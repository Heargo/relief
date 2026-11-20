//! Shallow clones (`git clone --depth 2`) of the `churn` fixture (six linear commits c1..c6):
//! the clone holds c5 and c6, and c5 is the boundary whose parent is not stored.

use std::path::Path;
use std::process::Command;

use relief_fixtures::Fixture;
use relief_git::{GitSource, RevSpec};
use tempfile::TempDir;

struct Repos {
    _tmp: TempDir,
    full: std::path::PathBuf,
    shallow: std::path::PathBuf,
    c1: String,
    c5: String,
    c6: String,
}

fn repos() -> Repos {
    let tmp = TempDir::new().unwrap();
    let full = tmp.path().join("full");
    let built = Fixture::load("churn").unwrap().build(&full).unwrap();
    let shallow = tmp.path().join("shallow");
    let out = Command::new("git")
        .arg("clone")
        .args(["--depth", "2"])
        .arg(format!("file://{}", full.display()))
        .arg(&shallow)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(shallow.join(".git/shallow").exists());
    let sha = |id: &str| built.sha(id).unwrap().to_string();
    Repos {
        c1: sha("c1"),
        c5: sha("c5"),
        c6: sha("c6"),
        full,
        shallow,
        _tmp: tmp,
    }
}

fn open(path: &Path) -> GitSource {
    GitSource::open(path).unwrap()
}

#[test]
fn shallow_clone_repo_id_and_log_do_not_fail() {
    let r = repos();
    let git = open(&r.shallow);
    let head = git.resolve("HEAD").unwrap();
    assert!(git.repo_id().is_ok());
    let range = git
        .resolve_range(&RevSpec::parse(&format!("{}..HEAD", r.c5)).unwrap())
        .unwrap();
    assert_eq!(range.new, head);
    let log = git.log(&range).unwrap();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].message.trim(), "fix: clamp bound");
    assert!(git.touching_commits(&head, 0).is_ok());
}

#[test]
fn shallow_clone_repo_id_is_the_oldest_stored_commit() {
    let r = repos();
    let id = open(&r.shallow).repo_id().unwrap();
    assert_eq!(id, open(&r.shallow).resolve(&r.c5).unwrap());
}

#[test]
fn full_repo_id_is_the_first_commit() {
    let r = repos();
    let git = open(&r.full);
    assert_eq!(git.repo_id().unwrap(), git.resolve(&r.c1).unwrap());
}

#[test]
fn full_repo_log_is_unchanged() {
    let r = repos();
    let git = open(&r.full);
    let range = git
        .resolve_range(&RevSpec::parse(&format!("{}..{}", r.c1, r.c6)).unwrap())
        .unwrap();
    let messages: Vec<String> = git
        .log(&range)
        .unwrap()
        .iter()
        .map(|c| c.message.trim().to_string())
        .collect();
    assert_eq!(
        messages,
        [
            "fix: discount rate",
            "fix: total accumulation",
            "fix: total threshold",
            "feat: discount rate and pricing tests",
            "fix: clamp bound",
        ]
    );
}

#[test]
fn a_missing_parent_without_shallow_file_is_an_error() {
    let r = repos();
    std::fs::remove_file(r.shallow.join(".git/shallow")).unwrap();
    assert!(open(&r.shallow).repo_id().is_err());
}

#[test]
fn touching_commits_skips_the_shallow_boundary_commit() {
    let r = repos();
    let git = open(&r.shallow);
    let head = git.resolve("HEAD").unwrap();
    let commits = git.touching_commits(&head, 0).unwrap();
    let ids: Vec<_> = commits.iter().map(|c| c.id.clone()).collect();
    assert_eq!(ids, [git.resolve(&r.c6).unwrap()]);
}
