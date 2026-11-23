//! Usages of imported bindings in one file: the identifiers that resolve to an import, outside
//! the import declaration and outside any scope that shadows the local name.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

use relief_adapter_api::{LinkContext, ResolveEnv, Usage};
use relief_model::NodeId;
use tree_sitter::Parser;

use crate::refs;
use crate::resolve::{JsonMemo, Resolution, resolve};

type TsNode<'a> = tree_sitter::Node<'a>;

const IDENTIFIERS: [&str; 3] = [
    "identifier",
    "type_identifier",
    "shorthand_property_identifier",
];

pub(crate) fn usages(
    path: &str,
    bytes: &[u8],
    bindings: &[String],
    parses: &AtomicUsize,
) -> Vec<Usage> {
    collect(path, bytes, parses, |bs| {
        bs.into_iter()
            .filter(|b| bindings.contains(&b.imported))
            .map(|b| (b.local, b.imported))
            .collect()
    })
}

/// Uses of the default and namespace imports of `path` whose specifier resolves to `target`,
/// under their local names. Specifiers resolve as the index does, through `env`.
pub(crate) fn module_usages(
    path: &str,
    bytes: &[u8],
    target: &str,
    env: &ResolveEnv<'_>,
    parses: &AtomicUsize,
) -> Vec<Usage> {
    let repo = NodeId::package("");
    let files: HashMap<String, NodeId> = env
        .paths
        .iter()
        .map(|p| ((*p).to_owned(), repo.clone()))
        .collect();
    let (nodes, routes) = Default::default();
    let ctx = LinkContext {
        path,
        paths: env.paths,
        read: env.read,
        package_dirs: env.package_dirs,
        files: &files,
        nodes: &nodes,
        routes: &routes,
        repo: &repo,
        indexes: &HashMap::new(),
    };
    let memo = JsonMemo::default();
    collect(path, bytes, parses, |bs| {
        bs.into_iter()
            .filter(|b| matches!(b.imported.as_str(), "default" | "*"))
            .filter(|b| resolve(&b.specifier, &ctx, &memo) == Resolution::File(target.to_owned()))
            .map(|b| (b.local.clone(), b.local))
            .collect()
    })
}

fn collect(
    path: &str,
    bytes: &[u8],
    parses: &AtomicUsize,
    pick: impl FnOnce(Vec<refs::Binding>) -> HashMap<String, String>,
) -> Vec<Usage> {
    let ext = path.rsplit_once('.').map_or("", |(_, e)| e);
    let language = if matches!(ext, "ts" | "mts" | "cts") {
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT
    } else {
        tree_sitter_typescript::LANGUAGE_TSX
    };
    let mut parser = Parser::new();
    if parser.set_language(&language.into()).is_err() {
        return Vec::new();
    }
    parses.fetch_add(1, Ordering::Relaxed);
    let Some(tree) = parser.parse(bytes, None) else {
        return Vec::new();
    };
    let root = tree.root_node();
    let locals = pick(refs::bindings(root, bytes));
    let mut out = Vec::new();
    if !locals.is_empty() {
        visit(root, bytes, &locals, &mut out);
    }
    out
}

fn text<'a>(node: TsNode<'_>, bytes: &'a [u8]) -> &'a str {
    std::str::from_utf8(&bytes[node.byte_range()]).unwrap_or("")
}

fn visit(node: TsNode<'_>, bytes: &[u8], locals: &HashMap<String, String>, out: &mut Vec<Usage>) {
    if node.kind() == "import_statement" {
        return;
    }
    if IDENTIFIERS.contains(&node.kind())
        && let Some(binding) = locals.get(text(node, bytes))
        && !is_alias(node)
        && !is_shadowed(node, bytes)
    {
        out.push(usage(node, bytes, binding));
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        visit(child, bytes, locals, out);
    }
}

/// The `y` of `export { x as y }` names nothing of this file's imports.
fn is_alias(node: TsNode<'_>) -> bool {
    node.parent().is_some_and(|p| {
        p.kind() == "export_specifier" && p.child_by_field_name("alias").is_some_and(|a| a == node)
    })
}

