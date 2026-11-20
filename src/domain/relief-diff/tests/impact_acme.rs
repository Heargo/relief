//! Seam 2: impact of `SessionStore.refresh` on the real acme-shop graph, head
//! of `main...feat/promo-codes`: 6 callers without HTTP, 8 with the `http`
//! edges (T04). The mockup says 10 (`getInvoice` and `listInvoices` call
//! `requireAuth`); the fixture passes it as `{ preHandler: requireAuth }`,
//! which is not modelled, so `useInvoice` and `InvoicesPage` are not reached.

use std::path::Path;

use relief_diff::{
    Direction, ImpactOptions, Reached, SymbolTexts, diff_graphs, impact, out_of_diff,
};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use relief_model::{GraphDiff, GraphSnapshot, NodeId};
use tempfile::TempDir;

const REFRESH: &str = "pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh";
const CHARGE: &str = "pkg:@acme/api/billing::file:apps/api/billing/payment.ts::sym:chargeCustomer";
const RENEW: &str = "pkg:@acme/api/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscriptions";
const REQUIRE_AUTH: &str =
    "pkg:@acme/api/routes::file:apps/api/routes/middleware.ts::sym:requireAuth";
const POST_CHECKOUT: &str =
    "pkg:@acme/api/routes::file:apps/api/routes/checkout.ts::sym:postCheckout";
const REGISTER_CHECKOUT: &str =
    "pkg:@acme/api/routes::file:apps/api/routes/checkout.ts::sym:registerCheckoutRoutes";
const REGISTER_INVOICES: &str =
    "pkg:@acme/api/routes::file:apps/api/routes/invoices.ts::sym:registerInvoiceRoutes";

fn index(source: &GitSource, rev: &str) -> GraphSnapshot {
    let commit = source.resolve(rev).unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(source, &commit)
        .unwrap()
        .graph
}

fn analyse() -> (GraphSnapshot, GraphDiff, TempDir) {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let base = index(&source, "main");
    let head = index(&source, "feat/promo-codes");
    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());
    (head, diff, dir)
}

fn callers(head: &GraphSnapshot) -> Vec<Reached> {
    let seed: NodeId = REFRESH.parse().unwrap();
    let options = ImpactOptions {
        max_depth: 8,
        follow_http: false,
    };
    impact(head, &[seed], Direction::Callers, &options)
}

fn callers_via_http(head: &GraphSnapshot) -> Vec<Reached> {
    let seed: NodeId = REFRESH.parse().unwrap();
    let options = ImpactOptions {
        max_depth: 8,
        follow_http: true,
    };
    impact(head, &[seed], Direction::Callers, &options)
}

fn rows(reached: &[Reached]) -> Vec<(String, usize)> {
    let mut rows: Vec<_> = reached
        .iter()
        .map(|r| (r.node.to_string(), r.depth))
        .collect();
    rows.sort();
    rows
}

fn by_id<'a>(reached: &'a [Reached], id: &str) -> &'a Reached {
    reached
        .iter()
        .find(|r| r.node.to_string() == id)
        .unwrap_or_else(|| panic!("{id} not reached"))
}

#[test]
fn refresh_has_six_callers_without_http_at_literal_depths() {
    let (head, _diff, _dir) = analyse();

    let reached = callers(&head);

    let mut expected: Vec<(String, usize)> = [
        (CHARGE, 1),
        (RENEW, 1),
        (REQUIRE_AUTH, 1),
        (POST_CHECKOUT, 2),
        (REGISTER_CHECKOUT, 2),
        (REGISTER_INVOICES, 2),
    ]
    .iter()
    .map(|(id, d)| ((*id).to_owned(), *d))
    .collect();
    expected.sort();
    assert_eq!(rows(&reached), expected);
}

#[test]
fn spec_files_are_not_among_the_callers() {
    let (head, _diff, _dir) = analyse();

    let reached = callers(&head);

    assert!(
        reached
            .iter()
            .all(|r| !r.node.to_string().contains(".spec.")),
        "{reached:?}"
    );
}

#[test]
fn require_auth_and_renew_subscriptions_are_the_direct_callers_out_of_diff() {
    let (head, diff, _dir) = analyse();
    let reached = callers(&head);

    let outside = out_of_diff(&diff, &reached);

    let mut direct: Vec<String> = outside
        .iter()
        .filter(|r| r.depth == 1)
        .map(|r| r.node.to_string())
        .collect();
    direct.sort();
    assert_eq!(direct, [RENEW, REQUIRE_AUTH]);
    // chargeCustomer changed in the range (the auth commit), so it is in the diff.
    assert!(outside.iter().all(|r| r.node.to_string() != CHARGE));
}

#[test]
fn renew_subscriptions_is_untested_while_require_auth_is_tested() {
    let (head, _diff, _dir) = analyse();

    let reached = callers(&head);

    assert!(!by_id(&reached, RENEW).tested);
    assert!(by_id(&reached, REQUIRE_AUTH).tested);
    assert!(by_id(&reached, CHARGE).tested);
    assert!(!by_id(&reached, POST_CHECKOUT).tested);
}

#[test]
fn refresh_has_eight_callers_when_following_http() {
    let (head, _diff, _dir) = analyse();

    let reached = callers_via_http(&head);

    let mut ids: Vec<String> = reached.iter().map(|r| r.node.to_string()).collect();
    ids.sort();
    let mut expected: Vec<String> = [
        CHARGE,
        RENEW,
        REQUIRE_AUTH,
        POST_CHECKOUT,
        REGISTER_CHECKOUT,
        REGISTER_INVOICES,
        "pkg:@acme/web/pages::file:apps/web/pages/Checkout.tsx::sym:useCheckoutTotals",
        "pkg:@acme/web/pages::file:apps/web/pages/Checkout.tsx::sym:CheckoutPage",
    ]
    .iter()
    .map(|id| (*id).to_owned())
    .collect();
    expected.sort();
    assert_eq!(ids, expected);
}
