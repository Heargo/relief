//! Language adapter for TypeScript, TSX, JavaScript and JSX (tree-sitter).

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use relief_adapter_api::{EntryPoint, Extraction, LanguageAdapter, LinkContext, ResolveEnv, Usage};
use relief_model::{
    Edge, EdgeKind, Node, NodeId, NodeKind, Precision, SignatureVerdict, Span, Visibility,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use streaming_iterator::StreamingIterator;
use tree_sitter::{Language, Parser, Query, QueryCursor, QueryError};

mod compare;
mod complexity;
mod http;
mod refs;
mod resolve;
mod usages;

pub use http::HttpCall;
pub use refs::{Binding, Instance, Ref};

use resolve::{JsonMemo, Resolution, resolve};

const SYMBOLS_QUERY: &str = include_str!("../queries/symbols.scm");
const LANGS: [&str; 6] = ["ts", "tsx", "js", "jsx", "mts", "cts"];

/// A symbol declared in a file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    /// `"POST /checkout"` for the handler of a route declaration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
}

/// An import of another module.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Import {
    /// The module specifier as written.
    pub specifier: String,
    /// Names as exported by the target (`"default"`, `"*"` for a namespace,
    /// `export *`, literal `import()` and `require()`); empty for a side-effect import.
    pub names: Vec<String>,
}

/// Result of indexing one file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIndex {
    /// In source order, methods right after their class.
    pub symbols: Vec<Symbol>,
    /// In source order.
    pub imports: Vec<Import>,
    /// Calls, renders and references from top-level symbols, duplicates merged.
    pub refs: Vec<Ref>,
    /// Names bound by static imports.
    pub bindings: Vec<Binding>,
    /// Top-level `const x = new Class()`.
    pub instances: Vec<Instance>,
    /// Client calls with a literal path.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub http_calls: Vec<HttpCall>,
    pub warnings: Vec<String>,
}

/// Adapter for the TypeScript family of languages.
///
/// Clones share one parse counter (`parses`).
#[derive(Debug, Default, Clone)]
pub struct TsAdapter {
    parses: Arc<AtomicUsize>,
    /// Signature texts of the files indexed so far, by content: asking for them again
    /// (diff of a changed file already indexed) does not parse the file a second time.
    signatures: Arc<Mutex<HashMap<(bool, u64), Signatures>>>,
}

type Signatures = Arc<Vec<(String, String)>>;

/// Memo key of a file: grammar (TSX or not) and a hash of its bytes.
fn content_key(path: &str, bytes: &[u8]) -> (bool, u64) {
    use std::hash::{Hash, Hasher};
    let ext = path.rsplit_once('.').map_or("", |(_, e)| e);
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    (!matches!(ext, "ts" | "mts" | "cts"), hasher.finish())
}

fn signature_pairs(index: &FileIndex) -> Vec<(String, String)> {
    index
        .symbols
        .iter()
        .filter_map(|s| Some((s.name.clone(), s.signature.clone()?)))
        .collect()
}

/// The grammar and the symbols query, compiled once per grammar.
fn symbols_query(tsx: bool) -> (Language, &'static Result<Query, QueryError>) {
    static TS: OnceLock<Result<Query, QueryError>> = OnceLock::new();
    static TSX: OnceLock<Result<Query, QueryError>> = OnceLock::new();
    let (language, cell): (Language, _) = if tsx {
        (tree_sitter_typescript::LANGUAGE_TSX.into(), &TSX)
    } else {
        (tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(), &TS)
    };
    let query = cell.get_or_init(|| Query::new(&language, SYMBOLS_QUERY));
    (language, query)
}

