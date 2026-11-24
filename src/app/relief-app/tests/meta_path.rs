//! K13 review: `MetaResponse.path` is the folder of the open repository, and the folder of the
//! workspace file for a workspace.

use std::fs;

use relief_app::{Session, SessionOptions, Workspace};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_ts::TsAdapter;
use tempfile::TempDir;

fn options() -> SessionOptions {
    SessionOptions {
        data_dir: None,
        range: None,
        detectors: default_detectors(),
        adapters: vec![Box::new(TsAdapter::new())],
    }
}

#[test]
fn meta_path_is_the_folder_of_the_repository() {
    let dir = TempDir::new().unwrap();
    let repo = dir.path().join("tiny");
    Fixture::load("tiny").unwrap().build(&repo).unwrap();
    let session = Session::open(&repo, options()).unwrap();
    assert_eq!(session.meta().path.as_deref(), repo.to_str());
}

#[test]
fn meta_path_is_the_folder_of_the_workspace() {
    let dir = TempDir::new().unwrap();
    let repo = dir.path().join("tiny");
    let space = dir.path().join("space");
    Fixture::load("tiny").unwrap().build(&repo).unwrap();
    fs::create_dir(&space).unwrap();
    let workspace = Workspace::from_repo(&repo, &space).unwrap();
    let session = Session::open_workspace(workspace.file(), options()).unwrap();
    let path = session.meta().path.unwrap();
    assert_eq!(
        fs::canonicalize(path).unwrap(),
        fs::canonicalize(&space).unwrap()
    );
}
