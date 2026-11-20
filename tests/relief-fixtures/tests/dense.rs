//! Ticket S05: the generated fixture `dense` (10 packages x 150 files that import files of other
//! packages), built through the CLI like `wide`, with changes left in the working tree.

use std::collections::BTreeMap;
use std::process::Command as StdCommand;

use assert_cmd::Command;
use tempfile::TempDir;

fn build(dir: &std::path::Path) {
    Command::cargo_bin("relief-fixtures")
        .expect("bin")
        .args(["build", "dense"])
        .arg(dir)
        .assert()
        .success();
}

fn git(dir: &std::path::Path, args: &[&str]) -> String {
    let out = StdCommand::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .expect("git");
    assert!(out.status.success());
    String::from_utf8_lossy(&out.stdout).to_string()
}

#[test]
fn build_dense_creates_ten_packages_of_one_hundred_fifty_files() {
    let dir = TempDir::new().expect("tmp");
    build(dir.path());
    let mut per_package: BTreeMap<String, usize> = BTreeMap::new();
    for path in git(dir.path(), &["ls-files"]).lines() {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 3 && parts[0] == "packages" && path.ends_with(".ts") {
            *per_package.entry(parts[1].to_string()).or_default() += 1;
        }
    }
    assert_eq!(per_package.len(), 10, "{per_package:?}");
    assert!(
        per_package.values().all(|n| *n == 150),
        "150 .ts files per package: {per_package:?}"
    );
}

#[test]
fn dense_is_committed_on_main_and_leaves_changes_in_the_working_tree() {
    let dir = TempDir::new().expect("tmp");
    build(dir.path());
    let count = git(dir.path(), &["rev-list", "--count", "main"]);
    assert!(count.trim().parse::<u32>().expect("count") >= 1);
    let status = git(dir.path(), &["status", "--porcelain"]);
    assert!(
        status.lines().count() >= 10,
        "at least 10 modified files in the working tree: {status}"
    );
}

#[test]
fn dense_is_deterministic() {
    let a = TempDir::new().expect("tmp");
    let b = TempDir::new().expect("tmp");
    build(a.path());
    build(b.path());
    assert_eq!(
        git(a.path(), &["rev-parse", "HEAD"]),
        git(b.path(), &["rev-parse", "HEAD"])
    );
    assert_eq!(
        git(a.path(), &["diff"]),
        git(b.path(), &["diff"]),
        "same working tree changes"
    );
}
