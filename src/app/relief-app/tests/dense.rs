//! Ticket S05: the generated fixture `dense` (10 packages x 150 files importing files of other
//! packages) opened as a `Session`: the index finds many edges between packages.

mod common;

use common::options;
use relief_app::{Session, SnapshotRequest};
use relief_fixtures::Fixture;
use relief_model::EdgeKind;
use tempfile::TempDir;

#[test]
fn indexing_dense_finds_many_import_edges_between_packages() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("dense");
    Fixture::load("dense").unwrap().build(&path).unwrap();
    let session = Session::open(&path, options(None)).unwrap();
    let graph = session
        .snapshot(&SnapshotRequest {
            rev: "HEAD".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap()
        .graph;
    let files = graph
        .nodes()
        .iter()
        .filter(|n| n.id.to_string().contains("::file:") && !n.id.to_string().contains("::sym:"))
        .count();
    assert_eq!(files, 1500);
    let package_of =
        |id: &relief_model::NodeId| id.to_string().split("::").next().unwrap().to_owned();
    let cross = graph
        .edges()
        .iter()
        .filter(|e| e.kind == EdgeKind::Imports && package_of(&e.from) != package_of(&e.to))
        .count();
    assert!(cross >= 1000, "{cross} import edges between packages");
}
