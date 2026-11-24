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

/// K06: without a path, relief no longer opens `.`: no repository is read, so a folder that is
/// not a repository is not an error (exit code 2). The folder of the configuration is a
/// temporary one.
#[test]
fn without_an_argument_no_session_is_opened() {
    let dir = TempDir::new().unwrap();
    let config = TempDir::new().unwrap();
    let output = desktop()
        .current_dir(dir.path())
        .env("RELIEF_CONFIG_DIR", config.path())
        .env_remove("OWD")
        .timeout(std::time::Duration::from_secs(20))
        .output()
        .unwrap();
    // Without a display the window cannot open (exit 1 or a signal), but never the "not a
    // repository" failure of opening `.`.
    assert_ne!(output.status.code(), Some(2), "{output:?}");
    assert!(
        !String::from_utf8_lossy(&output.stderr).contains("repository"),
        "{output:?}"
    );
}

/// K07: `relief <file>.relief.json` and `relief <folder>` open the workspace: the session is built
/// before any window, so neither the "not a repository" failure (exit code 2) nor a message about
/// a repository can happen. Without a display the window itself cannot open.
fn workspace() -> (TempDir, std::path::PathBuf) {
    let dir = TempDir::new().unwrap();
    let acme = dir.path().join("acme");
    let space = dir.path().join("space");
    Fixture::load("acme-shop").unwrap().build(&acme).unwrap();
    std::fs::create_dir(&space).unwrap();
    std::fs::write(
        space.join("shop.relief.json"),
        r#"{ "repos": [{ "name": "acme", "path": "../acme", "labels": ["back"],
            "source": "WORKTREE", "destination": "main" }] }"#,
    )
    .unwrap();
    (dir, space)
}

fn opens_the_workspace(arg: &std::path::Path) {
    let config = TempDir::new().unwrap();
    let output = desktop()
        .arg(arg)
        .env("RELIEF_CONFIG_DIR", config.path())
        .env_remove("OWD")
        .timeout(std::time::Duration::from_secs(20))
        .output()
        .unwrap();
    assert_ne!(output.status.code(), Some(2), "{output:?}");
    assert!(
        !String::from_utf8_lossy(&output.stderr).contains("repository"),
        "{output:?}"
    );
}

#[test]
fn a_workspace_file_is_opened_as_a_workspace() {
    let (_dir, space) = workspace();
    opens_the_workspace(&space.join("shop.relief.json"));
    // The data of the workspace, not of its repositories.
    assert!(space.join(".relief").is_dir());
}

#[test]
fn a_workspace_folder_is_opened_as_a_workspace() {
    let (dir, space) = workspace();
    opens_the_workspace(&space);
    assert!(space.join(".relief").is_dir());
    assert!(!dir.path().join("acme/.relief").exists());
}
