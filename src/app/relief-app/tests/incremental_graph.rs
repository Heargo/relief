//! Seam of ticket S11: the graph built from a known base (`Indexer::snapshot_from`) is the
//! graph indexed in full, for every commit of the fixtures and for the working tree.
//!
//! Interface expected from `relief_index::Indexer`:
//! `snapshot_from(&self, source: &GitSource, base_commit: &CommitId, base: &IndexedSnapshot,
//! commit: &CommitId) -> Result<IndexedSnapshot, IndexError>`: only the files that differ
//! between the two trees are extracted again, and only those and the files whose import
//! resolution may change are linked again; a change of a `tsconfig*.json` or a
//! `package.json` falls back to a full indexing.

use std::fs;
use std::path::Path;
use std::process::Command;

use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_git::{CommitId, GitSource};
use relief_index::{IndexedSnapshot, Indexer};
use relief_lang_ts::TsAdapter;
use tempfile::TempDir;

fn indexer() -> Indexer {
    Indexer::new("repo")
        .with_detectors(default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
}

/// What must not depend on the way the snapshot was built (not the parse counters).
fn shape(indexed: &IndexedSnapshot) -> String {
    let meta = &indexed.meta;
    format!(
        "{}\n{} {:?} {} {:?}\n{}",
        serde_json::to_string(&indexed.graph).unwrap(),
        meta.detector,
        meta.adapters,
        meta.ignored_files,
        meta.warnings,
        meta.commit,
    )
}

/// The graph without its commit id: sorted nodes (id, content hash) and edges.
fn content(indexed: &IndexedSnapshot) -> String {
    let mut nodes: Vec<String> = indexed
        .graph
        .nodes()
        .iter()
        .map(|n| format!("{} {}", n.id, n.content_hash))
        .collect();
    let mut edges: Vec<String> = indexed
        .graph
        .edges()
        .iter()
        .map(|e| format!("{} -> {} {:?} {:?}", e.from, e.to, e.kind, e.precision))
        .collect();
    nodes.sort();
    edges.sort();
    format!("{}\n--\n{}", nodes.join("\n"), edges.join("\n"))
}

/// Incremental from `base`, then in full; both serialised, and whether the graph differs
/// from the one of `base` (commit id apart).
fn both(source: &GitSource, base: &CommitId, commit: &CommitId) -> (String, String, bool) {
    let known = indexer().snapshot(source, base).expect("base");
    let incremental = indexer()
        .snapshot_from(source, base, &known, commit)
        .expect("incremental");
    let full = indexer().snapshot(source, commit).expect("full");
    let changed = content(&known) != content(&full);
    (shape(&incremental), shape(&full), changed)
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .output()
        .expect("git");
    assert!(out.status.success(), "git {args:?}");
    String::from_utf8(out.stdout).expect("utf8")
}

/// Every commit of every branch with its first parent.
fn commits_with_parent(dir: &Path) -> Vec<(String, String)> {
    git(dir, &["log", "--all", "--format=%H %P"])
        .lines()
        .filter_map(|line| {
            let mut ids = line.split_whitespace();
            Some((ids.next()?.to_owned(), ids.next()?.to_owned()))
        })
        .collect()
}

fn every_commit_equals_its_full_index(fixture: &str) {
    let dir = TempDir::new().expect("tmp");
    Fixture::load(fixture)
        .expect("load")
        .build(dir.path())
        .expect("build");
    let source = GitSource::open(dir.path()).expect("open");
    let pairs = commits_with_parent(dir.path());
    assert!(!pairs.is_empty(), "{fixture} has commits with a parent");
    for (commit, parent) in pairs {
        let (incremental, full, _) = both(
            &source,
            &source.resolve(&parent).unwrap(),
            &source.resolve(&commit).unwrap(),
        );
        assert_eq!(
            incremental, full,
            "{fixture}: {commit} built from {parent} differs from its full index"
        );
    }
}

#[test]
fn acme_shop_every_commit_from_its_parent() {
    every_commit_equals_its_full_index("acme-shop");
}

#[test]
fn tiny_every_commit_from_its_parent() {
    every_commit_equals_its_full_index("tiny");
}

#[test]
fn churn_every_commit_from_its_parent() {
    every_commit_equals_its_full_index("churn");
}

#[test]
fn cochange_every_commit_from_its_parent() {
    every_commit_equals_its_full_index("cochange");
}

#[test]
fn acme_shop_main_to_the_feature_branch() {
    let dir = TempDir::new().expect("tmp");
    Fixture::load("acme-shop")
        .expect("load")
        .build(dir.path())
        .expect("build");
    let source = GitSource::open(dir.path()).expect("open");
    let (incremental, full, changed) = both(
        &source,
        &source.resolve("main").unwrap(),
        &source.resolve("feat/promo-codes").unwrap(),
    );
    assert_eq!(incremental, full);
    assert!(changed, "the range changes the graph");
}

/// Builds `fixture`, applies `change` to the working tree, and checks the graph built from
/// HEAD against the one indexed in full.
fn worktree_equals_full_index(fixture: &str, change: impl FnOnce(&Path)) {
    let dir = TempDir::new().expect("tmp");
    Fixture::load(fixture)
        .expect("load")
        .build_with_worktree(dir.path(), change)
        .expect("build");
    let source = GitSource::open(dir.path()).expect("open");
    let (incremental, full, changed) = both(
        &source,
        &source.resolve("HEAD").unwrap(),
        &source.resolve("WORKTREE").unwrap(),
    );
    assert_eq!(incremental, full, "{fixture}: worktree from HEAD");
    assert!(changed, "{fixture}: the change shows in the graph");
}

fn write(root: &Path, path: &str, text: &str) {
    let file = root.join(path);
    fs::create_dir_all(file.parent().expect("parent")).expect("mkdir");
    fs::write(file, text).expect("write");
}

fn append(root: &Path, path: &str, text: &str) {
    let mut current = fs::read_to_string(root.join(path)).expect("read");
    current.push_str(text);
    write(root, path, &current);
}

#[test]
fn worktree_with_a_modified_file() {
    worktree_equals_full_index("acme-shop", |root| {
        append(
            root,
            "apps/api/billing/invoice.ts",
            "\nexport function addedInTheWorktree(): number {\n  return 1;\n}\n",
        );
    });
}

#[test]
fn worktree_with_a_modified_import_list() {
    worktree_equals_full_index("acme-shop", |root| {
        append(
            root,
            "apps/api/billing/invoice.ts",
            "\nimport { formatPrice } from \"@acme/shared/money\";\nexport const label = formatPrice;\n",
        );
    });
}

#[test]
fn worktree_with_an_added_file() {
    worktree_equals_full_index("acme-shop", |root| {
        write(
            root,
            "apps/api/billing/tax.ts",
            "import { computeTotal } from \"./invoice\";\nexport function tax() {\n  return computeTotal;\n}\n",
        );
    });
}

#[test]
fn worktree_with_a_deleted_file_still_imported() {
    worktree_equals_full_index("acme-shop", |root| {
        fs::remove_file(root.join("apps/api/billing/discount.ts")).expect("rm");
    });
}

#[test]
fn worktree_with_a_moved_file_still_imported() {
    worktree_equals_full_index("acme-shop", |root| {
        fs::create_dir_all(root.join("apps/api/pricing")).expect("mkdir");
        fs::rename(
            root.join("apps/api/billing/discount.ts"),
            root.join("apps/api/pricing/discount.ts"),
        )
        .expect("mv");
    });
}

#[test]
fn worktree_with_an_added_file_that_an_unchanged_importer_already_names() {
    // src/app.ts imports "./missing", unresolved at HEAD: adding the file resolves it.
    worktree_equals_full_index("ts-imports", |root| {
        write(root, "src/missing.ts", "export const nope = 1;\n");
    });
}

#[test]
fn worktree_with_a_deleted_file_that_an_unchanged_importer_names() {
    worktree_equals_full_index("ts-imports", |root| {
        fs::remove_file(root.join("src/util.ts")).expect("rm");
    });
}

#[test]
fn worktree_with_a_renamed_file_that_an_unchanged_importer_names() {
    worktree_equals_full_index("ts-imports", |root| {
        fs::rename(root.join("src/util.ts"), root.join("src/helpers.ts")).expect("mv");
    });
}

#[test]
fn worktree_with_an_added_index_file_that_shadows_a_resolution() {
    // "./widgets" resolves to src/widgets/index.ts; a sibling src/widgets.ts wins.
    worktree_equals_full_index("ts-imports", |root| {
        write(root, "src/widgets.ts", "export const Widget = () => 1;\n");
    });
}

#[test]
fn worktree_with_a_modified_tsconfig() {
    worktree_equals_full_index("ts-imports", |root| {
        write(
            root,
            "tsconfig.base.json",
            "{ \"compilerOptions\": { \"baseUrl\": \".\", \"paths\": { \"@lib/*\": [\"src/*\"] } } }\n",
        );
    });
}

#[test]
fn worktree_with_a_modified_root_tsconfig() {
    worktree_equals_full_index("acme-shop", |root| {
        let text = fs::read_to_string(root.join("tsconfig.json")).expect("read");
        write(
            root,
            "tsconfig.json",
            &text.replace(
                "\"@acme/*\": [\"./packages/*\"]",
                "\"@acme/*\": [\"./apps/*\"]",
            ),
        );
    });
}

#[test]
fn worktree_with_a_modified_package_json() {
    worktree_equals_full_index("ts-imports", |root| {
        let text = fs::read_to_string(root.join("packages/ui/package.json")).expect("read");
        write(
            root,
            "packages/ui/package.json",
            &text.replace("\"name\": \"", "\"name\": \"renamed-"),
        );
    });
}

#[test]
fn worktree_with_a_renamed_workspace_package() {
    worktree_equals_full_index("acme-shop", |root| {
        let text = fs::read_to_string(root.join("packages/db/package.json")).expect("read");
        write(
            root,
            "packages/db/package.json",
            &text.replace("@acme/db", "@acme/database"),
        );
    });
}

#[test]
fn worktree_with_a_modified_extended_json_that_is_not_named_like_a_tsconfig() {
    // tsconfig.json extends ./paths.json (committed), then paths.json changes in the worktree.
    worktree_equals_full_index("ts-imports", |root| {
        write(
            root,
            "tsconfig.json",
            "{ \"extends\": \"./paths.json\", \"include\": [\"src\", \"libs\", \"packages\"] }\n",
        );
        write(
            root,
            "paths.json",
            "{ \"compilerOptions\": { \"baseUrl\": \".\", \"paths\": { \"@lib/*\": [\"libs/*\"] } } }\n",
        );
        git(root, &["add", "-A"]);
        git(
            root,
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "-q",
                "-m",
                "extend paths.json",
            ],
        );
        write(
            root,
            "paths.json",
            "{ \"compilerOptions\": { \"baseUrl\": \".\", \"paths\": { \"@lib/*\": [\"src/*\"] } } }\n",
        );
    });
}
