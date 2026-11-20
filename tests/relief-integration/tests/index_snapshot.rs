use std::fs;
use std::path::Path;
use std::process::Command;

use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::Indexer;
use relief_model::NodeKind;
use tempfile::TempDir;

const TINY_HEAD: &str = "1ad585ea97387992733a0f44f984763a80819397";

fn index_tiny(dir: &Path) -> relief_index::IndexedSnapshot {
    Fixture::load("tiny")
        .expect("load tiny")
        .build(dir)
        .expect("build tiny");
    let source = GitSource::open(dir).expect("open");
    let commit = source.resolve("HEAD").expect("resolve");
    Indexer::new("tiny")
        .with_detectors(relief_detect::default_detectors())
        .snapshot(&source, &commit)
        .expect("snapshot")
}

fn git(repo: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@relief.invalid")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_COMMITTER_EMAIL", "fixture@relief.invalid")
        .env("GIT_AUTHOR_DATE", "2024-05-06T07:08:09 +0000")
        .env("GIT_COMMITTER_DATE", "2024-05-06T07:08:09 +0000")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn tiny_head_graph_is_repo_then_folders_then_files() {
    let dir = TempDir::new().expect("tmp");
    let indexed = index_tiny(dir.path());
    indexed.graph.validate().expect("valid graph");
    insta::assert_json_snapshot!("tiny_head_graph", indexed.graph);
}

#[test]
fn tiny_head_meta_describes_the_run() {
    let dir = TempDir::new().expect("tmp");
    let indexed = index_tiny(dir.path());
    let meta = serde_json::to_value(&indexed.meta).expect("meta json");
    assert_eq!(
        meta,
        serde_json::json!({
            "commit": TINY_HEAD,
            "date": "2024-01-03T10:00:00Z",
            "detector": "generic",
            "adapters": [],
            "ignoredFiles": 0,
            "parsedFiles": 0,
            "cachedFiles": 0,
            "warnings": [],
        })
    );
}

#[test]
fn two_runs_and_two_builds_give_identical_nodes() {
    let first_dir = TempDir::new().expect("tmp");
    let second_dir = TempDir::new().expect("tmp");
    let first = index_tiny(first_dir.path());
    let again = {
        let source = GitSource::open(first_dir.path()).expect("open");
        let commit = source.resolve("HEAD").expect("resolve");
        Indexer::new("tiny")
            .with_detectors(relief_detect::default_detectors())
            .snapshot(&source, &commit)
            .expect("snapshot")
    };
    let second = index_tiny(second_dir.path());
    assert_eq!(first.graph, again.graph);
    assert_eq!(first.graph, second.graph);
    assert_eq!(first.graph.nodes()[0].id.to_string(), "pkg:tiny");
}

#[test]
fn binary_and_excluded_files_are_left_out_and_counted() {
    let dir = TempDir::new().expect("tmp");
    let repo = dir.path();
    git(repo, &["init", "-q", "-b", "main"]);
    git(repo, &["config", "commit.gpgsign", "false"]);
    fs::create_dir_all(repo.join("src")).expect("mkdir");
    fs::create_dir_all(repo.join("node_modules/dep")).expect("mkdir");
    fs::write(repo.join("src/main.ts"), "export const x = 1;\n").expect("write");
    fs::write(repo.join("src/blob.dat"), b"ab\0cd\0").expect("write");
    fs::write(repo.join("logo.png"), b"\x89PNG\r\n\x1a\n").expect("write");
    fs::write(repo.join("node_modules/dep/index.js"), "x\n").expect("write");
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-q", "-m", "init"]);

    let source = GitSource::open(repo).expect("open");
    let commit = source.resolve("HEAD").expect("resolve");
    let indexed = Indexer::new("app")
        .with_detectors(relief_detect::default_detectors())
        .snapshot(&source, &commit)
        .expect("snapshot");

    indexed.graph.validate().expect("valid graph");
    let files: Vec<String> = indexed
        .graph
        .nodes()
        .iter()
        .filter(|n| n.kind == NodeKind::File)
        .map(|n| n.id.to_string())
        .collect();
    assert_eq!(files, ["pkg:app/src::file:src/main.ts"]);
    let meta = serde_json::to_value(&indexed.meta).expect("meta json");
    assert_eq!(meta["ignoredFiles"], 3);
    assert_eq!(meta["date"], "2024-05-06T07:08:09Z");
}

fn index_fixture(name: &str, rev: &str, dir: &Path) -> relief_index::IndexedSnapshot {
    Fixture::load(name)
        .expect("load fixture")
        .build(dir)
        .expect("build fixture");
    let source = GitSource::open(dir).expect("open");
    let commit = source.resolve(rev).expect("resolve");
    Indexer::new(name)
        .with_detectors(relief_detect::default_detectors())
        .snapshot(&source, &commit)
        .expect("snapshot")
}

#[test]
fn acme_shop_main_has_four_systems_and_their_dependencies() {
    let dir = TempDir::new().expect("tmp");
    let indexed = index_fixture("acme-shop", "main", dir.path());
    indexed.graph.validate().expect("valid graph");

    let mut systems: Vec<(String, NodeKind, String)> = indexed
        .graph
        .nodes()
        .iter()
        .filter(|n| matches!(n.kind, NodeKind::Service | NodeKind::Package))
        .map(|n| (n.id.to_string(), n.kind, n.subkind.clone()))
        .collect();
    systems.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(
        systems,
        vec![
            (
                "pkg:@acme/api".to_owned(),
                NodeKind::Service,
                "http-server".to_owned()
            ),
            (
                "pkg:@acme/db".to_owned(),
                NodeKind::Package,
                "library".to_owned()
            ),
            (
                "pkg:@acme/shared".to_owned(),
                NodeKind::Package,
                "library".to_owned()
            ),
            (
                "pkg:@acme/web".to_owned(),
                NodeKind::Service,
                "react-app".to_owned()
            ),
        ]
    );

    let mut edges: Vec<(String, String)> = indexed
        .graph
        .edges()
        .iter()
        .filter(|e| e.kind == relief_model::EdgeKind::DependsOn)
        .filter(|e| !e.to.to_string().starts_with("pkg:external"))
        .map(|e| (e.from.to_string(), e.to.to_string()))
        .collect();
    edges.sort();
    assert_eq!(
        edges,
        vec![
            ("pkg:@acme/api".to_owned(), "pkg:@acme/db".to_owned()),
            ("pkg:@acme/api".to_owned(), "pkg:@acme/shared".to_owned()),
            ("pkg:@acme/web".to_owned(), "pkg:@acme/shared".to_owned()),
        ]
    );
    assert_eq!(indexed.meta.detector, "workspaces");
    assert!(indexed.meta.warnings.is_empty());
}

#[test]
fn invalid_package_json_surfaces_in_meta_warnings() {
    let dir = TempDir::new().expect("tmp");
    let indexed = index_fixture("bad-package-json", "main", dir.path());
    indexed.graph.validate().expect("valid graph");
    assert_eq!(indexed.meta.warnings.len(), 1);
    assert!(
        indexed.meta.warnings[0].contains("packages/broken/package.json"),
        "warning was: {}",
        indexed.meta.warnings[0]
    );
    assert!(
        indexed
            .graph
            .nodes()
            .iter()
            .any(|n| n.id.to_string() == "pkg:@bad/ok")
    );
}
