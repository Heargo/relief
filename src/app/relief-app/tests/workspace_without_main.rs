//! A workspace whose repository has no `main` branch (reported on 2026-11-24: "unknown revision
//! 'main'"). The default destination is the one of a single repository: `main`, else `master`,
//! else the current branch, else `HEAD`.

mod common;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use common::options;
use relief_app::{DiffRequest, Session, Workspace};
use relief_fixtures::Fixture;
use tempfile::TempDir;

struct Space {
    _dir: TempDir,
    api: PathBuf,
    web: PathBuf,
    ws: PathBuf,
}

fn git(repo: &Path, args: &[&str]) {
    let status = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?}");
}

/// `shop-api` and `shop-web`, with the `main` of `shop-api` renamed `master`.
fn space() -> Space {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_path_buf();
    let api = root.join("shop-api");
    let web = root.join("shop-web");
    Fixture::load("shop-api").unwrap().build(&api).unwrap();
    Fixture::load("shop-web").unwrap().build(&web).unwrap();
    git(&api, &["branch", "-m", "main", "master"]);
    let ws = root.join("space");
    fs::create_dir(&ws).unwrap();
    Space {
        _dir: dir,
        api,
        web,
        ws,
    }
}

fn destination_of(ws: &Workspace, name: &str) -> String {
    ws.repos
        .iter()
        .find(|r| r.name == name)
        .unwrap()
        .destination
        .clone()
}

#[test]
fn a_repository_without_main_is_added_with_master_as_destination() {
    let s = space();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    ws.add_repo(&s.api, &[]).unwrap();
    ws.add_repo(&s.web, &[]).unwrap();
    assert_eq!(destination_of(&ws, "shop-api"), "master");
    assert_eq!(destination_of(&ws, "shop-web"), "main");
}

#[test]
fn a_workspace_file_that_says_main_for_a_repository_without_main_still_reviews() {
    let s = space();
    // What relief wrote before this fix: `main` for every repository.
    fs::write(
        s.ws.join("shop.relief.json"),
        r#"{ "repos": [
            { "name": "api", "path": "../shop-api", "source": "feat/order-total", "destination": "main" },
            { "name": "web", "path": "../shop-web", "source": "feat/order-badge", "destination": "main" }
        ] }"#,
    )
    .unwrap();
    let session = Session::open_workspace(&s.ws, options(None)).unwrap();
    let diff = session.diff(&DiffRequest::default()).unwrap().diff;
    assert!(
        diff.nodes
            .iter()
            .any(|n| n.id.to_string().starts_with("repo:api/")),
        "the change of api is in the diff"
    );
    let api = session
        .repo_comparisons()
        .into_iter()
        .find(|c| c.name == "api")
        .unwrap();
    assert_eq!(api.destination, "master");
}

#[test]
fn an_unknown_destination_chosen_by_hand_names_its_repository() {
    let s = space();
    fs::write(
        s.ws.join("shop.relief.json"),
        r#"{ "repos": [
            { "name": "api", "path": "../shop-api", "source": "feat/order-total", "destination": "release" }
        ] }"#,
    )
    .unwrap();
    let session = Session::open_workspace(&s.ws, options(None)).unwrap();
    let error = session
        .diff(&DiffRequest::default())
        .unwrap_err()
        .to_string();
    assert!(error.contains("api"), "{error}");
    assert!(error.contains("release"), "{error}");
}
