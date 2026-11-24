//! Seam 1 of ticket K05: `Session::settings` / `set_settings` on acme-shop.
//!
//! API expected: `relief_app::Settings { source: String, destination: String }`
//! (Debug, Clone, PartialEq), `Session::settings(&self) -> Result<Settings, AppError>`
//! and `Session::set_settings(&self, &Settings) -> Result<(), AppError>` (the error code
//! `no_data_dir` when the session has no data folder). `source` is a ref or `WORKTREE`.
//! The defaults live in `<data dir>/settings.json` as `{ "source": ..., "destination": ... }`.
//! A range given when opening wins: `A...B` and `A..B` give destination `A`, source `B`;
//! a lone `REV` gives destination `REV`, source `WORKTREE`.

mod common;

use std::fs;
use std::process::Command;

use common::*;
use relief_app::{DataDirEnv, RangeSpec, Session, SessionOptions, Settings};
use tempfile::TempDir;

fn open_with(acme: &Acme, data: Option<&TempDir>, range: Option<&str>) -> Session {
    let mut opts: SessionOptions = options(range.map(|r| RangeSpec::parse(r).unwrap()));
    opts.data_dir = data.map(|d| DataDirEnv {
        relief_cache_dir: Some(d.path().to_path_buf()),
        xdg_cache_home: None,
        home: None,
    });
    Session::open(&acme.path, opts).unwrap()
}

fn settings(source: &str, destination: &str) -> Settings {
    Settings {
        source: source.to_owned(),
        destination: destination.to_owned(),
    }
}

fn git(acme: &Acme, args: &[&str]) {
    let status = Command::new("git")
        .arg("-C")
        .arg(&acme.path)
        .args(args)
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?}");
}

#[test]
fn without_a_file_the_source_is_the_working_tree_and_the_destination_main() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    let session = open_with(&acme, Some(&data), None);
    assert_eq!(session.settings().unwrap(), settings("WORKTREE", "main"));
}

#[test]
fn without_main_the_destination_is_the_default_branch_of_the_repository() {
    let acme = build(|_| {});
    git(&acme, &["symbolic-ref", "HEAD", "refs/heads/main"]);
    git(&acme, &["branch", "-m", "main", "trunk"]);
    let data = TempDir::new().unwrap();
    let session = open_with(&acme, Some(&data), None);
    assert_eq!(session.settings().unwrap(), settings("WORKTREE", "trunk"));
}

#[test]
fn defaults_saved_are_read_back_after_reopening() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    open_with(&acme, Some(&data), None)
        .set_settings(&settings("feat/promo-codes", "main"))
        .unwrap();

    let reopened = open_with(&acme, Some(&data), None);
    assert_eq!(
        reopened.settings().unwrap(),
        settings("feat/promo-codes", "main")
    );
}

#[test]
fn the_defaults_live_in_settings_json_of_the_data_dir() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    open_with(&acme, Some(&data), None)
        .set_settings(&settings("feat/promo-codes", "main"))
        .unwrap();

    let text = fs::read_to_string(data.path().join("settings.json")).unwrap();
    let json: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(json["source"], "feat/promo-codes", "{text}");
    assert_eq!(json["destination"], "main", "{text}");
}

#[test]
fn the_last_defaults_saved_win() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    let session = open_with(&acme, Some(&data), None);
    session
        .set_settings(&settings("feat/promo-codes", "main"))
        .unwrap();
    session.set_settings(&settings("WORKTREE", "main")).unwrap();

    let reopened = open_with(&acme, Some(&data), None);
    assert_eq!(reopened.settings().unwrap(), settings("WORKTREE", "main"));
}

#[test]
fn a_range_given_at_opening_wins_over_the_saved_defaults() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    open_with(&acme, Some(&data), None)
        .set_settings(&settings("WORKTREE", "main"))
        .unwrap();

    let session = open_with(&acme, Some(&data), Some("main...feat/promo-codes"));
    assert_eq!(
        session.settings().unwrap(),
        settings("feat/promo-codes", "main")
    );
}

#[test]
fn a_two_dot_range_gives_the_same_sides() {
    let acme = build(|_| {});
    let session = open_with(&acme, None, Some("main..feat/promo-codes"));
    assert_eq!(
        session.settings().unwrap(),
        settings("feat/promo-codes", "main")
    );
}

#[test]
fn a_lone_revision_range_has_the_working_tree_as_source() {
    let acme = build(|_| {});
    let session = open_with(&acme, None, Some("main"));
    assert_eq!(session.settings().unwrap(), settings("WORKTREE", "main"));
}

#[test]
fn a_range_at_opening_does_not_overwrite_the_saved_defaults() {
    let acme = build(|_| {});
    let data = TempDir::new().unwrap();
    open_with(&acme, Some(&data), None)
        .set_settings(&settings("WORKTREE", "main"))
        .unwrap();
    drop(open_with(
        &acme,
        Some(&data),
        Some("main...feat/promo-codes"),
    ));

    let reopened = open_with(&acme, Some(&data), None);
    assert_eq!(reopened.settings().unwrap(), settings("WORKTREE", "main"));
}

#[test]
fn saving_without_a_data_dir_fails_with_no_data_dir() {
    let acme = build(|_| {});
    let session = open_with(&acme, None, None);
    let err = session
        .set_settings(&settings("WORKTREE", "main"))
        .unwrap_err();
    assert_eq!(err.code(), "no_data_dir");
}
