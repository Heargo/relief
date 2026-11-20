use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use relief_fixtures::{BuiltRepo, Fixture};
use relief_git::GitSource;
use tempfile::TempDir;

const A_TS: &str = "export function alpha(): number {\n  return 1;\n}\n\nexport function alphaTwo(): number {\n  return alpha() + alpha();\n}\n";
const A_TS_INIT: &str = "export function alpha(): number {\n  return 1;\n}\n";

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

fn tiny() -> (TempDir, BuiltRepo) {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("tiny")
        .expect("load tiny")
        .build(dir.path())
        .expect("build tiny");
    (dir, built)
}

fn paths(source: &GitSource, rev: &str) -> Vec<String> {
    let commit = source.resolve(rev).expect("resolve");
    source
        .list_tree(&commit)
        .expect("list_tree")
        .into_iter()
        .map(|e| e.path.to_string())
        .collect()
}

#[test]
fn open_finds_the_root_from_a_subfolder() {
    let (dir, built) = tiny();
    let source = GitSource::open(&dir.path().join("src")).expect("open from subfolder");
    assert_eq!(
        source.repo_id().expect("repo id"),
        built.sha("init").unwrap()
    );
    assert_eq!(paths(&source, "HEAD"), ["src/a.ts", "src/c.ts"]);
}

#[test]
fn open_outside_a_repository_names_the_problem() {
    let dir = TempDir::new().expect("tmp");
    let err = GitSource::open(dir.path()).err().expect("must fail");
    let msg = err.to_string().to_lowercase();
    assert!(msg.contains("not a git repository"), "got: {msg}");
}

#[test]
fn resolve_head_branch_and_full_sha() {
    let (dir, built) = tiny();
    let source = GitSource::open(dir.path()).expect("open");
    let reshape = built.sha("reshape").unwrap();
    assert_eq!(source.resolve("HEAD").unwrap().to_string(), reshape);
    assert_eq!(source.resolve("main").unwrap().to_string(), reshape);
    assert_eq!(source.resolve(reshape).unwrap().to_string(), reshape);
}

#[test]
fn resolve_branch_pointing_elsewhere() {
    let (dir, built) = tiny();
    git(dir.path(), &["branch", "old", built.sha("edit").unwrap()]);
    let source = GitSource::open(dir.path()).expect("open");
    assert_eq!(
        source.resolve("old").unwrap().to_string(),
        built.sha("edit").unwrap()
    );
}

#[test]
fn resolve_short_sha() {
    let (dir, built) = tiny();
    let source = GitSource::open(dir.path()).expect("open");
    let edit = built.sha("edit").unwrap();
    assert_eq!(source.resolve(&edit[..10]).unwrap().to_string(), edit);
}

#[test]
fn resolve_lightweight_and_annotated_tags_to_the_commit() {
    let (dir, built) = tiny();
    let init = built.sha("init").unwrap();
    let edit = built.sha("edit").unwrap();
    git(dir.path(), &["tag", "light", init]);
    git(dir.path(), &["tag", "-a", "-m", "release", "v1", edit]);
    let source = GitSource::open(dir.path()).expect("open");
    assert_eq!(source.resolve("light").unwrap().to_string(), init);
    assert_eq!(source.resolve("v1").unwrap().to_string(), edit);
}

#[test]
fn resolve_unknown_ref_names_it() {
    let (dir, _) = tiny();
    let source = GitSource::open(dir.path()).expect("open");
    let err = source.resolve("no-such-branch").err().expect("must fail");
    assert!(err.to_string().contains("no-such-branch"), "got: {err}");
    let err = source.resolve("deadbeef").err().expect("must fail");
    assert!(err.to_string().contains("deadbeef"), "got: {err}");
}

#[test]
fn resolve_ambiguous_short_sha_fails_readably() {
    let (dir, _) = tiny();
    // Many commits through fast-import so that two share a 4-hex prefix.
    let mut stream = String::new();
    for i in 0..1500 {
        stream.push_str(&format!(
            "commit refs/heads/many\ncommitter Fixture <fixture@relief.invalid> {} +0000\ndata 5\nc{:04}\n",
            1_700_000_000 + i,
            i
        ));
        stream.push('\n');
    }
    let mut child = Command::new("git")
        .arg("-C")
        .arg(dir.path())
        .args(["fast-import", "--quiet"])
        .stdin(Stdio::piped())
        .spawn()
        .expect("fast-import");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(stream.as_bytes())
        .expect("write");
    assert!(child.wait().expect("wait").success());

    let all = git(dir.path(), &["rev-list", "--all"]);
    let mut seen = std::collections::HashMap::new();
    let mut prefix = None;
    for sha in all.lines() {
        if let Some(_other) = seen.insert(sha[..4].to_string(), sha.to_string()) {
            prefix = Some(sha[..4].to_string());
            break;
        }
    }
    let prefix = prefix.expect("two commits share a 4-hex prefix");

    let source = GitSource::open(dir.path()).expect("open");
    let err = source.resolve(&prefix).err().expect("must fail");
    let msg = err.to_string();
    assert!(msg.to_lowercase().contains("ambiguous"), "got: {msg}");
    assert!(msg.contains(&prefix), "got: {msg}");
}

