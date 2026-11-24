//! A repository of the workspace that cannot be read any more keeps its row in the comparisons,
//! with the reason, instead of an empty list of branches; the other rows are not affected.

mod common;

use std::fs;
use std::path::Path;

use common::options;
use relief_app::Session;
use relief_fixtures::Fixture;
use tempfile::TempDir;

#[test]
fn an_unreadable_repository_reports_its_error_and_the_others_stay_usable() {
    let dir = TempDir::new().unwrap();
    let root = dir.path();
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
    assert!(session.repo_comparisons().iter().all(|c| c.error.is_none()));
    fs::remove_dir_all(root.join("shop-web/.git")).unwrap();
    let rows = session.repo_comparisons();
    assert_eq!(rows[0].name, "web");
    assert!(rows[0].error.is_some());
    assert!(rows[0].branches.is_empty());
    assert!(rows[1].error.is_none());
    assert!(rows[1].branches.contains(&"main".to_owned()));
}
