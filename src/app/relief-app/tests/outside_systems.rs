//! Seam 2 of ticket D04: `Session::snapshot` on a repo whose only manifest is a
//! `pyproject.toml` under `tests/fixtures/`: the generic detector answers, folders are modules.

use relief_app::{Session, SessionOptions, SnapshotRequest};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use serde_json::Value;
use tempfile::TempDir;

fn nodes() -> Vec<Value> {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("outside-systems");
    Fixture::load("outside-systems")
        .unwrap()
        .build(&path)
        .unwrap();
    let session = Session::open(
        &path,
        SessionOptions {
            data_dir: None,
            range: None,
            detectors: default_detectors(),
            adapters: vec![],
        },
    )
    .unwrap();
    let request = SnapshotRequest {
        rev: "HEAD".to_owned(),
        budget: None,
        expand: vec![],
    };
    // Twice: the second run goes through the cache.
    session.snapshot(&request).unwrap();
    let snapshot = session.snapshot(&request).unwrap();
    let json = serde_json::to_value(&snapshot).unwrap();
    json["graph"]["nodes"].as_array().unwrap().clone()
}

fn find<'a>(nodes: &'a [Value], id: &str) -> &'a Value {
    nodes
        .iter()
        .find(|n| n["id"] == id)
        .unwrap_or_else(|| panic!("no node {id}"))
}

#[test]
fn a_fixture_manifest_creates_no_system_and_folders_are_modules() {
    let nodes = nodes();
    assert!(
        nodes
            .iter()
            .all(|n| n["kind"] != "service" && n["kind"] != "package"),
        "{nodes:?}"
    );
    let docs = find(&nodes, "pkg:outside-systems/docs");
    assert_eq!(docs["kind"], "module");
    assert_eq!(docs["parent"], "pkg:outside-systems");
    let fixture = find(&nodes, "pkg:outside-systems/tests/fixtures/x");
    assert_eq!(fixture["kind"], "module");
    assert_eq!(
        find(
            &nodes,
            "pkg:outside-systems/tests/fixtures/x/pkg::file:tests/fixtures/x/pkg/mod.py"
        )["parent"],
        "pkg:outside-systems/tests/fixtures/x/pkg"
    );
    assert_eq!(
        find(&nodes, "pkg:outside-systems::file:README.md")["parent"],
        "pkg:outside-systems"
    );
}
