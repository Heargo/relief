//! K07 review: workspace file validation, workspace folder outside the members, data folder.

use std::fs;

use relief_app::{DataDirEnv, Session, Workspace};
use relief_fixtures::Fixture;
use tempfile::TempDir;

mod common;

fn two() -> (TempDir, std::path::PathBuf, std::path::PathBuf) {
    let dir = TempDir::new().unwrap();
    let acme = dir.path().join("acme");
    let ws = dir.path().join("space");
    Fixture::load("acme-shop").unwrap().build(&acme).unwrap();
    fs::create_dir(&ws).unwrap();
    (dir, acme, ws)
}

#[test]
fn several_workspace_files_in_a_folder_are_an_error_naming_them() {
    let (_d, _acme, ws) = two();
    fs::write(ws.join("a.relief.json"), r#"{"repos":[]}"#).unwrap();
    fs::write(ws.join("b.relief.json"), r#"{"repos":[]}"#).unwrap();
    let err = Workspace::open(&ws).unwrap_err().to_string();
    assert!(
        err.contains("a.relief.json") && err.contains("b.relief.json"),
        "{err}"
    );
    assert!(Workspace::open(&ws.join("b.relief.json")).is_ok());
}

#[test]
fn a_hand_written_file_with_bad_or_duplicate_names_is_an_error() {
    let (_d, _acme, ws) = two();
    let file = ws.join("x.relief.json");
    for repos in [
        r#"[{"name":"","path":"../acme"}]"#,
        r#"[{"name":"a/b","path":"../acme"}]"#,
        r#"[{"name":"a","path":"../acme"},{"name":"a","path":"../acme"}]"#,
    ] {
        fs::write(&file, format!(r#"{{"repos":{repos}}}"#)).unwrap();
        assert!(Workspace::open(&file).is_err(), "{repos}");
    }
}

#[test]
fn a_workspace_folder_inside_a_member_repository_is_refused() {
    let (_d, acme, ws) = two();
    let inside = acme.join("sub");
    fs::create_dir(&inside).unwrap();
    for dir in [&acme, &inside] {
        assert!(Workspace::from_repo(&acme, dir).is_err());
        assert!(!dir.join("acme.relief.json").exists());
        let mut w = Workspace::create(dir, "x").unwrap();
        assert!(w.add_repo(&acme, &[]).is_err());
        fs::remove_file(dir.join("x.relief.json")).unwrap();
    }
    assert!(Workspace::from_repo(&acme, &ws).is_ok());
}

#[test]
fn relief_cache_dir_places_the_data_of_a_workspace() {
    let (d, acme, ws) = two();
    let mut w = Workspace::create(&ws, "shop").unwrap();
    w.add_repo(&acme, &[]).unwrap();
    let cache = d.path().join("elsewhere");
    let mut opts = common::options(None);
    opts.data_dir = Some(DataDirEnv {
        relief_cache_dir: Some(cache.clone()),
        ..DataDirEnv::default()
    });
    let session = Session::open_workspace(&ws, opts).unwrap();
    assert_eq!(session.data_dir().unwrap().root(), cache);
}
