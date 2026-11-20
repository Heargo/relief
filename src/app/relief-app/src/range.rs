//! Typed requests of the use cases.

use relief_git::RevSpec;
use relief_model::{ImpactDirection, NodeId};

use crate::AppError;

/// A range expression, parsed once.
#[derive(Debug, Clone)]
pub struct RangeSpec {
    text: String,
    spec: RevSpec,
}

impl RangeSpec {
    /// `A...B` (against the merge base), `A..B`, or `REV` alone (REV against the working tree).
    pub fn parse(text: &str) -> Result<Self, AppError> {
        Ok(Self {
            text: text.to_owned(),
            spec: RevSpec::parse(text)?,
        })
    }

    /// HEAD against the working tree.
    pub fn worktree() -> Self {
        Self {
            text: "WORKTREE".to_owned(),
            spec: RevSpec::Worktree,
        }
    }

    /// HEAD against the index.
    pub fn staged() -> Self {
        Self {
            text: "INDEX".to_owned(),
            spec: RevSpec::Index,
        }
    }

    /// The expression as typed.
    pub fn text(&self) -> &str {
        &self.text
    }

    pub(crate) fn spec(&self) -> &RevSpec {
        &self.spec
    }
}

/// One side of a range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Base,
    Head,
}

/// `Session::snapshot`: the graph of a ref (or `WORKTREE` / `INDEX`).
#[derive(Debug, Clone)]
pub struct SnapshotRequest {
    pub rev: String,
    /// Most nodes to send: past it, containers are closed (see `relief_diff::budgeted`).
    pub budget: Option<usize>,
    /// Containers whose direct children are added whatever the budget.
    pub expand: Vec<NodeId>,
}

/// `Session::diff`; without a range, the opening range.
#[derive(Debug, Clone, Default)]
pub struct DiffRequest {
    pub range: Option<RangeSpec>,
    /// Most nodes of the head subgraph sent with the diff; none, no subgraph.
    pub budget: Option<usize>,
    /// Containers whose direct children are added to the subgraph.
    pub expand: Vec<NodeId>,
}

/// `Session::review_summary`; without a range, the opening range.
#[derive(Debug, Clone, Default)]
pub struct ReviewSummaryRequest {
    pub range: Option<RangeSpec>,
}

/// `Session::code`: the text of a node at one side of a range.
#[derive(Debug, Clone)]
pub struct CodeRequest {
    pub node: NodeId,
    pub side: Side,
    pub range: Option<RangeSpec>,
}

/// `Session::edge_usages`: where the source of an edge uses what it imports from the target.
/// `from` and `to` are files, or containers (module, package) for an aggregated edge.
#[derive(Debug, Clone)]
pub struct EdgeUsagesRequest {
    pub range: Option<RangeSpec>,
    pub side: Side,
    pub from: NodeId,
    pub to: NodeId,
}

/// `Session::impact`: the symbols reached from `seeds` in the head snapshot of a range.
#[derive(Debug, Clone)]
pub struct ImpactRequest {
    pub range: Option<RangeSpec>,
    pub seeds: Vec<NodeId>,
    pub direction: ImpactDirection,
    pub max_depth: usize,
    pub follow_http: bool,
}

/// `Session::reading_order`: the changed files or symbols of a range, in reading order.
#[derive(Debug, Clone)]
pub struct ReadingOrderRequest {
    pub range: Option<RangeSpec>,
    pub granularity: relief_diff::Granularity,
}

/// `Session::commit_reading`: the reading list of each commit of a range.
#[derive(Debug, Clone)]
pub struct CommitReadingRequest {
    pub range: Option<RangeSpec>,
}

/// `Session::metrics`: churn, complexity, owner and tests of the files and symbols of a ref.
#[derive(Debug, Clone)]
pub struct MetricsRequest {
    pub rev: String,
    /// Length of the churn window, counted back from the date of the commit; 90 by default.
    pub since_days: Option<u32>,
}

/// `Session::co_change`: pairs of files changed together in the history before a ref.
#[derive(Debug, Clone)]
pub struct CoChangeRequest {
    pub rev: String,
    /// Length of the period, counted back from the date of the commit; 90 by default.
    pub since_days: Option<u32>,
    /// Fewest common commits of a pair; the `relief.config.yaml` value, else 2, by default.
    pub min_commits: Option<u32>,
}

/// `Session::search`: nodes of the head snapshot of a range whose name matches `query`.
#[derive(Debug, Clone)]
pub struct SearchRequest {
    pub range: Option<RangeSpec>,
    pub query: String,
    pub limit: usize,
}
