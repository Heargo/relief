//! Seam 1 of ticket 03: a `Session` remembers the snapshots of real commits;
//! the working tree and the index are recomputed on each call.
//! `Session::indexed_count() -> usize` counts the indexings really done.

mod common;

use common::*;
use relief_app::{DiffRequest, RangeSpec, Session, SnapshotRequest};

fn snap(rev: &str) -> SnapshotRequest {
    SnapshotRequest {
        rev: rev.into(),
        budget: None,
        expand: vec![],
    }
}

#[test]
fn a_new_session_has_indexed_nothing() {
    let (_acme, session) = acme();
    assert_eq!(session.indexed_count(), 0);
}

#[test]
fn two_snapshots_of_the_same_commit_index_once() {
    let (_acme, session) = acme();
    let first = session.snapshot(&snap("main")).unwrap();
    assert_eq!(session.indexed_count(), 1);
    let second = session.snapshot(&snap("main")).unwrap();
    assert_eq!(session.indexed_count(), 1);
    assert_eq!(first, second);
    // Another name of the same commit is the same snapshot.
    session
        .snapshot(&snap(&_acme.repo.sha("base").unwrap().to_owned()))
        .unwrap();
    assert_eq!(session.indexed_count(), 1);
}

#[test]
fn two_snapshots_of_the_working_tree_index_twice() {
    let acme = build(|_| {});
    let session = Session::open(&acme.path, options(None)).unwrap();
    session.snapshot(&snap("WORKTREE")).unwrap();
    session.snapshot(&snap("WORKTREE")).unwrap();
    assert_eq!(session.indexed_count(), 2);
}

#[test]
fn a_repeated_diff_of_real_commits_indexes_nothing_more() {
    let (_acme, session) = acme();
    let request = DiffRequest {
        range: Some(RangeSpec::parse(RANGE).unwrap()),
        budget: None,
        expand: vec![],
    };
    session.diff(&request).unwrap();
    let after_first = session.indexed_count();
    assert!(after_first >= 2, "both sides are indexed");
    session.diff(&request).unwrap();
    assert_eq!(session.indexed_count(), after_first);
}

#[test]
fn a_session_can_be_shared_between_threads() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<Session>();
}
