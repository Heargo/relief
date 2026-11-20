//! Universal graph model: nodes, edges, stable ids and snapshots.

mod api;
pub mod contract;
mod diff;
mod graph;
mod id;
mod types;

#[cfg(feature = "testing")]
pub mod testing;

pub use api::{
    ApiError, CoChangePair, CoChangeResponse, CommitReadingEntry, CommitReadingResponse,
    DiffResponse, EdgeUsagesResponse, FileRef, FileRename, FileUsages, FormatOnlyFile,
    FormatOnlySummary, ImpactDirection, ImpactResponse, ImpactedNode, LogEntry, LogResponse,
    MetaResponse, MetricsResponse, ModuleCoupling, MovedFile, OutOfDiffCaller, ReadingItem,
    ReadingOrderResponse, ReadingReason, ReviewState, ReviewSummary, SearchHit, SearchResponse,
    SignatureSummary, SnapshotMeta, SnapshotResponse, Usage, Violation, ViolationEdge,
};
pub use diff::{
    EdgeChange, EdgeStatus, FileChange, GraphDiff, NodeChange, NodeStatus, SignatureChange,
    SignatureReason, SignatureVerdict,
};
pub use graph::{GraphSnapshot, ValidationError};
pub use id::{NodeId, NodeIdParseError};
pub use types::{Edge, EdgeKind, Metrics, Node, NodeKind, Precision, Span, Visibility};
