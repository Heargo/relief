//! Language adapter for Python (tree-sitter).

use std::collections::HashSet;

use relief_adapter_api::{Extraction, LanguageAdapter, LinkContext};
use relief_model::{
    Edge, EdgeKind, Node, NodeId, NodeKind, Precision, SignatureVerdict, Span, Visibility,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use streaming_iterator::StreamingIterator;
use tree_sitter::{Language, Parser, Query, QueryCursor};

mod compare;
mod refs;
mod resolve;

pub use refs::{Binding, Ref};

use resolve::{Resolution, locate, resolve};

const SYMBOLS_QUERY: &str = include_str!("../queries/symbols.scm");

type PyNode<'a> = tree_sitter::Node<'a>;

/// A symbol declared in a file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Symbol {
    /// `Class.method` for a method.
    pub name: String,
    pub subkind: String,
    pub visibility: Visibility,
    /// 1-based lines.
    pub span: Span,
    /// Hash of the tokens of the declaration (no whitespace, no comments).
    pub content_hash: String,
    pub signature_hash: Option<String>,
    /// Normalised signature text.
    pub signature: Option<String>,
}

/// An import of another module.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Import {
    /// The module as written (`.billing`, `shop.models`, `flask`).
    pub specifier: String,
    /// Names as exported by the module; `"*"` for a whole-module import.
    pub names: Vec<String>,
}

/// Result of indexing one file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIndex {
    /// In source order, methods right after their class.
    pub symbols: Vec<Symbol>,
    /// In source order.
    pub imports: Vec<Import>,
    /// Calls and annotation references from top-level symbols, duplicates merged.
    pub refs: Vec<Ref>,
    /// Names bound by imports.
    pub bindings: Vec<Binding>,
    pub warnings: Vec<String>,
}

/// Adapter for Python.
#[derive(Debug, Default, Clone, Copy)]
pub struct PythonAdapter;

impl PythonAdapter {
    pub fn new() -> Self {
        Self
    }

    /// Symbols and warnings of one file. Never fails: a file that does not
    /// parse yields its valid symbols and a warning naming the path.
    pub fn index_file(&self, path: &str, bytes: &[u8]) -> FileIndex {
        let language: Language = tree_sitter_python::LANGUAGE.into();
        let mut parser = Parser::new();
        if parser.set_language(&language).is_err() {
            return warn_only(path, "grammar unavailable");
        }
        let Some(tree) = parser.parse(bytes, None) else {
            return warn_only(path, "could not be parsed");
        };
        let Ok(query) = Query::new(&language, SYMBOLS_QUERY) else {
            return warn_only(path, "symbol query invalid");
        };
        let root = tree.root_node();
        let names = query.capture_names();

        let mut found: Vec<(usize, Symbol)> = Vec::new();
        let mut cursor = QueryCursor::new();
        let mut matches = cursor.matches(&query, root, bytes);
        while let Some(m) = matches.next() {
            let mut name_node = None;
            let mut decl = None;
            for capture in m.captures() {
                if names[capture.index as usize] == "name" {
                    name_node = Some(capture.node);
                } else {
                    decl = Some(capture.node);
                }
            }
            let (Some(name_node), Some(decl)) = (name_node, decl) else {
                continue;
            };
            if decl.has_error() {
                continue;
            }
            if let Some((start, symbol)) = build_symbol(name_node, decl, bytes) {
                found.push((start, symbol));
            }
        }
        found.sort_by_key(|(start, _)| *start);
        let mut seen = HashSet::new();
        let symbols: Vec<Symbol> = found
            .into_iter()
            .map(|(_, s)| s)
            .filter(|s| seen.insert(s.name.clone()))
            .collect();

        let mut warnings = Vec::new();
        if root.has_error() {
            let line = first_error(root).map_or(1, |n| n.start_position().row + 1);
            warnings.push(format!("{path}: syntax error at line {line}"));
        }
        let mut imports = Vec::new();
        let mut bindings = Vec::new();
        collect_imports(root, bytes, &mut imports, &mut bindings);
        let known: HashSet<&str> = symbols.iter().map(|s| s.name.as_str()).collect();
        let mut found_refs = refs::collect(root, bytes, &bindings);
        found_refs.retain(|r| known.contains(r.from.as_str()));
        FileIndex {
            symbols,
            imports,
            refs: found_refs,
            bindings,
            warnings,
        }
    }
}

impl LanguageAdapter for PythonAdapter {
    fn name(&self) -> &str {
        "python"
    }

    fn handles(&self, lang: &str) -> bool {
        lang == "py"
    }

