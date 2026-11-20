//! Seam 1 of ticket 04 (explore): `Session::co_change` on the `cochange` fixture.
//!
//! The history (see `tests/fixtures/cochange/fixture.yaml`): `src/a.md` and `src/b.md` change
//! together in 4 of the 5 normal commits that touch one of them (a is in 5 commits, b in 4), one
//! more normal commit touches `src/d.md` alone (6 counted commits), and the last commit (2024-06-01)
//! rewrites a and b with 31 generated files: more than 30 files, so it is ignored.
//!
//! API expected: `CoChangeRequest { rev: String, since_days: Option<u32>, min_commits:
//! Option<u32> }` and `Session::co_change(&CoChangeRequest) -> Result<CoChangeResponse, AppError>`
//! where `CoChangeResponse.pairs` is a `Vec<CoChangePair { a: String, b: String, commits: u32,
//! support: f64, confidence: f64 }>`; `a` and `b` are repository paths with `a < b`. `commits` is
//! the number of counted commits that touch both files, `support` is `commits` over the number of
//! counted commits of the period, `confidence` is `commits` over the number of commits of the
//! most changed of the two files. Only the pairs with at least `min_commits` common commits are
//! returned, sorted by decreasing `commits` then by path. The period (default 90 days) counts back
//! from the date of the commit of `rev`; the default threshold is 2 commits, overridden by the
//! `co_change: { min_commits: N }` section of `relief.config.yaml` at `rev`, itself overridden by
//! the request. The result is kept in `.relief/cache/` in a file whose name contains `co_change`.

mod common;

use std::fs;
use std::path::Path;
use std::process::Command;

use common::options;
use relief_app::{CoChangeRequest, DataDirEnv, Session, SessionOptions, SnapshotRequest};
use relief_fixtures::Fixture;
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
        .env("GIT_AUTHOR_DATE", "2024-06-02T10:00:00Z")
        .env("GIT_COMMITTER_DATE", "2024-06-02T10:00:00Z")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}");
}

fn open(path: &Path) -> Session {
    Session::open(
        path,
        SessionOptions {
            data_dir: Some(DataDirEnv {
                relief_cache_dir: None,
                xdg_cache_home: None,
                home: None,
            }),
            ..options(None)
        },
    )
    .unwrap()
}

fn history(config: Option<&str>) -> (TempDir, Session) {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("cochange");
    Fixture::load("cochange")
        .unwrap()
        .build_with_worktree(&path, |repo| {
            if let Some(config) = config {
                fs::write(repo.join("relief.config.yaml"), config).unwrap();
                git(repo, &["add", "relief.config.yaml"]);
                git(repo, &["commit", "-q", "-m", "chore: co-change config"]);
            }
        })
        .unwrap();
    let session = open(&path);
    (dir, session)
}

fn request(since_days: Option<u32>, min_commits: Option<u32>) -> CoChangeRequest {
    CoChangeRequest {
        rev: "main".into(),
        since_days,
        min_commits,
    }
}

#[test]
fn two_files_changed_together_4_times_out_of_5_make_a_pair_with_support_and_confidence() {
    let (_dir, session) = history(None);
    let got = session.co_change(&request(Some(365), None)).unwrap();
    assert_eq!(got.pairs.len(), 1, "{:?}", got.pairs);
    let pair = &got.pairs[0];
    assert_eq!((pair.a.as_str(), pair.b.as_str()), ("src/a.md", "src/b.md"));
    assert_eq!(pair.commits, 4);
    assert!((pair.support - 4.0 / 6.0).abs() < 1e-9, "{}", pair.support);
    assert!((pair.confidence - 0.8).abs() < 1e-9, "{}", pair.confidence);
}

#[test]
fn a_commit_of_more_than_30_files_counts_for_nothing() {
    let (_dir, session) = history(None);
    // Threshold 1: every pair of the counted commits shows up, and only a/b is one (d is alone, the
    // 31 generated files only appear in the mass rewrite).
    let got = session.co_change(&request(Some(365), Some(1))).unwrap();
    assert_eq!(got.pairs.len(), 1, "{:?}", got.pairs);
    assert_eq!(got.pairs[0].commits, 4, "the mass rewrite is not the fifth");
    assert!(got.pairs.iter().all(|p| !p.a.starts_with("packages/")));
}

