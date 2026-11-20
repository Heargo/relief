//! Seam 2 of ticket 04, `relief-app` side: a `.relief/` committed by mistake
//! is invisible in the snapshot and in the working-tree diff.

mod common;

use std::fs;
use std::path::Path;
use std::process::Command;

use common::*;
use relief_app::{DiffRequest, RangeSpec, Session, SnapshotRequest};

fn git(repo: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@relief.invalid")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_COMMITTER_EMAIL", "fixture@relief.invalid")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}");
}

fn with_committed_relief() -> Acme {
    build(|repo| {
        fs::create_dir_all(repo.join(".relief/cache")).unwrap();
        fs::write(repo.join(".relief/cache/stray.ts"), "export const a = 1;\n").unwrap();
        git(repo, &["add", "-f", ".relief"]);
        git(
            repo,
            &["commit", "-q", "-m", "chore: commit .relief by mistake"],
        );
        fs::write(repo.join(".relief/cache/stray.ts"), "export const a = 2;\n").unwrap();
        fs::write(repo.join(".relief/cache/other.ts"), "export const b = 1;\n").unwrap();
    })
}

#[test]
fn a_committed_relief_dir_is_absent_from_snapshots() {
    let acme = with_committed_relief();
    let session = Session::open(&acme.path, options(None)).unwrap();
    for rev in ["HEAD", "WORKTREE", "INDEX"] {
        let snapshot = session
            .snapshot(&SnapshotRequest {
                rev: rev.to_owned(),
                budget: None,
                expand: vec![],
            })
            .unwrap();
        let dump = format!("{:?}", snapshot.graph);
        assert!(!dump.contains(".relief"), "{rev}");
        assert!(dump.contains("billing"), "{rev}: the repo is still indexed");
    }
}

#[test]
fn a_committed_relief_dir_is_absent_from_the_worktree_diff() {
    let acme = with_committed_relief();
    let session = Session::open(&acme.path, options(None)).unwrap();
    let diff = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::worktree()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let dump = format!("{:?}", diff);
    assert!(!dump.contains(".relief"), "{dump}");
}
