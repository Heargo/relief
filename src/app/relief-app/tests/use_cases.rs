//! Seam 1 of ticket 03: the use cases of `relief-app` on the acme-shop fixture
//! (`main...feat/promo-codes`), by the public API only.
//!
//! API expected: `Session::open(&Path, SessionOptions) -> Result<Session, AppError>`,
//! `SessionOptions { data_dir, range: Option<RangeSpec>, detectors, adapters }`,
//! `RangeSpec::parse/worktree/staged`, `Side { Base, Head }`, `NodeId`, and on
//! `Session`: `meta() -> MetaResponse`, `snapshot(&SnapshotRequest { rev }) ->
//! Result<SnapshotResponse, _>`, `diff(&DiffRequest { range }) -> Result<DiffResponse, _>`,
//! `review_summary(&ReviewSummaryRequest { range }) -> Result<ReviewSummary, _>`,
//! `code(&CodeRequest { node, side, range }) -> Result<String, _>`.
//! Expected values come from the `relief-server` API tests.

mod common;

use common::*;
use relief_app::{
    CodeRequest, DiffRequest, RangeSpec, ReviewSummaryRequest, Side, SnapshotRequest,
};
use relief_model::NodeId;

fn node(id: &str) -> NodeId {
    id.parse().unwrap()
}

fn range() -> Option<RangeSpec> {
    Some(RangeSpec::parse(RANGE).unwrap())
}

#[test]
fn meta_lists_repo_opening_range_branches_and_tags() {
    let (acme, session) = acme();
    let tag = std::process::Command::new("git")
        .arg("-C")
        .arg(&acme.path)
        .args(["tag", "v1.0", "main"])
        .status()
        .unwrap();
    assert!(tag.success());
    let meta = session.meta();
    assert_eq!(meta.repo, "acme");
    assert_eq!(meta.range.as_deref(), Some("main...feat/promo-codes"));
    assert_eq!(meta.branches, ["feat/promo-codes", "main"]);
    assert_eq!(meta.tags, ["v1.0"]);
}

#[test]
fn meta_without_an_opening_range_has_none() {
    let acme = build(|_| {});
    let session = relief_app::Session::open(&acme.path, options(None)).unwrap();
    assert_eq!(session.meta().range, None);
}