impl TsAdapter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Number of tree-sitter parses made so far by this adapter and its clones.
    pub fn parses(&self) -> usize {
        self.parses.load(Ordering::Relaxed)
    }

    /// Symbols and warnings of one file. Never fails: a file that does not
    /// parse yields its valid symbols and a warning naming the path.
    pub fn index_file(&self, path: &str, bytes: &[u8]) -> FileIndex {
        let ext = path.rsplit_once('.').map_or("", |(_, e)| e);
        let tsx = !matches!(ext, "ts" | "mts" | "cts");
        let (language, query) = symbols_query(tsx);
        let mut parser = Parser::new();
        if parser.set_language(&language).is_err() {
            return warn_only(path, "grammar unavailable");
        }
        self.parses.fetch_add(1, Ordering::Relaxed);
        let Some(tree) = parser.parse(bytes, None) else {
            return warn_only(path, "could not be parsed");
        };
        let Ok(query) = query else {
            return warn_only(path, "symbol query invalid");
        };
        let root = tree.root_node();
        let names = query.capture_names();

        let mut found: Vec<(usize, Symbol)> = Vec::new();
        let mut cursor = QueryCursor::new();
        let mut matches = cursor.matches(query, root, bytes);
        while let Some(m) = matches.next() {
            let mut name_node = None;
            let mut decl = None;
            let mut kind = "";
            for capture in m.captures() {
                let capture_name = names[capture.index as usize];
                if capture_name == "name" {
                    name_node = Some(capture.node);
                } else {
                    decl = Some(capture.node);
                    kind = capture_name;
                }
            }
            let (Some(name_node), Some(decl)) = (name_node, decl) else {
                continue;
            };
            if decl.has_error() {
                continue;
            }
            if let Some(symbol) = build_symbol(kind, name_node, decl, bytes) {
                found.push((decl.start_byte(), symbol));
            }
        }
        found.sort_by_key(|(start, _)| *start);
        let mut seen = HashSet::new();
        let mut symbols: Vec<Symbol> = found
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
        collect_imports(root, bytes, &mut imports);
        let bindings = refs::bindings(root, bytes);
        let instances = refs::instances(root, bytes);
        let known: HashSet<&str> = symbols.iter().map(|s: &Symbol| s.name.as_str()).collect();
        let (mut found_refs, mut http_calls, routes) =
            refs::collect(root, bytes, &bindings, &instances);
        found_refs.retain(|r| known.contains(r.from.as_str()));
        http_calls.retain(|c| known.contains(c.from.as_str()));
        for route in routes {
            if let Some(handler) = symbols.iter_mut().find(|s| s.name == route.handler) {
                handler.subkind = "route".to_owned();
                handler.route = Some(route.route);
            }
        }
        FileIndex {
            symbols,
            imports,
            refs: found_refs,
            bindings,
            instances,
            http_calls,
            warnings,
        }
    }
}

impl LanguageAdapter for TsAdapter {
    fn name(&self) -> &str {
        "typescript"
    }

    fn version(&self) -> u32 {
        3
    }

    fn handles(&self, lang: &str) -> bool {
        LANGS.contains(&lang)
    }

    fn symbol_signatures(&self, path: &str, bytes: &[u8]) -> Vec<(String, String)> {
        let handled = path
            .rsplit_once('.')
            .is_some_and(|(_, ext)| matches!(ext, "ts" | "tsx" | "mts" | "cts"));
        if !handled {
            return Vec::new();
        }
        let key = content_key(path, bytes);
        if let Some(hit) = self
            .signatures
            .lock()
            .ok()
            .and_then(|m| m.get(&key).cloned())
        {
            return hit.as_ref().clone();
        }
        signature_pairs(&self.index_file(path, bytes))
    }

    fn complexity(&self, path: &str, bytes: &[u8]) -> Vec<(String, u32)> {
        let spans: Vec<(String, Span)> = self
            .index_file(path, bytes)
            .symbols
            .into_iter()
            .map(|s| (s.name, s.span))
            .collect();
        complexity::per_symbol(path, bytes, &spans, &self.parses)
    }

    fn usages(&self, path: &str, bytes: &[u8], bindings: &[String]) -> Option<Vec<Usage>> {
        let handled = path
            .rsplit_once('.')
            .is_some_and(|(_, ext)| LANGS.contains(&ext));
        handled.then(|| usages::usages(path, bytes, bindings, &self.parses))
    }

    fn module_usages(
        &self,
        path: &str,
        bytes: &[u8],
        target: &str,
        env: &ResolveEnv<'_>,
    ) -> Option<Vec<Usage>> {
        let handled = path
            .rsplit_once('.')
            .is_some_and(|(_, ext)| LANGS.contains(&ext));
        handled.then(|| usages::module_usages(path, bytes, target, env, &self.parses))
    }

    fn compare_signatures(&self, before: &str, after: &str) -> SignatureVerdict {
        compare::compare(before, after)
    }

    fn extract(&self, file: &Node, bytes: &[u8]) -> Extraction {
        self.extract_indexed(file, bytes).0
    }

