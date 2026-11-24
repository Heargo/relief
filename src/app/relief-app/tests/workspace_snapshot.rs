//! Seam 1 of ticket K08: `snapshot`, `diff`, `reading_order`, `impact` and `review_summary` of a
//! workspace session, on the two fixture repositories `shop-web` (branch `feat/order-badge`) and
//! `shop-api` (branch `feat/order-total`) and the workspace file of `tests/fixtures/shop-space`.
//!
//! Behaviour expected (spec « Modèle et ids », ADR 0010):
//! - `Session::snapshot` of a workspace session ignores `rev`: it is the union of the snapshots of
//!   the repositories, each at its own source (the workspace file's `source`), under one `repo`
//!   node per repository (`repo:<name>`, no parent), in file order. Every id is prefixed by its
//!   repository; the node of the repository serialises with `"branch"` (the branch checked out
//!   in the repository) and `"labels"` (the labels of the file); no other node has them.
//! - `Session::diff` without range diffs each repository on its own range (`source` into
//!   `destination` of the file) and unites the changes, ids prefixed.
//! - `reading_order`, `impact` and `review_summary` work on that union, with prefixed ids.

mod common;

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use common::options;
use relief_app::{
    DiffRequest, ImpactRequest, ReadingOrderRequest, ReviewSummaryRequest, Session, SnapshotRequest,
};
use relief_diff::Granularity;
use relief_fixtures::Fixture;
use relief_model::{ImpactDirection, NodeId};
use serde_json::{Value, json};
use tempfile::TempDir;

const API_CREATE_ORDER: &str = "repo:api/pkg:shop-api/src::file:src/orders.ts::sym:createOrder";
const WEB_RENDER_ORDERS: &str =
    "repo:web/pkg:shop-web/src::file:src/OrderList.ts::sym:renderOrders";
const WEB_MAIN: &str = "repo:web/pkg:shop-web/src::file:src/main.ts::sym:main";

struct Space {
    _dir: TempDir,
    api: PathBuf,
    ws: PathBuf,
}

fn space() -> Space {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_path_buf();
    let api = root.join("shop-api");
    Fixture::load("shop-api").unwrap().build(&api).unwrap();
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
    Space { _dir: dir, api, ws }
}

fn open(s: &Space) -> Session {
    Session::open_workspace(&s.ws, options(None)).unwrap()
}

