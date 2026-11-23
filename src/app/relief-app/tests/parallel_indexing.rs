//! S10 seam: indexing a fixture commit is deterministic, whatever the number of threads.
//! `Indexer::with_threads(n)` (to add) runs the per-file work in a pool of `n` threads.
//! The two cold-run tests lock existing behaviour and may already pass; the thread-count
//! tests fail until `with_threads` exists.

use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use tempfile::TempDir;

fn index_json(fixture: &str, threads: Option<usize>, cache: Option<&std::path::Path>) -> String {
    let dir = TempDir::new().unwrap();
    Fixture::load(fixture).unwrap().build(dir.path()).unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let commit = source.resolve("HEAD").unwrap();
    let mut indexer = Indexer::new(fixture)
        .with_detectors(default_detectors())
        .with_adapter(Box::new(TsAdapter::new()));
    if let Some(cache) = cache {
        indexer = indexer.with_cache(cache);
    }
    if let Some(n) = threads {
        indexer = indexer.with_threads(n);
    }
    let graph = indexer.snapshot(&source, &commit).unwrap().graph;
    serde_json::to_string(&graph).unwrap()
}

fn two_cold_runs_match(fixture: &str) {
    let (c1, c2) = (TempDir::new().unwrap(), TempDir::new().unwrap());
    let first = index_json(fixture, None, Some(c1.path()));
    let second = index_json(fixture, None, Some(c2.path()));
    assert!(first.len() > 100, "the graph is not empty");
    assert_eq!(first, second);
}

fn threads_do_not_change_the_graph(fixture: &str) {
    let one = index_json(fixture, Some(1), None);
    let many = index_json(fixture, Some(8), None);
    assert!(one.len() > 100, "the graph is not empty");
    assert_eq!(one, many);
}

#[test]
fn two_cold_indexings_of_acme_shop_are_byte_identical() {
    two_cold_runs_match("acme-shop");
}

#[test]
fn two_cold_indexings_of_wide_are_byte_identical() {
    two_cold_runs_match("wide");
}

#[test]
fn acme_shop_graph_is_the_same_on_one_thread_and_eight() {
    threads_do_not_change_the_graph("acme-shop");
}

#[test]
fn wide_graph_is_the_same_on_one_thread_and_eight() {
    threads_do_not_change_the_graph("wide");
}

#[test]
fn wide_graph_with_a_shared_cache_is_the_same_on_eight_threads() {
    let cache = TempDir::new().unwrap();
    let cold = index_json("wide", Some(8), Some(cache.path()));
    let warm = index_json("wide", Some(8), Some(cache.path()));
    let reference = index_json("wide", Some(1), None);
    assert_eq!(cold, reference);
    assert_eq!(warm, reference);
}
