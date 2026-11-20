//! Ticket U20, seam 2: `Session::edge_usages` on acme-shop.
//!
//! Contract expected from green:
//! `Session::edge_usages(&self, request: &EdgeUsagesRequest) -> Result<EdgeUsagesResponse, AppError>`
//! with `EdgeUsagesRequest { range: Option<RangeSpec>, side: Side, from: NodeId, to: NodeId }`
//! (`from` / `to`: a file, or a module / package for an aggregated edge) and
//! `EdgeUsagesResponse { supported: bool, total: usize, files: Vec<FileUsages> }`,
//! `FileUsages { file: NodeId, usages: Vec<Usage> }` (`Usage` from `relief_adapter_api`).
//! Files are sorted by path, usages by line then column. `total` counts every usage; at most
//! `EDGE_USAGES_CAP` (200) are returned, in all the files together. The side picks the blob
//! (`Base` for an edge the PR removes).

mod common;

use common::*;
use relief_app::{
    EDGE_USAGES_CAP, EdgeUsagesRequest, EdgeUsagesResponse, RangeSpec, Session, Side,
};
use relief_model::NodeId;

const ROUTES_INVOICES: &str = "pkg:@acme/api/routes::file:apps/api/routes/invoices.ts";
const ROUTES_CHECKOUT: &str = "pkg:@acme/api/routes::file:apps/api/routes/checkout.ts";
const BILLING_INVOICE: &str = "pkg:@acme/api/billing::file:apps/api/billing/invoice.ts";
const WEB_INVOICES_PAGE: &str = "pkg:@acme/web/pages::file:apps/web/pages/Invoices.tsx";
const WEB_UTILS_FORMAT: &str = "pkg:@acme/web/utils::file:apps/web/utils/format.ts";
const SHARED_FORMAT: &str = "pkg:@acme/shared/money::file:packages/shared/money/format.ts";

fn request(range: &str, side: Side, from: &str, to: &str) -> EdgeUsagesRequest {
    EdgeUsagesRequest {
        range: Some(RangeSpec::parse(range).unwrap()),
        side,
        from: from.parse::<NodeId>().unwrap(),
        to: to.parse::<NodeId>().unwrap(),
    }
}

/// (file, binding, line, column, enclosing)
fn rows(r: &EdgeUsagesResponse) -> Vec<(String, String, u32, u32, Option<String>)> {
    r.files
        .iter()
        .flat_map(|f| {
            f.usages.iter().map(|u| {
                (
                    f.file.to_string(),
                    u.binding.clone(),
                    u.line,
                    u.column,
                    u.enclosing.clone(),
                )
            })
        })
        .collect()
}

fn row(
    file: &str,
    binding: &str,
    line: u32,
    column: u32,
    enc: &str,
) -> (String, String, u32, u32, Option<String>) {
    (
        file.to_owned(),
        binding.to_owned(),
        line,
        column,
        Some(enc.to_owned()),
    )
}

#[test]
fn a_file_to_file_edge_lists_where_the_source_uses_what_it_imports() {
    let (_acme, session) = acme();
    let got = session
        .edge_usages(&request(
            RANGE,
            Side::Head,
            ROUTES_INVOICES,
            BILLING_INVOICE,
        ))
        .unwrap();
    assert!(got.supported);
    assert_eq!(got.total, 2);
    assert_eq!(
        rows(&got),
        vec![
            row(ROUTES_INVOICES, "renderInvoice", 11, 9, "getInvoice"),
            row(ROUTES_INVOICES, "computeTotal", 11, 28, "getInvoice"),
        ]
    );
    assert_eq!(
        got.files[0].usages[0].snippet,
        "  return renderInvoice(inv, computeTotal(inv.lines, inv.discount));"
    );
}

#[test]
fn an_aggregated_module_edge_groups_the_usages_by_source_file() {
    let (_acme, session) = acme();
    let got = session
        .edge_usages(&request(
            RANGE,
            Side::Head,
            "pkg:@acme/api/routes",
            "pkg:@acme/api/billing",
        ))
        .unwrap();
    assert_eq!(got.total, 4);
    assert_eq!(
        got.files
            .iter()
            .map(|f| f.file.to_string())
            .collect::<Vec<_>>(),
        [ROUTES_CHECKOUT, ROUTES_INVOICES]
    );
    assert_eq!(
        rows(&got),
        vec![
            row(ROUTES_CHECKOUT, "computeTotal", 10, 16, "postCheckout"),
            row(ROUTES_CHECKOUT, "chargeCustomer", 12, 9, "postCheckout"),
            row(ROUTES_INVOICES, "renderInvoice", 11, 9, "getInvoice"),
            row(ROUTES_INVOICES, "computeTotal", 11, 28, "getInvoice"),
        ]
    );
}

#[test]
fn an_edge_the_pr_removes_is_read_on_the_base_side() {
    let (_acme, session) = acme();
    let got = session
        .edge_usages(&request(
            RANGE,
            Side::Base,
            WEB_INVOICES_PAGE,
            WEB_UTILS_FORMAT,
        ))
        .unwrap();
    assert_eq!(
        rows(&got),
        vec![row(
            WEB_INVOICES_PAGE,
            "formatPrice",
            11,
            10,
            "InvoicesPage"
        )]
    );
    assert_eq!(
        got.files[0].usages[0].snippet,
        "      <p>{formatPrice(data.total)}</p>"
    );
}

#[test]
fn the_head_side_reads_the_head_file_with_the_new_import() {
    let (_acme, session) = acme();
    let got = session
        .edge_usages(&request(
            RANGE,
            Side::Head,
            WEB_INVOICES_PAGE,
            SHARED_FORMAT,
        ))
        .unwrap();
    assert_eq!(
        rows(&got),
        vec![row(
            WEB_INVOICES_PAGE,
            "formatPrice",
            11,
            10,
            "InvoicesPage"
        )]
    );
}

