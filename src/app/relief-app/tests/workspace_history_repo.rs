//! K16: in a workspace, each commit of the log and of the commit reading names its repository;
//! on a single repository the field is absent.

mod common;

use std::fs;
use std::path::Path;

use common::options;
use relief_app::{CommitReadingRequest, Session};
use relief_fixtures::Fixture;
use tempfile::TempDir;

#[test]
fn the_commits_of_a_workspace_carry_their_repository() {
    let dir = TempDir::new().unwrap();
    let root = dir.path();
    for name in ["shop-api", "shop-web"] {
        Fixture::load(name)
            .unwrap()
            .build(&root.join(name))
            .unwrap();
    }
    let ws = root.join("shop-space");
    fs::create_dir(&ws).unwrap();
    fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/fixtures/shop-space/shop.relief.json"),
        ws.join("shop.relief.json"),
    )
    .unwrap();
    let session = Session::open_workspace(&ws, options(None)).unwrap();
    let log = session.log("HEAD", 50, None).unwrap();
    let repos: Vec<Option<&str>> = log.iter().map(|e| e.repo.as_deref()).collect();
    assert_eq!(repos, [Some("web"), Some("web"), Some("api"), Some("api")]);
    // The limit counts per repository: a full first repository does not hide the second.
    let limited = session.log("HEAD", 1, None).unwrap();
    let repos: Vec<Option<&str>> = limited.iter().map(|e| e.repo.as_deref()).collect();
    assert_eq!(repos, [Some("web"), Some("api")]);
    let reading = session
        .commit_reading(&CommitReadingRequest { range: None })
        .unwrap();
    let repos: Vec<Option<&str>> = reading.commits.iter().map(|c| c.repo.as_deref()).collect();
    assert_eq!(repos, [Some("web"), Some("api")]);
}

#[test]
fn the_commits_of_a_single_repository_have_no_repository() {
    let dir = TempDir::new().unwrap();
    Fixture::load("shop-web")
        .unwrap()
        .build(&dir.path().join("shop-web"))
        .unwrap();
    let session = Session::open(&dir.path().join("shop-web"), options(None)).unwrap();
    let log = session.log("HEAD", 50, None).unwrap();
    assert!(log.iter().all(|e| e.repo.is_none()));
    assert!(!serde_json::to_string(&log[0]).unwrap().contains("repo"));
}
