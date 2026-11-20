use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use relief_fixtures::{BuiltRepo, Fixture};
use relief_git::{FileStatus, GitSource};
use tempfile::TempDir;

fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@relief.invalid")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_COMMITTER_EMAIL", "fixture@relief.invalid")
        .env("GIT_AUTHOR_DATE", "2024-02-01T10:00:00 +0000")
        .env("GIT_COMMITTER_DATE", "2024-02-01T10:00:00 +0000")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).expect("utf8")
}

const NEW_TS: &str = "export const brandNew = 'untracked';\n";
const STAGED_C_TS: &str = "export const staged = 42;\n";
const UNSTAGED_A_TS: &str = "export function alpha(): number {\n  return 1;\n}\n\nexport function alphaTwo(): number {\n  return alpha() + alpha();\n}\n\nexport const unstaged = true;\n";

/// `tiny` at `reshape`, plus a commit adding `.gitignore` and `src/gone.ts`,
/// then in the working tree:
/// - `src/a.ts` modified, not staged;
/// - `src/c.ts` modified and staged;
/// - `src/new.ts` untracked;
/// - `src/gone.ts` deleted, not staged;
/// - `debug.log` and `dist/out.js` ignored.
fn dirty() -> (TempDir, BuiltRepo) {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("tiny")
        .expect("load tiny")
        .build_with_worktree(dir.path(), |repo| {
            fs::write(repo.join(".gitignore"), "*.log\ndist/\n").unwrap();
            fs::write(
                repo.join("src/gone.ts"),
                "// to be deleted\nexport const doomed = 'zzz zzz zzz';\n",
            )
            .unwrap();
            git(repo, &["add", "-A"]);
            git(repo, &["commit", "-q", "-m", "chore: gitignore and gone"]);

            fs::write(repo.join("src/a.ts"), UNSTAGED_A_TS).unwrap();
            fs::write(repo.join("src/c.ts"), STAGED_C_TS).unwrap();
            git(repo, &["add", "src/c.ts"]);
            fs::write(repo.join("src/new.ts"), NEW_TS).unwrap();
            fs::remove_file(repo.join("src/gone.ts")).unwrap();
            fs::write(repo.join("debug.log"), "noise\n").unwrap();
            fs::create_dir_all(repo.join("dist")).unwrap();
            fs::write(repo.join("dist/out.js"), "var x;\n").unwrap();
        })
        .expect("build");
    (dir, built)
}

fn summary(source: &GitSource, from: &str, to: &str) -> Vec<String> {
    let old = source.resolve(from).expect("resolve from");
    let new = source.resolve(to).expect("resolve to");
    source
        .diff_trees(&old, &new)
        .expect("diff_trees")
        .into_iter()
        .map(|c| {
            let tag = match c.status {
                FileStatus::Added => "A",
                FileStatus::Deleted => "D",
                FileStatus::Modified => "M",
                FileStatus::Renamed { .. } => "R",
            };
            format!("{tag} {}", c.path)
        })
        .collect()
}

fn paths(source: &GitSource, rev: &str) -> Vec<String> {
    let commit = source.resolve(rev).expect("resolve");
    source
        .list_tree(&commit)
        .expect("list_tree")
        .into_iter()
        .map(|e| e.path)
        .collect()
}

fn blob_of(source: &GitSource, rev: &str, path: &str) -> relief_git::BlobId {
    let commit = source.resolve(rev).expect("resolve");
    source
        .list_tree(&commit)
        .expect("list_tree")
        .into_iter()
        .find(|e| e.path == path)
        .unwrap_or_else(|| panic!("{path} not in {rev}"))
        .blob
}

#[test]
fn diff_head_worktree_sees_unstaged_staged_untracked_and_deleted() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    assert_eq!(
        summary(&source, "HEAD", "WORKTREE"),
        ["M src/a.ts", "M src/c.ts", "D src/gone.ts", "A src/new.ts"]
    );
}

#[test]
fn diff_head_index_sees_only_the_staged_change() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    assert_eq!(summary(&source, "HEAD", "INDEX"), ["M src/c.ts"]);
}

#[test]
fn ignored_files_never_appear() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    for rev in ["WORKTREE", "INDEX"] {
        let listed = paths(&source, rev);
        assert!(
            !listed.iter().any(|p| p == "debug.log"),
            "{rev}: {listed:?}"
        );
        assert!(
            !listed.iter().any(|p| p.starts_with("dist/")),
            "{rev}: {listed:?}"
        );
    }
    let changed = summary(&source, "HEAD", "WORKTREE").join("\n");
    assert!(!changed.contains("debug.log") && !changed.contains("dist/"));
}

