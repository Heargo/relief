//! Seam 1 of ticket X01: the snapshot of a commit of acme-shop (real adapters) flags the entry
//! points through the adapter contract and the index copies them.
//!
//! API expected: `Node` gains `entry: bool` (JSON `entry`, only when true) and
//! `entry_type: Option<String>` (JSON `entryType`: "route" | "page" | "job"), and
//! `TsAdapter::version()` goes above 2 so cached extractions without them are dropped.

mod common;

use common::*;
use relief_adapter_api::LanguageAdapter;
use relief_app::SnapshotRequest;
use relief_lang_ts::TsAdapter;

fn entries(rev: &str) -> Vec<(String, String)> {
    let (_acme, session) = acme();
    let snap = session
        .snapshot(&SnapshotRequest {
            rev: rev.into(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let mut out: Vec<(String, String)> = snap
        .graph
        .nodes()
        .iter()
        .filter(|n| n.entry)
        .map(|n| (n.entry_type.clone().unwrap_or_default(), n.id.to_string()))
        .collect();
    out.sort();
    out
}

fn of_type(all: &[(String, String)], ty: &str) -> Vec<String> {
    all.iter()
        .filter(|(t, _)| t == ty)
        .map(|(_, id)| id.clone())
        .collect()
}

#[test]
fn acme_shop_entry_points_are_4_routes_3_pages_and_the_renewal_job() {
    let all = entries("feat/promo-codes");
    assert_eq!(of_type(&all, "route").len(), 4, "routes: {all:#?}");
    assert_eq!(
        of_type(&all, "page"),
        [
            "pkg:@acme/web/pages::file:apps/web/pages/Checkout.tsx",
            "pkg:@acme/web/pages::file:apps/web/pages/Invoices.tsx",
            "pkg:@acme/web/pages::file:apps/web/pages/Login.tsx",
        ]
    );
    assert_eq!(
        of_type(&all, "job"),
        ["pkg:@acme/api/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscriptions"]
    );
    let not_scripts = all.iter().filter(|(t, _)| t != "script").count();
    assert_eq!(not_scripts, 8, "nothing else is an entry point: {all:#?}");
    // The package.json scripts (apps/api: start, test; apps/web: dev, test) mark their package.
    let scripts = of_type(&all, "script");
    assert!(
        scripts.iter().any(|id| id == "pkg:@acme/api"),
        "scripts: {scripts:#?}"
    );
    assert!(
        scripts.iter().any(|id| id == "pkg:@acme/web"),
        "scripts: {scripts:#?}"
    );
}

#[test]
fn the_routes_flagged_are_the_route_handlers() {
    let all = entries("feat/promo-codes");
    let routes = of_type(&all, "route");
    for handler in [
        "pkg:@acme/api/routes::file:apps/api/routes/checkout.ts::sym:postCheckout",
        "pkg:@acme/api/routes::file:apps/api/routes/checkout.ts::sym:postPromoValidate",
        "pkg:@acme/api/routes::file:apps/api/routes/invoices.ts::sym:getInvoice",
        "pkg:@acme/api/routes::file:apps/api/routes/invoices.ts::sym:listInvoices",
    ] {
        assert!(
            routes.iter().any(|r| r == handler),
            "{handler} in {routes:#?}"
        );
    }
}

#[test]
fn only_entry_points_serialize_entry_and_entry_type() {
    let (_acme, session) = acme();
    let snap = session
        .snapshot(&SnapshotRequest {
            rev: "feat/promo-codes".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let json = serde_json::to_value(&snap.graph).unwrap();
    let nodes = json["nodes"].as_array().unwrap();
    let find = |suffix: &str| {
        nodes
            .iter()
            .find(|n| n["id"].as_str().unwrap().ends_with(suffix))
            .unwrap()
    };
    let job = find("::sym:renewSubscriptions");
    assert_eq!(job["entry"], true);
    assert_eq!(job["entryType"], "job");
    let plain = find("::sym:computeTotal");
    assert!(plain.get("entry").is_none());
    assert!(plain.get("entryType").is_none());
}

#[test]
fn the_ts_adapter_version_is_bumped_to_invalidate_the_blob_cache() {
    assert!(TsAdapter::new().version() > 2);
}
