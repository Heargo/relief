//! Seam 2: `TsAdapter` registered in `relief_index::Indexer`, resolution of
//! `calls`, `renders` and `references` into symbol -> symbol edges.
//!
//! Edges are written as `<file path>::sym:<symbol>` (the node id without its
//! package prefix). The lists come from `E_SPEC` in `docs/product/maquette/index.html`,
//! without `http`, `imports`, `moved` and `depends_on`. The maquette is a
//! summary: the index may hold more edges than listed (`CheckoutPage` renders
//! `Layout`, `renewSubscriptions` calls `buildInvoice`, ...), so the tests
//! check inclusion.
//!
//! Left out of the lists, because the code of the fixture does not match
//! `E_SPEC`: `getInvoice`/`listInvoices`/`postCheckout` -> `requireAuth`
//! (`requireAuth` is passed as a value, not called, and by the register
//! functions), `refresh` -> `findUser` (goes through `this.load`),
//! `formatPrice`/`toCents` -> `Currency` (the code only mentions `Money` or
//! `number`), `renewSubscriptions` -> `computeTotal` (the call is in
//! `buildInvoice`, which `renewSubscriptions` calls).

use std::collections::HashSet;
use std::path::Path;

use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::{IndexedSnapshot, Indexer};
use relief_lang_ts::TsAdapter;
use relief_model::{EdgeKind, Precision};
use tempfile::TempDir;

fn index(fixture: &str, rev: &str, dir: &Path) -> IndexedSnapshot {
    Fixture::load(fixture).unwrap().build(dir).unwrap();
    let source = GitSource::open(dir).unwrap();
    let commit = source.resolve(rev).unwrap();
    Indexer::new(fixture)
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(&source, &commit)
        .unwrap()
}

fn short(id: &str) -> String {
    id.split_once("::file:")
        .map_or(id.to_owned(), |(_, rest)| rest.to_owned())
}

fn edges(indexed: &IndexedSnapshot, kind: EdgeKind) -> HashSet<(String, String)> {
    indexed
        .graph
        .edges()
        .iter()
        .filter(|e| e.kind == kind)
        .map(|e| (short(&e.from.to_string()), short(&e.to.to_string())))
        .collect()
}

fn assert_includes(found: &HashSet<(String, String)>, expected: &[(&str, &str)]) {
    let missing: Vec<_> = expected
        .iter()
        .filter(|(from, to)| !found.contains(&((*from).to_owned(), (*to).to_owned())))
        .collect();
    assert!(
        missing.is_empty(),
        "missing edges: {missing:#?}\nfound: {found:#?}"
    );
}

fn has(found: &HashSet<(String, String)>, from: &str, to: &str) -> bool {
    found.contains(&(from.to_owned(), to.to_owned()))
}

