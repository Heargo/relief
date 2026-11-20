//! Seam 1 of ticket 03: each `AppError` code (`code() -> &'static str`) and the
//! parsing of `RangeSpec`.

mod common;

use common::*;
use relief_app::{
    AppError, CodeRequest, DiffRequest, RangeSpec, ReviewSummaryRequest, Session, Side,
    SnapshotRequest,
};
use relief_model::NodeId;
use tempfile::TempDir;

fn code_of<T: std::fmt::Debug>(result: Result<T, AppError>) -> &'static str {
    result.expect_err("an error was expected").code()
}

fn parse_error(text: &str) -> &'static str {
    code_of(RangeSpec::parse(text))
}

#[test]
fn range_spec_accepts_the_documented_forms() {
    for text in [
        "main...feat/promo-codes",
        "main..feat/promo-codes",
        "main",
        "HEAD~2",
    ] {
        assert!(RangeSpec::parse(text).is_ok(), "{text}");
    }
}

#[test]
fn malformed_ranges_are_invalid_range() {
    for text in ["main...", "...main", ""] {
        assert_eq!(parse_error(text), "invalid_range", "{text:?}");
    }
}

#[test]
fn an_unknown_ref_in_a_range_is_unknown_ref_when_used() {
    let (_acme, session) = acme();
    let range = Some(RangeSpec::parse("nope...main").unwrap());
    assert_eq!(
        code_of(session.diff(&DiffRequest {
            range: range.clone(),
            budget: None,
            expand: vec![],
        })),
        "unknown_ref"
    );
    assert_eq!(
        code_of(session.review_summary(&ReviewSummaryRequest { range })),
        "unknown_ref"
    );
}

#[test]
fn an_unknown_ref_for_a_snapshot_is_unknown_ref() {
    let (_acme, session) = acme();
    assert_eq!(
        code_of(session.snapshot(&SnapshotRequest {
            rev: "nope".into(),
            budget: None,
            expand: vec![],
        })),
        "unknown_ref"
    );
}

#[test]
fn opening_on_an_unknown_range_is_unknown_ref() {
    let acme = build(|_| {});
    let result = Session::open(
        &acme.path,
        options(Some(RangeSpec::parse("nope...main").unwrap())),
    );
    assert_eq!(code_of(result), "unknown_ref");
}

#[test]
fn an_unknown_node_is_unknown_node() {
    let (_acme, session) = acme();
    let missing: NodeId = "pkg:@acme/api::file:apps/api/billing/missing.ts"
        .parse()
        .unwrap();
    let request = CodeRequest {
        node: missing,
        side: Side::Head,
        range: None,
    };
    assert_eq!(code_of(session.code(&request)), "unknown_node");
}

#[test]
fn a_node_absent_from_the_requested_side_is_unknown_node() {
    let (_acme, session) = acme();
    let request = CodeRequest {
        node: DISCOUNT_FILE.parse().unwrap(),
        side: Side::Base,
        range: None,
    };
    assert_eq!(code_of(session.code(&request)), "unknown_node");
}

#[test]
fn a_forged_path_is_unknown_node() {
    let (_acme, session) = acme();
    let request = CodeRequest {
        node: "pkg:@acme/api::file:../secret.txt".parse().unwrap(),
        side: Side::Head,
        range: None,
    };
    assert_eq!(code_of(session.code(&request)), "unknown_node");
}

#[test]
fn a_directory_that_is_not_a_repository_is_not_a_repository() {
    let dir = TempDir::new().unwrap();
    assert_eq!(
        code_of(Session::open(dir.path(), options(None))),
        "not_a_repository"
    );
}

#[test]
fn indexing_without_any_detector_is_an_index_error() {
    let acme = build(|_| {});
    let mut opts = options(None);
    opts.detectors.clear();
    opts.adapters.clear();
    let session = Session::open(&acme.path, opts).unwrap();
    assert_eq!(
        code_of(session.snapshot(&SnapshotRequest {
            rev: "main".into(),
            budget: None,
            expand: vec![],
        })),
        "index"
    );
}
