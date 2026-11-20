use std::fs;
use std::path::Path;
use std::process::Command;

use relief_fixtures::Fixture;
use tempfile::TempDir;

fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).expect("utf8")
}

fn write_fixture(root: &Path, yaml: &str, files: &[(&str, &str)]) -> std::path::PathBuf {
    let dir = root.join("custom");
    fs::create_dir_all(&dir).expect("mkdir");
    fs::write(dir.join("fixture.yaml"), yaml).expect("yaml");
    for (rel, content) in files {
        let p = dir.join(rel);
        fs::create_dir_all(p.parent().expect("parent")).expect("mkdir");
        fs::write(p, content).expect("write");
    }
    dir
}

#[test]
fn building_tiny_twice_gives_identical_shas() {
    let a = TempDir::new().expect("tmp");
    let b = TempDir::new().expect("tmp");
    let fixture = Fixture::load("tiny").expect("load tiny");
    let first = fixture.build(a.path()).expect("build 1");
    let second = fixture.build(b.path()).expect("build 2");
    for id in ["init", "edit", "reshape"] {
        let sha = first.sha(id).expect("sha");
        assert_eq!(sha.len(), 40);
        assert_eq!(Some(sha), second.sha(id));
    }
    assert_ne!(first.sha("init"), first.sha("edit"));
}

#[test]
fn built_repo_has_three_commits_in_order_with_fixed_author() {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("tiny")
        .expect("load")
        .build(dir.path())
        .expect("build");
    assert_eq!(built.path(), dir.path());
    let log = git(built.path(), &["log", "--format=%s|%an <%ae>|%at", "main"]);
    assert_eq!(
        log,
        "refactor: rename b to c and drop the readme|Fixture <fixture@relief.invalid>|1704276000\n\
         feat: extend a|Fixture <fixture@relief.invalid>|1704189600\n\
         feat: initial files|Fixture <fixture@relief.invalid>|1704103200\n"
    );
    let head = git(built.path(), &["rev-parse", "main"]);
    assert_eq!(head.trim(), built.sha("reshape").expect("sha"));
}

#[test]
fn last_commit_of_tiny_renames_and_deletes() {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("tiny")
        .expect("load")
        .build(dir.path())
        .expect("build");
    let tree = git(built.path(), &["ls-tree", "-r", "--name-only", "HEAD"]);
    assert_eq!(tree, "src/a.ts\nsrc/c.ts\n");
    let changes = git(
        built.path(),
        &[
            "diff-tree",
            "-r",
            "-M",
            "--name-status",
            "--no-commit-id",
            "HEAD",
        ],
    );
    assert_eq!(changes, "D\tdocs/readme.md\nR100\tsrc/b.ts\tsrc/c.ts\n");
}

#[test]
fn overlay_commits_keep_files_of_previous_commits() {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("tiny")
        .expect("load")
        .build(dir.path())
        .expect("build");
    let sha = built.sha("edit").expect("sha");
    let tree = git(built.path(), &["ls-tree", "-r", "--name-only", sha]);
    assert_eq!(tree, "docs/readme.md\nsrc/a.ts\nsrc/b.ts\n");
}

#[test]
fn branch_field_puts_commits_on_a_named_branch() {
    let root = TempDir::new().expect("tmp");
    let fx = write_fixture(
        root.path(),
        r#"commits:
  - id: one
    message: "one"
    date: "2024-02-01T10:00:00Z"
  - id: two
    message: "two"
    branch: feat/x
    date: "2024-02-02T10:00:00Z"
"#,
        &[("one/f.txt", "1\n"), ("two/g.txt", "2\n")],
    );
    let out = TempDir::new().expect("tmp");
    let built = Fixture::load_from(&fx)
        .expect("load")
        .build(out.path())
        .expect("build");
    let main = git(built.path(), &["rev-parse", "main"]);
    let feat = git(built.path(), &["rev-parse", "feat/x"]);
    assert_eq!(main.trim(), built.sha("one").expect("sha"));
    assert_eq!(feat.trim(), built.sha("two").expect("sha"));
    let parent = git(built.path(), &["rev-parse", "feat/x^"]);
    assert_eq!(parent.trim(), built.sha("one").expect("sha"));
    let tree = git(built.path(), &["ls-tree", "-r", "--name-only", "feat/x"]);
    assert_eq!(tree, "f.txt\ng.txt\n");
}

