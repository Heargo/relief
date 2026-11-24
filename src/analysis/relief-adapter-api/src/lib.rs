//! Contracts of the extractors: language adapters and project detectors.
//!
//! Both are pure: they receive bytes and a blob reader from the caller and
//! never read git themselves.

use std::collections::{BTreeMap, HashMap, HashSet};

pub use relief_model::Usage;
use relief_model::{Edge, EdgeKind, Node, NodeId, Precision, SignatureReason, SignatureVerdict};

/// A language adapter: turns one file into symbol nodes and edges.
pub trait LanguageAdapter: Send + Sync {
    /// Name reported in the snapshot `meta`.
    fn name(&self) -> &str;
    /// Version of the extraction logic; part of the cache key, bump it to invalidate.
    fn version(&self) -> u32 {
        1
    }
    /// Whether the adapter handles files of this language.
    fn handles(&self, lang: &str) -> bool;
    /// Symbols, edges and warnings of `file`, a node of the graph, given its bytes.
    fn extract(&self, file: &Node, bytes: &[u8]) -> Extraction;
    /// Like `extract`, plus an opaque, serialised per-file index that the index keeps in its
    /// cache next to the extraction and hands back to `link_indexed`, so `link` does not
    /// parse the file again. `None`: this adapter keeps nothing.
    fn extract_indexed(&self, file: &Node, bytes: &[u8]) -> (Extraction, Option<String>) {
        (self.extract(file, bytes), None)
    }
    /// Like `link`, given what `extract_indexed` returned for the same bytes (if anything).
    fn link_indexed(
        &self,
        file: &Node,
        bytes: &[u8],
        _index: Option<&str>,
        ctx: &LinkContext<'_>,
    ) -> Extraction {
        self.link(file, bytes, ctx)
    }
    /// Second pass, once every file has been extracted: cross-file edges
    /// (imports) and the nodes they need (external packages).
    fn link(&self, _file: &Node, _bytes: &[u8], _ctx: &LinkContext<'_>) -> Extraction {
        Extraction::default()
    }
    /// Whether a change of `path`, a file this adapter does not extract (configuration, a
    /// manifest...), can alter how other files link. The index then rebuilds from scratch.
    /// `paths` and `read` describe the new tree. Conservative default: any such change does.
    fn link_input(
        &self,
        _path: &str,
        _paths: &[&str],
        _read: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> bool {
        true
    }
    /// Whether the links of the unchanged file `path` may differ now that the paths `added`
    /// exist, or the routes changed. Asked for every unchanged file whose links do not point
    /// into a changed file, on each incremental build. `index` is what `extract_indexed` returned for it;
    /// `ctx` describes the new tree. Conservative default: yes.
    fn link_affected(
        &self,
        _path: &str,
        _index: Option<&str>,
        _ctx: &LinkContext<'_>,
        _added: &HashSet<String>,
        _routes_changed: bool,
    ) -> bool {
        true
    }
    /// `(symbol name, normalised signature text)` of the symbols of one file
    /// of this language, identified by its repository path; empty when the
    /// adapter does not handle that path.
    fn symbol_signatures(&self, _path: &str, _bytes: &[u8]) -> Vec<(String, String)> {
        Vec::new()
    }
    /// `(symbol name, cyclomatic complexity)` of the symbols of one file of this language,
    /// identified by its repository path; empty when the adapter does not handle that path.
    /// Not part of the extraction: the index cache does not depend on it.
    fn complexity(&self, _path: &str, _bytes: &[u8]) -> Vec<(String, u32)> {
        Vec::new()
    }
    /// The references, in one file of this language, to the imported `bindings` (names as
    /// exported by the target module), in source order. `None`: not supported by this adapter.
    fn usages(&self, _path: &str, _bytes: &[u8], _bindings: &[String]) -> Option<Vec<Usage>> {
        None
    }
    /// The references, in one file of this language, to the local names of its default and
    /// namespace imports of the module `target` (repository path); `env` is what resolves
    /// specifiers like the index does. `Usage::binding` is the local name. `None`: not
    /// supported by this adapter.
    fn module_usages(
        &self,
        _path: &str,
        _bytes: &[u8],
        _target: &str,
        _env: &ResolveEnv<'_>,
    ) -> Option<Vec<Usage>> {
        None
    }
    /// The packages this repository publishes (a name other repositories import it by, and the
    /// repository path of its entry point). `paths` and `read` describe the tree.
    fn published_packages(
        &self,
        _paths: &[&str],
        _read: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Vec<PublishedPackage> {
        Vec::new()
    }
    /// The HTTP calls of `file` with a literal path, from its serialised per-file index
    /// (`extract_indexed`). Routes are not listed: a handler node carries its `route`.
    fn http_calls(&self, _file: &Node, _index: Option<&str>) -> Vec<HttpCallSite> {
        Vec::new()
    }
    /// Judges a change between two normalised signature texts of this language.
    fn compare_signatures(&self, before: &str, after: &str) -> SignatureVerdict {
        SignatureVerdict {
            breaking: before != after,
            reason: SignatureReason::Unspecified,
            equivalent: before == after,
        }
    }
}

/// Placeholder of a `${…}` substitution in a client path.
pub const PATH_WILDCARD: char = '\u{0}';

/// An HTTP client call with a literal path, made from a symbol.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpCallSite {
    /// The calling symbol.
    pub from: NodeId,
    /// Upper-case verb, `None` when it cannot be told.
    pub verb: Option<String>,
    /// Path as written, substitutions replaced by `PATH_WILDCARD`, query string removed.
    pub path: String,
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
            .all(|(r, c)| r.starts_with(':') || c.contains(PATH_WILDCARD) || r == c)
}

/// Whether a call with this verb (`None`: unknown) can reach a route of `route_verb`.
pub fn verb_matches(call_verb: Option<&str>, route_verb: &str) -> bool {
    call_verb.is_none_or(|v| v == route_verb)
}

/// The `http` edge from a calling symbol to a route handler; heuristic when the verb of the
/// call is unknown.
pub fn http_edge(from: NodeId, to: NodeId, call_verb: Option<&str>) -> Edge {
    Edge {
        from,
        to,
        kind: EdgeKind::Http,
        precision: Precision::Syntactic,
        heuristic: call_verb.is_none(),
        count: None,
    }
}

/// A package a repository publishes: the name it is imported by and its entry point.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishedPackage {
    pub name: String,
    /// The name other repositories write in an import to reach it.
    pub import_name: String,
    /// Repository path of the entry point file.
    pub entry: String,
}

