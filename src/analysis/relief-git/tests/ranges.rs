use std::fmt::Write as _;
use std::path::Path;
use std::process::Command;

use relief_fixtures::{BuiltRepo, Fixture};
use relief_git::{FileChange, FileStatus, GitSource, RevSpec};
use tempfile::TempDir;

fn build(name: &str) -> (TempDir, BuiltRepo) {
    let dir = TempDir::new().unwrap();
    let built = Fixture::load(name).unwrap().build(dir.path()).unwrap();
    (dir, built)
}

fn git(repo: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@relief.invalid")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_COMMITTER_EMAIL", "fixture@relief.invalid")
        .env("GIT_AUTHOR_DATE", "2024-01-04T10:00:00 +0000")
        .env("GIT_COMMITTER_DATE", "2024-01-04T10:00:00 +0000")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// `tiny` (init, edit, reshape on main) plus a branch `feat` forked at
/// `edit` with one commit adding `src/feat.ts`; main has moved on to
/// `reshape` since the fork.
fn tiny_diverged() -> (TempDir, BuiltRepo) {
    let (dir, built) = build("tiny");
    let repo = dir.path();
    git(
        repo,
        &["checkout", "-q", "-b", "feat", built.sha("edit").unwrap()],
    );
    std::fs::write(
        repo.join("src/feat.ts"),
        "export const feat = 1;\nexport const feat2 = 2;\n",
    )
    .unwrap();
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-q", "-m", "feat: add feat.ts"]);
    git(repo, &["checkout", "-q", "main"]);
    (dir, built)
}

fn render(changes: &[FileChange]) -> String {
    let mut out = String::new();
    for c in changes {
        match &c.status {
            FileStatus::Added => write!(out, "A  {}", c.path),
            FileStatus::Deleted => write!(out, "D  {}", c.path),
            FileStatus::Modified => write!(out, "M  {}", c.path),
            FileStatus::Renamed { from, similarity } => {
                write!(out, "R{similarity} {from} -> {}", c.path)
            }
        }
        .unwrap();
        writeln!(out, "  +{} -{}", c.lines_added, c.lines_removed).unwrap();
    }
    out
}

fn range(source: &GitSource, text: &str) -> relief_git::ResolvedRange {
    source
        .resolve_range(&RevSpec::parse(text).unwrap())
        .unwrap()
}

#[test]
fn merge_base_of_diverged_branches_is_the_fork_point() {
    let (dir, built) = tiny_diverged();
    let source = GitSource::open(dir.path()).unwrap();
    let main = source.resolve("main").unwrap();
    let feat = source.resolve("feat").unwrap();
    let base = source.merge_base(&main, &feat).unwrap();
    assert_eq!(base, built.sha("edit").unwrap());
    assert_eq!(source.merge_base(&feat, &main).unwrap(), base);
}

#[test]
fn merge_base_of_an_ancestor_is_the_ancestor() {
    let (dir, built) = build("tiny");
    let source = GitSource::open(dir.path()).unwrap();
    let init = source.resolve(built.sha("init").unwrap()).unwrap();
    let head = source.resolve("HEAD").unwrap();
    assert_eq!(source.merge_base(&init, &head).unwrap(), init);
}

#[test]
fn two_dots_compare_the_trees_as_they_are() {
    let (dir, built) = tiny_diverged();
    let source = GitSource::open(dir.path()).unwrap();
    let r = range(&source, "main..feat");
    assert_eq!(r.old, built.sha("reshape").unwrap());
    assert_eq!(r.new, source.resolve("feat").unwrap());
    let changes = source.diff_trees(&r.old, &r.new).unwrap();
    assert_eq!(
        render(&changes),
        "A  docs/readme.md  +3 -0\n\
         R100 src/c.ts -> src/b.ts  +0 -0\n\
         A  src/feat.ts  +2 -0\n"
    );
}

#[test]
fn three_dots_compare_against_the_merge_base() {
    let (dir, built) = tiny_diverged();
    let source = GitSource::open(dir.path()).unwrap();
    let r = range(&source, "main...feat");
    assert_eq!(r.old, built.sha("edit").unwrap());
    assert_eq!(r.new, source.resolve("feat").unwrap());
    let changes = source.diff_trees(&r.old, &r.new).unwrap();
    assert_eq!(render(&changes), "A  src/feat.ts  +2 -0\n");
    let feat = &changes[0];
    assert!(feat.old_blob.is_none());
    assert!(feat.new_blob.is_some());
}

