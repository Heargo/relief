//! Syntactic references of a file: calls, JSX renders and type or value
//! references, from the enclosing top-level symbol.

use std::collections::HashMap;

use relief_model::EdgeKind;

use crate::http::{self, Found, HttpCall, Route};
use serde::Serialize;

type TsNode<'a> = tree_sitter::Node<'a>;

/// A reference from a symbol of the file to a name, duplicates merged.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ref {
    /// Enclosing symbol (`Class.method` for a method).
    pub from: String,
    /// Target as written; `Class.method` or `recv.method` for a member call.
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
    /// Name exported by the module, `"default"` or `"*"`.
    pub imported: String,
}

/// A top-level `const name = new Class()`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub name: String,
    pub class: String,
}

fn text<'a>(node: TsNode<'_>, bytes: &'a [u8]) -> &'a str {
    std::str::from_utf8(&bytes[node.byte_range()]).unwrap_or("")
}

pub(crate) fn bindings(root: TsNode<'_>, bytes: &[u8]) -> Vec<Binding> {
    let mut out = Vec::new();
    let mut cursor = root.walk();
    for statement in root.children(&mut cursor) {
        if statement.kind() != "import_statement" {
            continue;
        }
        let Some(source) = statement.child_by_field_name("source") else {
            continue;
        };
        let raw = text(source, bytes);
        let Some(specifier) = raw.get(1..raw.len().saturating_sub(1)) else {
            continue;
        };
        let mut c = statement.walk();
        for clause in statement
            .children(&mut c)
            .filter(|n| n.kind() == "import_clause")
        {
            let mut cc = clause.walk();
            for child in clause.children(&mut cc) {
                match child.kind() {
                    "identifier" => out.push(binding(text(child, bytes), specifier, "default")),
                    "namespace_import" => {
                        let mut n = child.walk();
                        if let Some(id) = child.children(&mut n).find(|x| x.kind() == "identifier")
                        {
                            out.push(binding(text(id, bytes), specifier, "*"));
                        }
                    }
                    "named_imports" => {
                        let mut n = child.walk();
                        for spec in child
                            .children(&mut n)
                            .filter(|x| x.kind() == "import_specifier")
                        {
                            let Some(name) = spec.child_by_field_name("name") else {
                                continue;
                            };
                            let local = spec.child_by_field_name("alias").unwrap_or(name);
                            out.push(binding(text(local, bytes), specifier, text(name, bytes)));
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    out
}

fn binding(local: &str, specifier: &str, imported: &str) -> Binding {
    Binding {
        local: local.to_owned(),
        specifier: specifier.to_owned(),
        imported: imported.to_owned(),
    }
}

pub(crate) fn instances(root: TsNode<'_>, bytes: &[u8]) -> Vec<Instance> {
    let mut out = Vec::new();
    for (_, declarator) in declarators(root) {
        let (Some(name), Some(value)) = (
            declarator.child_by_field_name("name"),
            declarator.child_by_field_name("value"),
        ) else {
            continue;
        };
        if name.kind() != "identifier" || value.kind() != "new_expression" {
            continue;
        }
        let Some(class) = value
            .child_by_field_name("constructor")
            .filter(|c| c.kind() == "identifier")
        else {
            continue;
        };
        out.push(Instance {
            name: text(name, bytes).to_owned(),
            class: text(class, bytes).to_owned(),
        });
    }
    out
}

/// Top-level variable declarators, with their statement.
fn declarators(root: TsNode<'_>) -> Vec<(TsNode<'_>, TsNode<'_>)> {
    let mut out = Vec::new();
    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        let statement = unwrap_export(child);
        if matches!(
            statement.kind(),
            "lexical_declaration" | "variable_declaration"
        ) {
            let mut c = statement.walk();
            for d in statement
                .children(&mut c)
                .filter(|n| n.kind() == "variable_declarator")
            {
                out.push((statement, d));
            }
        }
    }
    out
}

fn unwrap_export(node: TsNode<'_>) -> TsNode<'_> {
    if node.kind() == "export_statement" {
        node.child_by_field_name("declaration").unwrap_or(node)
    } else {
        node
    }
}

struct State<'a> {
    bytes: &'a [u8],
    imported: Vec<&'a str>,
    instances: HashMap<&'a str, &'a str>,
    refs: Vec<Ref>,
    calls: Vec<HttpCall>,
    routes: Vec<Route>,
}

impl State<'_> {
    fn add(&mut self, from: &str, name: &str, kind: EdgeKind) {
        if let Some(r) = self
            .refs
            .iter_mut()
            .find(|r| r.kind == kind && r.from == from && r.name == name)
        {
            r.weight += 1;
        } else {
            self.refs.push(Ref {
                from: from.to_owned(),
                name: name.to_owned(),
                kind,
                weight: 1,
            });
        }
    }
}

pub(crate) fn collect(
    root: TsNode<'_>,
    bytes: &[u8],
    bindings: &[Binding],
    instances: &[Instance],
) -> (Vec<Ref>, Vec<HttpCall>, Vec<Route>) {
    let mut st = State {
        bytes,
        imported: bindings.iter().map(|b| b.local.as_str()).collect(),
        instances: instances
            .iter()
            .map(|i| (i.name.as_str(), i.class.as_str()))
            .collect(),
        refs: Vec::new(),
        calls: Vec::new(),
        routes: Vec::new(),
    };
    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        let decl = unwrap_export(child);
        let name = |n: TsNode<'_>| {
            n.child_by_field_name("name")
                .map(|x| text(x, bytes).to_owned())
        };
        match decl.kind() {
            "class_declaration" | "abstract_class_declaration" => {
                let Some(class) = name(decl) else { continue };
                let mut c = decl.walk();
                for part in decl.children(&mut c) {
                    if part.kind() != "class_body" {
                        visit(part, &class, &mut st);
                        continue;
                    }
                    let mut b = part.walk();
                    for member in part.children(&mut b) {
                        let from = match (member.kind(), name(member)) {
                            ("method_definition", Some(m)) => {
                                format!("{class}.{}", m.trim_start_matches('#'))
                            }
                            _ => class.clone(),
                        };
                        visit(member, &from, &mut st);
                    }
                }
            }
            "lexical_declaration" | "variable_declaration" => {
                let mut c = decl.walk();
                for d in decl
                    .children(&mut c)
                    .filter(|n| n.kind() == "variable_declarator")
                {
                    if let Some(from) = name(d) {
                        visit(d, &from, &mut st);
                    }
                }
            }
            "function_declaration"
            | "generator_function_declaration"
            | "type_alias_declaration"
            | "interface_declaration"
            | "enum_declaration" => {
                if let Some(from) = name(decl) {
                    visit(decl, &from, &mut st);
                }
            }
            _ => {}
        }
    }
    (st.refs, st.calls, st.routes)
}

fn is_name_of_parent(node: TsNode<'_>) -> bool {
    node.parent()
        .and_then(|p| p.child_by_field_name("name"))
        .is_some_and(|n| n.id() == node.id())
}

fn visit(node: TsNode<'_>, from: &str, st: &mut State<'_>) {
    let bytes = st.bytes;
    let mut skip: Option<usize> = None;
    match node.kind() {
        "call_expression" => {
            match http::inspect(node, bytes) {
                Some(Found::Route(route)) => st.routes.push(route),
                Some(Found::Call { verb, path }) => {
                    let call = HttpCall {
                        from: from.to_owned(),
                        verb,
                        path,
                    };
                    if !st.calls.contains(&call) {
                        st.calls.push(call);
                    }
                }
                None => {}
            }
            if let Some(f) = node.child_by_field_name("function") {
                match f.kind() {
                    "identifier" => {
                        st.add(from, text(f, bytes), EdgeKind::Calls);
                        skip = Some(f.id());
                    }
                    "member_expression" => {
                        let object = f.child_by_field_name("object");
                        let property = f.child_by_field_name("property");
                        if let (Some(o), Some(p)) = (object, property)
                            && o.kind() == "identifier"
                            && p.kind() == "property_identifier"
                        {
                            let recv = text(o, bytes);
                            let method = text(p, bytes);
                            if let Some(class) = st.instances.get(recv) {
                                st.add(from, &format!("{class}.{method}"), EdgeKind::Calls);
                            } else if st.imported.contains(&recv) {
                                st.add(from, &format!("{recv}.{method}"), EdgeKind::Calls);
                            }
                            skip = Some(f.id());
                        }
                    }
                    _ => {}
                }
            }
        }
        "jsx_opening_element" | "jsx_self_closing_element" => {
            if let Some(n) = node.child_by_field_name("name")
                && n.kind() == "identifier"
                && text(n, bytes).starts_with(char::is_uppercase)
            {
                st.add(from, text(n, bytes), EdgeKind::Renders);
            }
            skip = node.child_by_field_name("name").map(|n| n.id());
        }
        "jsx_closing_element" => return,
        "type_identifier" => {
            if !is_name_of_parent(node) {
                st.add(from, text(node, bytes), EdgeKind::References);
            }
            return;
        }
        "identifier" => {
            if st.imported.contains(&text(node, bytes)) {
                st.add(from, text(node, bytes), EdgeKind::References);
            }
            return;
        }
        _ => {}
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if Some(child.id()) != skip {
            visit(child, from, st);
        }
    }
}
