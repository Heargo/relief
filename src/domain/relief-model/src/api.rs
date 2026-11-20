use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{EdgeKind, GraphDiff, GraphSnapshot, NodeId, NodeKind};

/// Description of an indexing run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub commit: String,
    /// Commit date, ISO 8601 UTC.
    pub date: String,
    pub detector: String,
    pub adapters: Vec<String>,
    pub ignored_files: usize,
    /// Files an adapter parsed during this run.
    pub parsed_files: usize,
    /// Files whose extraction was served by the cache.
    pub cached_files: usize,
    pub warnings: Vec<String>,
}

/// A file renamed between base and head, as detected by git.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct FileRename {
    pub from: String,
    pub to: String,
}

/// Files and text-diff lines ignored because they only changed in format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FormatOnlySummary {
    pub files: usize,
    pub lines_added: u32,
    pub lines_removed: u32,
}

/// Body of every error of the HTTP API.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

/// Response of `GET /api/snapshot`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SnapshotResponse {
    pub graph: GraphSnapshot,
    pub meta: SnapshotMeta,
}

/// Response of `GET /api/diff`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiffResponse {
    pub diff: GraphDiff,
    pub renames: Vec<FileRename>,
    pub format_only: FormatOnlySummary,
    /// Short SHA (7 characters) of the base really compared: the merge base for `...`, the base
    /// as is for `..`, HEAD for the working tree.
    #[serde(default)]
    pub base_resolved: String,
    /// Head subgraph of the review (changed nodes, their neighbours and ancestors); only when a
    /// budget was asked for.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub graph: Option<GraphSnapshot>,
}

/// One match of the `search` command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SearchHit {
    pub id: NodeId,
    pub kind: NodeKind,
}

/// Response of the `search` command: best match first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
}

/// Response of `GET /api/meta`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MetaResponse {
    /// Name of the repository directory.
    pub repo: String,
    /// Range the server was opened with, if any.
    pub range: Option<String>,
    pub branches: Vec<String>,
    pub tags: Vec<String>,
}

/// A symbol whose signature changed, with the callers it reaches in the head.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignatureSummary {
    pub node: NodeId,
    pub breaking: bool,
    /// The symbol is not exported.
    pub internal: bool,
    /// Callers at depth 1.
    pub direct_callers: usize,
    /// All the callers, direct ones included.
    pub transitive_callers: usize,
    /// Callers (direct or transitive) that no test reaches.
    pub untested_callers: usize,
}

/// The edge that breaks a rule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ViolationEdge {
    pub from: NodeId,
    pub to: NodeId,
    pub kind: EdgeKind,
}

/// An edge of the head that a rule denies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Violation {
    /// Id of the broken rule.
    pub rule: String,
    pub edge: ViolationEdge,
    /// The range adds the edge; otherwise it was already there.
    pub introduced: bool,
}

/// A direct caller that the range did not touch, of a breaking signature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct OutOfDiffCaller {
    pub node: NodeId,
    /// The breaking signature it calls.
    pub calls: NodeId,
    /// A test reaches it directly.
    pub tested: bool,
}

/// A dependency between two modules (directories).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ModuleCoupling {
    pub from: String,
    pub to: String,
}

/// Response of `GET /api/review/summary`: the structural overview of a range.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSummary {
    /// Breaking signatures first.
    pub signatures: Vec<SignatureSummary>,
    pub violations: Vec<Violation>,
    pub added_files: Vec<FileRef>,
    pub removed_files: Vec<FileRef>,
    pub moved_files: Vec<MovedFile>,
    pub format_only_files: Vec<FormatOnlyFile>,
    pub out_of_diff: Vec<OutOfDiffCaller>,
    pub couplings_added: Vec<ModuleCoupling>,
    pub couplings_removed: Vec<ModuleCoupling>,
}

/// A file of the range and its node.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct FileRef {
    pub path: String,
    pub node: NodeId,
}

/// A file moved by the range; `node` is its id on the head side.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MovedFile {
    pub from: String,
    pub to: String,
    pub node: NodeId,
}