    fn extract_indexed(&self, file: &Node, bytes: &[u8]) -> (Extraction, Option<String>) {
        let id = file.id.to_string();
        let path = id.split_once("::file:").map_or(id.as_str(), |(_, p)| p);
        let index = self.index_file(path, bytes);
        let serialised = serde_json::to_string(&index).ok();
        if let Ok(mut memo) = self.signatures.lock() {
            memo.insert(content_key(path, bytes), Arc::new(signature_pairs(&index)));
        }
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
                route: s.route,
                entry: false,
                entry_type: None,
                child_count: None,
                is_test: false,
            })
            .collect();
        let extraction = Extraction {
            nodes,
            edges: Vec::<Edge>::new(),
            warnings: index.warnings,
            entries: Vec::new(),
        };
        (extraction, serialised)
    }

    /// What resolution reads: `tsconfig*.json`, `jsconfig*.json`, `package.json` and the
    /// files their relative `extends` lead to. A change of an `extends` is a change of the
    /// tsconfig itself, so the chains of the new tree are enough.
    fn link_input(
        &self,
        path: &str,
        paths: &[&str],
        read: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> bool {
        resolve::is_link_config(path) || resolve::is_extended_by_config(path, paths, read)
    }

    fn link_affected(
        &self,
        _path: &str,
        index: Option<&str>,
        ctx: &LinkContext<'_>,
        added: &std::collections::HashSet<String>,
        routes_changed: bool,
    ) -> bool {
        if added.is_empty() && !routes_changed {
            return false;
        }
        let Some(index) = index.and_then(|j| serde_json::from_str::<FileIndex>(j).ok()) else {
            return true;
        };
        if routes_changed && !index.http_calls.is_empty() {
            return true;
        }
        if added.is_empty() {
            return false;
        }
        let memo = JsonMemo::default();
        index
            .imports
            .iter()
            .map(|i| &i.specifier)
            .chain(index.bindings.iter().map(|b| &b.specifier))
            .any(|s| matches!(resolve(s, ctx, &memo), Resolution::File(p) if added.contains(&p)))
    }

    fn link(&self, file: &Node, bytes: &[u8], ctx: &LinkContext<'_>) -> Extraction {
        self.link_indexed(file, bytes, None, ctx)
    }

    fn link_indexed(
        &self,
        file: &Node,
        bytes: &[u8],
        index: Option<&str>,
        ctx: &LinkContext<'_>,
    ) -> Extraction {
        let index = index
            .and_then(|json| serde_json::from_str::<FileIndex>(json).ok())
            .unwrap_or_else(|| self.index_file(ctx.path, bytes));
        let mut out = Extraction::default();
        let edge = |to: NodeId, out: &mut Extraction| {
            let e = Edge {
                from: file.id.clone(),
                to,
                kind: EdgeKind::Imports,
                precision: Precision::Syntactic,
                heuristic: false,
                count: None,
            };
            if !out.edges.contains(&e) {
                out.edges.push(e);
            }
        };
        let memo = JsonMemo::default();
        link_refs(self, file, &index, ctx, &memo, &mut out);
        for import in index.imports {
            match resolve(&import.specifier, ctx, &memo) {
                Resolution::File(path) => {
                    let Some(target) = ctx.files.get(&path) else {
                        continue;
                    };
                    let named: Vec<NodeId> = import
                        .names
                        .iter()
                        .filter(|n| !matches!(n.as_str(), "default" | "*"))
                        .map(|n| target.clone().symbol(n))
                        .filter(|id| ctx.nodes.contains(id))
                        .collect();
                    if named.is_empty() {
                        edge(target.clone(), &mut out);
                    }
                    for id in named {
                        edge(id, &mut out);
                    }
                }
                Resolution::External(name) => {
                    let id = external_node(&name, ctx, &mut out);
                    edge(id, &mut out);
                }
                Resolution::Unresolved => {
                    out.warnings.push(format!(
                        "{}: unresolved import \"{}\"",
                        ctx.path, import.specifier
                    ));
                    let id = external_node(UNRESOLVED, ctx, &mut out);
                    edge(id, &mut out);
                }
            }
        }
        out
    }
}

