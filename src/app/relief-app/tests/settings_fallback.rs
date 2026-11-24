//! K05 review: the default destination and a corrupt `settings.json`.

mod common;

use std::fs;
use std::process::Command;

use common::*;
use relief_app::{DataDirEnv, Session, Settings};
use tempfile::TempDir;

fn git(acme: &Acme, args: &[&str]) {
    let status = Command::new("git")
        .arg("-C")
        .arg(&acme.path)
        .args(args)
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?}");
}

fn open_with(acme: &Acme, data: &TempDir) -> Session {
    let mut opts = options(None);
    opts.data_dir = Some(DataDirEnv {
        relief_cache_dir: Some(data.path().to_path_buf()),
        xdg_cache_home: None,
        home: None,
    });
    Session::open(&acme.path, opts).unwrap()
}

fn worktree_head() -> Settings {
    Settings {
        source: "WORKTREE".to_owned(),
        destination: "HEAD".to_owned(),
    }
}

#[test]
fn a_detached_head_without_main_gives_head_as_destination() {
    let acme = build(|_| {});
    git(&acme, &["branch", "-m", "main", "trunk"]);
    git(&acme, &["checkout", "-q", "--detach"]);
    let data = TempDir::new().unwrap();
    assert_eq!(open_with(&acme, &data).settings().unwrap(), worktree_head());
}

#[test]
fn a_corrupt_settings_file_gives_the_computed_defaults() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    let session = open_with(&acme, &data);
    fs::write(data.path().join("settings.json"), "{ not json").unwrap();
    assert_eq!(
        session.settings().unwrap(),
        Settings {
            source: "WORKTREE".to_owned(),
            destination: "main".to_owned()
        }
    );
}
