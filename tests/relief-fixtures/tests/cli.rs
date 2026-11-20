use std::process::Command as StdCommand;

use assert_cmd::Command;
use relief_fixtures::Fixture;
use tempfile::TempDir;

#[test]
fn build_subcommand_creates_the_same_repo_as_the_api() {
    let cli_dir = TempDir::new().expect("tmp");
    let api_dir = TempDir::new().expect("tmp");
    Command::cargo_bin("relief-fixtures")
        .expect("bin")
        .args(["build", "tiny"])
        .arg(cli_dir.path())
        .assert()
        .success();
    let built = Fixture::load("tiny")
        .expect("load")
        .build(api_dir.path())
        .expect("build");
    let out = StdCommand::new("git")
        .arg("-C")
        .arg(cli_dir.path())
        .args(["rev-parse", "main"])
        .output()
        .expect("git");
    assert!(out.status.success());
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        built.sha("reshape").expect("sha")
    );
}

#[test]
fn build_subcommand_fails_on_unknown_fixture() {
    let dir = TempDir::new().expect("tmp");
    let assert = Command::cargo_bin("relief-fixtures")
        .expect("bin")
        .args(["build", "does-not-exist"])
        .arg(dir.path())
        .assert()
        .failure();
    let stderr = String::from_utf8_lossy(&assert.get_output().stderr).to_string();
    assert!(
        stderr.contains("fixtures/does-not-exist/fixture.yaml"),
        "{stderr}"
    );
}

#[test]
fn build_subcommand_knows_acme_shop() {
    let dir = TempDir::new().expect("tmp");
    Command::cargo_bin("relief-fixtures")
        .expect("bin")
        .args(["build", "acme-shop"])
        .arg(dir.path())
        .assert()
        .success();
    let out = StdCommand::new("git")
        .arg("-C")
        .arg(dir.path())
        .args(["rev-list", "--count", "main..feat/promo-codes"])
        .output()
        .expect("git");
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "5");
}