/// What an adapter needs to resolve import specifiers outside of linking.
pub struct ResolveEnv<'a> {
    /// Every path of the commit tree.
    pub paths: &'a [&'a str],
    /// Reads a blob of the commit tree by path.
    pub read: &'a dyn Fn(&str) -> Option<Vec<u8>>,
    /// Workspace package name to directory.
    pub package_dirs: &'a BTreeMap<String, String>,
}

/// What an adapter may look at to link one file to the rest of the repository.
pub struct LinkContext<'a> {
    /// Repository path of the file being linked.
    pub path: &'a str,
    /// Every path of the commit tree.
    pub paths: &'a [&'a str],
    /// Reads a blob of the commit tree by path.
    pub read: &'a dyn Fn(&str) -> Option<Vec<u8>>,
    /// Workspace package name to directory.
    pub package_dirs: &'a BTreeMap<String, String>,
    /// File node id by repository path.
    pub files: &'a HashMap<String, NodeId>,
    /// Ids of every node extracted so far.
    pub nodes: &'a HashSet<NodeId>,
    /// Route (`"POST /checkout"`) of each route handler node.
    pub routes: &'a HashMap<NodeId, String>,
    /// Root node of the repository.
    pub repo: &'a NodeId,
    /// Serialised per-file index (`extract_indexed`) of the files of this adapter, by path;
    /// empty when unknown.
    pub indexes: &'a HashMap<String, String>,
}

/// What an adapter extracts from one file.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Extraction {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    /// One per problem (for example a file that does not parse), naming the file.
    pub warnings: Vec<String>,
    /// Nodes of the graph the adapter recognises as entry points of the system.
    pub entries: Vec<EntryPoint>,
}

/// A node flagged as an entry point (`entry_type`: `route`, `page`, `job`, `script`, `main`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryPoint {
    pub node: NodeId,
    pub entry_type: String,
}

/// Result of a project detector.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Detection {
    /// Name of the detector (`"workspaces"`, `"generic"`...).
    pub detector: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    /// Non-fatal problems found while detecting.
    pub warnings: Vec<String>,
    /// Package name to directory, for workspace packages.
    pub package_dirs: BTreeMap<String, String>,
    /// Nodes the detector recognises as entry points (`script`: a `package.json` script).
    pub entries: Vec<EntryPoint>,
}

/// A project detector: `(repo name, paths, blob reader) -> detection`.
pub trait Detector: Send + Sync {
    /// `None` means "this is not my kind of project".
    fn detect(
        &self,
        repo_name: &str,
        paths: &[&str],
        read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Option<Detection>;

    /// Like `detect`, with the content hashes already known for some paths (`known(path)`):
    /// a file whose hash is known is not read to be hashed. A detector that does not use
    /// them ignores them.
    fn detect_with(
        &self,
        repo_name: &str,
        paths: &[&str],
        read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
        known: &dyn Fn(&str) -> Option<String>,
    ) -> Option<Detection> {
        let _ = known;
        self.detect(repo_name, paths, read_blob)
    }
}