/// Symbol-to-symbol edges for the refs of `index`, resolved by scope: the
/// symbols of the file first, then the names it imports.
fn link_refs(
    adapter: &TsAdapter,
    file: &Node,
    index: &FileIndex,
    ctx: &LinkContext<'_>,
    memo: &JsonMemo,
    out: &mut Extraction,
) {
    let mut instances: HashMap<String, Vec<Instance>> = HashMap::new();
    for r in &index.refs {
        let from = file.id.clone().symbol(&r.from);
        let local = file.id.clone().symbol(&r.name);
        let to = if ctx.nodes.contains(&local) {
            Some(local)
        } else {
            resolve_import(adapter, &r.name, index, ctx, memo, &mut instances)
        };
        let Some(to) = to.filter(|t| *t != from) else {
            continue;
        };
        let edge = Edge {
            from,
            to,
            kind: r.kind,
            precision: Precision::Syntactic,
            heuristic: false,
            count: None,
        };
        if !out.edges.contains(&edge) {
            out.edges.push(edge);
        }
    }
    link_http(file, index, ctx, out);
    link_entries(file, index, ctx, out);
}

/// Entry points of a file: route handlers, pages (`.tsx` under a `pages/` folder) and the
/// exported functions of a `jobs/` folder.
fn link_entries(file: &Node, index: &FileIndex, ctx: &LinkContext<'_>, out: &mut Extraction) {
    let mut flag = |node: NodeId, ty: &str| {
        out.entries.push(EntryPoint {
            node,
            entry_type: ty.to_owned(),
        });
    };
    for s in index.symbols.iter().filter(|s| s.route.is_some()) {
        flag(file.id.clone().symbol(&s.name), "route");
    }
    let segments: Vec<&str> = ctx.path.split('/').collect();
    let name = segments.last().copied().unwrap_or_default();
    let in_dir = |dir: &str| segments.len() > 1 && segments[..segments.len() - 1].contains(&dir);
    let is_test = name.contains(".spec.") || name.contains(".test.");
    if is_test {
        return;
    }
    if name.ends_with(".tsx") && in_dir("pages") {
        flag(file.id.clone(), "page");
    }
    if in_dir("jobs") {
        for s in index
            .symbols
            .iter()
            .filter(|s| s.subkind == "function" && s.visibility == Visibility::Public)
        {
            flag(file.id.clone().symbol(&s.name), "job");
        }
    }
}

/// `http` edges from the client calls of `index` to the routes of the repository.
fn link_http(file: &Node, index: &FileIndex, ctx: &LinkContext<'_>, out: &mut Extraction) {
    for call in &index.http_calls {
        let from = file.id.clone().symbol(&call.from);
        let mut targets: Vec<(&NodeId, &String)> = ctx.routes.iter().collect();
        targets.sort_by_key(|(id, _)| id.to_string());
        for (to, route) in targets {
            let Some((verb, path)) = route.split_once(' ') else {
                continue;
            };
            if *to == from
                || call.verb.as_deref().is_some_and(|v| v != verb)
                || !http::path_matches(path, &call.path)
            {
                continue;
            }
            let edge = Edge {
                from: from.clone(),
                to: to.clone(),
                kind: EdgeKind::Http,
                precision: Precision::Syntactic,
                heuristic: call.verb.is_none(),
                count: None,
            };
            if !out.edges.contains(&edge) {
                out.edges.push(edge);
            }
        }
    }
}

fn resolve_import(
    adapter: &TsAdapter,
    name: &str,
    index: &FileIndex,
    ctx: &LinkContext<'_>,
    memo: &JsonMemo,
    cache: &mut HashMap<String, Vec<Instance>>,
) -> Option<NodeId> {
    let (recv, method) = match name.split_once('.') {
        Some((r, m)) => (r, Some(m)),
        None => (name, None),
    };
    let binding = index.bindings.iter().find(|b| b.local == recv)?;
    let Resolution::File(path) = resolve(&binding.specifier, ctx, memo) else {
        return None;
    };
    let target = ctx.files.get(&path)?;
    let symbol = match (method, binding.imported.as_str()) {
        (None, "default" | "*") => return None,
        (None, imported) => imported.to_owned(),
        (Some(method), "*") => method.to_owned(),
        (Some(method), imported) => {
            let found = cache.entry(path.clone()).or_insert_with(|| {
                #[derive(Deserialize)]
                struct Instances {
                    instances: Vec<Instance>,
                }
                ctx.indexes
                    .get(&path)
                    .and_then(|json| serde_json::from_str::<Instances>(json).ok())
                    .map(|i| i.instances)
                    .or_else(|| (ctx.read)(&path).map(|b| adapter.index_file(&path, &b).instances))
                    .unwrap_or_default()
            });
            let class = &found.iter().find(|i| i.name == imported)?.class;
            format!("{class}.{method}")
        }
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
        is_test: false,
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

fn collect_imports(node: TsNode<'_>, bytes: &[u8], out: &mut Vec<Import>) {
    match node.kind() {
        "import_statement" | "export_statement" if node.child_by_field_name("source").is_some() => {
            if let Some(import) = static_import(node, bytes) {
                out.push(import);
            }
            return;
        }
        "call_expression" => {
            if let Some(import) = call_import(node, bytes) {
                out.push(import);
            }
        }
        _ => {}
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_imports(child, bytes, out);
    }
}

fn string_value(node: TsNode<'_>, bytes: &[u8]) -> Option<String> {
    if node.kind() != "string" {
        return None;
    }
    let raw = text(node, bytes);
    raw.get(1..raw.len().checked_sub(1)?).map(str::to_owned)
}

fn static_import(node: TsNode<'_>, bytes: &[u8]) -> Option<Import> {
    let specifier = string_value(node.child_by_field_name("source")?, bytes)?;
    let mut names = Vec::new();
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            "*" | "namespace_export" => names.push("*".to_owned()),
            "import_clause" | "export_clause" => clause_names(child, bytes, &mut names),
            _ => {}
        }
    }
    Some(Import { specifier, names })
}

