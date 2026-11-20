//! Seam 1 of ticket R06: `Session::diff` on one isolated commit of acme-shop, as a reviewed
//! `insta` snapshot. Needs `insta` (feature `json`) among the dev-dependencies of relief-app.

mod common;

use common::*;
use relief_app::{DiffRequest, RangeSpec};

#[test]
fn diff_of_the_auth_commit_alone() {
    let (acme, session) = acme();
    let spec = format!(
        "{}..{}",
        acme.repo.sha("discount").unwrap(),
        acme.repo.sha("auth").unwrap()
    );
    let response = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::parse(&spec).unwrap()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    insta::assert_json_snapshot!("auth_commit_diff", serde_json::to_value(&response).unwrap());
}
