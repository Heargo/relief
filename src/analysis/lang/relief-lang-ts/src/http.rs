//! HTTP surface of a file: route declarations (`app.post("/x", handler)`) and
//! client calls (`fetch("/x")`, wrappers such as `httpPost("/x")`).

use serde::Serialize;

type TsNode<'a> = tree_sitter::Node<'a>;

const VERBS: [&str; 5] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
/// Placeholder of a `${…}` substitution in a client path.
pub(crate) const WILDCARD: char = '\u{0}';

/// A client call with a literal path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpCall {
    /// Enclosing symbol.
    pub from: String,
    /// Upper-case verb, `None` when it cannot be told.
    pub verb: Option<String>,
    /// Path as written, substitutions replaced by `\0`, query string removed.
    pub path: String,
}

/// A route declared by `<object>.<verb>("<path>", …, handler)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Route {
    pub handler: String,
    /// `"POST /checkout"`.
    pub route: String,
}

pub(crate) enum Found {
    Route(Route),
    Call { verb: Option<String>, path: String },
}

fn text<'a>(node: TsNode<'_>, bytes: &'a [u8]) -> &'a str {
    std::str::from_utf8(&bytes[node.byte_range()]).unwrap_or("")
}

/// Literal path of a string or template, substitutions as wildcards.
fn literal(node: TsNode<'_>, bytes: &[u8]) -> Option<String> {
    match node.kind() {
        "string" => {
            let raw = text(node, bytes);
            raw.get(1..raw.len().checked_sub(1)?).map(str::to_owned)
        }
        "template_string" => {
            let mut out = String::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                match child.kind() {
                    "string_fragment" => out.push_str(text(child, bytes)),
                    "template_substitution" => out.push(WILDCARD),
                    _ => {}
                }
            }
            Some(out)
        }
        _ => None,
    }
}

fn words(name: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for c in name.chars() {
        match out.last_mut() {
            Some(w) if !c.is_uppercase() && c.is_alphanumeric() => w.push(c.to_ascii_lowercase()),
            _ if c.is_alphanumeric() => out.push(c.to_ascii_lowercase().to_string()),
            _ => out.push(String::new()),
        }
    }
    out.retain(|w| !w.is_empty());
    out
}

/// Looks at one `call_expression` for a route declaration or a client call.
pub(crate) fn inspect(call: TsNode<'_>, bytes: &[u8]) -> Option<Found> {
    let function = call.child_by_field_name("function")?;
    let arguments = call.child_by_field_name("arguments")?;
    let mut cursor = arguments.walk();
    let args: Vec<TsNode<'_>> = arguments.named_children(&mut cursor).collect();
    let first = *args.first()?;
    match function.kind() {
        "member_expression" => {
            let property = text(function.child_by_field_name("property")?, bytes);
            let verb = property.to_ascii_uppercase();
            if !VERBS.contains(&verb.as_str()) || property != property.to_ascii_lowercase() {
                return None;
            }
            let path = literal(first, bytes).filter(|p| p.starts_with('/'))?;
            let handler = args
                .last()
                .filter(|a| a.kind() == "identifier" && args.len() > 1)?;
            Some(Found::Route(Route {
                handler: text(*handler, bytes).to_owned(),
                route: format!("{verb} {path}"),
            }))
        }
        "identifier" => {
            let name = text(function, bytes);
            let path = literal(first, bytes).filter(|p| p.starts_with('/'))?;
            let path = path.split('?').next().unwrap_or("").to_owned();
            if name == "fetch" {
                let verb = match args.get(1) {
                    None => Some("GET".to_owned()),
                    Some(options) => method_of(*options, bytes),
                };
                return Some(Found::Call { verb, path });
            }
            let parts = words(name);
            let named: Vec<String> = parts
                .iter()
                .map(|w| w.to_ascii_uppercase())
                .filter(|w| VERBS.contains(&w.as_str()))
                .collect();
            let wrapper = !named.is_empty() || parts.iter().any(|w| w == "fetch" || w == "request");
            if !wrapper {
                return None;
            }
            let verb = (named.len() == 1).then(|| named[0].clone());
            Some(Found::Call { verb, path })
        }
        _ => None,
    }
}

/// `method` of a `fetch` options object when it is a string literal.
fn method_of(options: TsNode<'_>, bytes: &[u8]) -> Option<String> {
    if options.kind() != "object" {
        return None;
    }
    let mut cursor = options.walk();
    for pair in options.named_children(&mut cursor) {
        if pair.kind() != "pair" {
            continue;
        }
        let key = pair.child_by_field_name("key")?;
        let key = text(key, bytes).trim_matches(['"', '\'']);
        if key == "method" {
            let value = literal(pair.child_by_field_name("value")?, bytes)?;
            return Some(value.to_ascii_uppercase());
        }
    }
    Some("GET".to_owned())
}

/// Whether a client path reaches a route path, parameters and substitutions
/// matching any single segment.
pub fn path_matches(route: &str, client: &str) -> bool {
    let route: Vec<&str> = route.trim_matches('/').split('/').collect();
    let client: Vec<&str> = client.trim_matches('/').split('/').collect();
    route.len() == client.len()
        && route
            .iter()
            .zip(&client)
            .all(|(r, c)| r.starts_with(':') || c.contains(WILDCARD) || r == c)
}
