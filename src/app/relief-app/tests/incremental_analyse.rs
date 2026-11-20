//! Seam of ticket S04: `Session::analyse` does not index the side it already knows in full.
//! A session opened on the working tree knows HEAD and the working tree; after one file
//! changes in the working tree, a new analysis reparses that blob only (no disk cache here:
//! the memory of the session is what is measured), and its diff is the one of a new session.
//!
//! Interface expected from `relief_lang_ts::TsAdapter`: it is `Clone`, clones share one
//! counter, and `parses() -> usize` is the number of tree-sitter parses made so far.

mod common;

use common::*;
use relief_app::{DiffRequest, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_lang_ts::TsAdapter;

fn counted(ts: &TsAdapter) -> SessionOptions {
    SessionOptions {
        data_dir: None,
        range: None,
        detectors: default_detectors(),
        adapters: vec![Box::new(ts.clone())],
    }
}

fn worktree_request() -> DiffRequest {
    DiffRequest {
        range: None,
        budget: None,
        expand: vec![],
    }
}

fn touch(acme: &Acme) {
    let file = acme.path.join("apps/api/billing/invoice.ts");
    let mut text = std::fs::read_to_string(&file).expect("read");
    text.push_str("\nexport function addedInTheWorktree(): number {\n  return 1;\n}\n");
    std::fs::write(file, text).expect("write");
}

#[test]
fn analysing_after_one_change_reparses_only_the_changed_blob() {
    let acme = build(|_| {});
    let ts = TsAdapter::new();
    let session = Session::open(&acme.path, counted(&ts)).unwrap();
    session.diff(&worktree_request()).unwrap();
    touch(&acme);
    let before = ts.parses();
    session.diff(&worktree_request()).unwrap();
    assert_eq!(
        ts.parses() - before,
        1,
        "only invoice.ts changed, nothing else may be parsed again"
    );
}

#[test]
fn the_incremental_diff_equals_the_diff_of_a_new_session() {
    let acme = build(|_| {});
    let ts = TsAdapter::new();
    let session = Session::open(&acme.path, counted(&ts)).unwrap();
    session.diff(&worktree_request()).unwrap();
    touch(&acme);
    let incremental = session.diff(&worktree_request()).unwrap();
    let fresh = Session::open(&acme.path, options(None)).unwrap();
    assert_eq!(incremental, fresh.diff(&worktree_request()).unwrap());
    assert!(
        incremental
            .diff
            .nodes
            .iter()
            .any(|n| n.id.to_string().ends_with("::sym:addedInTheWorktree")),
        "the added symbol is in the diff"
    );
}
