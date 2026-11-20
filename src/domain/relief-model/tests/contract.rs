use std::path::PathBuf;

use relief_model::contract::{diff_schema, snapshot_schema};
use serde_json::Value;

fn committed(name: &str) -> Option<String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../docs/contract")
        .join(name);
    std::fs::read_to_string(path).ok()
}

fn assert_fresh(name: &str, generated: &str) {
    let on_disk = committed(name)
        .unwrap_or_else(|| panic!("docs/contract/{name} is missing: run `just contract`"));
    assert!(
        on_disk == generated,
        "docs/contract/{name} is out of date: run `just contract`"
    );
}

fn parse(schema: &str) -> Value {
    serde_json::from_str(schema).unwrap()
}

#[test]
fn committed_snapshot_schema_is_up_to_date() {
    assert_fresh("snapshot.schema.json", &snapshot_schema());
}

#[test]
fn committed_diff_schema_is_up_to_date() {
    assert_fresh("diff.schema.json", &diff_schema());
}

#[test]
fn snapshot_schema_describes_commit_nodes_and_edges() {
    let schema = parse(&snapshot_schema());
    for field in ["commit", "nodes", "edges"] {
        assert!(
            schema["properties"].get(field).is_some(),
            "missing property {field}"
        );
    }
    assert!(schema["$defs"].get("Node").is_some());
    assert!(schema["$defs"].get("Edge").is_some());
}

#[test]
fn node_id_is_a_plain_string_in_both_schemas() {
    for schema in [parse(&snapshot_schema()), parse(&diff_schema())] {
        assert_eq!(schema["$defs"]["NodeId"]["type"], "string");
    }
}

#[test]
fn diff_schema_describes_signature_changes_and_moves() {
    let schema = parse(&diff_schema());
    for field in ["base", "head", "nodes", "files", "edges"] {
        assert!(
            schema["properties"].get(field).is_some(),
            "missing property {field}"
        );
    }
    assert!(schema["$defs"].get("SignatureChange").is_some());
    assert!(
        schema["$defs"]["NodeStatus"]
            .to_string()
            .contains("\"moved\"")
    );
    assert!(
        schema["$defs"]["EdgeStatus"]
            .to_string()
            .contains("\"moved\"")
    );
}

#[test]
fn schemas_end_with_a_newline() {
    assert!(snapshot_schema().ends_with("}\n"));
    assert!(diff_schema().ends_with("}\n"));
}
