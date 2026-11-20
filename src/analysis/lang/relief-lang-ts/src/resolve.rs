//! Module resolution for TypeScript imports: relative paths, `tsconfig.json`
//! `paths` (through `extends`), workspace packages, else external.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use relief_adapter_api::LinkContext;
use serde_json::Value;

const EXTENSIONS: [&str; 7] = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs"];

/// Where an import specifier leads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Resolution {
    /// A file of the repository, by path.
    File(String),
    /// A package outside the repository, by package name.
    External(String),
    Unresolved,
}

/// The JSON files (tsconfig, package.json) read while linking one file, so an import list does
/// not parse them again for each specifier.
#[derive(Default)]
pub(crate) struct JsonMemo(RefCell<HashMap<String, Option<Rc<Value>>>>);

pub(crate) fn resolve(specifier: &str, ctx: &LinkContext<'_>, memo: &JsonMemo) -> Resolution {
    if specifier.starts_with('.') {
        let base = join(parent(ctx.path), specifier);
        return resolve_file(&base, ctx).map_or(Resolution::Unresolved, Resolution::File);
    }
    if let Some(file) = resolve_tsconfig_paths(specifier, ctx, memo) {
        return Resolution::File(file);
    }
    if let Some((name, dir)) = workspace_package(specifier, ctx) {
        let rest = specifier[name.len()..].trim_start_matches('/');
        return resolve_workspace(dir, rest, ctx, memo)
            .map_or(Resolution::Unresolved, Resolution::File);
    }
    Resolution::External(package_name(specifier))
}

fn package_name(specifier: &str) -> String {
    if specifier.contains(':') {
        return specifier.to_owned();
    }
    let mut parts = specifier.split('/');
    let first = parts.next().unwrap_or("");
    if first.starts_with('@') {
        match parts.next() {
            Some(second) => format!("{first}/{second}"),
            None => first.to_owned(),
        }
    } else {
        first.to_owned()
    }
}

fn parent(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(dir, _)| dir)
}

/// Joins and normalises (`.` and `..`) a directory and a relative path.
fn join(dir: &str, rel: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in dir.split('/').chain(rel.split('/')) {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

fn resolve_file(base: &str, ctx: &LinkContext<'_>) -> Option<String> {
    let exists = |p: &str| ctx.files.contains_key(p);
    if exists(base) {
        return Some(base.to_owned());
    }
    // `./x.js` may stand for `./x.ts`.
    let stem = ["js", "jsx", "mjs", "cjs"]
        .iter()
        .find_map(|e| base.strip_suffix(&format!(".{e}")));
    for root in std::iter::once(base).chain(stem) {
        for ext in EXTENSIONS {
            let candidate = format!("{root}.{ext}");
            if exists(&candidate) {
                return Some(candidate);
            }
        }
    }
    for ext in EXTENSIONS {
        let candidate = join(base, &format!("index.{ext}"));
        if exists(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn read_json(path: &str, ctx: &LinkContext<'_>, memo: &JsonMemo) -> Option<Rc<Value>> {
    if let Some(hit) = memo.0.borrow().get(path) {
        return hit.clone();
    }
    let value = (ctx.read)(path)
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .and_then(|text| serde_json::from_str(&strip_jsonc(&text)).ok())
        .map(Rc::new);
    memo.0.borrow_mut().insert(path.to_owned(), value.clone());
    value
}

/// Removes comments and trailing commas (tsconfig files are JSONC).
fn strip_jsonc(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let (mut i, mut in_string) = (0, false);
    while i < chars.len() {
        let c = chars[i];
        if in_string {
            out.push(c);
            if c == '\\' && i + 1 < chars.len() {
                i += 1;
                out.push(chars[i]);
            } else if c == '"' {
                in_string = false;
            }
        } else if c == '"' {
            in_string = true;
            out.push(c);
        } else if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        } else if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i += 2;
            continue;
        } else if c == ',' {
            let next = chars[i + 1..].iter().find(|n| !n.is_whitespace());
            if !matches!(next, Some('}' | ']')) {
                out.push(c);
            }
        } else {
            out.push(c);
        }
        i += 1;
    }
    out
}

type PathPatterns = Vec<(String, Vec<String>)>;

#[derive(Default)]
struct TsConfig {
    base_url: Option<String>,
    /// Patterns and the directory of the config that defined them.
    paths: Option<(PathPatterns, String)>,
}

fn load_tsconfig(path: &str, ctx: &LinkContext<'_>, memo: &JsonMemo, depth: usize) -> TsConfig {
    let mut config = TsConfig::default();
    let Some(json) = read_json(path, ctx, memo).filter(|_| depth < 8) else {
        return config;
    };
    let dir = parent(path);
    if let Some(extends) = json.get("extends").and_then(Value::as_str)
        && extends.starts_with('.')
    {
        let mut target = join(dir, extends);
        if !ctx.files.contains_key(&target) {
            target.push_str(".json");
        }
        config = load_tsconfig(&target, ctx, memo, depth + 1);
    }
    let options = json.get("compilerOptions");
    if let Some(base) = options
        .and_then(|o| o.get("baseUrl"))
        .and_then(Value::as_str)
    {
        config.base_url = Some(join(dir, base));
    }
    if let Some(paths) = options
        .and_then(|o| o.get("paths"))
        .and_then(Value::as_object)
    {
        let list = paths
            .iter()
            .map(|(k, v)| {
                let targets = v
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_owned)
                            .collect()
                    })
                    .unwrap_or_default();
                (k.clone(), targets)
            })
            .collect();
        config.paths = Some((list, dir.to_owned()));
    }
    config
}

