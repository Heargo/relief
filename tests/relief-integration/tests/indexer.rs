//! Seam 2: `TsAdapter` registered in `relief_index::Indexer`.
//!
//! Warnings of the adapter are expected in `meta.warnings`, each naming the
//! file path.

use std::fs;
use std::path::Path;
use std::process::Command;

use relief_adapter_api::LanguageAdapter;
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::{IndexedSnapshot, Indexer};
use relief_lang_ts::TsAdapter;
use relief_model::{NodeKind, Visibility};
use tempfile::TempDir;

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
        .unwrap();
    assert!(out.status.success(), "git {args:?}");
}

fn index_acme(dir: &Path) -> IndexedSnapshot {
    Fixture::load("acme-shop").unwrap().build(dir).unwrap();
    let source = GitSource::open(dir).unwrap();
    let commit = source.resolve("main").unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(&source, &commit)
        .unwrap()
}

#[test]
fn handles_only_the_ts_family_of_languages() {
    let adapter = TsAdapter::new();
    for lang in ["ts", "tsx", "js", "jsx", "mts", "cts"] {
        assert!(adapter.handles(lang), "{lang}");
    }
    for lang in ["rs", "py", "json", "md", "yaml", "java"] {
        assert!(!adapter.handles(lang), "{lang}");
    }
}

#[test]
fn acme_symbols_are_nodes_attached_to_their_file() {
    let dir = TempDir::new().unwrap();
    let indexed = index_acme(dir.path());
    indexed.graph.validate().unwrap();

    let file = indexed
        .graph
        .nodes()
        .iter()
        .find(|n| n.kind == NodeKind::File && n.id.to_string().ends_with("auth/session.ts"))
        .expect("session.ts file node");
    let file_id = file.id.to_string();

    let refresh = indexed
        .graph
        .nodes()
        .iter()
        .find(|n| n.id.to_string() == format!("{file_id}::sym:SessionStore.refresh"))
        .expect("refresh symbol node");
    assert_eq!(refresh.kind, NodeKind::Symbol);
    assert_eq!(refresh.subkind, "method");
    assert_eq!(refresh.visibility, Visibility::Public);
    assert_eq!(refresh.lang.as_deref(), Some("ts"));
    assert_eq!(refresh.parent.as_ref(), Some(&file.id));
    assert!(refresh.span.is_some());
    assert!(!refresh.content_hash.is_empty());
    assert!(refresh.signature_hash.is_some());

    let load = indexed
        .graph
        .nodes()
        .iter()
        .find(|n| n.id.to_string() == format!("{file_id}::sym:SessionStore.load"))
        .expect("load symbol node");
    assert_eq!(load.visibility, Visibility::Internal);
}

#[test]
fn every_symbol_node_hangs_under_a_file_of_a_supported_language() {
    let dir = TempDir::new().unwrap();
    let indexed = index_acme(dir.path());
    let nodes = indexed.graph.nodes();
    let symbols: Vec<_> = nodes
        .iter()
        .filter(|n| n.kind == NodeKind::Symbol)
        .collect();
    assert!(symbols.len() > 20, "only {} symbols", symbols.len());
    for symbol in symbols {
        let parent = nodes
            .iter()
            .find(|n| Some(&n.id) == symbol.parent.as_ref())
            .expect("symbol parent exists");
        assert_eq!(parent.kind, NodeKind::File);
        let lang = parent.lang.as_deref().unwrap();
        assert!(["ts", "tsx", "js", "jsx", "mts", "cts"].contains(&lang));
    }
}

#[test]
fn the_adapter_name_is_reported_in_the_meta() {
    let dir = TempDir::new().unwrap();
    let indexed = index_acme(dir.path());
    let name = TsAdapter::new().name().to_owned();
    assert!(!name.is_empty());
    assert_eq!(indexed.meta.adapters, vec![name]);
    assert!(indexed.meta.warnings.is_empty());
}

#[test]
fn a_file_that_does_not_parse_warns_without_failing_the_indexation() {
    let dir = TempDir::new().unwrap();
    let repo = dir.path();
    git(repo, &["init", "-q", "-b", "main"]);
    git(repo, &["config", "commit.gpgsign", "false"]);
    fs::create_dir_all(repo.join("src")).unwrap();
    fs::write(repo.join("src/good.ts"), "export const x = 1;\n").unwrap();
    fs::write(
        repo.join("src/broken.ts"),
        "export function ok() { return 1; }\n\nexport function broken( {\n",
    )
    .unwrap();
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-q", "-m", "init"]);

    let source = GitSource::open(repo).unwrap();
    let commit = source.resolve("HEAD").unwrap();
    let indexed = Indexer::new("app")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(&source, &commit)
        .unwrap();

    indexed.graph.validate().unwrap();
    let ids: Vec<String> = indexed
        .graph
        .nodes()
        .iter()
        .map(|n| n.id.to_string())
        .collect();
    assert!(ids.contains(&"pkg:app/src::file:src/broken.ts".to_owned()));
    assert!(ids.contains(&"pkg:app/src::file:src/broken.ts::sym:ok".to_owned()));
    assert!(ids.contains(&"pkg:app/src::file:src/good.ts::sym:x".to_owned()));
    assert_eq!(
        indexed.meta.warnings.len(),
        1,
        "{:?}",
        indexed.meta.warnings
    );
    assert!(indexed.meta.warnings[0].contains("src/broken.ts"));
}
