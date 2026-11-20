use std::collections::BTreeMap;
use std::process::Command as StdCommand;

use assert_cmd::Command;
use tempfile::TempDir;

#[test]
fn build_wide_creates_a_git_repo_of_ten_packages_with_three_hundred_files() {
    let dir = TempDir::new().expect("tmp");
    Command::cargo_bin("relief-fixtures")
        .expect("bin")
        .args(["build", "wide"])
        .arg(dir.path())
        .assert()
        .success();
    let out = StdCommand::new("git")
        .arg("-C")
        .arg(dir.path())
        .args(["ls-files"])
        .output()
        .expect("git");
    assert!(out.status.success());
    let listing = String::from_utf8_lossy(&out.stdout).to_string();
    let mut per_package: BTreeMap<String, usize> = BTreeMap::new();
    for path in listing.lines() {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 3 && parts[0] == "packages" && path.ends_with(".ts") {
            *per_package.entry(parts[1].to_string()).or_default() += 1;
        }
    }
    assert_eq!(per_package.len(), 10, "{per_package:?}");
    assert!(
        per_package.values().all(|n| *n == 300),
        "300 .ts files per package: {per_package:?}"
    );
}

#[test]
fn wide_is_committed_on_main() {
    let dir = TempDir::new().expect("tmp");
    Command::cargo_bin("relief-fixtures")
        .expect("bin")
        .args(["build", "wide"])
        .arg(dir.path())
        .assert()
        .success();
    let out = StdCommand::new("git")
        .arg("-C")
        .arg(dir.path())
        .args(["rev-list", "--count", "main"])
        .output()
        .expect("git");
    assert!(out.status.success());
    assert!(
        String::from_utf8_lossy(&out.stdout)
            .trim()
            .parse::<u32>()
            .expect("count")
            >= 1
    );
}
