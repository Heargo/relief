//! Resolution of a Python module specifier to a file of the commit tree.

use relief_adapter_api::LinkContext;

pub(crate) enum Resolution {
    /// A module of the project: its file, and its directory when it is a package.
    Module {
        file: Option<String>,
        dir: Option<String>,
    },
    /// A package outside the project (by top-level name).
    External(String),
    Unresolved,
}

pub(crate) fn join(base: &str, rest: &str) -> String {
    match (base.is_empty(), rest.is_empty()) {
        (true, _) => rest.to_owned(),
        (_, true) => base.to_owned(),
        _ => format!("{base}/{rest}"),
    }
}

fn parent_dir(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(dir, _)| dir)
}

/// The module `parts` below `base`: `base/a/b.py` or `base/a/b/__init__.py`.
pub(crate) fn locate(base: &str, parts: &[&str], ctx: &LinkContext<'_>) -> Option<Resolution> {
    let dir = join(base, &parts.join("/"));
    let module = (!parts.is_empty())
        .then(|| format!("{dir}.py"))
        .filter(|p| ctx.files.contains_key(p));
    if module.is_some() {
        return Some(Resolution::Module {
            file: module,
            dir: None,
        });
    }
    let init = join(&dir, "__init__.py");
    if ctx.files.contains_key(&init) {
        return Some(Resolution::Module {
            file: Some(init),
            dir: Some(dir),
        });
    }
    None
}

fn roots(ctx: &LinkContext<'_>) -> Vec<String> {
    let mut roots = vec![String::new(), "src".to_owned()];
    for dir in ctx.package_dirs.values() {
        for root in [dir.clone(), join(dir, "src")] {
            if !roots.contains(&root) {
                roots.push(root);
            }
        }
    }
    roots
}

pub(crate) fn resolve(specifier: &str, ctx: &LinkContext<'_>) -> Resolution {
    let dots = specifier.chars().take_while(|c| *c == '.').count();
    let parts: Vec<&str> = specifier[dots..]
        .split('.')
        .filter(|p| !p.is_empty())
        .collect();
    if dots > 0 {
        let mut base = parent_dir(ctx.path);
        for _ in 1..dots {
            base = parent_dir(base);
        }
        return match locate(base, &parts, ctx) {
            Some(found) => found,
            None if parts.is_empty() => Resolution::Module {
                file: None,
                dir: Some(base.to_owned()),
            },
            None => Resolution::Unresolved,
        };
    }
    let Some(first) = parts.first() else {
        return Resolution::Unresolved;
    };
    let roots = roots(ctx);
    for root in &roots {
        if let Some(found) = locate(root, &parts, ctx) {
            return found;
        }
    }
    if roots
        .iter()
        .any(|root| locate(root, &[first], ctx).is_some())
    {
        Resolution::Unresolved
    } else {
        Resolution::External((*first).to_owned())
    }
}