#[test]
fn acme_calls_match_the_maquette() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    indexed.graph.validate().unwrap();
    assert_includes(
        &edges(&indexed, EdgeKind::Calls),
        &[
            // web
            (
                "apps/web/pages/Checkout.tsx::sym:CheckoutPage",
                "apps/web/pages/Checkout.tsx::sym:useCheckoutTotals",
            ),
            (
                "apps/web/pages/Checkout.tsx::sym:useCheckoutTotals",
                "packages/shared/http/client.ts::sym:httpPost",
            ),
            (
                "apps/web/pages/Invoices.tsx::sym:InvoicesPage",
                "apps/web/hooks/useInvoice.ts::sym:useInvoice",
            ),
            (
                "apps/web/pages/Invoices.tsx::sym:InvoicesPage",
                "apps/web/utils/dates.ts::sym:formatDate",
            ),
            (
                "apps/web/pages/Login.tsx::sym:LoginPage",
                "apps/web/hooks/useSession.ts::sym:useSession",
            ),
            (
                "apps/web/components/PromoCodeInput.tsx::sym:PromoCodeInput",
                "apps/web/components/PromoCodeInput.tsx::sym:validateCodeLocally",
            ),
            (
                "apps/web/components/PromoCodeInput.tsx::sym:PromoCodeInput",
                "packages/shared/http/client.ts::sym:httpPost",
            ),
            (
                "apps/web/components/PromoCodeInput.tsx::sym:validateCodeLocally",
                "packages/db/repos/discountRepo.ts::sym:findDiscountByCode",
            ),
            (
                "apps/web/hooks/useInvoice.ts::sym:useInvoice",
                "packages/shared/http/client.ts::sym:httpGet",
            ),
            (
                "apps/web/hooks/useSession.ts::sym:useSession",
                "packages/shared/http/client.ts::sym:httpPost",
            ),
            // api
            (
                "apps/api/routes/invoices.ts::sym:getInvoice",
                "packages/db/repos/invoiceRepo.ts::sym:findInvoice",
            ),
            (
                "apps/api/routes/invoices.ts::sym:getInvoice",
                "apps/api/billing/invoice.ts::sym:computeTotal",
            ),
            (
                "apps/api/routes/invoices.ts::sym:getInvoice",
                "apps/api/billing/invoice.ts::sym:renderInvoice",
            ),
            (
                "apps/api/routes/invoices.ts::sym:listInvoices",
                "packages/db/repos/invoiceRepo.ts::sym:findInvoice",
            ),
            (
                "apps/api/routes/checkout.ts::sym:postCheckout",
                "apps/api/billing/invoice.ts::sym:computeTotal",
            ),
            (
                "apps/api/routes/checkout.ts::sym:postCheckout",
                "apps/api/billing/payment.ts::sym:chargeCustomer",
            ),
            (
                "apps/api/routes/checkout.ts::sym:postCheckout",
                "packages/db/repos/discountRepo.ts::sym:findDiscountByCode",
            ),
            (
                "apps/api/routes/checkout.ts::sym:postPromoValidate",
                "packages/db/repos/discountRepo.ts::sym:findDiscountByCode",
            ),
            (
                "apps/api/routes/middleware.ts::sym:requireAuth",
                "apps/api/auth/session.ts::sym:SessionStore.refresh",
            ),
            (
                "apps/api/auth/session.ts::sym:SessionStore.login",
                "apps/api/auth/tokens.ts::sym:signToken",
            ),
            (
                "apps/api/auth/session.ts::sym:SessionStore.login",
                "packages/db/repos/userRepo.ts::sym:findUser",
            ),
            (
                "apps/api/auth/session.ts::sym:SessionStore.refresh",
                "apps/api/auth/tokens.ts::sym:verifyToken",
            ),
            (
                "apps/api/billing/invoice.ts::sym:computeTotal",
                "packages/shared/money/currency.ts::sym:toCents",
            ),
            (
                "apps/api/billing/invoice.ts::sym:computeTotal",
                "apps/api/billing/discount.ts::sym:applyDiscount",
            ),
            (
                "apps/api/billing/discount.ts::sym:applyDiscount",
                "apps/api/billing/discount.ts::sym:isExpired",
            ),
            (
                "apps/api/billing/discount.ts::sym:applyDiscount",
                "packages/shared/money/currency.ts::sym:toCents",
            ),
            (
                "apps/api/billing/payment.ts::sym:chargeCustomer",
                "apps/api/auth/session.ts::sym:SessionStore.refresh",
            ),
            (
                "apps/api/jobs/renewals.ts::sym:renewSubscriptions",
                "apps/api/auth/session.ts::sym:SessionStore.refresh",
            ),
            (
                "apps/api/jobs/renewals.ts::sym:renewSubscriptions",
                "apps/api/jobs/renewals.ts::sym:buildInvoice",
            ),
            (
                "apps/api/jobs/renewals.ts::sym:buildInvoice",
                "apps/api/billing/invoice.ts::sym:computeTotal",
            ),
            (
                "apps/api/jobs/renewals.ts::sym:renewSubscriptions",
                "apps/api/billing/payment.ts::sym:chargeCustomer",
            ),
            (
                "apps/api/jobs/renewals.ts::sym:renewSubscriptions",
                "packages/db/repos/userRepo.ts::sym:findUser",
            ),
        ],
    );
}

#[test]
fn acme_renders_match_the_maquette() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    assert_includes(
        &edges(&indexed, EdgeKind::Renders),
        &[
            (
                "apps/web/pages/Checkout.tsx::sym:CheckoutPage",
                "apps/web/components/PromoCodeInput.tsx::sym:PromoCodeInput",
            ),
            (
                "apps/web/pages/Checkout.tsx::sym:CheckoutPage",
                "apps/web/components/CartSummary.tsx::sym:CartSummary",
            ),
            (
                "apps/web/pages/Login.tsx::sym:LoginPage",
                "apps/web/components/Button.tsx::sym:Button",
            ),
            (
                "apps/web/components/PromoCodeInput.tsx::sym:PromoCodeInput",
                "apps/web/components/Button.tsx::sym:Button",
            ),
        ],
    );
}

#[test]
fn a_local_component_is_rendered_by_its_local_symbol() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    assert_includes(
        &edges(&indexed, EdgeKind::Renders),
        &[(
            "apps/web/pages/Checkout.tsx::sym:CheckoutPage",
            "apps/web/pages/Checkout.tsx::sym:Layout",
        )],
    );
}

#[test]
fn acme_references_match_the_maquette() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    assert_includes(
        &edges(&indexed, EdgeKind::References),
        &[
            (
                "apps/api/routes/invoices.ts::sym:listInvoices",
                "packages/db/schema/invoices.ts::sym:invoicesTable",
            ),
            (
                "apps/api/billing/invoice.ts::sym:computeTotal",
                "apps/api/billing/invoice.ts::sym:InvoiceLine",
            ),
            (
                "apps/api/billing/invoice.ts::sym:computeTotal",
                "apps/api/billing/discount.ts::sym:DiscountCode",
            ),
            (
                "apps/api/billing/discount.ts::sym:applyDiscount",
                "apps/api/billing/discount.ts::sym:DiscountCode",
            ),
            (
                "apps/api/billing/invoice.ts::sym:renderInvoice",
                "apps/api/billing/invoice.ts::sym:InvoiceLine",
            ),
            (
                "packages/db/repos/invoiceRepo.ts::sym:findInvoice",
                "packages/db/schema/invoices.ts::sym:invoicesTable",
            ),
            (
                "packages/db/repos/invoiceRepo.ts::sym:saveInvoice",
                "packages/db/schema/invoices.ts::sym:invoicesTable",
            ),
            (
                "packages/db/repos/discountRepo.ts::sym:findDiscountByCode",
                "packages/db/schema/discounts.ts::sym:discountsTable",
            ),
            (
                "packages/db/repos/userRepo.ts::sym:findUser",
                "packages/db/schema/users.ts::sym:usersTable",
            ),
        ],
    );
}

