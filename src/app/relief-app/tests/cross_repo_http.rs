//! Seam 1 of ticket K12: HTTP calls between repositories of a workspace (spec « Arêtes entre
//! dépôts », T04). `shop-web` calls `fetch("/orders")` in `loadOrders`; `shop-api` declares
//! `GET /orders` (handler `ordersHandler` of `src/server.ts`).
//!
//! Behaviour expected:
//! - the snapshot of the `shop-space` workspace has an `http` edge from `repo:web/…loadOrders`
//!   to `repo:api/…ordersHandler`, by the rule of a single repository (verb and path, so a
//!   `POST` call does not reach `GET /orders`);
//! - the impact of the handler, following HTTP, reaches the caller in the other repository;
//! - the diff carries the edge (added or removed) when the call or the route changes.

mod common;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use common::options;
use relief_app::{DiffRequest, ImpactRequest, Session, SnapshotRequest};
use relief_fixtures::Fixture;
use relief_model::{EdgeKind, EdgeStatus, ImpactDirection, NodeId};
use tempfile::TempDir;

const WEB_LOAD_ORDERS: &str = "repo:web/pkg:shop-web/src::file:src/OrderList.ts::sym:loadOrders";
const WEB_MAIN: &str = "repo:web/pkg:shop-web/src::file:src/main.ts::sym:main";
const API_HANDLER: &str = "repo:api/pkg:shop-api/src::file:src/server.ts::sym:ordersHandler";

fn git(dir: &Path, args: &[&str]) {
    let status = Command::new("git")
        .current_dir(dir)
        .args(["-c", "user.name=t", "-c", "user.email=t@t"])
        .args(args)
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?}");
}

/// Both repositories built side by side; `edit` may rewrite `(web, api)` on the branch `edit`
/// of the one it touches, which the workspace file then reads as `source`.
struct Space {
    _dir: TempDir,
    ws: PathBuf,
}

fn space(web_edit: Option<(&str, &str, &str)>, api_edit: Option<(&str, &str, &str)>) -> Space {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_path_buf();
    for repo in ["shop-api", "shop-web"] {
        Fixture::load(repo)
            .unwrap()
            .build(&root.join(repo))
            .unwrap();
    }
    let edit = |repo: &str, e: Option<(&str, &str, &str)>| -> &'static str {
        let Some((file, from, to)) = e else {
            return "main";
        };
        let dir = root.join(repo);
        git(&dir, &["checkout", "-q", "-b", "edit", "main"]);
        let path = dir.join(file);
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains(from), "{from} not in {file}");
        fs::write(&path, text.replace(from, to)).unwrap();
        git(&dir, &["commit", "-q", "-am", "edit"]);
        "edit"
    };
    let web = edit("shop-web", web_edit);
    let api = edit("shop-api", api_edit);
    let ws = root.join("space");
    fs::create_dir(&ws).unwrap();
    fs::write(
        ws.join("s.relief.json"),
        format!(
            r#"{{ "repos": [
                {{ "name": "web", "path": "../shop-web", "source": "{web}", "destination": "main" }},
                {{ "name": "api", "path": "../shop-api", "source": "{api}", "destination": "main" }}
            ] }}"#
        ),
    )
    .unwrap();
    Space { _dir: dir, ws }
}

fn open(s: &Space) -> Session {
    Session::open_workspace(&s.ws, options(None)).unwrap()
}

/// `from -> to` of the `http` edges of the union snapshot.
fn http_edges(session: &Session) -> Vec<String> {
    let response = session
        .snapshot(&SnapshotRequest {
            rev: "HEAD".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    response
        .graph
        .edges()
        .iter()
        .filter(|e| e.kind == EdgeKind::Http)
        .map(|e| format!("{} -> {}", e.from, e.to))
        .collect()
}

fn diff_http(session: &Session) -> Vec<(String, EdgeStatus)> {
    session
        .analyse(&DiffRequest {
            range: None,
            budget: None,
            expand: vec![],
        })
        .unwrap()
        .diff
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Http)
        .map(|e| (format!("{} -> {}", e.from, e.to), e.status.clone()))
        .collect()
}

fn callers(session: &Session, follow_http: bool) -> Vec<(String, usize)> {
    session
        .impact(&ImpactRequest {
            range: None,
            seeds: vec![API_HANDLER.parse::<NodeId>().unwrap()],
            direction: ImpactDirection::Callers,
            max_depth: 4,
            follow_http,
        })
        .unwrap()
        .reached
        .iter()
        .map(|r| (r.node.to_string(), r.depth))
        .collect()
}

#[test]
fn a_call_of_one_repository_reaches_the_route_of_another() {
    let s = space(None, None);
    assert_eq!(
        http_edges(&open(&s)),
        vec![format!("{WEB_LOAD_ORDERS} -> {API_HANDLER}")]
    );
}

#[test]
fn a_call_with_another_verb_does_not_reach_the_route() {
    let s = space(
        Some((
            "src/OrderList.ts",
            "export function renderOrders",
            "export async function postOrders() {\n  return fetch(\"/orders\", { method: \"POST\" });\n}\n\nexport function renderOrders",
        )),
        None,
    );
    assert_eq!(
        http_edges(&open(&s)),
        vec![format!("{WEB_LOAD_ORDERS} -> {API_HANDLER}")]
    );
}

#[test]
fn the_impact_of_the_handler_reaches_the_caller_in_the_other_repository() {
    let s = space(None, None);
    let reached = callers(&open(&s), true);
    assert!(
        reached.contains(&(WEB_LOAD_ORDERS.to_owned(), 1)),
        "{reached:?}"
    );
    assert!(reached.contains(&(WEB_MAIN.to_owned(), 2)), "{reached:?}");
    // Without following HTTP, the impact stays in the repository of the handler.
    let inside = callers(&open(&s), false);
    assert!(
        inside.iter().all(|(id, _)| !id.starts_with("repo:web/")),
        "{inside:?}"
    );
}

#[test]
fn a_call_that_stops_matching_is_a_removed_edge() {
    let s = space(
        Some((
            "src/OrderList.ts",
            "fetch(\"/orders\")",
            "fetch(\"/archive\")",
        )),
        None,
    );
    assert_eq!(
        diff_http(&open(&s)),
        vec![(
            format!("{WEB_LOAD_ORDERS} -> {API_HANDLER}"),
            EdgeStatus::Removed
        )]
    );
}

#[test]
fn a_route_that_moves_is_a_removed_edge() {
    let s = space(
        None,
        Some(("src/server.ts", "\"/orders\"", "\"/orders/all\"")),
    );
    assert_eq!(
        diff_http(&open(&s)),
        vec![(
            format!("{WEB_LOAD_ORDERS} -> {API_HANDLER}"),
            EdgeStatus::Removed
        )]
    );
}

#[test]
fn a_new_call_of_the_route_is_an_added_edge() {
    let s = space(
        Some((
            "src/OrderList.ts",
            "export function renderOrders",
            "export async function reloadOrders() {\n  return fetch(\"/orders\");\n}\n\nexport function renderOrders",
        )),
        None,
    );
    let edge = format!(
        "repo:web/pkg:shop-web/src::file:src/OrderList.ts::sym:reloadOrders -> {API_HANDLER}"
    );
    assert!(
        diff_http(&open(&s)).contains(&(edge, EdgeStatus::Added)),
        "{:?}",
        diff_http(&open(&s))
    );
}
