//! Seam of ticket S23: building a snapshot from a known base does not make the detector read
//! the blobs it already hashed for the base.
//!
//! Interface expected from `relief_index::Indexer`: `detector_reads(&self) -> usize`, the
//! number of blobs handed to detectors (through the `read_blob` they receive) so far by
//! this indexer, in `snapshot*` and `package_dirs`. The count is cumulative, like
//! `TsAdapter::parses()`.

use relief_detect::default_detectors;
use relief_fixtures::{BuiltRepo, Fixture};
use relief_git::GitSource;
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use tempfile::TempDir;

fn indexer() -> Indexer {
    Indexer::new("repo")
        .with_detectors(default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
}

fn tiny() -> (TempDir, GitSource, BuiltRepo) {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("tiny")
        .expect("load")
        .build(dir.path())
        .expect("build");
    let source = GitSource::open(dir.path()).expect("open");
    (dir, source, built)
}

#[test]
fn a_full_snapshot_makes_the_detector_read_every_blob() {
    let (_dir, source, built) = tiny();
    let indexer = indexer();
    indexer
        .snapshot(
            &source,
            &source.resolve(built.sha("init").unwrap()).unwrap(),
        )
        .expect("snapshot");
    // init holds src/a.ts, src/b.ts and docs/readme.md.
    assert_eq!(indexer.detector_reads(), 3);
}

#[test]
fn a_snapshot_from_a_base_makes_the_detector_read_only_the_changed_blobs() {
    let (_dir, source, built) = tiny();
    let indexer = indexer();
    let (init, edit) = (
        source.resolve(built.sha("init").unwrap()).unwrap(),
        source.resolve(built.sha("edit").unwrap()).unwrap(),
    );
    let base = indexer.snapshot(&source, &init).expect("base");
    let before = indexer.detector_reads();
    indexer
        .snapshot_from(&source, &init, &base, &edit)
        .expect("incremental");
    assert_eq!(
        indexer.detector_reads() - before,
        1,
        "only src/a.ts changed between init and edit"
    );
}

#[test]
fn a_snapshot_from_a_base_reads_the_added_blobs_and_not_the_others() {
    let (_dir, source, built) = tiny();
    let indexer = indexer();
    let (edit, reshape) = (
        source.resolve(built.sha("edit").unwrap()).unwrap(),
        source.resolve(built.sha("reshape").unwrap()).unwrap(),
    );
    let base = indexer.snapshot(&source, &edit).expect("base");
    let before = indexer.detector_reads();
    indexer
        .snapshot_from(&source, &edit, &base, &reshape)
        .expect("incremental");
    assert_eq!(
        indexer.detector_reads() - before,
        1,
        "reshape adds src/c.ts (b.ts and the readme are gone, a.ts is unchanged)"
    );
}