fn usage(node: TsNode<'_>, bytes: &[u8], binding: &str) -> Usage {
    let row = node.start_position().row;
    let start = bytes[..node.start_byte()]
        .iter()
        .rposition(|b| *b == b'\n')
        .map_or(0, |i| i + 1);
    let end = bytes[start..]
        .iter()
        .position(|b| *b == b'\n')
        .map_or(bytes.len(), |i| start + i);
    let line = String::from_utf8_lossy(&bytes[start..end]);
    let snippet = line.trim_end_matches('\r').to_owned();
    let column = String::from_utf8_lossy(&bytes[start..node.start_byte()])
        .chars()
        .count();
    Usage {
        binding: binding.to_owned(),
        line: row as u32 + 1,
        column: column as u32,
        snippet,
        enclosing: enclosing(node, bytes),
    }
}

fn enclosing(node: TsNode<'_>, bytes: &[u8]) -> Option<String> {
    let mut current = node.parent();
    while let Some(n) = current {
        match n.kind() {
            "function_declaration" | "generator_function_declaration" => {
                return n
                    .child_by_field_name("name")
                    .map(|x| text(x, bytes).to_owned());
            }
            "method_definition" => {
                let name = text(n.child_by_field_name("name")?, bytes);
                let class = std::iter::successors(n.parent(), |p| p.parent())
                    .find(|p| matches!(p.kind(), "class_declaration" | "class"))
                    .and_then(|c| c.child_by_field_name("name"))
                    .map(|c| text(c, bytes));
                return Some(match class {
                    Some(class) => format!("{class}.{name}"),
                    None => name.to_owned(),
                });
            }
            "arrow_function" | "function_expression" | "function" => {
                if let Some(p) = n.parent().filter(|p| p.kind() == "variable_declarator")
                    && let Some(name) = p.child_by_field_name("name")
                {
                    return Some(text(name, bytes).to_owned());
                }
            }
            _ => {}
        }
        current = n.parent();
    }
    None
}

/// Whether an ancestor of `node` declares the same name (parameter, variable, function, class).
fn is_shadowed(node: TsNode<'_>, bytes: &[u8]) -> bool {
    let name = text(node, bytes);
    let mut current = node.parent();
    while let Some(n) = current {
        if n.kind() != "program" && declares(n, bytes, name) {
            return true;
        }
        current = n.parent();
    }
    false
}

fn declares(scope: TsNode<'_>, bytes: &[u8], name: &str) -> bool {
    let kind = scope.kind();
    if kind.contains("function") || matches!(kind, "arrow_function" | "method_definition") {
        for field in ["parameters", "parameter"] {
            if let Some(params) = scope.child_by_field_name(field)
                && pattern_binds(params, bytes, name)
            {
                return true;
            }
        }
    }
    if kind == "catch_clause"
        && let Some(p) = scope.child_by_field_name("parameter")
        && pattern_binds(p, bytes, name)
    {
        return true;
    }
    if kind == "for_in_statement"
        && scope.child_by_field_name("kind").is_some()
        && let Some(left) = scope.child_by_field_name("left")
        && pattern_binds(left, bytes, name)
    {
        return true;
    }
    let mut cursor = scope.walk();
    scope.children(&mut cursor).any(|child| match child.kind() {
        "lexical_declaration" | "variable_declaration" => {
            let mut c = child.walk();
            child
                .children(&mut c)
                .filter(|d| d.kind() == "variable_declarator")
                .filter_map(|d| d.child_by_field_name("name"))
                .any(|n| pattern_binds(n, bytes, name))
        }
        "function_declaration" | "generator_function_declaration" | "class_declaration" => child
            .child_by_field_name("name")
            .is_some_and(|n| text(n, bytes) == name),
        _ => false,
    })
}

/// Whether a binding pattern (parameters, destructuring) introduces `name`.
fn pattern_binds(pattern: TsNode<'_>, bytes: &[u8], name: &str) -> bool {
    match pattern.kind() {
        "identifier" | "shorthand_property_identifier_pattern" => text(pattern, bytes) == name,
        "required_parameter" | "optional_parameter" => pattern
            .child_by_field_name("pattern")
            .is_some_and(|p| pattern_binds(p, bytes, name)),
        "assignment_pattern" | "object_assignment_pattern" => pattern
            .child_by_field_name("left")
            .is_some_and(|p| pattern_binds(p, bytes, name)),
        "pair_pattern" => pattern
            .child_by_field_name("value")
            .is_some_and(|p| pattern_binds(p, bytes, name)),
        "formal_parameters" | "object_pattern" | "array_pattern" | "rest_pattern" => {
            let mut cursor = pattern.walk();
            pattern
                .children(&mut cursor)
                .any(|c| pattern_binds(c, bytes, name))
        }
        _ => false,
    }
}
