//! Seam 1 of ticket K16: the use cases that still refuse a workspace (`code`, `edge_usages`,
//! `search`, `log`, `commit_reading`, `metrics`, `co_change`) on the two fixture repositories
//! `shop-web` (branch `feat/order-badge`) and `shop-api` (branch `feat/order-total`) and the
//! workspace file of `tests/fixtures/shop-space`.
//!
//! Behaviour expected (spec « Modèle et ids »):
//! - an id prefixed `repo:<name>/` is served by its member repository, on the range of that
//!   repository (its source into its destination: base = `main`, head = the feature branch);
//!   ids in answers are prefixed;
//! - `search`, `metrics` and `co_change` cover the union of the repositories;
//! - `log` and `commit_reading` list the commits of each repository, in file order (web, then
//!   api), each commit of `commit_reading` carrying prefixed file ids.

mod common;

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use common::options;
use relief_app::{
    CoChangeRequest, CodeRequest, CommitReadingRequest, EdgeUsagesRequest, MetricsRequest,
    SearchRequest, Session, Side,
};
use relief_fixtures::Fixture;
use relief_model::NodeId;
use tempfile::TempDir;

const WEB_ORDER_LIST: &str = "repo:web/pkg:shop-web/src::file:src/OrderList.ts";
const WEB_MAIN: &str = "repo:web/pkg:shop-web/src::file:src/main.ts";
const WEB_RENDER_ORDERS: &str =
    "repo:web/pkg:shop-web/src::file:src/OrderList.ts::sym:renderOrders";
const API_ORDERS: &str = "repo:api/pkg:shop-api/src::file:src/orders.ts";
const API_TYPES: &str = "repo:api/pkg:shop-api/src::file:src/types.ts";
const API_CREATE_ORDER: &str = "repo:api/pkg:shop-api/src::file:src/orders.ts::sym:createOrder";

struct Space {
    _dir: TempDir,
}

fn open() -> (Space, Session) {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_path_buf();
    Fixture::load("shop-api")
        .unwrap()
        .build(&root.join("shop-api"))
        .unwrap();
    Fixture::load("shop-web")
        .unwrap()
        .build(&root.join("shop-web"))
        .unwrap();
    let ws = root.join("shop-space");
    fs::create_dir(&ws).unwrap();
    fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/fixtures/shop-space/shop.relief.json"),
        ws.join("shop.relief.json"),
    )
    .unwrap();
    let session = Session::open_workspace(&ws, options(None)).unwrap();
    (Space { _dir: dir }, session)
}

fn id(text: &str) -> NodeId {
    text.parse().unwrap()
}

fn code(session: &Session, node: &str, side: Side) -> String {
    session
        .code(&CodeRequest {
            node: id(node),
            side,
            range: None,
        })
        .unwrap()
}

#[test]
fn the_code_of_a_file_is_read_in_its_repository_at_each_side_of_its_range() {
    let (_s, session) = open();
    let head = code(&session, WEB_ORDER_LIST, Side::Head);
    let base = code(&session, WEB_ORDER_LIST, Side::Base);
    assert!(
        head.contains("`(${orders.length}) ` + orders.map"),
        "{head}"
    );
    assert!(!base.contains("orders.length"), "{base}");
    assert!(base.contains("return orders.map((o) => o.id).join(\", \");"));
    let api_head = code(&session, API_ORDERS, Side::Head);
    let api_base = code(&session, API_ORDERS, Side::Base);
    assert!(api_head.contains("lines.reduce((sum, line) => sum + line, 0)"));
    assert!(api_base.contains("return { id, total: 0 };"));
}

#[test]
fn the_code_of_an_unchanged_file_is_the_same_on_both_sides() {
    let (_s, session) = open();
    let head = code(&session, WEB_MAIN, Side::Head);
    assert!(head.starts_with("import { loadOrders, renderOrders } from \"./OrderList\";"));
    assert_eq!(head, code(&session, WEB_MAIN, Side::Base));
}

#[test]
fn the_code_of_a_symbol_is_its_declaration_at_each_side() {
    let (_s, session) = open();
    assert_eq!(
        code(&session, WEB_RENDER_ORDERS, Side::Head),
        "export function renderOrders(orders: Order[]): string {\n  return `(${orders.length}) ` + orders.map((o) => o.id).join(\", \");\n}"
    );
    assert_eq!(
        code(&session, WEB_RENDER_ORDERS, Side::Base),
        "export function renderOrders(orders: Order[]): string {\n  return orders.map((o) => o.id).join(\", \");\n}"
    );
    assert_eq!(
        code(&session, API_CREATE_ORDER, Side::Base),
        "export function createOrder(id: string): Order {\n  return { id, total: 0 };\n}"
    );
}

#[test]
fn an_unknown_node_of_a_repository_is_still_refused() {
    let (_s, session) = open();
    let err = session
        .code(&CodeRequest {
            node: id("repo:web/pkg:shop-web/src::file:src/Nope.ts"),
            side: Side::Head,
            range: None,
        })
        .unwrap_err();
    assert!(err.to_string().contains("unknown node"), "{err}");
}

fn usages(session: &Session, from: &str, to: &str) -> relief_app::EdgeUsagesResponse {
    session
        .edge_usages(&EdgeUsagesRequest {
            range: None,
            side: Side::Head,
            from: id(from),
            to: id(to),
        })
        .unwrap()
}