fn snapshot_json(session: &Session) -> Vec<Value> {
    let response = session
        .snapshot(&SnapshotRequest {
            rev: "HEAD".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let graph = serde_json::to_value(&response.graph).unwrap();
    graph["nodes"].as_array().unwrap().clone()
}

fn id(text: &str) -> NodeId {
    text.parse().unwrap()
}

#[test]
fn the_snapshot_has_one_repo_node_per_repository_with_its_branch_and_labels() {
    let s = space();
    let nodes = snapshot_json(&open(&s));
    let tops: Vec<&Value> = nodes.iter().filter(|n| n["parent"].is_null()).collect();
    let ids: Vec<&str> = tops.iter().map(|n| n["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["repo:web", "repo:api"]);
    assert!(tops.iter().all(|n| n["kind"] == "repo"), "{tops:?}");
    assert_eq!(tops[0]["branch"], "feat/order-badge");
    assert_eq!(tops[0]["labels"], json!(["front"]));
    assert_eq!(tops[1]["branch"], "feat/order-total");
    assert_eq!(tops[1]["labels"], json!(["back"]));
    let others = nodes.iter().filter(|n| !n["parent"].is_null());
    assert!(others.clone().all(|n| n["branch"].is_null()));
}

#[test]
fn every_other_id_is_prefixed_by_its_repository() {
    let s = space();
    let nodes = snapshot_json(&open(&s));
    let ids: BTreeSet<String> = nodes
        .iter()
        .map(|n| n["id"].as_str().unwrap().to_owned())
        .collect();
    assert!(ids.contains(API_CREATE_ORDER), "{ids:?}");
    assert!(ids.contains(WEB_RENDER_ORDERS), "{ids:?}");
    assert!(ids.contains("repo:api/pkg:shop-api/src::file:src/server.ts"));
    assert!(ids.contains("repo:web/pkg:shop-web/src::file:src/main.ts"));
    assert!(
        ids.iter()
            .all(|i| i.starts_with("repo:api") || i.starts_with("repo:web")),
        "{ids:?}"
    );
    let parsed: Vec<NodeId> = ids.iter().map(|i| id(i)).collect();
    assert!(parsed.iter().all(|n| n.repo().is_some()));
}

#[test]
fn each_repository_is_indexed_at_its_own_source() {
    let s = space();
    let nodes = snapshot_json(&open(&s));
    let hash = |wanted: &str| {
        nodes
            .iter()
            .find(|n| n["id"] == wanted)
            .map(|n| n["contentHash"].as_str().unwrap().to_owned())
            .unwrap_or_else(|| panic!("{wanted} missing"))
    };
    let alone = |rev: &str| {
        let session = Session::open(&s.api, options(None)).unwrap();
        let response = session
            .snapshot(&SnapshotRequest {
                rev: rev.into(),
                budget: None,
                expand: vec![],
            })
            .unwrap();
        response
            .graph
            .nodes()
            .iter()
            .find(|n| n.id.to_string() == API_CREATE_ORDER.replace("repo:api/", ""))
            .map(|n| n.content_hash.clone())
            .unwrap()
    };
    assert_eq!(hash(API_CREATE_ORDER), alone("feat/order-total"));
    assert_ne!(hash(API_CREATE_ORDER), alone("main"));
}

#[test]
fn the_diff_unites_the_changes_of_each_repository_on_its_own_range() {
    let s = space();
    let diff = open(&s).diff(&DiffRequest::default()).unwrap().diff;
    let changes: Vec<Value> = diff
        .nodes
        .iter()
        .map(|c| serde_json::to_value(c).unwrap())
        .collect();
    let by_id = |wanted: &str| changes.iter().find(|c| c["id"] == wanted).cloned();
    assert_eq!(changes.len(), 2, "{changes:?}");
    assert_eq!(by_id(API_CREATE_ORDER).unwrap()["status"], "modified");
    assert_eq!(by_id(WEB_RENDER_ORDERS).unwrap()["status"], "modified");
}

#[test]
fn a_repository_whose_source_is_its_destination_has_no_change() {
    let s = space();
    let file = s.ws.join("shop.relief.json");
    let text = fs::read_to_string(&file)
        .unwrap()
        .replace("feat/order-total", "main");
    fs::write(&file, text).unwrap();
    let diff = open(&s).diff(&DiffRequest::default()).unwrap().diff;
    let ids: Vec<String> = diff.nodes.iter().map(|c| c.id.to_string()).collect();
    assert_eq!(ids, [WEB_RENDER_ORDERS]);
}

#[test]
fn the_reading_order_covers_the_union() {
    let s = space();
    let order = open(&s)
        .reading_order(&ReadingOrderRequest {
            range: None,
            granularity: Granularity::Symbol,
        })
        .unwrap();
    let ids: BTreeSet<String> = order.items.iter().map(|i| i.id.to_string()).collect();
    assert_eq!(
        ids,
        BTreeSet::from([API_CREATE_ORDER.to_owned(), WEB_RENDER_ORDERS.to_owned()])
    );
}

#[test]
fn the_impact_follows_callers_inside_a_repository_with_prefixed_ids() {
    let s = space();
    let impact = open(&s)
        .impact(&ImpactRequest {
            range: None,
            seeds: vec![id(WEB_RENDER_ORDERS)],
            direction: ImpactDirection::Callers,
            max_depth: 3,
            follow_http: false,
        })
        .unwrap();
    let reached: Vec<(String, usize, bool)> = impact
        .reached
        .iter()
        .map(|r| (r.node.to_string(), r.depth, r.out_of_diff))
        .collect();
    assert!(
        reached.contains(&(WEB_MAIN.to_owned(), 1, true)),
        "{reached:?}"
    );
}

#[test]
fn the_review_summary_is_the_one_of_the_union() {
    let s = space();
    let summary = open(&s)
        .review_summary(&ReviewSummaryRequest { range: None })
        .unwrap();
    assert!(summary.added_files.is_empty() && summary.removed_files.is_empty());
    assert!(
        summary
            .signatures
            .iter()
            .all(|sig| sig.node.repo() == Some("api"))
    );
}