#[test]
fn removed_edges_exist_on_main_and_are_gone_on_the_branch() {
    let dir = TempDir::new().unwrap();
    let main = index("acme-shop", "main", dir.path());
    let calls = edges(&main, EdgeKind::Calls);
    assert_includes(
        &calls,
        &[
            (
                "apps/api/routes/checkout.ts::sym:postCheckout",
                "apps/api/billing/legacyCoupon.ts::sym:applyLegacyCoupon",
            ),
            (
                "apps/api/billing/legacyCoupon.ts::sym:applyLegacyCoupon",
                "packages/shared/money/currency.ts::sym:toCents",
            ),
        ],
    );

    let dir = TempDir::new().unwrap();
    let branch = index("acme-shop", "feat/promo-codes", dir.path());
    let calls = edges(&branch, EdgeKind::Calls);
    assert!(
        !calls
            .iter()
            .any(|(_, to)| to.ends_with("::sym:applyLegacyCoupon")),
        "{calls:#?}"
    );
}

#[test]
fn added_edges_do_not_exist_on_main() {
    let dir = TempDir::new().unwrap();
    let main = index("acme-shop", "main", dir.path());
    let calls = edges(&main, EdgeKind::Calls);
    assert_includes(
        &calls,
        &[(
            "apps/api/routes/checkout.ts::sym:postCheckout",
            "apps/api/billing/invoice.ts::sym:computeTotal",
        )],
    );
    assert!(
        !calls
            .iter()
            .any(|(_, to)| to.ends_with("::sym:applyDiscount"))
    );
    assert!(
        !calls
            .iter()
            .any(|(_, to)| to.ends_with("::sym:findDiscountByCode"))
    );
    assert!(
        !edges(&main, EdgeKind::Renders)
            .iter()
            .any(|(_, to)| to.ends_with("::sym:PromoCodeInput"))
    );
}

#[test]
fn calls_renders_and_references_are_syntactic_and_unique() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    let kinds = [EdgeKind::Calls, EdgeKind::Renders, EdgeKind::References];
    let mut seen = HashSet::new();
    let mut count = 0;
    for edge in indexed
        .graph
        .edges()
        .iter()
        .filter(|e| kinds.contains(&e.kind))
    {
        count += 1;
        assert_eq!(edge.precision, Precision::Syntactic, "{edge:?}");
        assert!(
            seen.insert((edge.from.to_string(), edge.to.to_string(), edge.kind)),
            "duplicate edge {edge:?}"
        );
    }
    assert!(count > 40, "only {count} edges");
}

#[test]
fn edges_join_symbols_not_files() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    let kinds = [EdgeKind::Calls, EdgeKind::Renders, EdgeKind::References];
    let mut count = 0;
    for edge in indexed
        .graph
        .edges()
        .iter()
        .filter(|e| kinds.contains(&e.kind))
    {
        count += 1;
        assert!(edge.from.to_string().contains("::sym:"), "{edge:?}");
        assert!(edge.to.to_string().contains("::sym:"), "{edge:?}");
    }
    assert!(count > 0);
}

#[test]
fn a_call_stays_in_its_file_when_other_files_declare_a_homonym() {
    let dir = TempDir::new().unwrap();
    let indexed = index("ts-scope", "HEAD", dir.path());
    indexed.graph.validate().unwrap();
    let calls = edges(&indexed, EdgeKind::Calls);
    assert!(
        has(&calls, "src/a.ts::sym:runA", "src/a.ts::sym:helper"),
        "{calls:#?}"
    );
    assert!(
        has(&calls, "src/b.ts::sym:runB", "src/b.ts::sym:helper"),
        "{calls:#?}"
    );
    assert!(!has(&calls, "src/a.ts::sym:runA", "src/b.ts::sym:helper"));
    assert!(!has(&calls, "src/b.ts::sym:runB", "src/a.ts::sym:helper"));
}

#[test]
fn a_call_to_a_name_neither_local_nor_imported_has_no_edge() {
    let dir = TempDir::new().unwrap();
    let indexed = index("ts-scope", "HEAD", dir.path());
    let calls = edges(&indexed, EdgeKind::Calls);
    assert!(
        has(&calls, "src/c.ts::sym:runC", "src/b.ts::sym:exported"),
        "{calls:#?}"
    );
    let from_c: Vec<_> = calls
        .iter()
        .filter(|(from, _)| from == "src/c.ts::sym:runC")
        .collect();
    assert_eq!(from_c.len(), 1, "{from_c:?}");
}
