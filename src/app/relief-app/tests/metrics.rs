//! Seam 1 of ticket 03 (explore): `Session::metrics` on the `churn` fixture (6 commits by bob and
//! carol, the last one on 2024-06-30).
//!
//! API expected: `MetricsRequest { rev: String, since_days: Option<u32> }` (default 90 days),
//! `Session::metrics(&MetricsRequest) -> Result<MetricsResponse, AppError>` where
//! `MetricsResponse.nodes` maps a node id (`String`) to the model's `Metrics`, which gains
//! `churn: Option<u32>`, `owner: Option<String>` and `tested: Option<bool>` next to
//! `complexity: Option<u32>`. The window counts back from the date of the commit of `rev`, not from
//! the clock. The churn of a file or symbol is the number of commits of the window that touch the
//! file or the lines of the span (the creating commit counts). The owner is the majority author of
//! those commits. `tested` is true on a file imported by a test file. The result is kept in
//! `.relief/cache/` in a file whose name contains `metrics`.

mod common;

use std::fs;

use common::options;
use relief_app::{DataDirEnv, MetricsRequest, Session, SessionOptions, SnapshotRequest};
use relief_fixtures::Fixture;
use tempfile::TempDir;

const PRICING: &str = "pkg:churn/src::file:src/pricing.ts";
const TOTAL: &str = "pkg:churn/src::file:src/pricing.ts::sym:total";
const DISCOUNT: &str = "pkg:churn/src::file:src/pricing.ts::sym:discount";
const UTIL: &str = "pkg:churn/src::file:src/util.ts";
const CLAMP: &str = "pkg:churn/src::file:src/util.ts::sym:clamp";

fn churn() -> (TempDir, Session) {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("churn");
    Fixture::load("churn").unwrap().build(&path).unwrap();
    let session = Session::open(
        &path,
        SessionOptions {
            data_dir: Some(DataDirEnv {
                relief_cache_dir: None,
                xdg_cache_home: None,
                home: None,
            }),
            ..options(None)
        },
    )
    .unwrap();
    (dir, session)
}

fn request(since_days: Option<u32>) -> MetricsRequest {
    MetricsRequest {
        rev: "main".into(),
        since_days,
    }
}

#[test]
fn default_window_of_90_days_counts_the_commits_after_april_1st_2024() {
    let (_dir, session) = churn();
    let m = session.metrics(&request(None)).unwrap();
    // pricing.ts: c3 (bob), c4 (bob), c5 (carol); c1 and c2 are before 2024-04-01.
    assert_eq!(m.nodes[PRICING].churn, Some(3));
    assert_eq!(m.nodes[PRICING].owner.as_deref(), Some("bob"));
    // total (lines 1-9): c3 and c4.
    assert_eq!(m.nodes[TOTAL].churn, Some(2));
    assert_eq!(m.nodes[TOTAL].owner.as_deref(), Some("bob"));
    // discount (lines 11-13): c5 only.
    assert_eq!(m.nodes[DISCOUNT].churn, Some(1));
    assert_eq!(m.nodes[DISCOUNT].owner.as_deref(), Some("carol"));
    // util.ts: c6.
    assert_eq!(m.nodes[UTIL].churn, Some(1));
    assert_eq!(m.nodes[UTIL].owner.as_deref(), Some("bob"));
    assert_eq!(m.nodes[CLAMP].churn, Some(1));
}

#[test]
fn a_30_day_window_keeps_only_the_commits_after_may_31st_2024() {
    let (_dir, session) = churn();
    let m = session.metrics(&request(Some(30))).unwrap();
    assert_eq!(m.nodes[PRICING].churn, Some(1));
    assert_eq!(m.nodes[PRICING].owner.as_deref(), Some("carol"));
    assert_eq!(m.nodes[TOTAL].churn, Some(0));
    assert_eq!(m.nodes[DISCOUNT].churn, Some(1));
    assert_eq!(m.nodes[UTIL].churn, Some(1));
}

#[test]
fn a_365_day_window_reaches_the_first_commit() {
    let (_dir, session) = churn();
    let m = session.metrics(&request(Some(365))).unwrap();
    assert_eq!(m.nodes[PRICING].churn, Some(5));
    // total: c1 (creation), c3, c4. discount: c1, c2, c5.
    assert_eq!(m.nodes[TOTAL].churn, Some(3));
    assert_eq!(m.nodes[DISCOUNT].churn, Some(3));
    assert_eq!(m.nodes[DISCOUNT].owner.as_deref(), Some("carol"));
    assert_eq!(m.nodes[UTIL].churn, Some(2));
}

#[test]
fn the_window_follows_the_commit_not_the_clock() {
    let (_dir, session) = churn();
    // At c4 (2024-05-10) a 90 day window starts on 2024-02-10: c3 and c4 only.
    let m = session
        .metrics(&MetricsRequest {
            rev: "main~2".into(),
            since_days: None,
        })
        .unwrap();
    assert_eq!(m.nodes[PRICING].churn, Some(2));
    assert_eq!(m.nodes[DISCOUNT].churn, Some(0));
}

#[test]
fn cyclomatic_complexity_counts_the_branches_of_each_function() {
    let (_dir, session) = churn();
    let m = session.metrics(&request(None)).unwrap();
    // 1 + `for` + `if`.
    assert_eq!(m.nodes[TOTAL].complexity, Some(3));
    assert_eq!(m.nodes[DISCOUNT].complexity, Some(1));
    // 1 + the ternary.
    assert_eq!(m.nodes[CLAMP].complexity, Some(2));
}

#[test]
fn a_file_imported_by_a_test_file_is_tested() {
    let (_dir, session) = churn();
    let m = session.metrics(&request(None)).unwrap();
    assert_eq!(m.nodes[PRICING].tested, Some(true));
    assert_eq!(m.nodes[UTIL].tested, Some(false));
}

#[test]
fn the_snapshot_of_the_same_commit_is_identical_before_and_after_metrics() {
    let (_dir, session) = churn();
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
    session.metrics(&request(None)).unwrap();
    session.metrics(&request(Some(30))).unwrap();
    assert_eq!(snap(), before);
    assert!(
        !before.to_string().contains("\"churn\""),
        "the snapshot carries no churn"
    );
}

#[test]
fn the_result_is_kept_in_the_cache_folder_and_a_second_call_gives_the_same_answer() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("churn");
    Fixture::load("churn").unwrap().build(&path).unwrap();
    let open = || {
        Session::open(
            &path,
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
    };
    let first = open().metrics(&request(None)).unwrap();
    let kept = fs::read_dir(path.join(".relief/cache"))
        .unwrap()
        .filter_map(Result::ok)
        .any(|e| e.file_name().to_string_lossy().contains("metrics"));
    assert!(kept, "a metrics file in .relief/cache");
    let second = open().metrics(&request(None)).unwrap();
    assert_eq!(second.nodes[PRICING].churn, first.nodes[PRICING].churn);
    assert_eq!(second.nodes[TOTAL].churn, Some(2));
}

#[test]
fn an_unknown_ref_is_an_error() {
    let (_dir, session) = churn();
    let err = session
        .metrics(&MetricsRequest {
            rev: "nope".into(),
            since_days: None,
        })
        .unwrap_err();
    assert!(!err.to_string().is_empty());
}
