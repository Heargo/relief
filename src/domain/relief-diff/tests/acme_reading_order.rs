//! Seams 2 and 3 of ticket 07: the reading order of acme-shop.
//!
//! Seam 2: `main...feat/promo-codes`, by file (14) and by symbol.
//! Seam 3: `reading_by_commit` on the five commits of the branch.
//!
//! API expected, in `relief_diff`: `reading_order` (see `reading_order.rs`) and
//! `reading_by_commit(&[(GraphDiff, GraphSnapshot)]) -> Vec<CommitReading>`:
//! one `(diff, head snapshot)` per commit, oldest first, and
//! `CommitReading { commit: String, files: Vec<ReadingItem>, other_files: usize }`
//! where `commit` is the commit sha (`diff.head`), `files` the files with a
//! structural change in reading order (as `Granularity::File` within that commit)
//! and `other_files` the files of the commit's `diff.files` without one.
//!
//! Deviations from the mockup (the expected values below come from the real
//! fixture data): by symbol there are 22 entries, not 19. The mockup has no
//! `SessionStore` (class whose method changed), no `Props` types, no
//! `registerCheckoutRoutes`, and has `InvoicesPage`, which the real diff does
//! not see as changed (only its import was rewritten). Every symbol of the diff
//! is read, removed ones included (`applyLegacyCoupon`, as in the mockup), minus
//! the old locations of moved symbols.

use std::path::Path;

use relief_diff::{
    FileRename, Granularity, ReadingReason, SymbolTexts, diff_graphs_with_renames,
    reading_by_commit, reading_order,
};
use relief_fixtures::Fixture;
use relief_git::{FileStatus, GitSource};
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use relief_model::{FileChange, GraphDiff, GraphSnapshot};
use tempfile::TempDir;

fn index(source: &GitSource, rev: &str) -> GraphSnapshot {
    let commit = source.resolve(rev).unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(source, &commit)
        .unwrap()
        .graph
}

fn diff_between(source: &GitSource, before: &str, after: &str) -> (GraphDiff, GraphSnapshot) {
    let changes = source
        .diff_trees(
            &source.resolve(before).unwrap(),
            &source.resolve(after).unwrap(),
        )
        .unwrap();
    let files: Vec<FileChange> = changes
        .iter()
        .map(|c| FileChange {
            path: c.path.clone(),
            lines_added: c.lines_added,
            lines_removed: c.lines_removed,
        })
        .collect();
    let renames: Vec<FileRename> = changes
        .iter()
        .filter_map(|c| match &c.status {
            FileStatus::Renamed { from, .. } => Some(FileRename {
                from: from.clone(),
                to: c.path.clone(),
            }),
            _ => None,
        })
        .collect();
    let (base, head) = (index(source, before), index(source, after));
    let diff = diff_graphs_with_renames(&base, &head, &files, &SymbolTexts::default(), &renames);
    (diff, head)
}

fn paths(items: &[relief_diff::ReadingItem]) -> Vec<String> {
    items
        .iter()
        .map(|i| i.id.file_path().unwrap().to_owned())
        .collect()
}

#[test]
fn the_14_changed_files_are_read_dependencies_first() {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let (diff, head) = diff_between(&source, "main", "feat/promo-codes");
    let items = reading_order(&diff, &head, Granularity::File);
    // client.ts (prettier only) and the old apps/web/utils/format.ts are not read.
    assert_eq!(
        paths(&items),
        [
            "apps/api/auth/session.ts",
            "apps/api/billing/discount.ts",
            "apps/api/billing/invoice.ts",
            "apps/api/billing/legacyCoupon.ts",
            "apps/api/billing/payment.ts",
            "apps/api/routes/invoices.ts",
            "packages/db/schema/discounts.ts",
            "packages/db/repos/discountRepo.ts",
            "apps/api/routes/checkout.ts",
            "apps/web/components/PromoCodeInput.tsx",
            "packages/shared/money/format.ts",
            "apps/web/components/CartSummary.tsx",
            "apps/web/pages/Checkout.tsx",
            "apps/web/pages/Invoices.tsx",
        ]
    );
}

#[test]
fn the_file_reasons_of_acme_shop() {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let (diff, head) = diff_between(&source, "main", "feat/promo-codes");
    let items = reading_order(&diff, &head, Granularity::File);
    let reasons = |path: &str| {
        items
            .iter()
            .find(|i| i.id.file_path() == Some(path))
            .unwrap()
            .reasons
            .clone()
    };
    assert_eq!(
        reasons("apps/api/auth/session.ts"),
        [ReadingReason::Lines {
            added: 2,
            removed: 2
        }]
    );
    assert_eq!(
        reasons("apps/api/billing/discount.ts"),
        [ReadingReason::New]
    );
    assert_eq!(
        reasons("apps/api/billing/legacyCoupon.ts"),
        [ReadingReason::Removed]
    );
    assert_eq!(
        reasons("packages/shared/money/format.ts"),
        [ReadingReason::MovedIdentical]
    );
}

