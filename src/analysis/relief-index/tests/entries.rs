//! Seam: the entries of a `Detection` are copied by the index into the snapshot
//! (`Node.entry = true`, `Node.entry_type = Some("script")`), without naming any detector.

use relief_adapter_api::{Detection, Detector, EntryPoint};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::Indexer;
use relief_model::{Node, NodeId, NodeKind, Visibility};
use tempfile::TempDir;

struct WithEntries;

impl Detector for WithEntries {
    fn detect(
        &self,
        _repo_name: &str,
        _paths: &[&str],
        _read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Option<Detection> {
        let node = |id: NodeId, kind, parent: Option<NodeId>| Node {
            id,
            kind,
            subkind: String::new(),
            parent,
            lang: None,
            span: None,
            visibility: Visibility::Public,
            content_hash: String::new(),
            signature_hash: None,
            metrics: None,
            path: None,
            route: None,
            entry: false,
            entry_type: None,
            child_count: None,
            is_test: false,
        };
        let root = NodeId::package("app");
        let pkg = NodeId::package("lib");
        Some(Detection {
            detector: "fake".to_owned(),
            nodes: vec![
                node(root.clone(), NodeKind::Repo, None),
                node(pkg.clone(), NodeKind::Package, Some(root)),
            ],
            entries: vec![EntryPoint {
                node: pkg,
                entry_type: "script".to_owned(),
            }],
            ..Detection::default()
        })
    }
}

#[test]
fn detector_entries_are_flagged_in_the_snapshot() {
    let dir = TempDir::new().expect("tmp");
    Fixture::load("tiny")
        .expect("load")
        .build(dir.path())
        .expect("build");
    let source = GitSource::open(dir.path()).expect("open");
    let commit = source.resolve("HEAD").expect("resolve");
    let indexed = Indexer::new("tiny")
        .with_detector(Box::new(WithEntries))
        .snapshot(&source, &commit)
        .expect("snapshot");
    let flagged: Vec<(String, Option<String>)> = indexed
        .graph
        .nodes()
        .iter()
        .filter(|n| n.entry)
        .map(|n| (n.id.to_string(), n.entry_type.clone()))
        .collect();
    assert_eq!(flagged, [("pkg:lib".to_owned(), Some("script".to_owned()))]);
}