#[test]
fn build_with_worktree_leaves_dirty_state() {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("tiny")
        .expect("load")
        .build_with_worktree(dir.path(), |wt| {
            fs::write(wt.join("src/a.ts"), "// unstaged edit\n").expect("edit");
            fs::write(wt.join("src/c.ts"), "// staged edit\n").expect("edit");
            git(wt, &["add", "src/c.ts"]);
            fs::write(wt.join("notes.txt"), "untracked\n").expect("untracked");
        })
        .expect("build");
    let status = git(built.path(), &["status", "--porcelain"]);
    assert_eq!(status, " M src/a.ts\nM  src/c.ts\n?? notes.txt\n");
    let head = git(built.path(), &["rev-parse", "HEAD"]);
    assert_eq!(head.trim(), built.sha("reshape").expect("sha"));
}

#[test]
fn unknown_fixture_error_names_the_file() {
    let err = Fixture::load("does-not-exist").expect_err("must fail");
    let msg = err.to_string();
    assert!(
        msg.contains("fixtures/does-not-exist/fixture.yaml"),
        "{msg}"
    );
}

#[test]
fn missing_field_error_names_file_and_field() {
    let root = TempDir::new().expect("tmp");
    let fx = write_fixture(
        root.path(),
        "commits:\n  - id: one\n    date: \"2024-02-01T10:00:00Z\"\n",
        &[],
    );
    let msg = Fixture::load_from(&fx).expect_err("must fail").to_string();
    assert!(msg.contains("fixture.yaml"), "{msg}");
    assert!(msg.contains("message"), "{msg}");
}

#[test]
fn invalid_date_error_names_file_and_field() {
    let root = TempDir::new().expect("tmp");
    let fx = write_fixture(
        root.path(),
        "commits:\n  - id: one\n    message: m\n    date: \"not a date\"\n",
        &[],
    );
    let msg = Fixture::load_from(&fx).expect_err("must fail").to_string();
    assert!(msg.contains("fixture.yaml"), "{msg}");
    assert!(msg.contains("date"), "{msg}");
}

/// A commit may carry an `author` (a name; the email is `<name>@relief.invalid`); without it the
/// fixed `Fixture <fixture@relief.invalid>` author applies.
#[test]
fn a_commit_author_overrides_the_fixed_author() {
    let dir = TempDir::new().expect("tmp");
    let tmp = TempDir::new().expect("tmp");
    let fixture_dir = write_fixture(
        tmp.path(),
        "commits:\n  - id: a\n    message: \"one\"\n    date: \"2024-01-01T10:00:00Z\"\n    author: bob\n  - id: b\n    message: \"two\"\n    date: \"2024-01-02T10:00:00Z\"\n",
        &[("a/f.txt", "1"), ("b/f.txt", "2")],
    );
    let built = Fixture::load_from(&fixture_dir)
        .expect("load")
        .build(dir.path())
        .expect("build");
    let log = git(built.path(), &["log", "--format=%s|%an <%ae>|%cn", "main"]);
    assert_eq!(
        log,
        "two|Fixture <fixture@relief.invalid>|Fixture\none|bob <bob@relief.invalid>|bob\n"
    );
}

#[test]
fn churn_fixture_has_six_dated_commits_by_bob_and_carol() {
    let dir = TempDir::new().expect("tmp");
    let built = Fixture::load("churn")
        .expect("load churn")
        .build(dir.path())
        .expect("build");
    let log = git(built.path(), &["log", "--format=%an|%aI", "main"]);
    assert_eq!(
        log,
        "bob|2024-06-30T10:00:00Z\n\
         carol|2024-06-01T10:00:00Z\n\
         bob|2024-05-10T10:00:00Z\n\
         bob|2024-04-10T10:00:00Z\n\
         carol|2024-02-01T10:00:00Z\n\
         bob|2024-01-10T10:00:00Z\n"
    );
}
