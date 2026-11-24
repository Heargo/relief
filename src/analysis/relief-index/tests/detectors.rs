//! Seam 2: `Indexer` on a fixture repository with detectors and an adapter
//! defined here. The index chooses nothing: only what the caller registers is
//! used, in order, the first detector that answers wins.

use std::path::Path;

use relief_adapter_api::{Detection, Detector, Extraction, LanguageAdapter};
use relief_fixtures::Fixture;
use relief_git::{CommitId, GitSource};
use relief_index::{IndexError, Indexer};
use relief_model::{Node, NodeId, NodeKind, Visibility};
use tempfile::TempDir;

/// Answers with a single repository node named after itself, or declines.
struct Fake {
    name: &'static str,
    answers: bool,
}

impl Detector for Fake {
    fn detect(
        &self,
        _repo_name: &str,
        _paths: &[&str],
        _read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Option<Detection> {
        if !self.answers {
            return None;
        }
        let root = NodeId::package(self.name);
        let node = |id: NodeId, kind, parent: Option<NodeId>, lang: Option<&str>| Node {
            id,
            kind,
            subkind: String::new(),
            parent,
            lang: lang.map(str::to_owned),
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
            branch: None,
            labels: None,
        };
        Some(Detection {
            detector: self.name.to_owned(),
            nodes: vec![
                node(root.clone(), NodeKind::Repo, None, None),
                node(
                    root.clone().file("src/a.ts"),
                    NodeKind::File,
                    Some(root),
                    Some("ts"),
                ),
            ],
            edges: Vec::new(),
            warnings: Vec::new(),
            package_dirs: Default::default(),
            entries: Vec::new(),
        })
    }
}

struct FakeAdapter;

impl LanguageAdapter for FakeAdapter {
    fn name(&self) -> &str {
        "fake-adapter"
    }
    fn handles(&self, lang: &str) -> bool {
        lang == "ts"
    }
    fn extract(&self, file: &Node, _bytes: &[u8]) -> Extraction {
        Extraction {
            warnings: vec![format!("fake adapter saw {}", file.id)],
            ..Extraction::default()
        }
    }
}

fn tiny(dir: &Path) -> (GitSource, CommitId) {
    Fixture::load("tiny")
        .expect("load")
        .build(dir)
        .expect("build");
    let source = GitSource::open(dir).expect("open");
    let commit = source.resolve("HEAD").expect("resolve");
    (source, commit)
}

#[test]
fn first_detector_that_answers_wins() {
    let dir = TempDir::new().expect("tmp");
    let (source, commit) = tiny(dir.path());
    let indexed = Indexer::new("tiny")
        .with_detectors(vec![
            Box::new(Fake {
                name: "declines",
                answers: false,
            }),
            Box::new(Fake {
                name: "first",
                answers: true,
            }),
            Box::new(Fake {
                name: "second",
                answers: true,
            }),
        ])
        .snapshot(&source, &commit)
        .expect("snapshot");
    assert_eq!(indexed.meta.detector, "first");
    let ids: Vec<String> = indexed
        .graph
        .nodes()
        .iter()
        .map(|n| n.id.to_string())
        .collect();
    assert_eq!(ids, ["pkg:first", "pkg:first::file:src/a.ts"]);
}

#[test]
fn with_detector_registers_in_call_order() {
    let dir = TempDir::new().expect("tmp");
    let (source, commit) = tiny(dir.path());
    let indexed = Indexer::new("tiny")
        .with_detector(Box::new(Fake {
            name: "one",
            answers: true,
        }))
        .with_detector(Box::new(Fake {
            name: "two",
            answers: true,
        }))
        .snapshot(&source, &commit)
        .expect("snapshot");
    assert_eq!(indexed.meta.detector, "one");
}

#[test]
fn no_detector_registered_is_an_error() {
    let dir = TempDir::new().expect("tmp");
    let (source, commit) = tiny(dir.path());
    let err = Indexer::new("tiny")
        .snapshot(&source, &commit)
        .expect_err("no detector");
    assert!(matches!(err, IndexError::NoDetector), "got {err:?}");
}

#[test]
fn every_detector_declining_is_an_error() {
    let dir = TempDir::new().expect("tmp");
    let (source, commit) = tiny(dir.path());
    let err = Indexer::new("tiny")
        .with_detectors(vec![Box::new(Fake {
            name: "no",
            answers: false,
        })])
        .snapshot(&source, &commit)
        .expect_err("nobody answers");
    assert!(matches!(err, IndexError::NoDetector), "got {err:?}");
}

#[test]
fn the_adapter_provided_is_reported_in_meta() {
    let dir = TempDir::new().expect("tmp");
    let (source, commit) = tiny(dir.path());
    let indexed = Indexer::new("tiny")
        .with_detector(Box::new(Fake {
            name: "only",
            answers: true,
        }))
        .with_adapter(Box::new(FakeAdapter))
        .snapshot(&source, &commit)
        .expect("snapshot");
    let meta = serde_json::to_value(&indexed.meta).expect("meta json");
    assert_eq!(meta["detector"], "only");
    assert_eq!(meta["adapters"], serde_json::json!(["fake-adapter"]));
    assert_eq!(
        meta["warnings"],
        serde_json::json!(["fake adapter saw pkg:only::file:src/a.ts"])
    );
}