/// A file whose text changed in format only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FormatOnlyFile {
    pub path: String,
    pub node: NodeId,
    pub lines_added: u32,
    pub lines_removed: u32,
}

/// Which way an impact walk follows the edges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ImpactDirection {
    /// Who reaches the seeds.
    Callers,
    /// What the seeds reach.
    Dependencies,
}

/// A symbol reached by an impact walk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImpactedNode {
    pub node: NodeId,
    /// Number of hops from the seed (1 = direct).
    pub depth: usize,
    /// Shortest path from the seed to the node (seed included, node excluded).
    pub via: Vec<NodeId>,
    /// Kind of the last edge.
    pub kind: EdgeKind,
    /// A test reaches it directly.
    pub tested: bool,
    /// The range did not touch it.
    pub out_of_diff: bool,
}

/// Response of the `impact` command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ImpactResponse {
    pub reached: Vec<ImpactedNode>,
}

/// Response of the `metrics` command: the metrics of the files and symbols of a ref, kept apart
/// from the snapshot (the churn depends on a window of time).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MetricsResponse {
    /// Length of the churn window, in days before the date of the commit.
    pub since_days: u32,
    /// Node id to its metrics.
    pub nodes: std::collections::BTreeMap<String, crate::Metrics>,
}

/// The nodes a reviewer marked as seen in one range.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReviewState {
    pub seen: Vec<NodeId>,
}

/// Why a file or symbol is on the reading list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReadingReason {
    BreakingSignature,
    ModifiedSignature,
    Violation,
    New,
    Removed,
    MovedIdentical,
    Lines { added: u32, removed: u32 },
}

/// A file or symbol to read, with the reasons to read it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReadingItem {
    pub id: NodeId,
    pub reasons: Vec<ReadingReason>,
}

/// The reading list of one commit of a range.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CommitReadingEntry {
    /// Full sha.
    pub commit: String,
    pub short: String,
    /// First line of the message.
    pub message: String,
    /// Files with a structural change, in reading order.
    pub files: Vec<ReadingItem>,
    /// Files of the commit without a structural change.
    pub other_files: usize,
}

/// One commit of a log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LogEntry {
    /// Full SHA.
    pub sha: String,
    /// First 7 characters of the SHA.
    pub short: String,
    /// First line of the message.
    pub subject: String,
    pub author: String,
    /// Author time, in seconds since the Unix epoch.
    pub time: i64,
}

/// Response of the `log` command: the commits, newest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LogResponse {
    pub entries: Vec<LogEntry>,
}

/// Response of the `commit_reading` command: the commits, oldest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CommitReadingResponse {
    pub commits: Vec<CommitReadingEntry>,
}

/// Response of the `reading_order` command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReadingOrderResponse {
    pub items: Vec<ReadingItem>,
}

/// Two files changed in the same commits.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CoChangePair {
    /// Repository path of the first file (`a < b`).
    pub a: String,
    /// Repository path of the second file.
    pub b: String,
    /// Counted commits that touch both files.
    pub commits: u32,
    /// `commits` over the counted commits of the period.
    pub support: f64,
    /// `commits` over the commits of the most changed of the two files.
    pub confidence: f64,
}

/// The pairs of files changed together; kept apart from the snapshot (it depends on the history).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CoChangeResponse {
    /// Sorted by decreasing `commits`, then by paths.
    pub pairs: Vec<CoChangePair>,
}

/// One reference, in a file, to a binding imported from another module.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// Name as exported by the target module.
    pub binding: String,
    /// 1-based line.
    pub line: u32,
    /// 0-based char offset of the identifier in `snippet`.
    pub column: u32,
    /// The source line, without its terminator.
    pub snippet: String,
    /// Enclosing function or method (`Class.method`); none at top level.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enclosing: Option<String>,
}

/// The usages found in one source file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct FileUsages {
    pub file: NodeId,
    pub usages: Vec<Usage>,
}

/// Response of the `edge_usages` command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EdgeUsagesResponse {
    /// False when no adapter can find usages in the source files.
    pub supported: bool,
    /// Every usage found, listed or not.
    pub total: usize,
    pub files: Vec<FileUsages>,
}
