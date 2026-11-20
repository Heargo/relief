//! Seam 2 of ticket 02: `Session::review_summary` lists the rule violations of the range
//! (`ReviewSummary::violations: Vec<relief_model::Violation>`), on acme-shop.

mod common;

use common::*;
use relief_app::{RangeSpec, ReviewSummaryRequest};

fn summary(range: &str) -> relief_model::ReviewSummary {
    let (_acme, session) = acme();
    session
        .review_summary(&ReviewSummaryRequest {
            range: Some(RangeSpec::parse(range).unwrap()),
        })
        .unwrap()
}

#[test]
fn the_pr_introduces_one_violation_and_keeps_one_existing() {
    let s = summary(RANGE);
    let introduced: Vec<_> = s.violations.iter().filter(|v| v.introduced).collect();
    let existing: Vec<_> = s.violations.iter().filter(|v| !v.introduced).collect();
    assert_eq!(introduced.len(), 1, "{:?}", s.violations);
    assert_eq!(introduced[0].rule, "web-sans-db");
    assert!(
        introduced[0]
            .edge
            .from
            .to_string()
            .ends_with("::sym:validateCodeLocally")
    );
    assert!(
        introduced[0]
            .edge
            .to
            .to_string()
            .ends_with("::sym:findDiscountByCode")
    );
    assert_eq!(existing.len(), 1, "{:?}", s.violations);
    assert_eq!(existing[0].rule, "routes-via-repos");
    assert!(
        existing[0]
            .edge
            .from
            .to_string()
            .ends_with("::sym:listInvoices")
    );
    assert!(
        existing[0]
            .edge
            .to
            .to_string()
            .ends_with("::sym:invoicesTable")
    );
}

#[test]
fn a_range_without_change_has_no_introduced_violation() {
    let s = summary("main~0..main");
    assert!(
        s.violations.iter().all(|v| !v.introduced),
        "{:?}",
        s.violations
    );
    let existing: Vec<_> = s.violations.iter().filter(|v| !v.introduced).collect();
    assert_eq!(existing.len(), 1, "{:?}", s.violations);
    assert_eq!(existing[0].rule, "routes-via-repos");
}