fn clause_names(clause: TsNode<'_>, bytes: &[u8], names: &mut Vec<String>) {
    let mut cursor = clause.walk();
    for child in clause.children(&mut cursor) {
        match child.kind() {
            "identifier" => names.push("default".to_owned()),
            "namespace_import" => names.push("*".to_owned()),
            "named_imports" => clause_names(child, bytes, names),
            "import_specifier" | "export_specifier" => {
                if let Some(name) = child.child_by_field_name("name") {
                    names.push(text(name, bytes).to_owned());
                }
            }
            _ => {}
        }
    }
}

/// `import("x")` and `require("x")` with a string literal argument.
fn call_import(call: TsNode<'_>, bytes: &[u8]) -> Option<Import> {
    let function = call.child_by_field_name("function")?;
    let is_import = function.kind() == "import"
        || (function.kind() == "identifier" && text(function, bytes) == "require");
    if !is_import {
        return None;
    }
    let argument = call.child_by_field_name("arguments")?.named_child(0)?;
    Some(Import {
        specifier: string_value(argument, bytes)?,
        names: vec!["*".to_owned()],
    })
}

fn first_error(node: tree_sitter::Node<'_>) -> Option<tree_sitter::Node<'_>> {
    if node.is_error() || node.is_missing() {
        return Some(node);
    }
    let mut cursor = node.walk();
    node.children(&mut cursor)
        .filter(|c| c.has_error())
        .find_map(first_error)
}

type TsNode<'a> = tree_sitter::Node<'a>;

fn text<'a>(node: TsNode<'_>, bytes: &'a [u8]) -> &'a str {
    std::str::from_utf8(&bytes[node.byte_range()]).unwrap_or("")
}

/// Whether the declaration sits at the top of the file, possibly exported.
fn top_level(decl: TsNode<'_>) -> Option<bool> {
    let parent = decl.parent()?;
    match parent.kind() {
        "program" => Some(false),
        "export_statement" if parent.parent()?.kind() == "program" => Some(true),
        _ => None,
    }
}

fn build_symbol(
    kind: &str,
    name_node: TsNode<'_>,
    decl: TsNode<'_>,
    bytes: &[u8],
) -> Option<Symbol> {
    let name = text(name_node, bytes).trim_start_matches('#').to_owned();
    let mut span_node = decl;
    let (full_name, subkind, visibility, mut sig): (String, &str, Visibility, Vec<String>);
    let prefix_of = |node: TsNode<'_>| -> Vec<String> {
        let Some(parent) = node.parent().filter(|p| p.kind() == "export_statement") else {
            return Vec::new();
        };
        let mut cursor = parent.walk();
        parent
            .children(&mut cursor)
            .filter(|c| matches!(c.kind(), "export" | "default"))
            .map(|c| text(c, bytes).to_owned())
            .collect()
    };
    match kind {
        "function" | "class" | "type" | "enum" => {
            let exported = top_level(decl)?;
            visibility = vis(exported);
            subkind = match kind {
                "function" if is_component(&name, decl) => "component",
                "function" if is_hook(&name) => "hook",
                "function" => "function",
                "class" => "class",
                "enum" => "enum",
                _ => "type",
            };
            let body = if matches!(kind, "function" | "class") {
                decl.child_by_field_name("body")
            } else {
                None
            };
            sig = prefix_of(decl);
            sig.extend(tokens(decl, bytes, body));
            full_name = name;
        }
        "variable" => {
            let statement = decl.parent()?;
            if !matches!(
                statement.kind(),
                "lexical_declaration" | "variable_declaration"
            ) {
                return None;
            }
            let exported = top_level(statement)?;
            visibility = vis(exported);
            if statement.named_child_count() == 1 {
                span_node = statement;
            }
            let value = decl.child_by_field_name("value").filter(|v| {
                matches!(
                    v.kind(),
                    "arrow_function" | "function_expression" | "function"
                )
            });
            subkind = match value {
                Some(v) if is_component(&name, v) => "component",
                Some(_) if is_hook(&name) => "hook",
                _ => "const",
            };
            sig = prefix_of(statement);
            if let Some(keyword) = statement.child(0) {
                sig.push(text(keyword, bytes).to_owned());
            }
            sig.extend(tokens(name_node, bytes, None));
            if let Some(annotation) = decl.child_by_field_name("type") {
                sig.extend(tokens(annotation, bytes, None));
            }
            if let Some(v) = value {
                sig.extend(tokens(v, bytes, v.child_by_field_name("body")));
            }
            full_name = name;
        }
        "method" => {
            let class = decl
                .parent()
                .filter(|p| p.kind() == "class_body")?
                .parent()?;
            if !matches!(
                class.kind(),
                "class_declaration" | "abstract_class_declaration"
            ) {
                return None;
            }
            let exported = top_level(class)?;
            let class_name = text(class.child_by_field_name("name")?, bytes);
            let private = name_node.kind() == "private_property_identifier" || {
                let mut cursor = decl.walk();
                decl.children(&mut cursor)
                    .any(|c| c.kind() == "accessibility_modifier" && text(c, bytes) == "private")
            };
            visibility = vis(exported && !private);
            subkind = "method";
            sig = tokens(decl, bytes, decl.child_by_field_name("body"));
            full_name = format!("{class_name}.{name}");
        }
        _ => return None,
    }
    let content = hash(&tokens(span_node, bytes, None).join("\u{1}"));
    let signature = render(&sig);
    let start = span_node.start_position().row as u32 + 1;
    let end = span_node.end_position().row as u32 + 1;
    Some(Symbol {
        name: full_name,
        subkind: subkind.to_owned(),
        visibility,
        span: Span {
            start_line: start,
            end_line: end,
        },
        content_hash: content,
        signature_hash: Some(hash(&signature)),
        signature: Some(signature),
        route: None,
    })
}

