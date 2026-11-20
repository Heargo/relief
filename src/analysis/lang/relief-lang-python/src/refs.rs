//! Syntactic references of a file: calls and annotation types, from the enclosing
//! top-level symbol.

use relief_model::EdgeKind;
use serde::Serialize;

use crate::{PyNode, text};

/// A reference from a symbol of the file to a name, duplicates merged.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ref {
    /// Enclosing symbol (`Class.method` for a method).
    pub from: String,
    /// Target as written; `Class.method` or `recv.name` for a member call.
    pub name: String,
    pub kind: EdgeKind,
    /// Number of occurrences.
    pub weight: u32,
}

/// A name bound by an import statement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub local: String,
    pub specifier: String,
    /// Name exported by the module, `"*"` for a whole-module import.
    pub imported: String,
}

const BUILTIN_TYPES: &[&str] = &[
    "int",
    "str",
    "float",
    "bool",
    "bytes",
    "bytearray",
    "complex",
    "list",
    "dict",
    "set",
    "frozenset",
    "tuple",
    "object",
    "type",
    "None",
];

struct Collector<'a> {
    bytes: &'a [u8],
    bindings: &'a [Binding],
    out: Vec<Ref>,
}

impl Collector<'_> {
    fn push(&mut self, from: &str, name: String, kind: EdgeKind) {
        match self
            .out
            .iter_mut()
            .find(|r| r.from == from && r.name == name && r.kind == kind)
        {
            Some(r) => r.weight += 1,
            None => self.out.push(Ref {
                from: from.to_owned(),
                name,
                kind,
                weight: 1,
            }),
        }
    }

    fn walk(&mut self, node: PyNode<'_>, from: &str, class: Option<&str>) {
        match node.kind() {
            "call" => {
                if let Some(name) = node
                    .child_by_field_name("function")
                    .and_then(|f| self.call_name(f, class))
                {
                    self.push(from, name, EdgeKind::Calls);
                }
            }
            "type" => {
                let mut names = Vec::new();
                type_names(node, self.bytes, &mut names);
                for name in names {
                    self.push(from, name, EdgeKind::References);
                }
                return;
            }
            _ => {}
        }
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk(child, from, class);
        }
    }

    fn call_name(&self, function: PyNode<'_>, class: Option<&str>) -> Option<String> {
        match function.kind() {
            "identifier" => Some(text(function, self.bytes).to_owned()),
            "attribute" => {
                let object = function.child_by_field_name("object")?;
                if object.kind() != "identifier" {
                    return None;
                }
                let receiver = text(object, self.bytes);
                let attribute = text(function.child_by_field_name("attribute")?, self.bytes);
                if matches!(receiver, "self" | "cls")
                    && let Some(class) = class
                {
                    return Some(format!("{class}.{attribute}"));
                }
                self.bindings
                    .iter()
                    .any(|b| b.local == receiver)
                    .then(|| format!("{receiver}.{attribute}"))
            }
            _ => None,
        }
    }
}

fn type_names(node: PyNode<'_>, bytes: &[u8], out: &mut Vec<String>) {
    match node.kind() {
        "identifier" => {
            let name = text(node, bytes);
            if !BUILTIN_TYPES.contains(&name) {
                out.push(name.to_owned());
            }
        }
        "attribute" => out.push(text(node, bytes).to_owned()),
        "string" => {}
        _ => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                type_names(child, bytes, out);
            }
        }
    }
}

/// The definition under an optional decorator wrapper.
pub(crate) fn definition(node: PyNode<'_>) -> Option<PyNode<'_>> {
    match node.kind() {
        "decorated_definition" => node.child_by_field_name("definition"),
        "function_definition" | "class_definition" => Some(node),
        _ => None,
    }
}

pub(crate) fn collect(root: PyNode<'_>, bytes: &[u8], bindings: &[Binding]) -> Vec<Ref> {
    let mut collector = Collector {
        bytes,
        bindings,
        out: Vec::new(),
    };
    let name_of = |n: PyNode<'_>| {
        n.child_by_field_name("name")
            .map(|id| text(id, bytes).to_owned())
    };
    let mut cursor = root.walk();
    for statement in root.children(&mut cursor) {
        let Some(def) = definition(statement) else {
            continue;
        };
        let Some(name) = name_of(def) else { continue };
        if def.kind() == "function_definition" {
            collector.walk(statement, &name, None);
            continue;
        }
        let Some(body) = def.child_by_field_name("body") else {
            continue;
        };
        let mut c = body.walk();
        for member in body.children(&mut c) {
            match definition(member).filter(|d| d.kind() == "function_definition") {
                Some(method) => {
                    if let Some(method_name) = name_of(method) {
                        collector.walk(member, &format!("{name}.{method_name}"), Some(&name));
                    }
                }
                None => collector.walk(member, &name, Some(&name)),
            }
        }
    }
    collector.out
}