#[test]
fn log_of_a_diverged_range_lists_only_the_branch_commits() {
    let (dir, _) = tiny_diverged();
    let source = GitSource::open(dir.path()).unwrap();
    for text in ["main..feat", "main...feat"] {
        let commits = source.log(&range(&source, text)).unwrap();
        assert_eq!(commits.len(), 1, "{text}");
        assert_eq!(commits[0].message.trim_end(), "feat: add feat.ts");
        assert_eq!(commits[0].author, "Fixture");
        assert_eq!(render(&commits[0].files), "A  src/feat.ts  +2 -0\n");
    }
}

#[test]
fn diff_trees_reports_modified_deleted_and_renamed_files() {
    let (dir, built) = build("tiny");
    let source = GitSource::open(dir.path()).unwrap();
    let init = source.resolve(built.sha("init").unwrap()).unwrap();
    let edit = source.resolve(built.sha("edit").unwrap()).unwrap();
    let reshape = source.resolve(built.sha("reshape").unwrap()).unwrap();
    assert_eq!(
        render(&source.diff_trees(&init, &edit).unwrap()),
        "M  src/a.ts  +4 -0\n"
    );
    assert_eq!(
        render(&source.diff_trees(&edit, &reshape).unwrap()),
        "D  docs/readme.md  +0 -3\n\
         R100 src/b.ts -> src/c.ts  +0 -0\n"
    );
    let changes = source.diff_trees(&init, &edit).unwrap();
    assert!(changes[0].old_blob.is_some() && changes[0].new_blob.is_some());
    assert_ne!(changes[0].old_blob, changes[0].new_blob);
}

#[test]
fn an_unknown_ref_in_a_range_is_an_error() {
    let (dir, _) = tiny_diverged();
    let source = GitSource::open(dir.path()).unwrap();
    let spec = RevSpec::parse("main...nope").unwrap();
    assert!(source.resolve_range(&spec).is_err());
}

#[test]
fn acme_shop_promo_codes_changes_fifteen_files() {
    let (dir, _) = build("acme-shop");
    let source = GitSource::open(dir.path()).unwrap();
    let r = range(&source, "main...feat/promo-codes");
    let changes = source.diff_trees(&r.old, &r.new).unwrap();
    assert_eq!(changes.len(), 15);
    let rename = changes
        .iter()
        .find(|c| c.path == "packages/shared/money/format.ts")
        .expect("format.ts is in the diff");
    assert_eq!(
        rename.status,
        FileStatus::Renamed {
            from: "apps/web/utils/format.ts".to_string(),
            similarity: 100
        }
    );
    assert_eq!(rename.old_blob, rename.new_blob);
    assert!(
        !changes.iter().any(|c| c.path == "apps/web/utils/format.ts"),
        "the old path is not reported on its own"
    );
    let deleted: Vec<_> = changes
        .iter()
        .filter(|c| c.status == FileStatus::Deleted)
        .map(|c| c.path.as_str())
        .collect();
    assert_eq!(deleted, ["apps/api/billing/legacyCoupon.ts"]);
    insta::assert_snapshot!("acme_main_to_promo_codes_changes", render(&changes));
}

#[test]
fn acme_shop_log_gives_the_five_commits_of_the_mockup() {
    let (dir, built) = build("acme-shop");
    let source = GitSource::open(dir.path()).unwrap();
    let commits = source
        .log(&range(&source, "main...feat/promo-codes"))
        .unwrap();
    let ids = ["db", "discount", "auth", "move", "checkout"];
    assert_eq!(commits.len(), 5);
    for (commit, id) in commits.iter().zip(ids) {
        assert_eq!(commit.id, built.sha(id).unwrap(), "chronological order");
        assert!(commit.id.to_string().starts_with(&commit.short));
        assert!(commit.short.len() >= 7);
    }
    let messages: Vec<_> = commits.iter().map(|c| c.message.trim_end()).collect();
    assert_eq!(
        messages,
        [
            "feat(db): table discounts et repo",
            "feat(billing): remise dans computeTotal",
            "refactor(auth): refresh() renvoie null au lieu de lever",
            "refactor: formatPrice déplacé dans shared (+ prettier)",
            "feat(checkout): champ code promo et route /promo/validate",
        ]
    );
    let moved = &commits[3].files;
    assert!(moved.iter().any(|f| f.status
        == FileStatus::Renamed {
            from: "apps/web/utils/format.ts".to_string(),
            similarity: 100
        }
        && f.path == "packages/shared/money/format.ts"));
    let mut text = String::new();
    for c in &commits {
        writeln!(text, "== {}", c.message.trim_end()).unwrap();
        text.push_str(&render(&c.files));
    }
    insta::assert_snapshot!("acme_promo_codes_log", text);
}