#[test]
fn usages_are_capped_at_200_and_the_total_is_kept() {
    assert_eq!(EDGE_USAGES_CAP, 200);
    let acme = build(|path| {
        let file = path.join("apps/web/pages/Invoices.tsx");
        let mut text = std::fs::read_to_string(&file).unwrap();
        text.push_str("export function many() {\n");
        for _ in 0..250 {
            text.push_str("  formatPrice(1);\n");
        }
        text.push_str("}\n");
        std::fs::write(file, text).unwrap();
    });
    let session = Session::open(&acme.path, options(None)).unwrap();
    let got = session
        .edge_usages(&request(
            "feat/promo-codes",
            Side::Head,
            WEB_INVOICES_PAGE,
            SHARED_FORMAT,
        ))
        .unwrap();
    assert_eq!(got.total, 251);
    assert_eq!(rows(&got).len(), 200);
}

// Ticket U21, seam 2: default and namespace imports on an edge to a file.

const AUDIT: &str = "pkg:@acme/api/routes::file:apps/api/routes/audit.ts";
const LEDGER: &str = "pkg:@acme/api/billing::file:apps/api/billing/ledger.ts";
const RATES: &str = "pkg:@acme/api/billing::file:apps/api/billing/rates.ts";

/// `audit.ts` imports `ledger` by default, `rates` as a namespace and `other` by default.
fn with_default_imports() -> Acme {
    build(|path| {
        let billing = path.join("apps/api/billing");
        std::fs::write(
            billing.join("ledger.ts"),
            "export default function ledger(n: number) {\n  return n;\n}\n",
        )
        .unwrap();
        std::fs::write(
            billing.join("rates.ts"),
            "export function rate(n: number) {\n  return n;\n}\n",
        )
        .unwrap();
        std::fs::write(
            billing.join("other.ts"),
            "export default function other() {\n  return 0;\n}\n",
        )
        .unwrap();
        std::fs::write(
            path.join("apps/api/routes/audit.ts"),
            "import Ledger from \"../billing/ledger\";\nimport * as rates from \"../billing/rates\";\nimport Other from \"../billing/other\";\n\nexport function audit() {\n  Other();\n  return Ledger(1) + rates.rate(2);\n}\n",
        )
        .unwrap();
    })
}

fn default_import_request(to: &str) -> EdgeUsagesRequest {
    request("feat/promo-codes", Side::Head, AUDIT, to)
}

#[test]
fn an_edge_for_a_default_import_lists_the_uses_under_the_local_name() {
    let acme = with_default_imports();
    let session = Session::open(&acme.path, options(None)).unwrap();
    let got = session
        .edge_usages(&default_import_request(LEDGER))
        .unwrap();
    assert!(got.supported);
    assert_eq!(got.total, 1);
    assert_eq!(rows(&got), vec![row(AUDIT, "Ledger", 7, 9, "audit")]);
    assert_eq!(
        got.files[0].usages[0].snippet,
        "  return Ledger(1) + rates.rate(2);"
    );
}

#[test]
fn an_edge_for_a_namespace_import_lists_the_uses_of_the_namespace() {
    let acme = with_default_imports();
    let session = Session::open(&acme.path, options(None)).unwrap();
    let got = session.edge_usages(&default_import_request(RATES)).unwrap();
    assert_eq!(got.total, 1);
    assert_eq!(rows(&got), vec![row(AUDIT, "rates", 7, 21, "audit")]);
}

#[test]
fn a_module_edge_gathers_default_and_namespace_imports_of_its_files() {
    let acme = with_default_imports();
    let session = Session::open(&acme.path, options(None)).unwrap();
    let got = session
        .edge_usages(&request(
            "feat/promo-codes",
            Side::Head,
            "pkg:@acme/api/routes",
            "pkg:@acme/api/billing",
        ))
        .unwrap();
    let bindings: Vec<_> = rows(&got).into_iter().map(|r| r.1).collect();
    assert!(bindings.contains(&"Ledger".to_owned()));
    assert!(bindings.contains(&"rates".to_owned()));
    assert!(bindings.contains(&"Other".to_owned()));
}

#[test]
fn default_and_namespace_imports_through_a_workspace_package_name_are_usages() {
    let acme = build(|path| {
        let money = path.join("packages/shared/money");
        std::fs::write(
            money.join("ledger.ts"),
            "export default function ledger(n: number) {\n  return n;\n}\n",
        )
        .unwrap();
        std::fs::write(
            money.join("rates.ts"),
            "export function rate(n: number) {\n  return n;\n}\n",
        )
        .unwrap();
        std::fs::write(
            path.join("apps/api/routes/audit.ts"),
            "import Ledger from \"@acme/shared/money/ledger\";\nimport * as rates from \"@acme/shared/money/rates\";\n\nexport function audit() {\n  return Ledger(1) + rates.rate(2);\n}\n",
        )
        .unwrap();
    });
    let session = Session::open(&acme.path, options(None)).unwrap();
    let got = session
        .edge_usages(&default_import_request(
            "pkg:@acme/shared/money::file:packages/shared/money/ledger.ts",
        ))
        .unwrap();
    assert_eq!(rows(&got), vec![row(AUDIT, "Ledger", 5, 9, "audit")]);
    let got = session
        .edge_usages(&default_import_request(
            "pkg:@acme/shared/money::file:packages/shared/money/rates.ts",
        ))
        .unwrap();
    assert_eq!(rows(&got), vec![row(AUDIT, "rates", 5, 21, "audit")]);
}