#[test]
fn the_usages_of_an_edge_inside_a_repository_are_listed_with_prefixed_files() {
    let (_s, session) = open();
    let got = usages(&session, WEB_MAIN, WEB_ORDER_LIST);
    assert!(got.supported);
    let files: Vec<String> = got.files.iter().map(|f| f.file.to_string()).collect();
    assert_eq!(files, [WEB_MAIN]);
    let bindings: BTreeSet<&str> = got.files[0]
        .usages
        .iter()
        .map(|u| u.binding.as_str())
        .collect();
    assert_eq!(bindings, BTreeSet::from(["loadOrders", "renderOrders"]));
    let render = got.files[0]
        .usages
        .iter()
        .find(|u| u.binding == "renderOrders" && u.line == 4)
        .expect("the call on line 4");
    assert_eq!(render.snippet, "  return renderOrders(await loadOrders());");
    assert_eq!(render.enclosing.as_deref(), Some("main"));
}

#[test]
fn the_usages_of_an_edge_between_repositories_are_listed() {
    let (_s, session) = open();
    let got = usages(&session, WEB_ORDER_LIST, API_TYPES);
    assert!(got.supported);
    assert!(got.total > 0, "{got:?}");
    let files: Vec<String> = got.files.iter().map(|f| f.file.to_string()).collect();
    assert_eq!(files, [WEB_ORDER_LIST]);
    assert!(got.files[0].usages.iter().all(|u| u.binding == "Order"));
}

fn search(session: &Session, query: &str) -> Vec<String> {
    session
        .search(&SearchRequest {
            range: None,
            query: query.into(),
            limit: 8,
        })
        .unwrap()
        .hits
        .into_iter()
        .map(|h| h.id.to_string())
        .collect()
}

#[test]
fn the_search_finds_a_symbol_of_each_repository_with_prefixed_ids() {
    let (_s, session) = open();
    assert_eq!(search(&session, "renderOrders"), [WEB_RENDER_ORDERS]);
    assert_eq!(search(&session, "createOrder"), [API_CREATE_ORDER]);
    let both = search(&session, "listOrders");
    assert_eq!(
        both,
        ["repo:api/pkg:shop-api/src::file:src/orders.ts::sym:listOrders"]
    );
    let loads = search(&session, "loadOrders");
    assert_eq!(
        loads,
        ["repo:web/pkg:shop-web/src::file:src/OrderList.ts::sym:loadOrders"]
    );
}

#[test]
fn the_log_lists_the_commits_of_each_repository() {
    let (_s, session) = open();
    let entries = session.log("HEAD", 50, None).unwrap();
    let subjects: Vec<&str> = entries.iter().map(|e| e.subject.as_str()).collect();
    assert_eq!(entries.len(), 4, "{subjects:?}");
    for wanted in [
        "feat(orders): count badge on the list",
        "chore: orders screen",
        "feat(orders): total on created orders",
        "chore: orders api",
    ] {
        assert!(subjects.contains(&wanted), "{wanted} in {subjects:?}");
    }
    let filtered = session.log("HEAD", 50, Some("total on")).unwrap();
    let subjects: Vec<&str> = filtered.iter().map(|e| e.subject.as_str()).collect();
    assert_eq!(subjects, ["feat(orders): total on created orders"]);
}

#[test]
fn the_commit_reading_lists_the_commits_of_each_repository_with_prefixed_files() {
    let (_s, session) = open();
    let reading = session
        .commit_reading(&CommitReadingRequest { range: None })
        .unwrap();
    let rows: Vec<(String, Vec<String>)> = reading
        .commits
        .iter()
        .map(|c| {
            (
                c.message.clone(),
                c.files.iter().map(|f| f.id.to_string()).collect(),
            )
        })
        .collect();
    assert_eq!(
        rows,
        [
            (
                "feat(orders): count badge on the list".to_owned(),
                vec![WEB_ORDER_LIST.to_owned()]
            ),
            (
                "feat(orders): total on created orders".to_owned(),
                vec![API_ORDERS.to_owned()]
            ),
        ]
    );
}

#[test]
fn the_metrics_cover_the_files_of_every_repository_with_prefixed_ids() {
    let (_s, session) = open();
    let got = session
        .metrics(&MetricsRequest {
            rev: "HEAD".into(),
            since_days: Some(36500),
        })
        .unwrap();
    assert!(
        got.nodes.contains_key(WEB_ORDER_LIST),
        "{:?}",
        got.nodes.keys()
    );
    assert!(got.nodes.contains_key(API_ORDERS), "{:?}", got.nodes.keys());
    assert!(got.nodes.contains_key(API_CREATE_ORDER));
    assert!(
        got.nodes
            .keys()
            .all(|k| k.starts_with("repo:web/") || k.starts_with("repo:api/")),
        "{:?}",
        got.nodes.keys()
    );
}

#[test]
fn the_co_change_pairs_stay_inside_a_repository_and_carry_its_prefix() {
    let (_s, session) = open();
    let got = session
        .co_change(&CoChangeRequest {
            rev: "HEAD".into(),
            since_days: Some(36500),
            min_commits: Some(1),
        })
        .unwrap();
    assert!(!got.pairs.is_empty());
    for pair in &got.pairs {
        let repo = if pair.a.starts_with("repo:web/") {
            "repo:web/"
        } else {
            "repo:api/"
        };
        assert!(pair.a.starts_with(repo), "{pair:?}");
        assert!(pair.b.starts_with(repo), "{pair:?}");
    }
    let repos: BTreeSet<&str> = got.pairs.iter().map(|p| &p.a[..9.min(p.a.len())]).collect();
    assert_eq!(repos.len(), 2, "{:?}", got.pairs);
}