    /// Linking reads nothing but the paths of the tree and the workspace packages.
    fn link_input(
        &self,
        _path: &str,
        _paths: &[&str],
        _read: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> bool {
        false
    }

    /// A file that is gone is seen through the edges that point to it; a new one may be
    /// what an import now resolves to.
    fn link_affected(
        &self,
        _path: &str,
        _index: Option<&str>,
        _ctx: &LinkContext<'_>,
        added: &std::collections::HashSet<String>,
        _routes_changed: bool,
    ) -> bool {
        !added.is_empty()
    }

    fn symbol_signatures(&self, path: &str, bytes: &[u8]) -> Vec<(String, String)> {
        if !path.ends_with(".py") {
            return Vec::new();
        }
        self.index_file(path, bytes)
            .symbols
            .into_iter()
            .filter_map(|s| Some((s.name, s.signature?)))
            .collect()
    }

    fn compare_signatures(&self, before: &str, after: &str) -> SignatureVerdict {
        compare::compare(before, after)
    }

    fn extract(&self, file: &Node, bytes: &[u8]) -> Extraction {
        let id = file.id.to_string();
        let path = id.split_once("::file:").map_or(id.as_str(), |(_, p)| p);
        let index = self.index_file(path, bytes);
        let nodes = index
            .symbols
            .into_iter()
            .map(|s| Node {
                id: file.id.clone().symbol(&s.name),
                kind: NodeKind::Symbol,
                subkind: s.subkind,
                parent: Some(file.id.clone()),
                lang: file.lang.clone(),
                span: Some(s.span),
                visibility: s.visibility,
                content_hash: s.content_hash,
                signature_hash: s.signature_hash,
                metrics: None,
                path: None,
                route: None,
                entry: false,
                entry_type: None,
                child_count: None,
            })
            .collect();
        Extraction {
            nodes,
            edges: Vec::<Edge>::new(),
            warnings: index.warnings,
            entries: Vec::new(),
        }
    }

    fn link(&self, file: &Node, bytes: &[u8], ctx: &LinkContext<'_>) -> Extraction {
        let index = self.index_file(ctx.path, bytes);
        let mut out = Extraction::default();
        link_refs(file, &index, ctx, &mut out);
        for import in &index.imports {
            let targets = match resolve(&import.specifier, ctx) {
                Resolution::Module { file: target, dir } => {
                    module_targets(import, target, dir, ctx)
                }
                Resolution::External(name) => vec![external_node(&name, ctx, &mut out)],
                Resolution::Unresolved => {
                    out.warnings.push(format!(
                        "{}: unresolved import \"{}\"",
                        ctx.path, import.specifier
                    ));
                    vec![external_node(UNRESOLVED, ctx, &mut out)]
                }
            };
            for to in targets {
                push_edge(&mut out, file.id.clone(), to, EdgeKind::Imports);
            }
        }
        out
    }
}

fn push_edge(out: &mut Extraction, from: NodeId, to: NodeId, kind: EdgeKind) {
    let edge = Edge {
        from,
        to,
        kind,
        precision: Precision::Syntactic,
        heuristic: false,
        count: None,
    };
    if !out.edges.contains(&edge) {
        out.edges.push(edge);
    }
}

/// Nodes an import points to: the named symbols or submodules, else the module itself.
fn module_targets(
    import: &Import,
    file: Option<String>,
    dir: Option<String>,
    ctx: &LinkContext<'_>,
) -> Vec<NodeId> {
    let target = file.as_ref().and_then(|p| ctx.files.get(p));
    let mut found = Vec::new();
    for name in import.names.iter().filter(|n| n.as_str() != "*") {
        let submodule = dir.as_ref().and_then(|d| match locate(d, &[name], ctx) {
            Some(Resolution::Module { file: Some(p), .. }) => ctx.files.get(&p).cloned(),
            _ => None,
        });
        let symbol = target
            .map(|t| t.clone().symbol(name))
            .filter(|id| ctx.nodes.contains(id));
        found.extend(submodule.or(symbol));
    }
    if found.is_empty() {
        found.extend(target.cloned());
    }
    found
}

/// Symbol-to-symbol edges for the refs of `index`, resolved by scope: the
/// symbols of the file first, then the names it imports.
fn link_refs(file: &Node, index: &FileIndex, ctx: &LinkContext<'_>, out: &mut Extraction) {
    for r in &index.refs {
        let from = file.id.clone().symbol(&r.from);
        let local = file.id.clone().symbol(&r.name);
        let to = if ctx.nodes.contains(&local) {
            Some(local)
        } else {
            resolve_import(&r.name, index, ctx)
        };
        let Some(to) = to.filter(|t| *t != from) else {
            continue;
        };
        push_edge(out, from, to, r.kind);
    }
}

fn resolve_import(name: &str, index: &FileIndex, ctx: &LinkContext<'_>) -> Option<NodeId> {
    let (recv, method) = match name.split_once('.') {
        Some((r, m)) => (r, Some(m)),
        None => (name, None),
    };
    let binding = index.bindings.iter().find(|b| b.local == recv)?;
    let Resolution::Module { file, dir } = resolve(&binding.specifier, ctx) else {
        return None;
    };
    let submodule = dir
        .as_ref()
        .and_then(|d| match locate(d, &[&binding.imported], ctx) {
            Some(Resolution::Module { file: Some(p), .. }) => ctx.files.get(&p),
            _ => None,
        });
    let (target, symbol) = match (submodule, method, binding.imported.as_str()) {
        (Some(target), Some(method), _) => (target, method.to_owned()),
        (None, Some(method), "*") => (ctx.files.get(&file?)?, method.to_owned()),
        (None, None, imported) if imported != "*" => (ctx.files.get(&file?)?, imported.to_owned()),
        (None, Some(method), imported) => (ctx.files.get(&file?)?, format!("{imported}.{method}")),
        _ => return None,
    };
    let id = target.clone().symbol(&symbol);
    ctx.nodes.contains(&id).then_some(id)
}

const UNRESOLVED: &str = "unresolved";
const EXTERNAL_GROUP: &str = "external";

/// Id of the external node `name`, pushing it (and the group) into `out`.
fn external_node(name: &str, ctx: &LinkContext<'_>, out: &mut Extraction) -> NodeId {
    let group = NodeId::package(EXTERNAL_GROUP);
    let id = NodeId::package(&format!("{EXTERNAL_GROUP}/{name}"));
    let make = |id: &NodeId, kind, subkind: &str, parent: &NodeId| Node {
        id: id.clone(),
        kind,
        subkind: subkind.to_owned(),
        parent: Some(parent.clone()),
        lang: None,
        span: None,
        visibility: Visibility::Public,
        content_hash: String::new(),
        signature_hash: None,
        metrics: None,
        path: None,
        route: None,
        entry: false,
        entry_type: None,
        child_count: None,
    };
    out.nodes
        .push(make(&group, NodeKind::Module, "external-group", ctx.repo));
    out.nodes
        .push(make(&id, NodeKind::External, "external", &group));
    id
}

fn warn_only(path: &str, reason: &str) -> FileIndex {
    FileIndex {
        warnings: vec![format!("{path}: {reason}")],
        ..FileIndex::default()
    }
}

fn first_error(node: PyNode<'_>) -> Option<PyNode<'_>> {
    if node.is_error() || node.is_missing() {
        return Some(node);
    }
    let mut cursor = node.walk();
    node.children(&mut cursor)
        .filter(|c| c.has_error())
        .find_map(first_error)
}

pub(crate) fn text<'a>(node: PyNode<'_>, bytes: &'a [u8]) -> &'a str {
    std::str::from_utf8(&bytes[node.byte_range()]).unwrap_or("")
}

fn collect_imports(
    node: PyNode<'_>,
    bytes: &[u8],
    imports: &mut Vec<Import>,
    bindings: &mut Vec<Binding>,
) {
    match node.kind() {
        "import_statement" => {
            let mut cursor = node.walk();
            for item in node.children_by_field_name("name", &mut cursor) {
                let (module, local) = match item.kind() {
                    "aliased_import" => (
                        item.child_by_field_name("name"),
                        item.child_by_field_name("alias"),
                    ),
                    _ => (Some(item), None),
                };
                let Some(module) = module else { continue };
                let specifier = text(module, bytes).to_owned();
                let local = match local {
                    Some(alias) => Some(text(alias, bytes).to_owned()),
                    None => (!specifier.contains('.')).then(|| specifier.clone()),
                };
                if let Some(local) = local {
                    bindings.push(Binding {
                        local,
                        specifier: specifier.clone(),
                        imported: "*".to_owned(),
                    });
                }
                imports.push(Import {
                    specifier,
                    names: vec!["*".to_owned()],
                });
            }
            return;
        }
        "import_from_statement" => {
            let Some(module) = node.child_by_field_name("module_name") else {
                return;
            };
            let specifier = text(module, bytes).to_owned();
            let mut names = Vec::new();
            let mut cursor = node.walk();
            for item in node.children_by_field_name("name", &mut cursor) {
                let (name, alias) = match item.kind() {
                    "aliased_import" => (
                        item.child_by_field_name("name"),
                        item.child_by_field_name("alias"),
                    ),
                    _ => (Some(item), None),
                };
                let Some(name) = name else { continue };
                let name = text(name, bytes).to_owned();
                bindings.push(Binding {
                    local: alias.map_or_else(|| name.clone(), |a| text(a, bytes).to_owned()),
                    specifier: specifier.clone(),
                    imported: name.clone(),
                });
                names.push(name);
            }
            let mut c = node.walk();
            if node.children(&mut c).any(|n| n.kind() == "wildcard_import") {
                names.push("*".to_owned());
            }
            imports.push(Import { specifier, names });
            return;
        }
        _ => {}
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_imports(child, bytes, imports, bindings);
    }
}

fn build_symbol(name_node: PyNode<'_>, decl: PyNode<'_>, bytes: &[u8]) -> Option<(usize, Symbol)> {
    let name = text(name_node, bytes).to_owned();
    let wrapper = decl.parent().filter(|p| p.kind() == "decorated_definition");
    let span_node = wrapper.unwrap_or(decl);
    let container = span_node.parent()?;
    let (full_name, subkind, visibility) = match container.kind() {
        "module" if decl.kind() == "function_definition" => {
            let v = visibility_of(&name, true);
            (name, "function", v)
        }
        "module" => {
            let v = visibility_of(&name, true);
            (name, "class", v)
        }
        "block" if decl.kind() == "function_definition" => {
            let class_decl = container
                .parent()
                .filter(|c| c.kind() == "class_definition")?;
            let class_wrapper = class_decl
                .parent()
                .filter(|p| p.kind() == "decorated_definition");
            if class_wrapper.unwrap_or(class_decl).parent()?.kind() != "module" {
                return None;
            }
            let class_name = text(class_decl.child_by_field_name("name")?, bytes);
            let v = visibility_of(&name, visibility_of(class_name, true) == Visibility::Public);
            (format!("{class_name}.{name}"), "method", v)
        }
        _ => return None,
    };
    let mut sig = tokens(decl, bytes, decl.child_by_field_name("body"));
    if sig.last().is_some_and(|t| t == ":") {
        sig.pop();
    }
    let signature = render(&sig);
    let content = hash(&tokens(span_node, bytes, None).join("\u{1}"));
    Some((
        span_node.start_byte(),
        Symbol {
            name: full_name,
            subkind: subkind.to_owned(),
            visibility,
            span: Span {
                start_line: span_node.start_position().row as u32 + 1,
                end_line: span_node.end_position().row as u32 + 1,
            },
            content_hash: content,
            signature_hash: Some(hash(&signature)),
            signature: Some(signature),
        },
    ))
}

/// A leading underscore marks an internal name; dunder names are public.
fn visibility_of(name: &str, public_scope: bool) -> Visibility {
    let dunder = name.starts_with("__") && name.ends_with("__") && name.len() > 4;
    if public_scope && (dunder || !name.starts_with('_')) {
        Visibility::Public
    } else {
        Visibility::Internal
    }
}

/// Leaf tokens of `node` without comments, without the subtree `skip` and without
/// semicolons and trailing commas (formatting noise). Strings, starred names and
/// signed numbers are single tokens.
fn tokens(node: PyNode<'_>, bytes: &[u8], skip: Option<PyNode<'_>>) -> Vec<String> {
    fn walk(node: PyNode<'_>, bytes: &[u8], skip: Option<usize>, out: &mut Vec<String>) {
        if Some(node.id()) == skip || node.kind() == "comment" {
            return;
        }
        match node.kind() {
            "string" | "concatenated_string" => {
                out.push(text(node, bytes).to_owned());
                return;
            }
            "list_splat_pattern" | "dictionary_splat_pattern" | "unary_operator" => {
                out.push(text(node, bytes).split_whitespace().collect());
                return;
            }
            _ => {}
        }
        if node.child_count() == 0 {
            if node.kind() != ";" {
                out.push(text(node, bytes).to_owned());
            }
            return;
        }
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            walk(child, bytes, skip, out);
        }
    }
    let mut raw = Vec::new();
    walk(node, bytes, skip.map(|n| n.id()), &mut raw);
    let mut out = Vec::with_capacity(raw.len());
    for (i, token) in raw.iter().enumerate() {
        let closing = raw
            .get(i + 1)
            .is_some_and(|n| matches!(n.as_str(), ")" | "]" | "}"));
        if token == "," && closing {
            continue;
        }
        out.push(token.clone());
    }
    out
}

/// Joins tokens with spaces, tightening around punctuation.
fn render(tokens: &[String]) -> String {
    let mut out = String::new();
    let mut previous: Option<&str> = None;
    for token in tokens {
        let tight_before = matches!(token.as_str(), "," | ")" | "]" | ":" | "." | "(" | "[");
        let tight_after = previous.is_some_and(|p| matches!(p, "(" | "[" | "."));
        if previous.is_some() && !tight_before && !tight_after {
            out.push(' ');
        }
        out.push_str(token);
        previous = Some(token);
    }
    out
}

fn hash(input: &str) -> String {
    Sha256::digest(input.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
