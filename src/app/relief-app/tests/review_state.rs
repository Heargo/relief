//! Seam 1 of ticket R05: `Session::review_state` / `set_review_state` and the
//! reading order exposed by `Session::reading_order`, on acme-shop.
//!
//! API expected: `relief_model::ReviewState { seen: Vec<NodeId> }` (Default, PartialEq),
//! `Session::review_state(&RangeSpec) -> Result<ReviewState, AppError>`,
//! `Session::set_review_state(&RangeSpec, &ReviewState) -> Result<(), AppError>`,
//! the error code `no_data_dir` when the session has no data folder, and
//! `Session::reading_order(&ReadingOrderRequest { range: Option<RangeSpec>,
//! granularity: relief_diff::Granularity }) -> Result<ReadingOrderResponse, AppError>`
//! with `ReadingOrderResponse { items: Vec<ReadingItem> }` (`ReadingItem.id: NodeId`).

mod common;

use std::fs;

use common::*;
use relief_app::{DataDirEnv, RangeSpec, ReadingOrderRequest, Session, SessionOptions};
use relief_diff::Granularity;
use relief_model::{NodeId, ReviewState};
use tempfile::TempDir;

fn open_with_data(acme: &Acme, data: &TempDir) -> Session {
    let mut opts: SessionOptions = options(Some(RangeSpec::parse(RANGE).unwrap()));
    opts.data_dir = Some(DataDirEnv {
        relief_cache_dir: Some(data.path().to_path_buf()),
        xdg_cache_home: None,
        home: None,
    });
    Session::open(&acme.path, opts).unwrap()
}

fn range() -> RangeSpec {
    RangeSpec::parse(RANGE).unwrap()
}

fn state(ids: &[&str]) -> ReviewState {
    ReviewState {
        seen: ids.iter().map(|i| i.parse::<NodeId>().unwrap()).collect(),
    }
}

#[test]
fn a_new_session_reads_back_what_was_saved() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    let saved = state(&[COMPUTE_TOTAL, DISCOUNT_FILE]);
    open_with_data(&acme, &data)
        .set_review_state(&range(), &saved)
        .unwrap();

    let reopened = open_with_data(&acme, &data);
    assert_eq!(reopened.review_state(&range()).unwrap(), saved);
}

#[test]
fn a_range_never_saved_has_an_empty_state() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    let session = open_with_data(&acme, &data);
    assert_eq!(
        session.review_state(&range()).unwrap(),
        ReviewState::default()
    );
}

#[test]
fn the_state_of_another_range_is_not_mixed() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    let session = open_with_data(&acme, &data);
    let other = RangeSpec::parse("main..feat/promo-codes").unwrap();
    session
        .set_review_state(&range(), &state(&[COMPUTE_TOTAL]))
        .unwrap();
    session
        .set_review_state(&other, &state(&[REFRESH]))
        .unwrap();

    let reopened = open_with_data(&acme, &data);
    assert_eq!(
        reopened.review_state(&range()).unwrap(),
        state(&[COMPUTE_TOTAL])
    );
    assert_eq!(reopened.review_state(&other).unwrap(), state(&[REFRESH]));
}

#[test]
fn the_last_write_wins() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    let session = open_with_data(&acme, &data);
    session
        .set_review_state(&range(), &state(&[COMPUTE_TOTAL, REFRESH]))
        .unwrap();
    session
        .set_review_state(&range(), &state(&[REFRESH]))
        .unwrap();
    assert_eq!(session.review_state(&range()).unwrap(), state(&[REFRESH]));
}

#[test]
fn the_file_lives_in_state_review_with_the_range_text_in_clear_and_no_temp_left() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    open_with_data(&acme, &data)
        .set_review_state(&range(), &state(&[COMPUTE_TOTAL]))
        .unwrap();

    let dir = data.path().join("state").join("review");
    let files: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(files.len(), 1, "{files:?}");
    assert_eq!(files[0].extension().unwrap(), "json");
    let text = fs::read_to_string(&files[0]).unwrap();
    assert!(text.contains(RANGE), "{text}");
    assert!(text.contains(COMPUTE_TOTAL), "{text}");
}

#[test]
fn without_a_data_dir_the_error_code_is_no_data_dir() {
    let (_acme, session) = acme();
    let err = session
        .set_review_state(&range(), &state(&[COMPUTE_TOTAL]))
        .unwrap_err();
    assert_eq!(err.code(), "no_data_dir");
    let err = session.review_state(&range()).unwrap_err();
    assert_eq!(err.code(), "no_data_dir");
}

#[test]
fn reading_order_by_file_has_14_files() {
    let (_acme, session) = acme();
    let order = session
        .reading_order(&ReadingOrderRequest {
            range: Some(range()),
            granularity: Granularity::File,
        })
        .unwrap();
    assert_eq!(order.items.len(), 14);
    assert!(
        order
            .items
            .iter()
            .all(|i| i.id.to_string().contains("::file:") && !i.id.to_string().contains("::sym:"))
    );
}

#[test]
fn reading_order_by_symbol_has_22_symbols_including_compute_total() {
    let (_acme, session) = acme();
    let order = session
        .reading_order(&ReadingOrderRequest {
            range: Some(range()),
            granularity: Granularity::Symbol,
        })
        .unwrap();
    assert_eq!(order.items.len(), 22);
    assert!(
        order
            .items
            .iter()
            .any(|i| i.id.to_string() == COMPUTE_TOTAL)
    );
}
