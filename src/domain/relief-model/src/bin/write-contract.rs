//! Writes the JSON Schemas of the contract into the directory given as argument.

use std::path::PathBuf;
use std::process::ExitCode;

use relief_model::contract::{
    api_error_schema, co_change_response_schema, commit_reading_response_schema,
    diff_response_schema, diff_schema, edge_usages_response_schema, impact_response_schema,
    log_response_schema, meta_response_schema, metrics_response_schema,
    reading_order_response_schema, repo_comparison_schema, review_state_schema,
    review_summary_schema, search_response_schema, settings_schema, snapshot_response_schema,
    snapshot_schema,
};

fn main() -> ExitCode {
    let Some(dir) = std::env::args_os().nth(1).map(PathBuf::from) else {
        eprintln!("usage: write-contract <dir>");
        return ExitCode::FAILURE;
    };
    let files = [
        ("snapshot.schema.json", snapshot_schema()),
        ("diff.schema.json", diff_schema()),
        ("snapshot-response.schema.json", snapshot_response_schema()),
        ("diff-response.schema.json", diff_response_schema()),
        ("meta-response.schema.json", meta_response_schema()),
        ("api-error.schema.json", api_error_schema()),
        ("review-summary.schema.json", review_summary_schema()),
        ("impact-response.schema.json", impact_response_schema()),
        ("metrics-response.schema.json", metrics_response_schema()),
        (
            "co-change-response.schema.json",
            co_change_response_schema(),
        ),
        ("review-state.schema.json", review_state_schema()),
        ("settings.schema.json", settings_schema()),
        ("repo-comparison.schema.json", repo_comparison_schema()),
        (
            "reading-order-response.schema.json",
            reading_order_response_schema(),
        ),
        ("search-response.schema.json", search_response_schema()),
        (
            "commit-reading-response.schema.json",
            commit_reading_response_schema(),
        ),
        ("log-response.schema.json", log_response_schema()),
        (
            "edge-usages-response.schema.json",
            edge_usages_response_schema(),
        ),
    ];
    for (name, content) in files {
        if let Err(error) = std::fs::write(dir.join(name), content) {
            eprintln!("cannot write {name}: {error}");
            return ExitCode::FAILURE;
        }
    }
    ExitCode::SUCCESS
}
