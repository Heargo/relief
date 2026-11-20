//! Seam 1 of ticket 02: `relief_rules::violations(&Config, &GraphSnapshot, &GraphDiff)
//! -> Vec<Violation>` on `GraphBuilder` snapshots and on the acme-shop data.
//!
//! API expected: `Violation { rule: String, edge: <has from, to, kind>, introduced: bool }`
//! exported by `relief_model` and used by `relief_rules::violations`.

use relief_diff::{SymbolTexts, diff_graphs};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use relief_model::testing::GraphBuilder;
use relief_model::{EdgeKind, GraphSnapshot, NodeId};
use relief_rules::{parse_config, violations};
use tempfile::TempDir;

const WEB: &str = "apps/web/Cart.tsx";
const DB: &str = "packages/db/repo.ts";
const OTHER: &str = "apps/api/handler.ts";

fn sym(pkg: &str, path: &str, name: &str) -> NodeId {
    NodeId::package(pkg).file(path).symbol(name)
}

fn graph(commit: &str, edges: &[(&str, &str, &str, &str, EdgeKind)]) -> GraphSnapshot {
    let mut b = GraphBuilder::new(commit);
    for (pkg, path) in [("@a/web", WEB), ("@a/db", DB), ("@a/api", OTHER)] {
        let p = b.package(pkg);
        let f = b.file(&p, path);
        b.symbol(&f, "s");
    }
    for (from_pkg, from_path, to_pkg, to_path, kind) in edges {
        b.edge(
            &sym(from_pkg, from_path, "s"),
            &sym(to_pkg, to_path, "s"),
            *kind,
        );
    }
    b.build()
}

const CONFIG: &[u8] = b"rules:
  - id: web-sans-db
    from: apps/web/**
    deny: packages/db/**
";

fn run(
    config: &[u8],
    base: &[(&str, &str, &str, &str, EdgeKind)],
    head: &[(&str, &str, &str, &str, EdgeKind)],
) -> Vec<relief_model::Violation> {
    let (b, h) = (graph("base", base), graph("head", head));
    let diff = diff_graphs(&b, &h, &[], &SymbolTexts::default());
    violations(&parse_config(config).unwrap(), &h, &diff)
}

const WEB_TO_DB: (&str, &str, &str, &str, EdgeKind) = ("@a/web", WEB, "@a/db", DB, EdgeKind::Calls);

#[test]
fn an_added_edge_from_from_to_deny_is_an_introduced_violation() {
    let got = run(CONFIG, &[], &[WEB_TO_DB]);
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].rule, "web-sans-db");
    assert_eq!(got[0].edge.from, sym("@a/web", WEB, "s"));
    assert_eq!(got[0].edge.to, sym("@a/db", DB, "s"));
    assert!(got[0].introduced);
}

#[test]
fn an_edge_already_in_the_base_is_an_existing_violation() {
    let got = run(CONFIG, &[WEB_TO_DB], &[WEB_TO_DB]);
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].rule, "web-sans-db");
    assert!(!got[0].introduced);
}

#[test]
fn an_edge_outside_from_or_outside_deny_is_not_a_violation() {
    let got = run(
        CONFIG,
        &[],
        &[
            ("@a/api", OTHER, "@a/db", DB, EdgeKind::Calls),
            ("@a/web", WEB, "@a/api", OTHER, EdgeKind::Calls),
        ],
    );
    assert!(got.is_empty(), "{got:?}");
}

#[test]
fn only_the_kinds_of_the_rule_are_looked_at() {
    let http = ("@a/web", WEB, "@a/db", DB, EdgeKind::Http);
    // `http` is not in the default kinds.
    assert!(run(CONFIG, &[], &[http]).is_empty());
    // An explicit `kinds` replaces the default.
    let only_http = b"rules:
  - id: web-sans-db
    from: apps/web/**
    deny: packages/db/**
    kinds: [http]
";
    assert_eq!(run(only_http, &[], &[http]).len(), 1);
    assert!(run(only_http, &[], &[WEB_TO_DB]).is_empty());
}

#[test]
fn a_removed_edge_is_not_a_violation() {
    assert!(run(CONFIG, &[WEB_TO_DB], &[]).is_empty());
}

#[test]
fn acme_shop_has_one_introduced_and_one_existing_violation() {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(dir.path())
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let index = |rev: &str| {
        let commit = source.resolve(rev).unwrap();
        Indexer::new("acme-shop")
            .with_detectors(relief_detect::default_detectors())
            .with_adapter(Box::new(TsAdapter::new()))
            .snapshot(&source, &commit)
            .unwrap()
            .graph
    };
    let (base, head) = (index("main"), index("feat/promo-codes"));
    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());
    let config = parse_config(
        &std::fs::read(dir.path().join("relief.config.yaml")).unwrap_or_else(|_| {
            include_bytes!("../../../../tests/fixtures/acme-shop/base/relief.config.yaml").to_vec()
        }),
    )
    .unwrap();
    let got = violations(&config, &head, &diff);
    let pairs: Vec<(String, String, String, bool)> = got
        .iter()
        .map(|v| {
            (
                v.rule.clone(),
                v.edge.from.to_string(),
                v.edge.to.to_string(),
                v.introduced,
            )
        })
        .collect();
    let introduced: Vec<_> = pairs.iter().filter(|p| p.3).collect();
    let existing: Vec<_> = pairs.iter().filter(|p| !p.3).collect();
    assert_eq!(introduced.len(), 1, "{pairs:#?}");
    assert_eq!(introduced[0].0, "web-sans-db");
    assert!(introduced[0].1.ends_with("::sym:validateCodeLocally"));
    assert!(introduced[0].2.ends_with("::sym:findDiscountByCode"));
    assert_eq!(existing.len(), 1, "{pairs:#?}");
    assert_eq!(existing[0].0, "routes-via-repos");
    assert!(existing[0].1.ends_with("::sym:listInvoices"));
    assert!(existing[0].2.ends_with("::sym:invoicesTable"));
}