#[test]
fn list_tree_of_the_latest_commit_is_the_expected_list() {
    let (dir, _) = tiny();
    let source = GitSource::open(dir.path()).expect("open");
    let commit = source.resolve("HEAD").unwrap();
    let entries = source.list_tree(&commit).expect("list_tree");
    let listed: Vec<(String, u32)> = entries
        .iter()
        .map(|e| (e.path.to_string(), e.mode))
        .collect();
    assert_eq!(
        listed,
        [
            ("src/a.ts".to_string(), 0o100644),
            ("src/c.ts".to_string(), 0o100644),
        ]
    );
}

#[test]
fn list_tree_of_the_first_commit_is_recursive() {
    let (dir, built) = tiny();
    let source = GitSource::open(dir.path()).expect("open");
    assert_eq!(
        paths(&source, built.sha("init").unwrap()),
        ["docs/readme.md", "src/a.ts", "src/b.ts"]
    );
}

#[test]
fn read_blob_returns_the_file_content() {
    let (dir, _) = tiny();
    let source = GitSource::open(dir.path()).expect("open");
    let commit = source.resolve("HEAD").unwrap();
    let entries = source.list_tree(&commit).expect("list_tree");
    let a = entries.iter().find(|e| e.path == "src/a.ts").expect("a.ts");
    let content = source.read_blob(&a.blob).expect("read_blob");
    assert_eq!(&content[..], A_TS.as_bytes());

    let first = source.resolve("main~2").expect("main~2");
    let old = source.list_tree(&first).expect("list_tree");
    let a = old.iter().find(|e| e.path == "src/a.ts").expect("a.ts");
    assert_eq!(
        &source.read_blob(&a.blob).expect("read_blob")[..],
        A_TS_INIT.as_bytes()
    );
}

#[test]
fn submodules_are_listed_but_not_followed() {
    let (dir, built) = tiny();
    let sub = built.sha("init").unwrap();
    git(
        dir.path(),
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("160000,{sub},vendor/lib"),
        ],
    );
    git(dir.path(), &["commit", "-q", "-m", "add submodule"]);
    let source = GitSource::open(dir.path()).expect("open");
    let commit = source.resolve("HEAD").unwrap();
    let entries = source.list_tree(&commit).expect("list_tree");
    let listed: Vec<(String, u32)> = entries
        .iter()
        .map(|e| (e.path.to_string(), e.mode))
        .collect();
    assert_eq!(
        listed,
        [
            ("src/a.ts".to_string(), 0o100644),
            ("src/c.ts".to_string(), 0o100644),
            ("vendor/lib".to_string(), 0o160000),
        ]
    );
}

#[test]
fn repo_id_is_the_first_commit_sha() {
    let (dir, built) = tiny();
    let source = GitSource::open(dir.path()).expect("open");
    assert_eq!(source.repo_id().unwrap(), built.sha("init").unwrap());
}

#[test]
fn reading_never_modifies_the_repository() {
    let (dir, built) = tiny();
    let index = dir.path().join(".git/index");
    // Let git refresh the index (racy-git) first, so only relief's reads are measured.
    git(dir.path(), &["status", "--porcelain"]);
    git(dir.path(), &["status", "--porcelain"]);
    let status_before = git(dir.path(), &["status", "--porcelain"]);
    let mtime_before = fs::metadata(&index)
        .expect("index")
        .modified()
        .expect("mtime");
    let index_bytes_before = fs::read(&index).expect("index");

    {
        let source = GitSource::open(&dir.path().join("src")).expect("open");
        let _ = source.repo_id().expect("repo id");
        for rev in ["HEAD", "main", built.sha("init").unwrap()] {
            let commit = source.resolve(rev).expect("resolve");
            for entry in source.list_tree(&commit).expect("list_tree") {
                let _ = source.read_blob(&entry.blob).expect("read_blob");
            }
        }
        let _ = source.resolve("unknown-ref");
    }

    let mtime_after = fs::metadata(&index)
        .expect("index")
        .modified()
        .expect("mtime");
    assert_eq!(mtime_after, mtime_before);
    assert_eq!(fs::read(&index).expect("index"), index_bytes_before);

    assert_eq!(git(dir.path(), &["status", "--porcelain"]), status_before);
    assert_eq!(status_before, "");
}
