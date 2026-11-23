use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::NodeId;

/// Level of a node in the containment hierarchy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Repo,
    Workspace,
    Service,
    Package,
    Module,
    File,
    Symbol,
    External,
}

/// Kind of relation between two nodes.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    Imports,
    Calls,
    References,
    Renders,
    Extends,
    Implements,
    Http,
    DependsOn,
    /// Files that change in the same commits (git history, not the code).
    CoChange,
}

/// How an edge was obtained.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Precision {
    Syntactic,
    Resolved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Public,
    Internal,
}

/// Source range, 1-based lines.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub start_line: u32,
    pub end_line: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub loc: u32,
    /// Cyclomatic complexity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub complexity: Option<u32>,
    /// Commits of the window that touch the file or the lines of the symbol.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub churn: Option<u32>,
    /// Majority author of those commits.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// A test file or symbol links to the node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tested: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: NodeId,
    pub kind: NodeKind,
    pub subkind: String,
    pub parent: Option<NodeId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub span: Option<Span>,
    pub visibility: Visibility,
    pub content_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metrics: Option<Metrics>,
    /// Folder in the repository, without trailing `/` (workspace systems and modules).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// `"POST /checkout"` on the handler of a route (`subkind: route`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    /// The node is an entry point of the system (route, page, job, script, main).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub entry: bool,
    /// `route`, `page`, `job`, `script` or `main` on an entry point.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_type: Option<String>,
    /// Exact number of direct children in the full graph, on a container of a subgraph whose
    /// children are not all in it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_count: Option<usize>,
    /// A test file (test folder or `*.test.*`, `*.spec.*`, `*.e2e.*` name), or a container that
    /// holds nothing but tests.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub is_test: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub from: NodeId,
    pub to: NodeId,
    pub kind: EdgeKind,
    pub precision: Precision,
    /// The match is a guess (unknown verb of the client call).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub heuristic: bool,
    /// Number of real edges an edge aggregated between two containers of a subgraph stands for.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
}
