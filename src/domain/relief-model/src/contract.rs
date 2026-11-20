//! JSON Schema of the serialized types, written to `docs/contract/`.

use schemars::{JsonSchema, schema_for};

use crate::{
    ApiError, CoChangeResponse, CommitReadingResponse, DiffResponse, EdgeUsagesResponse, GraphDiff,
    GraphSnapshot, ImpactResponse, LogResponse, MetaResponse, MetricsResponse,
    ReadingOrderResponse, ReviewState, ReviewSummary, SearchResponse, SnapshotResponse,
};

fn render<T: JsonSchema>() -> String {
    let mut json = serde_json::to_string_pretty(&schema_for!(T)).unwrap_or_default();
    json.push('\n');
    json
}

/// JSON Schema of [`GraphSnapshot`], pretty-printed, ending with a newline.
pub fn snapshot_schema() -> String {
    render::<GraphSnapshot>()
}

/// JSON Schema of [`GraphDiff`], pretty-printed, ending with a newline.
pub fn diff_schema() -> String {
    render::<GraphDiff>()
}

/// JSON Schema of [`SnapshotResponse`] (`GET /api/snapshot`).
pub fn snapshot_response_schema() -> String {
    render::<SnapshotResponse>()
}

/// JSON Schema of [`DiffResponse`] (`GET /api/diff`).
pub fn diff_response_schema() -> String {
    render::<DiffResponse>()
}

/// JSON Schema of [`MetaResponse`] (`GET /api/meta`).
pub fn meta_response_schema() -> String {
    render::<MetaResponse>()
}

/// JSON Schema of [`ApiError`] (body of every API error).
pub fn api_error_schema() -> String {
    render::<ApiError>()
}

/// JSON Schema of [`ReviewSummary`] (`GET /api/review/summary`).
pub fn review_summary_schema() -> String {
    render::<ReviewSummary>()
}

/// JSON Schema of [`ImpactResponse`] (the `impact` command).
pub fn impact_response_schema() -> String {
    render::<ImpactResponse>()
}

/// JSON Schema of [`ReviewState`] (the `review_state` commands).
pub fn review_state_schema() -> String {
    render::<ReviewState>()
}

/// JSON Schema of [`ReadingOrderResponse`] (the `reading_order` command).
pub fn reading_order_response_schema() -> String {
    render::<ReadingOrderResponse>()
}

/// JSON Schema of [`CommitReadingResponse`] (the `commit_reading` command).
pub fn commit_reading_response_schema() -> String {
    render::<CommitReadingResponse>()
}

/// JSON Schema of [`LogResponse`] (the `log` command).
pub fn log_response_schema() -> String {
    render::<LogResponse>()
}

/// JSON Schema of [`MetricsResponse`] (the `metrics` command).
pub fn metrics_response_schema() -> String {
    render::<MetricsResponse>()
}

/// JSON Schema of [`CoChangeResponse`] (the `co_change` command).
pub fn co_change_response_schema() -> String {
    render::<CoChangeResponse>()
}

/// JSON Schema of [`SearchResponse`] (the `search` command).
pub fn search_response_schema() -> String {
    render::<SearchResponse>()
}

/// JSON Schema of [`EdgeUsagesResponse`] (the `edge_usages` command).
pub fn edge_usages_response_schema() -> String {
    render::<EdgeUsagesResponse>()
}
