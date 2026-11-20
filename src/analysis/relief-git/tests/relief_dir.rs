//! Seam 2 of ticket 04: `GitSource` never lists `.relief/`, even when it is
//! committed, staged and present in the working tree.

use std::fs;
use std::path::Path;
use std::process::Command;

use relief_fixtures::Fixture;
use relief_git::GitSource;
use tempfile::TempDir;

fn git(repo: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@relief.invalid")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_COMMITTER_EMAIL", "fixture@relief.invalid")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}");
}

fn paths(source: &GitSource, rev: &str) -> Vec<String> {
    let commit = source.resolve(rev).unwrap();
    source
        .list_tree(&commit)
        .unwrap()
        .into_iter()
        .map(|e| e.path)
        .collect()
}

fn committed_relief() -> TempDir {
    let dir = TempDir::new().unwrap();
    Fixture::load("tiny")
        .unwrap()
        .build_with_worktree(dir.path(), |repo| {
            fs::create_dir_all(repo.join(".relief/state")).unwrap();
            fs::write(repo.join(".relief/state/seen.ts"), "export const a = 1;\n").unwrap();
            fs::write(repo.join(".relief/relief.json"), "{}\n").unwrap();
            git(repo, &["add", "-f", ".relief"]);
            git(repo, &["commit", "-q", "-m", "chore: commit .relief"]);
            fs::write(repo.join(".relief/state/seen.ts"), "export const a = 2;\n").unwrap();
            fs::write(repo.join(".relief/state/new.ts"), "export const n = 1;\n").unwrap();
            git(repo, &["add", "-f", ".relief/state/new.ts"]);
        })
        .unwrap();
    dir
}

fn assert_hidden(rev: &str) {
    let dir = committed_relief();
    let source = GitSource::open(dir.path()).unwrap();
    let listed = paths(&source, rev);
    assert!(!listed.is_empty(), "{rev}");
    assert!(
        !listed
            .iter()
            .any(|p| p == ".relief" || p.starts_with(".relief/")),
        "{rev}: {listed:?}"
    );
}

#[test]
fn relief_dir_is_not_listed_in_a_commit() {
    assert_hidden("HEAD");
}

#[test]
fn relief_dir_is_not_listed_in_the_worktree() {
    assert_hidden("WORKTREE");
}

#[test]
fn relief_dir_is_not_listed_in_the_index() {
    assert_hidden("INDEX");
}
