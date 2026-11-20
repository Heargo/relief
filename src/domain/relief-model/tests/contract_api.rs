//! Contract of the API responses, seam 3: the schemas of the HTTP responses
//! (`SnapshotMeta`, `FileRename`, `FormatOnlySummary`, the error body) are
//! generated, committed and up to date, and the hand-written schemas of
//! `NodeChange` and `EdgeChange` accept a real `GraphDiff`.
//!
//! Expected in `relief_model::contract` (types moved to `relief-model` as
//! needed): `snapshot_response_schema()` (`{ graph, meta }`),
//! `diff_response_schema()` (`{ diff, renames, formatOnly }`),
//! `meta_response_schema()` (`{ repo, range, branches, tags }`) and
//! `api_error_schema()` (`{ code, message }`), written to
//! `docs/contract/{snapshot-response,diff-response,meta-response,api-error}.schema.json`.

use std::path::PathBuf;

use relief_model::contract::{
    api_error_schema, diff_response_schema, diff_schema, meta_response_schema,
    snapshot_response_schema,
};
use serde_json::{Value, json};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn parse(schema: &str) -> Value {
    serde_json::from_str(schema).unwrap()
}

fn assert_fresh(name: &str, generated: &str) {
    let on_disk = std::fs::read_to_string(root().join("docs/contract").join(name))
        .unwrap_or_else(|_| panic!("docs/contract/{name} is missing: run `just contract`"));
    assert!(
        on_disk == generated,
        "docs/contract/{name} is out of date: run `just contract`"
    );
}

#[test]
fn committed_response_schemas_are_up_to_date() {
    assert_fresh("snapshot-response.schema.json", &snapshot_response_schema());
    assert_fresh("diff-response.schema.json", &diff_response_schema());
    assert_fresh("meta-response.schema.json", &meta_response_schema());
    assert_fresh("api-error.schema.json", &api_error_schema());
}

#[test]
fn snapshot_response_has_the_graph_and_snapshot_meta() {
    let schema = parse(&snapshot_response_schema());
    for field in ["graph", "meta"] {
        assert!(schema["properties"].get(field).is_some(), "missing {field}");
    }
    let meta = &schema["$defs"]["SnapshotMeta"]["properties"];
    for field in [
        "commit",
        "date",
        "detector",
        "adapters",
        "ignoredFiles",
        "parsedFiles",
        "cachedFiles",
        "warnings",
    ] {
        assert!(meta.get(field).is_some(), "SnapshotMeta lacks {field}");
    }
}

#[test]
fn diff_response_has_renames_and_format_only_summary() {
    let schema = parse(&diff_response_schema());
    for field in ["diff", "renames", "formatOnly"] {
        assert!(schema["properties"].get(field).is_some(), "missing {field}");
    }
    let rename = &schema["$defs"]["FileRename"]["properties"];
    assert!(rename.get("from").is_some() && rename.get("to").is_some());
    let format = &schema["$defs"]["FormatOnlySummary"]["properties"];
    for field in ["files", "linesAdded", "linesRemoved"] {
        assert!(
            format.get(field).is_some(),
            "FormatOnlySummary lacks {field}"
        );
    }
    assert!(schema["$defs"].get("NodeChange").is_some());
    assert!(schema["$defs"].get("EdgeChange").is_some());
}

#[test]
fn meta_response_describes_repo_range_branches_and_tags() {
    let schema = parse(&meta_response_schema());
    for field in ["repo", "range", "branches", "tags"] {
        assert!(schema["properties"].get(field).is_some(), "missing {field}");
    }
}

#[test]
fn api_error_is_code_and_message() {
    let schema = parse(&api_error_schema());
    let required = schema["required"].to_string();
    assert!(required.contains("code") && required.contains("message"));
    assert_eq!(schema["properties"].as_object().unwrap().len(), 2);
}

#[test]
fn contract_ts_declares_the_response_types() {
    let ts =
        std::fs::read_to_string(root().join("src/ui/src/app/core/models/contract.ts")).unwrap();
    for name in [
        "SnapshotMeta",
        "FileRename",
        "FormatOnlySummary",
        "ApiError",
        "SnapshotResponse",
        "DiffResponse",
        "MetaResponse",
    ] {
        assert!(
            ts.contains(&format!("export interface {name}"))
                || ts.contains(&format!("export type {name}")),
            "contract.ts lacks {name}: run `just contract`"
        );
    }
}

/// A `GraphDiff` with every node and edge status, as the core serializes it.
fn real_diff() -> Value {
    let diff = json!({
        "base": "aaaa",
        "head": "bbbb",
        "nodes": [
            { "id": "pkg:@acme/api::file:a.ts::sym:added", "status": "added",
              "linesAdded": 3, "linesRemoved": 0 },
            { "id": "pkg:@acme/api::file:a.ts::sym:gone", "status": "removed",
              "linesAdded": 0, "linesRemoved": 2 },
            { "id": "pkg:@acme/api::file:a.ts::sym:body", "status": "modified",
              "body": true, "linesAdded": 1, "linesRemoved": 1 },
            { "id": "pkg:@acme/api::file:a.ts::sym:sig", "status": "modified",
              "body": false,
              "signature": { "before": "f(a)", "after": "f(a, b?)", "breaking": false,
                             "reason": { "code": "paramOptionalAdded" }, "internal": false },
              "linesAdded": 1, "linesRemoved": 1 },
            { "id": "pkg:@acme/api::file:b.ts::sym:moved", "status": "moved",
              "from": "pkg:@acme/api::file:a.ts::sym:moved", "body": false,
              "linesAdded": 0, "linesRemoved": 0 }
        ],
        "files": [{ "path": "a.ts", "linesAdded": 5, "linesRemoved": 3 }],
        "edges": [
            { "from": "pkg:@acme/api::file:a.ts", "to": "pkg:@acme/api::file:b.ts",
              "kind": "imports", "status": "added", "commit": "bbbb" },
            { "from": "pkg:@acme/api::file:a.ts", "to": "pkg:@acme/api::file:c.ts",
              "kind": "imports", "status": "removed", "commit": null },
            { "from": "pkg:@acme/api::file:b.ts", "to": "pkg:@acme/api::file:c.ts",
              "kind": "calls", "status": "moved", "commit": null }
        ]
    });
    // It must be a real `GraphDiff` before it is used to check the schema.
    let typed: relief_model::GraphDiff = serde_json::from_value(diff.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), diff);
    diff
}

#[test]
fn hand_written_node_and_edge_change_schemas_accept_a_real_diff() {
    let validator = jsonschema::validator_for(&parse(&diff_schema())).unwrap();
    let diff = real_diff();
    let errors: Vec<String> = validator
        .iter_errors(&diff)
        .map(|e| e.to_string())
        .collect();
    assert!(errors.is_empty(), "{errors:?}");
}

#[test]
fn hand_written_schemas_reject_a_change_without_a_status() {
    let validator = jsonschema::validator_for(&parse(&diff_schema())).unwrap();
    let mut diff = real_diff();
    diff["nodes"][0].as_object_mut().unwrap().remove("status");
    assert!(!validator.is_valid(&diff));
    let mut diff = real_diff();
    diff["edges"][0]["status"] = json!("exploded");
    assert!(!validator.is_valid(&diff));
}