fn resolve_tsconfig_paths(
    specifier: &str,
    ctx: &LinkContext<'_>,
    memo: &JsonMemo,
) -> Option<String> {
    let mut dir = parent(ctx.path);
    let config_path = loop {
        let candidate = join(dir, "tsconfig.json");
        if ctx.files.contains_key(&candidate) {
            break candidate;
        }
        if dir.is_empty() {
            return None;
        }
        dir = parent(dir);
    };
    let config = load_tsconfig(&config_path, ctx, memo, 0);
    let (patterns, defined_in) = config.paths?;
    let base = config.base_url.unwrap_or(defined_in);
    // Longest matching prefix wins; an exact key beats any wildcard.
    let mut matches: Vec<(usize, &Vec<String>, String)> = Vec::new();
    for (key, targets) in &patterns {
        match key.split_once('*') {
            None if key == specifier => matches.push((usize::MAX, targets, String::new())),
            Some((prefix, suffix))
                if specifier.len() >= prefix.len() + suffix.len()
                    && specifier.starts_with(prefix)
                    && specifier.ends_with(suffix) =>
            {
                let captured = &specifier[prefix.len()..specifier.len() - suffix.len()];
                matches.push((prefix.len(), targets, captured.to_owned()));
            }
            _ => {}
        }
    }
    matches.sort_by_key(|m| std::cmp::Reverse(m.0));
    matches.iter().find_map(|(_, targets, captured)| {
        targets
            .iter()
            .find_map(|t| resolve_file(&join(&base, &t.replace('*', captured)), ctx))
    })
}

fn workspace_package<'a>(specifier: &str, ctx: &'a LinkContext<'_>) -> Option<(&'a str, &'a str)> {
    ctx.package_dirs
        .iter()
        .filter(|(name, _)| {
            specifier == name.as_str()
                || specifier
                    .strip_prefix(name.as_str())
                    .is_some_and(|rest| rest.starts_with('/'))
        })
        .max_by_key(|(name, _)| name.len())
        .map(|(name, dir)| (name.as_str(), dir.as_str()))
}

fn resolve_workspace(
    dir: &str,
    rest: &str,
    ctx: &LinkContext<'_>,
    memo: &JsonMemo,
) -> Option<String> {
    let manifest = read_json(&join(dir, "package.json"), ctx, memo);
    if let Some(exports) = manifest.as_ref().and_then(|m| m.get("exports")) {
        let key = if rest.is_empty() {
            ".".to_owned()
        } else {
            format!("./{rest}")
        };
        if let Some(target) = exports_target(exports, &key)
            && let Some(file) = resolve_file(&join(dir, &target), ctx)
        {
            return Some(file);
        }
    }
    if rest.is_empty()
        && let Some(main) = manifest
            .as_ref()
            .and_then(|m| m.get("main"))
            .and_then(Value::as_str)
        && let Some(file) = resolve_file(&join(dir, main), ctx)
    {
        return Some(file);
    }
    resolve_file(&join(dir, rest), ctx)
}

fn exports_target(exports: &Value, key: &str) -> Option<String> {
    let map = match exports {
        Value::Object(map) if map.keys().any(|k| k.starts_with('.')) => map,
        // A string or a conditions object stands for ".".
        other => return (key == ".").then(|| condition_target(other)).flatten(),
    };
    if let Some(value) = map.get(key) {
        return condition_target(value);
    }
    map.iter().find_map(|(pattern, value)| {
        let (prefix, suffix) = pattern.split_once('*')?;
        let captured = key
            .strip_prefix(prefix)?
            .strip_suffix(suffix)
            .filter(|c| !c.is_empty())?;
        condition_target(value).map(|t| t.replace('*', captured))
    })
}

fn condition_target(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Object(map) => ["import", "default", "require", "types"]
            .iter()
            .filter_map(|c| map.get(*c))
            .chain(map.values())
            .find_map(condition_target),
        _ => None,
    }
}