#[test]
fn the_default_period_is_90_days_back_from_the_commit_of_the_ref_and_the_default_threshold_is_2() {
    let (_dir, session) = history(None);
    // Since 2024-03-03: k3 and k5 touch both files (k1 and k2 are older).
    let got = session.co_change(&request(None, None)).unwrap();
    assert_eq!(got.pairs.len(), 1, "{:?}", got.pairs);
    assert_eq!(got.pairs[0].commits, 2);
}

#[test]
fn a_short_period_keeps_too_few_commits_to_reach_the_threshold() {
    let (_dir, session) = history(None);
    // Since 2024-05-02: only k5 (the mass rewrite is ignored).
    let got = session.co_change(&request(Some(30), None)).unwrap();
    assert!(got.pairs.is_empty(), "{:?}", got.pairs);
    let got = session.co_change(&request(Some(30), Some(1))).unwrap();
    assert_eq!(got.pairs.len(), 1);
    assert_eq!(got.pairs[0].commits, 1);
}

#[test]
fn the_period_follows_the_commit_not_the_clock() {
    let (_dir, session) = history(None);
    // At k4 (2024-04-10) a 90 day window starts on 2024-01-11: k2, k3 and k4.
    let got = session
        .co_change(&CoChangeRequest {
            rev: "main~3".into(),
            since_days: None,
            min_commits: None,
        })
        .unwrap();
    assert_eq!(got.pairs.len(), 1, "{:?}", got.pairs);
    assert_eq!(got.pairs[0].commits, 2);
}

#[test]
fn the_request_threshold_selects_the_pairs() {
    let (_dir, session) = history(None);
    assert_eq!(
        session
            .co_change(&request(Some(365), Some(4)))
            .unwrap()
            .pairs
            .len(),
        1
    );
    assert!(
        session
            .co_change(&request(Some(365), Some(5)))
            .unwrap()
            .pairs
            .is_empty()
    );
}

#[test]
fn the_threshold_is_read_from_relief_config_yaml() {
    let (_dir, session) = history(Some("co_change:\n  min_commits: 5\n"));
    let got = session.co_change(&request(Some(365), None)).unwrap();
    assert!(got.pairs.is_empty(), "{:?}", got.pairs);

    let (_dir, session) = history(Some("co_change:\n  min_commits: 1\n"));
    let got = session.co_change(&request(Some(30), None)).unwrap();
    assert_eq!(got.pairs.len(), 1, "{:?}", got.pairs);
    assert_eq!(got.pairs[0].commits, 1);
}

#[test]
fn the_request_threshold_wins_over_the_config() {
    let (_dir, session) = history(Some("co_change:\n  min_commits: 5\n"));
    let got = session.co_change(&request(Some(365), Some(4))).unwrap();
    assert_eq!(got.pairs.len(), 1);
}

#[test]
fn the_snapshot_of_the_same_commit_is_identical_before_and_after_co_change() {
    let (_dir, session) = history(None);
    let snap = || {
        serde_json::to_value(
            session
                .snapshot(&SnapshotRequest {
                    rev: "main".into(),
                    budget: None,
                    expand: vec![],
                })
                .unwrap(),
        )
        .unwrap()
    };
    let before = snap();
    session.co_change(&request(Some(365), None)).unwrap();
    assert_eq!(snap(), before);
    assert!(!before.to_string().contains("co_change"));
}

#[test]
fn the_result_is_kept_in_the_cache_folder_and_a_second_call_gives_the_same_answer() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("cochange");
    Fixture::load("cochange").unwrap().build(&path).unwrap();
    let first = open(&path).co_change(&request(Some(365), None)).unwrap();
    let kept = fs::read_dir(path.join(".relief/cache"))
        .unwrap()
        .filter_map(Result::ok)
        .any(|e| e.file_name().to_string_lossy().contains("co_change"));
    assert!(kept, "a co_change file in .relief/cache");
    let second = open(&path).co_change(&request(Some(365), None)).unwrap();
    assert_eq!(second.pairs.len(), 1);
    assert_eq!(second.pairs[0].commits, first.pairs[0].commits);
    assert_eq!(second.pairs[0].commits, 4);
}

#[test]
fn an_unknown_ref_is_an_error() {
    let (_dir, session) = history(None);
    let err = session
        .co_change(&CoChangeRequest {
            rev: "nope".into(),
            since_days: None,
            min_commits: None,
        })
        .unwrap_err();
    assert!(!err.to_string().is_empty());
}