#[test]
fn snapshot_of_a_ref_is_the_graph_of_its_commit() {
    let (acme, session) = acme();
    let snap = session
        .snapshot(&SnapshotRequest {
            rev: "main".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(
        snap.graph.commit().to_string(),
        acme.repo.sha("base").unwrap()
    );
    assert_eq!(snap.meta.commit.to_string(), acme.repo.sha("base").unwrap());
    let ids: Vec<String> = snap
        .graph
        .nodes()
        .iter()
        .map(|n| n.id.to_string())
        .collect();
    assert!(ids.iter().any(|i| i == COMPUTE_TOTAL));
    assert!(
        !ids.iter().any(|i| i == DISCOUNT_FILE),
        "added on the branch"
    );
}

#[test]
fn diff_of_the_acme_range() {
    let (acme, session) = acme();
    let response = session
        .diff(&DiffRequest {
            range: range(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(
        response.diff.base.to_string(),
        acme.repo.sha("base").unwrap()
    );
    assert_eq!(
        response.diff.head.to_string(),
        acme.repo.sha("checkout").unwrap()
    );
    assert_eq!(response.diff.files.len(), 15);
    assert_eq!(response.format_only.files, 1);
    assert_eq!(response.format_only.lines_added, 29);
    assert_eq!(response.format_only.lines_removed, 29);
}

#[test]
fn diff_without_a_range_uses_the_opening_range() {
    let (_acme, session) = acme();
    let explicit = session
        .diff(&DiffRequest {
            range: range(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let default = session
        .diff(&DiffRequest {
            range: None,
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(default, explicit);
}

#[test]
fn a_range_can_be_a_two_dot_range_or_a_single_rev() {
    let (acme, session) = acme();
    let two_dots = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::parse("main..feat/promo-codes").unwrap()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(
        two_dots.diff.base.to_string(),
        acme.repo.sha("base").unwrap()
    );
    assert_eq!(
        two_dots.diff.head.to_string(),
        acme.repo.sha("checkout").unwrap()
    );
    // A single rev is compared with the working tree.
    let single = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::parse("main").unwrap()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(single.diff.base.to_string(), acme.repo.sha("base").unwrap());
}

#[test]
fn the_working_tree_range_sees_uncommitted_changes_and_staged_does_not() {
    let acme = build(|path| {
        let file = path.join("apps/api/billing/invoice.ts");
        let mut text = std::fs::read_to_string(&file).unwrap();
        text.push_str("// touched\n");
        std::fs::write(file, text).unwrap();
    });
    let session = relief_app::Session::open(&acme.path, options(None)).unwrap();
    let worktree = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::worktree()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let paths: Vec<&str> = worktree
        .diff
        .files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    assert_eq!(paths, ["apps/api/billing/invoice.ts"]);
    let staged = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::staged()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert!(staged.diff.files.is_empty());
    // With no range at all, the default is the working tree.
    let default = session
        .diff(&DiffRequest {
            range: None,
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(default, worktree);
}

#[test]
fn review_summary_counts_the_callers_of_the_breaking_refresh() {
    let (_acme, session) = acme();
    let summary = session
        .review_summary(&ReviewSummaryRequest { range: range() })
        .unwrap();
    let refresh = summary
        .signatures
        .iter()
        .find(|s| s.node.to_string() == REFRESH)
        .expect("refresh is in the summary");
    assert!(refresh.breaking);
    assert_eq!(refresh.direct_callers, 3);
    assert_eq!(refresh.transitive_callers, 6);
    assert_eq!(summary.couplings_added.len(), 4);
    assert_eq!(summary.couplings_removed.len(), 1);
    assert_eq!(summary.format_only_files.len(), 1);
    assert_eq!(
        summary.format_only_files[0].path,
        "packages/shared/http/client.ts"
    );
}

#[test]
fn review_summary_without_a_range_uses_the_opening_range() {
    let (_acme, session) = acme();
    let explicit = session
        .review_summary(&ReviewSummaryRequest { range: range() })
        .unwrap();
    let default = session
        .review_summary(&ReviewSummaryRequest { range: None })
        .unwrap();
    assert_eq!(default, explicit);
}

#[test]
fn code_of_a_file_is_its_text_at_the_requested_side() {
    let (_acme, session) = acme();
    let code = |side| {
        session
            .code(&CodeRequest {
                node: node(INVOICE_FILE),
                side,
                range: None,
            })
            .unwrap()
    };
    let head = code(Side::Head);
    assert!(head.contains("discount?: DiscountCode"));
    assert!(head.contains("export function renderInvoice("));
    let base = code(Side::Base);
    assert!(!base.contains("DiscountCode"));
    assert!(base.contains("export function renderInvoice("));
}

#[test]
fn code_of_a_symbol_is_only_its_declaration() {
    let (_acme, session) = acme();
    let code = |side| {
        session
            .code(&CodeRequest {
                node: node(COMPUTE_TOTAL),
                side,
                range: None,
            })
            .unwrap()
    };
    let head = code(Side::Head);
    assert!(
        head.contains(
            "function computeTotal(lines: InvoiceLine[], discount?: DiscountCode): Money {"
        )
    );
    assert!(head.contains("applyDiscount(total, discount)"));
    assert!(!head.contains("renderInvoice"));
    let base = code(Side::Base);
    assert!(base.contains("function computeTotal(lines: InvoiceLine[]): Money {"));
    assert!(!base.contains("applyDiscount"));
}

#[test]
fn base_code_of_a_moved_symbol_is_read_with_its_base_id() {
    let (_acme, session) = acme();
    let base = session
        .code(&CodeRequest {
            node: node(FORMAT_PRICE),
            side: Side::Base,
            range: None,
        })
        .unwrap();
    assert!(base.contains("export function formatPrice(m: Money, locale = \"fr-FR\")"));
}

#[test]
fn code_follows_the_requested_range() {
    let (acme, session) = acme();
    let session_file = node("pkg:@acme/api/auth::file:apps/api/auth/session.ts");
    let discount = acme.repo.sha("discount").unwrap();
    let full = session
        .code(&CodeRequest {
            node: session_file.clone(),
            side: Side::Head,
            range: None,
        })
        .unwrap();
    assert!(full.contains("Promise<Session | null>"));
    let partial = session
        .code(&CodeRequest {
            node: session_file,
            side: Side::Head,
            range: Some(RangeSpec::parse(&format!("main...{discount}")).unwrap()),
        })
        .unwrap();
    assert!(!partial.contains("Promise<Session | null>"));
    assert!(partial.contains("Promise<Session>"));
}
