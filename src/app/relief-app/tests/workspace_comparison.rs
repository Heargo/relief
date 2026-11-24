//! Seam 1 of ticket K10 (app side): the comparison of each repository of a workspace, on the
//! fixture repositories `shop-web` (`feat/order-badge`) and `shop-api` (`feat/order-total`) and
//! the workspace file of `tests/fixtures/shop-space`.
//!
//! API expected:
//! - `Workspace::set_comparison(&mut self, repo, source, destination)` writes the comparison of
//!   one repository in the workspace file (the other fields and repositories untouched) and
//!   fails on an unknown repository, leaving the file alone.
//! - `Session::repo_comparisons() -> Vec<RepoComparison>` (`RepoComparison { name, source,
//!   destination, branches }`, in file order; `branches` = the local branches of that repository).
//! - `Session::set_repo_comparison(&self, repo, source, destination, save)` changes the
//!   comparison of one repository for the session; with `save` it also writes the workspace
//!   file. The diff of the union follows; the other repositories are not indexed again.

mod common;

use std::fs;
use std::path::{Path, PathBuf};

use common::options;
use relief_app::{DiffRequest, Session, Workspace};
use relief_fixtures::Fixture;
use serde_json::{Value, json};
use tempfile::TempDir;

const API_CREATE_ORDER: &str = "repo:api/pkg:shop-api/src::file:src/orders.ts::sym:createOrder";
const WEB_RENDER_ORDERS: &str =
    "repo:web/pkg:shop-web/src::file:src/OrderList.ts::sym:renderOrders";

struct Space {
    _dir: TempDir,
    ws: PathBuf,
}

fn space() -> Space {
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
    Space { _dir: dir, ws }
}

fn open(s: &Space) -> Session {
    Session::open_workspace(&s.ws, options(None)).unwrap()
}

fn file(s: &Space) -> Value {
    serde_json::from_str(&fs::read_to_string(s.ws.join("shop.relief.json")).unwrap()).unwrap()
}

fn changed(session: &Session) -> Vec<String> {
    let mut ids: Vec<String> = session
        .diff(&DiffRequest::default())
        .unwrap()
        .diff
        .nodes
        .iter()
        .map(|c| c.id.to_string())
        .collect();
    ids.sort();
    ids
}

#[test]
fn the_comparisons_list_each_repository_with_its_sides_and_branches() {
    let s = space();
    let comparisons = open(&s).repo_comparisons();
    let names: Vec<&str> = comparisons.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["web", "api"]);
    assert_eq!(comparisons[0].source, "feat/order-badge");
    assert_eq!(comparisons[0].destination, "main");
    assert_eq!(comparisons[1].source, "feat/order-total");
    assert_eq!(comparisons[1].destination, "main");
    assert!(comparisons[1].branches.contains(&"main".to_owned()));
    assert!(
        comparisons[1]
            .branches
            .contains(&"feat/order-total".to_owned())
    );
    assert!(
        !comparisons[1]
            .branches
            .contains(&"feat/order-badge".to_owned())
    );
}

#[test]
fn changing_a_comparison_in_session_moves_the_diff_and_leaves_the_file_alone() {
    let s = space();
    let before = fs::read_to_string(s.ws.join("shop.relief.json")).unwrap();
    let session = open(&s);
    assert_eq!(
        changed(&session),
        [API_CREATE_ORDER.to_owned(), WEB_RENDER_ORDERS.to_owned()]
    );
    session
        .set_repo_comparison("api", "main", "main", false)
        .unwrap();
    assert_eq!(changed(&session), [WEB_RENDER_ORDERS.to_owned()]);
    let comparisons = session.repo_comparisons();
    assert_eq!(comparisons[1].source, "main");
    assert_eq!(comparisons[0].source, "feat/order-badge");
    assert_eq!(
        fs::read_to_string(s.ws.join("shop.relief.json")).unwrap(),
        before
    );
}

#[test]
fn saving_a_comparison_writes_it_in_the_workspace_file_for_the_next_session() {
    let s = space();
    let session = open(&s);
    session
        .set_repo_comparison("api", "main", "main", true)
        .unwrap();
    let written = file(&s);
    assert_eq!(written["repos"][1]["source"], "main");
    assert_eq!(written["repos"][1]["destination"], "main");
    assert_eq!(written["repos"][0]["source"], "feat/order-badge");
    assert_eq!(written["repos"][1]["labels"], json!(["back"]));
    assert_eq!(changed(&open(&s)), [WEB_RENDER_ORDERS.to_owned()]);
}

#[test]
fn only_the_changed_repository_is_read_again() {
    let s = space();
    let session = open(&s);
    let first = changed(&session);
    let indexed = session.indexed_count();
    assert!(indexed > 0);
    // `main` of the api repository was already indexed as the destination: nothing to index,
    // and the web repository is not read again.
    session
        .set_repo_comparison("api", "main", "main", false)
        .unwrap();
    assert_eq!(changed(&session), [WEB_RENDER_ORDERS.to_owned()]);
    assert_eq!(session.indexed_count(), indexed);
    // Back to the first comparison: both sides are known, the union is the same as before.
    session
        .set_repo_comparison("api", "feat/order-total", "main", false)
        .unwrap();
    assert_eq!(changed(&session), first);
    assert_eq!(session.indexed_count(), indexed);
}

#[test]
fn an_unknown_repository_is_refused_and_changes_nothing() {
    let s = space();
    let before = fs::read_to_string(s.ws.join("shop.relief.json")).unwrap();
    let session = open(&s);
    let error = session
        .set_repo_comparison("nope", "main", "main", true)
        .unwrap_err();
    assert!(error.to_string().contains("nope"), "{error}");
    assert_eq!(
        fs::read_to_string(s.ws.join("shop.relief.json")).unwrap(),
        before
    );
    assert_eq!(session.repo_comparisons().len(), 2);
}

#[test]
fn a_single_repository_session_has_no_repository_comparison() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("shop-api");
    Fixture::load("shop-api").unwrap().build(&path).unwrap();
    let session = Session::open(&path, options(None)).unwrap();
    assert!(session.repo_comparisons().is_empty());
    assert!(
        session
            .set_repo_comparison("shop-api", "main", "main", false)
            .is_err()
    );
}

#[test]
fn set_comparison_on_the_workspace_writes_one_repository_and_keeps_the_rest() {
    let s = space();
    let mut workspace = Workspace::open(&s.ws).unwrap();
    workspace.set_comparison("web", "WORKTREE", "main").unwrap();
    assert_eq!(workspace.repos[0].source, "WORKTREE");
    let written = file(&s);
    assert_eq!(written["repos"][0]["source"], "WORKTREE");
    assert_eq!(written["repos"][0]["destination"], "main");
    assert_eq!(written["repos"][0]["labels"], json!(["front"]));
    assert_eq!(written["repos"][1]["source"], "feat/order-total");
    let reopened = Workspace::open(&s.ws).unwrap();
    assert_eq!(reopened.repos[0].source, "WORKTREE");
    assert!(workspace.set_comparison("nope", "main", "main").is_err());
}
