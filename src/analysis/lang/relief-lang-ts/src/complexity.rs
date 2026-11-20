//! Cyclomatic complexity of the symbols of a file: 1 plus the decision points inside the span.

use relief_model::Span;
use tree_sitter::{Language, Node, Parser};

/// Node kinds that add a path.
const BRANCHES: [&str; 8] = [
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_case",
    "catch_clause",
    "ternary_expression",
];

/// Operators of a `binary_expression` that short-circuit.
const SHORT_CIRCUITS: [&str; 3] = ["&&", "||", "??"];

/// Complexity of each `(name, span)`; empty when the file cannot be parsed.
pub fn per_symbol(path: &str, bytes: &[u8], spans: &[(String, Span)]) -> Vec<(String, u32)> {
    let ext = path.rsplit_once('.').map_or("", |(_, e)| e);
    let language: Language = match ext {
        "ts" | "mts" | "cts" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        _ => tree_sitter_typescript::LANGUAGE_TSX.into(),
    };
    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return Vec::new();
    }
    let Some(tree) = parser.parse(bytes, None) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    collect(tree.root_node(), bytes, &mut rows);
    spans
        .iter()
        .map(|(name, span)| {
            let inside = rows
                .iter()
                .filter(|row| **row >= span.start_line && **row <= span.end_line)
                .count();
            (name.clone(), 1 + inside as u32)
        })
        .collect()
}

/// 1-based start line of every decision point.
fn collect(node: Node<'_>, bytes: &[u8], rows: &mut Vec<u32>) {
    let branch = BRANCHES.contains(&node.kind())
        || (node.kind() == "binary_expression"
            && node
                .child_by_field_name("operator")
                .and_then(|op| op.utf8_text(bytes).ok())
                .is_some_and(|op| SHORT_CIRCUITS.contains(&op)));
    if branch {
        rows.push(node.start_position().row as u32 + 1);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect(child, bytes, rows);
    }
}