#[test]
fn list_tree_worktree_is_head_plus_edits() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    assert_eq!(
        paths(&source, "WORKTREE"),
        [".gitignore", "src/a.ts", "src/c.ts", "src/new.ts"]
    );
}

#[test]
fn list_tree_index_is_the_staged_tree() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    assert_eq!(
        paths(&source, "INDEX"),
        [".gitignore", "src/a.ts", "src/c.ts", "src/gone.ts"]
    );
}

#[test]
fn worktree_blob_ids_match_git_hash_object() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    for path in ["src/a.ts", "src/c.ts", "src/new.ts"] {
        let expected = git(dir.path(), &["hash-object", path]);
        let blob = blob_of(&source, "WORKTREE", path);
        assert_eq!(blob.to_string(), expected.trim(), "{path}");
    }
}

#[test]
fn index_blob_ids_are_the_staged_ones() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    let staged = git(dir.path(), &["rev-parse", ":src/c.ts"]);
    assert_eq!(
        blob_of(&source, "INDEX", "src/c.ts").to_string(),
        staged.trim()
    );
    // a.ts is not staged: the index still holds the HEAD version.
    let head = git(dir.path(), &["rev-parse", "HEAD:src/a.ts"]);
    assert_eq!(
        blob_of(&source, "INDEX", "src/a.ts").to_string(),
        head.trim()
    );
}

#[test]
fn read_blob_returns_worktree_and_index_content() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    let untracked = blob_of(&source, "WORKTREE", "src/new.ts");
    assert_eq!(source.read_blob(&untracked).unwrap(), NEW_TS.as_bytes());
    let unstaged = blob_of(&source, "WORKTREE", "src/a.ts");
    assert_eq!(
        source.read_blob(&unstaged).unwrap(),
        UNSTAGED_A_TS.as_bytes()
    );
    let staged = blob_of(&source, "INDEX", "src/c.ts");
    assert_eq!(source.read_blob(&staged).unwrap(), STAGED_C_TS.as_bytes());
}

#[test]
fn diff_trees_reports_worktree_blobs_and_line_counts() {
    let (dir, _) = dirty();
    let source = GitSource::open(dir.path()).unwrap();
    let head = source.resolve("HEAD").unwrap();
    let work = source.resolve("WORKTREE").unwrap();
    let changes = source.diff_trees(&head, &work).unwrap();
    let new = changes.iter().find(|c| c.path == "src/new.ts").unwrap();
    assert_eq!(new.status, FileStatus::Added);
    assert_eq!((new.lines_added, new.lines_removed), (1, 0));
    assert_eq!(new.old_blob, None);
    let expected = git(dir.path(), &["hash-object", "src/new.ts"]);
    assert_eq!(new.new_blob.as_ref().unwrap().to_string(), expected.trim());
    let gone = changes.iter().find(|c| c.path == "src/gone.ts").unwrap();
    assert_eq!(gone.status, FileStatus::Deleted);
    assert_eq!(gone.new_blob, None);
}

fn snapshot_repo(repo: &Path) -> (Vec<u8>, BTreeSet<PathBuf>) {
    let index = fs::read(repo.join(".git/index")).unwrap();
    let mut objects = BTreeSet::new();
    let mut stack = vec![repo.join(".git/objects")];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                stack.push(path);
            } else {
                objects.insert(path);
            }
        }
    }
    (index, objects)
}

#[test]
fn virtual_commits_leave_the_repository_untouched() {
    let (dir, _) = dirty();
    let before = snapshot_repo(dir.path());
    let source = GitSource::open(dir.path()).unwrap();
    for rev in ["WORKTREE", "INDEX"] {
        let commit = source.resolve(rev).expect("resolve");
        for entry in source.list_tree(&commit).unwrap() {
            source.read_blob(&entry.blob).unwrap();
        }
        let head = source.resolve("HEAD").unwrap();
        source.diff_trees(&head, &commit).unwrap();
    }
    drop(source);
    let after = snapshot_repo(dir.path());
    assert_eq!(before.0, after.0, ".git/index changed");
    assert_eq!(before.1, after.1, ".git/objects changed");
}
