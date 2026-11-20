//! Seam 2 of ticket 05 (renamed in 07): the `relief` binary opens the session before
//! any window. Failures exit with code 2 and an English message on stderr,
//! without starting Tauri (so these tests need no display).

use assert_cmd::Command;
use predicates::prelude::*;
use relief_fixtures::Fixture;
use tempfile::TempDir;

fn desktop() -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_relief"));
    cmd.env_remove("DISPLAY").env_remove("WAYLAND_DISPLAY");
    cmd
}

fn acme() -> (TempDir, std::path::PathBuf) {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("acme");
    Fixture::load("acme-shop").unwrap().build(&path).unwrap();
    (dir, path)
}

#[test]
fn a_folder_that_is_not_a_repository_exits_with_code_2() {
    let dir = TempDir::new().unwrap();
    desktop()
        .arg(dir.path())
        .assert()
        .code(2)
        .stderr(predicate::str::is_empty().not());
}

#[test]
fn an_invalid_range_on_acme_shop_exits_with_code_2() {
    let (_dir, path) = acme();
    desktop()
        .arg(&path)
        .arg("main...")
        .assert()
        .code(2)
        .stderr(predicate::str::is_empty().not());
}

#[test]
fn an_unknown_ref_on_acme_shop_exits_with_code_2() {
    let (_dir, path) = acme();
    desktop()
        .arg(&path)
        .arg("nope...main")
        .assert()
        .code(2)
        .stderr(predicate::str::is_empty().not());
}