fn vis(exported: bool) -> Visibility {
    if exported {
        Visibility::Public
    } else {
        Visibility::Internal
    }
}

fn is_hook(name: &str) -> bool {
    name.starts_with("use")
}

fn is_component(name: &str, function: TsNode<'_>) -> bool {
    name.chars().next().is_some_and(char::is_uppercase) && contains_jsx(function)
}

fn contains_jsx(node: TsNode<'_>) -> bool {
    if matches!(
        node.kind(),
        "jsx_element" | "jsx_self_closing_element" | "jsx_fragment"
    ) {
        return true;
    }
    let mut cursor = node.walk();
    node.children(&mut cursor).any(contains_jsx)
}

/// Leaf tokens of `node` without comments, without the subtree `skip`,
/// without semicolons and trailing commas (formatting noise); string quotes are
/// normalised to `"` so a literal stays distinct from an identifier.
fn tokens(node: TsNode<'_>, bytes: &[u8], skip: Option<TsNode<'_>>) -> Vec<String> {
    fn walk(node: TsNode<'_>, bytes: &[u8], skip: Option<usize>, out: &mut Vec<String>) {
        if Some(node.id()) == skip || node.kind() == "comment" {
            return;
        }
        if node.child_count() == 0 {
            let quote = matches!(node.kind(), "\"" | "'")
                && node.parent().is_some_and(|p| p.kind() == "string");
            if quote {
                out.push("\"".to_owned());
            } else if node.kind() != ";" {
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
            .is_some_and(|n| matches!(n.as_str(), ")" | "]" | "}" | ">"));
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
        let tight_before = matches!(
            token.as_str(),
            "," | ")" | "]" | "?" | ":" | "." | "(" | "<" | ">" | "["
        );
        let tight_after = previous.is_some_and(|p| matches!(p, "(" | "[" | "." | "<"));
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
