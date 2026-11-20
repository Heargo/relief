//! Seam 1: `relief_index::Indexer` with a blob cache, on acme-shop with the TS adapter.
//!
//! Expected API: `Indexer::with_cache(dir)` keeps `<dir>/index.sqlite`;
//! `SnapshotMeta::parsed_files` / `cached_files` count the files an adapter
//! handled, parsed or served by the cache; `LanguageAdapter::version()`
//! (default method) takes part in the cache key.

use std::fs;
use std::path::Path;

use relief_adapter_api::{Extraction, LanguageAdapter, LinkContext};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::{IndexedSnapshot, Indexer};
use relief_lang_ts::TsAdapter;
use relief_model::Node;
use tempfile::TempDir;

/// New TS-family blobs of `feat/promo-codes` compared to `main` (checked with
/// `git ls-tree`): 13 files, no duplicated content.
const NEW_BLOBS_PROMO: usize = 13;

struct Versioned(TsAdapter, u32);

impl LanguageAdapter for Versioned {
    fn name(&self) -> &str {
        self.0.name()
    }
    fn version(&self) -> u32 {
        self.1
    }
    fn handles(&self, lang: &str) -> bool {
        self.0.handles(lang)
    }
    fn extract(&self, file: &Node, bytes: &[u8]) -> Extraction {
        self.0.extract(file, bytes)
    }
    fn link(&self, file: &Node, bytes: &[u8], ctx: &LinkContext<'_>) -> Extraction {
        self.0.link(file, bytes, ctx)
    }
}

fn acme(dir: &Path) -> GitSource {
    Fixture::load("acme-shop").unwrap().build(dir).unwrap();
    GitSource::open(dir).unwrap()
}

fn snapshot(
    source: &GitSource,
    rev: &str,
    cache: &Path,
    adapter: Box<dyn LanguageAdapter>,
) -> IndexedSnapshot {
    let commit = source.resolve(rev).unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(adapter)
        .with_cache(cache)
        .snapshot(source, &commit)
        .unwrap()
}

fn ts(source: &GitSource, rev: &str, cache: &Path) -> IndexedSnapshot {
    snapshot(source, rev, cache, Box::new(TsAdapter::new()))
}

#[test]
fn first_snapshot_parses_every_file_and_serves_none_from_cache() {
    let repo = TempDir::new().unwrap();
    let cache = TempDir::new().unwrap();
    let source = acme(repo.path());
    let first = ts(&source, "main", cache.path());
    assert!(first.meta.parsed_files > 0);
    assert_eq!(first.meta.cached_files, 0);
}

#[test]
fn second_snapshot_of_the_same_commit_parses_nothing() {
    let repo = TempDir::new().unwrap();
    let cache = TempDir::new().unwrap();
    let source = acme(repo.path());
    let first = ts(&source, "main", cache.path());
    let second = ts(&source, "main", cache.path());
    assert_eq!(second.meta.parsed_files, 0);
    assert_eq!(second.meta.cached_files, first.meta.parsed_files);
    assert_eq!(second.graph, first.graph);
}

#[test]
fn feature_branch_after_main_parses_only_new_blobs() {
    let repo = TempDir::new().unwrap();
    let cache = TempDir::new().unwrap();
    let source = acme(repo.path());
    let main = ts(&source, "main", cache.path());
    let feat = ts(&source, "feat/promo-codes", cache.path());
    assert_eq!(feat.meta.parsed_files, NEW_BLOBS_PROMO);
    assert!(feat.meta.cached_files > 0);
    assert!(main.meta.parsed_files > 0);
}

#[test]
fn cached_snapshot_equals_uncached_snapshot() {
    let repo = TempDir::new().unwrap();
    let cache = TempDir::new().unwrap();
    let source = acme(repo.path());
    let commit = source.resolve("main").unwrap();
    let plain = Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(&source, &commit)
        .unwrap();
    ts(&source, "main", cache.path());
    let cached = ts(&source, "main", cache.path());
    assert_eq!(cached.graph, plain.graph);
}

#[test]
fn a_new_adapter_version_invalidates_the_cache() {
    let repo = TempDir::new().unwrap();
    let cache = TempDir::new().unwrap();
    let source = acme(repo.path());
    let v1 = snapshot(
        &source,
        "main",
        cache.path(),
        Box::new(Versioned(TsAdapter::new(), 1)),
    );
    let v2 = snapshot(
        &source,
        "main",
        cache.path(),
        Box::new(Versioned(TsAdapter::new(), 2)),
    );
    assert_eq!(v2.meta.parsed_files, v1.meta.parsed_files);
    assert_eq!(v2.meta.cached_files, 0);
}

#[test]
fn garbage_cache_file_does_not_fail_and_is_recreated_with_a_warning() {
    let repo = TempDir::new().unwrap();
    let cache = TempDir::new().unwrap();
    let source = acme(repo.path());
    let garbage: Vec<u8> = (0..4096u32).map(|i| (i * 31 % 251) as u8).collect();
    fs::write(cache.path().join("index.sqlite"), &garbage).unwrap();

    let first = ts(&source, "main", cache.path());
    assert!(first.meta.parsed_files > 0);
    assert_eq!(first.meta.cached_files, 0);
    assert!(
        first
            .meta
            .warnings
            .iter()
            .any(|w| w.to_lowercase().contains("cache")),
        "{:?}",
        first.meta.warnings
    );

    let second = ts(&source, "main", cache.path());
    assert_eq!(second.meta.parsed_files, 0);
    assert_eq!(second.meta.cached_files, first.meta.parsed_files);
}
