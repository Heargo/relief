//! Seam of ticket S04: `Indexer` on the acme-shop fixture with the real TypeScript adapter and
//! a disk cache. A second snapshot of the same commit, from a fresh indexer on the same cache
//! folder, parses no file at all (neither for `extract` nor for `link`).
//!
//! Interface expected from `relief_lang_ts::TsAdapter` (smallest way to observe parsing):
//! it is `Clone`, clones share one counter, and `parses() -> usize` is the number of
//! tree-sitter parses the adapter has made through any of its methods.

use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::{IndexedSnapshot, Indexer};
use relief_lang_ts::TsAdapter;
use rusqlite::Connection;
use tempfile::TempDir;

struct Setup {
    _repo: TempDir,
    cache: TempDir,
    source: GitSource,
    commit: relief_git::CommitId,
}

fn setup() -> Setup {
    let repo = TempDir::new().expect("tmp");
    Fixture::load("acme-shop")
        .expect("load")
        .build(repo.path())
        .expect("build");
    let source = GitSource::open(repo.path()).expect("open");
    let commit = source.resolve("main").expect("resolve");
    Setup {
        _repo: repo,
        cache: TempDir::new().expect("tmp"),
        source,
        commit,
    }
}

/// A fresh indexer (empty memory) on the shared cache folder, and its parse counter.
fn run(setup: &Setup) -> (IndexedSnapshot, TsAdapter) {
    let ts = TsAdapter::new();
    let indexed = Indexer::new("acme")
        .with_detectors(default_detectors())
        .with_adapter(Box::new(ts.clone()))
        .with_cache(setup.cache.path())
        .snapshot(&setup.source, &setup.commit)
        .expect("snapshot");
    (indexed, ts)
}

#[test]
fn a_cold_snapshot_parses_files() {
    let setup = setup();
    let (_, ts) = run(&setup);
    assert!(ts.parses() > 0, "cold run must parse, got {}", ts.parses());
}

#[test]
fn a_warm_snapshot_parses_no_file() {
    let setup = setup();
    let (cold, _) = run(&setup);
    assert!(cold.meta.parsed_files > 0);
    let (warm, ts) = run(&setup);
    assert_eq!(warm.meta.parsed_files, 0);
    assert_eq!(ts.parses(), 0, "warm run must not reparse any file");
}

#[test]
fn cold_and_warm_snapshots_have_the_same_graph() {
    let setup = setup();
    let (cold, _) = run(&setup);
    let (warm, _) = run(&setup);
    assert_eq!(cold.graph, warm.graph);
}

#[test]
fn a_cache_of_the_previous_format_is_ignored_and_upgraded() {
    let setup = setup();
    let (reference, _) = run(&setup);
    // Replace the cache by one in the previous format (version 4), holding rows
    // that would poison the graph if they were read.
    let file = setup.cache.path().join("index.sqlite");
    for suffix in ["", "-wal", "-shm"] {
        let mut name = file.clone().into_os_string();
        name.push(suffix);
        let _ = std::fs::remove_file(name);
    }
    {
        let conn = Connection::open(&file).expect("open");
        conn.execute_batch(
            "CREATE TABLE file_index (
                blob TEXT NOT NULL, adapter TEXT NOT NULL, adapter_version INTEGER NOT NULL,
                payload TEXT NOT NULL, PRIMARY KEY (blob, adapter, adapter_version));
            PRAGMA user_version = 4;",
        )
        .expect("old cache");
    }
    let (again, ts) = run(&setup);
    assert_eq!(again.graph, reference.graph);
    assert!(ts.parses() > 0, "an old cache holds no usable index");
    let conn = Connection::open(&file).expect("reopen");
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .expect("version");
    assert!(version > 4, "format version must be raised, got {version}");
}
