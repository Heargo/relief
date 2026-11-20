//! Seam 1 of ticket U23: `DiffResponse.base_resolved`, the short SHA (7 characters) of the base
//! really compared, on acme-shop.

mod common;

use common::*;
use relief_app::{DiffRequest, RangeSpec};

fn base_resolved(session: &relief_app::Session, range: RangeSpec) -> String {
    let response = session
        .diff(&DiffRequest {
            range: Some(range),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    response.base_resolved
}

#[test]
fn three_dots_resolve_to_the_merge_base() {
    let (acme, session) = acme();
    // `discount` is an ancestor of `checkout`: the merge base of checkout...discount is discount.
    let spec = format!(
        "{}...{}",
        acme.repo.sha("checkout").unwrap(),
        acme.repo.sha("discount").unwrap()
    );
    let resolved = base_resolved(&session, RangeSpec::parse(&spec).unwrap());
    assert_eq!(resolved, acme.repo.sha("discount").unwrap()[..7]);
}

#[test]
fn two_dots_resolve_to_the_base_as_is() {
    let (acme, session) = acme();
    let spec = format!(
        "{}..{}",
        acme.repo.sha("checkout").unwrap(),
        acme.repo.sha("discount").unwrap()
    );
    let resolved = base_resolved(&session, RangeSpec::parse(&spec).unwrap());
    assert_eq!(resolved, acme.repo.sha("checkout").unwrap()[..7]);
}

#[test]
fn the_acme_range_resolves_to_the_base_commit() {
    let (acme, session) = acme();
    let resolved = base_resolved(&session, RangeSpec::parse(RANGE).unwrap());
    assert_eq!(resolved, acme.repo.sha("base").unwrap()[..7]);
}

#[test]
fn the_working_tree_resolves_to_the_head_commit() {
    let (acme, session) = acme();
    let resolved = base_resolved(&session, RangeSpec::worktree());
    assert_eq!(resolved, acme.repo.sha("checkout").unwrap()[..7]);
}