#[test]
fn the_symbols_are_read_dependencies_first() {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let (diff, head) = diff_between(&source, "main", "feat/promo-codes");
    let items = reading_order(&diff, &head, Granularity::Symbol);
    let got: Vec<(String, String)> = items
        .iter()
        .map(|i| {
            (
                i.id.file_path().unwrap().to_owned(),
                i.id.symbol_key().unwrap(),
            )
        })
        .collect();
    let expected = [
        ("apps/api/auth/session.ts", "SessionStore"),
        ("apps/api/auth/session.ts", "SessionStore.refresh"),
        ("apps/api/billing/discount.ts", "DiscountCode"),
        ("apps/api/billing/discount.ts", "isExpired"),
        ("apps/api/billing/discount.ts", "applyDiscount"),
        ("apps/api/billing/invoice.ts", "computeTotal"),
        ("apps/api/billing/legacyCoupon.ts", "applyLegacyCoupon"),
        ("apps/api/billing/payment.ts", "chargeCustomer"),
        ("apps/api/routes/checkout.ts", "registerCheckoutRoutes"),
        ("apps/api/routes/invoices.ts", "getInvoice"),
        ("apps/web/components/CartSummary.tsx", "Props"),
        ("apps/web/components/PromoCodeInput.tsx", "Props"),
        ("packages/db/schema/discounts.ts", "discountsTable"),
        ("packages/db/repos/discountRepo.ts", "findDiscountByCode"),
        ("apps/api/routes/checkout.ts", "postCheckout"),
        ("apps/api/routes/checkout.ts", "postPromoValidate"),
        (
            "apps/web/components/PromoCodeInput.tsx",
            "validateCodeLocally",
        ),
        ("apps/web/components/PromoCodeInput.tsx", "PromoCodeInput"),
        ("apps/web/pages/Checkout.tsx", "useCheckoutTotals"),
        ("packages/shared/money/format.ts", "formatPrice"),
        ("apps/web/components/CartSummary.tsx", "CartSummary"),
        ("apps/web/pages/Checkout.tsx", "CheckoutPage"),
    ];
    let expected: Vec<(String, String)> = expected
        .iter()
        .map(|(f, s)| ((*f).to_owned(), (*s).to_owned()))
        .collect();
    assert_eq!(got, expected);
}

#[test]
fn the_symbol_reasons_of_acme_shop() {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let (diff, head) = diff_between(&source, "main", "feat/promo-codes");
    let items = reading_order(&diff, &head, Granularity::Symbol);
    let reasons = |name: &str| {
        items
            .iter()
            .find(|i| i.id.symbol_key().as_deref() == Some(name))
            .unwrap()
            .reasons
            .clone()
    };
    assert_eq!(reasons("applyDiscount"), [ReadingReason::New]);
    assert_eq!(reasons("applyLegacyCoupon"), [ReadingReason::Removed]);
    assert_eq!(reasons("formatPrice"), [ReadingReason::MovedIdentical]);
}

#[test]
fn the_five_commits_come_in_order_with_their_structural_files() {
    let dir = TempDir::new().unwrap();
    let built = Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let ids = ["base", "db", "discount", "auth", "move", "checkout"];
    let steps: Vec<(GraphDiff, GraphSnapshot)> = ids
        .windows(2)
        .map(|w| diff_between(&source, built.sha(w[0]).unwrap(), built.sha(w[1]).unwrap()))
        .collect();
    let commits = reading_by_commit(&steps);

    let got: Vec<(String, Vec<String>, usize)> = commits
        .iter()
        .map(|c| (c.commit.clone(), paths(&c.files), c.other_files))
        .collect();
    let sha = |id: &str| built.sha(id).unwrap().to_owned();
    let strs = |v: &[&str]| v.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    let expected = vec![
        (
            sha("db"),
            strs(&[
                "packages/db/schema/discounts.ts",
                "packages/db/repos/discountRepo.ts",
            ]),
            0,
        ),
        (
            sha("discount"),
            strs(&[
                "apps/api/billing/discount.ts",
                "apps/api/billing/invoice.ts",
                "apps/api/routes/invoices.ts",
            ]),
            0,
        ),
        (
            sha("auth"),
            strs(&["apps/api/auth/session.ts", "apps/api/billing/payment.ts"]),
            0,
        ),
        // client.ts is prettier only: counted apart, not listed.
        (
            sha("move"),
            strs(&[
                "packages/shared/money/format.ts",
                "apps/web/pages/Invoices.tsx",
            ]),
            1,
        ),
        (
            sha("checkout"),
            strs(&[
                "apps/api/billing/legacyCoupon.ts",
                "apps/api/routes/checkout.ts",
                "apps/web/components/CartSummary.tsx",
                "apps/web/components/PromoCodeInput.tsx",
                "apps/web/pages/Checkout.tsx",
            ]),
            0,
        ),
    ];
    assert_eq!(got, expected);
}
