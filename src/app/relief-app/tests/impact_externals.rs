//! Ticket X02: `Session::impact` on acme-shop (`main...feat/promo-codes`), direction
//! `dependencies` from the `postCheckout` route reaches the externals imported by the files of
//! the flow: `payment.ts` imports `stripe-sdk`. `callers` counts of R04 (8 and 6) are unchanged
//! (see `impact.rs`).

mod common;

use common::*;
use relief_app::{ImpactRequest, RangeSpec};
use relief_model::{ImpactDirection, NodeId};

const POST_CHECKOUT: &str =
    "pkg:@acme/api/routes::file:apps/api/routes/checkout.ts::sym:postCheckout";

#[test]
fn post_checkout_reaches_stripe_sdk_through_its_dependencies() {
    let (_acme, session) = acme();
    let impact = session
        .impact(&ImpactRequest {
            range: Some(RangeSpec::parse(RANGE).unwrap()),
            seeds: vec![POST_CHECKOUT.parse::<NodeId>().unwrap()],
            direction: ImpactDirection::Dependencies,
            max_depth: 8,
            follow_http: true,
        })
        .unwrap();
    let nodes: Vec<String> = impact.reached.iter().map(|r| r.node.to_string()).collect();
    assert!(
        nodes.contains(&"pkg:external/stripe-sdk".to_owned()),
        "{nodes:#?}"
    );
    // The symbols reached before are still there.
    assert!(nodes.iter().any(|n| n.ends_with("::sym:chargeCustomer")));
    assert!(nodes.iter().any(|n| n.ends_with("::sym:computeTotal")));
}
