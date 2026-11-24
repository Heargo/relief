//! Seam 1 of ticket 09: which changed files are `format_only` when no adapter reads them.
//!
//! A `.java` or Angular `.html` file is only seen by the generic detector (a file node, no symbol).
//! It is `format_only` when its text is the same on both sides once the blanks (spaces, tabs,
//! line breaks) are removed; a real text change, a comment included, is not. A file an adapter
//! reads keeps rule E05 (`client.ts` of acme-shop).
//!
//! The same in a workspace (`repo:<name>/<path>` paths).
//!
//! API expected: `DiffResponse.format_only_paths: Vec<String>`, the paths of the
//! `format_only` files (same paths as `diff.files`), next to `format_only` (counts).

mod common;

use std::fs;
use std::path::Path;
use std::process::Command;

use common::*;
use relief_app::{DiffRequest, RangeSpec, ReviewSummaryRequest, Session};
use relief_fixtures::Fixture;
use tempfile::TempDir;

const CLIENT: &str = "packages/shared/http/client.ts";

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

/// acme-shop with `path` committed as `before`, then rewritten as `after` in the working tree.
fn edited(path: &'static str, before: &'static str, after: &'static str) -> (Acme, Session) {
    let acme = build(move |repo| {
        let file = repo.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, before).unwrap();
        git(repo, &["add", path]);
        git(
            repo,
            &["commit", "-q", "-m", "chore: add an unanalysed file"],
        );
        fs::write(&file, after).unwrap();
    });
    let session = Session::open(&acme.path, options(None)).unwrap();
    (acme, session)
}

fn worktree() -> DiffRequest {
    DiffRequest {
        range: None,
        budget: None,
        expand: vec![],
    }
}

const JAVA: &str = "src/main/java/shop/Total.java";
const HTML: &str = "src/app/orders.component.html";
const JAVA_BEFORE: &str =
    "class Total {\n    int sum(int a, int b) {\n        return a + b;\n    }\n}\n";
const HTML_BEFORE: &str = "<ul>\n  <li *ngFor=\"let o of orders\">{{ o.id }}</li>\n</ul>\n";

#[test]
fn a_java_file_whose_text_really_changes_is_not_format_only() {
    let (_acme, session) = edited(
        JAVA,
        JAVA_BEFORE,
        "class Total {\n    int sum(int a, int b) {\n        return a * b;\n    }\n}\n",
    );
    let response = session.diff(&worktree()).unwrap();
    assert!(response.diff.files.iter().any(|f| f.path == JAVA));
    assert_eq!(response.format_only.files, 0);
    assert_eq!(response.format_only.lines_added, 0);
    assert_eq!(response.format_only.lines_removed, 0);
    assert!(response.format_only_paths.is_empty());
    let summary = session
        .review_summary(&ReviewSummaryRequest { range: None })
        .unwrap();
    assert!(summary.format_only_files.is_empty());
}

#[test]
fn a_java_file_that_only_changes_indentation_is_format_only() {
    let (_acme, session) = edited(
        JAVA,
        JAVA_BEFORE,
        "class Total {\n\tint sum(int a, int b) {\n\t\treturn a + b;\n\t}\n}\n",
    );
    let response = session.diff(&worktree()).unwrap();
    assert_eq!(response.format_only.files, 1);
    assert_eq!(response.format_only.lines_added, 3);
    assert_eq!(response.format_only.lines_removed, 3);
    assert_eq!(response.format_only_paths, [JAVA]);
    let summary = session
        .review_summary(&ReviewSummaryRequest { range: None })
        .unwrap();
    assert_eq!(summary.format_only_files.len(), 1);
    assert_eq!(summary.format_only_files[0].path, JAVA);
}

#[test]
fn a_java_file_reflowed_over_other_lines_is_format_only() {
    let (_acme, session) = edited(
        JAVA,
        JAVA_BEFORE,
        "class Total { int sum(int a,\n int b) {\n return a + b; } }\n",
    );
    let response = session.diff(&worktree()).unwrap();
    assert_eq!(response.format_only_paths, [JAVA]);
}

#[test]
fn a_changed_angular_template_is_not_format_only() {
    let (_acme, session) = edited(
        HTML,
        HTML_BEFORE,
        "<ul>\n  <li *ngFor=\"let o of orders\">{{ o.total }}</li>\n</ul>\n",
    );
    let response = session.diff(&worktree()).unwrap();
    assert!(response.diff.files.iter().any(|f| f.path == HTML));
    assert!(response.format_only_paths.is_empty());
    assert_eq!(response.format_only.files, 0);
}

#[test]
fn a_comment_added_to_an_unanalysed_file_is_not_format_only() {
    let (_acme, session) = edited(
        JAVA,
        JAVA_BEFORE,
        "// sums both sides\nclass Total {\n    int sum(int a, int b) {\n        return a + b;\n    }\n}\n",
    );
    let response = session.diff(&worktree()).unwrap();
    assert!(response.format_only_paths.is_empty());
}

const MD: &str = "docs/guide.md";
const MD_BEFORE: &str = "# Guide\n\nRun the tool.\n\n- first\n- second\n";

#[test]
fn a_markdown_file_whose_text_really_changes_is_not_format_only() {
    let (_acme, session) = edited(
        MD,
        MD_BEFORE,
        "# Guide\n\nRun the tool twice.\n\n- first\n- second\n",
    );
    let response = session.diff(&worktree()).unwrap();
    assert!(response.diff.files.iter().any(|f| f.path == MD));
    assert!(response.format_only_paths.is_empty());
    assert_eq!(response.format_only.files, 0);
}

#[test]
fn a_markdown_file_that_only_changes_indentation_and_trailing_spaces_is_format_only() {
    let (_acme, session) = edited(
        MD,
        MD_BEFORE,
        "# Guide\n\nRun the tool.   \n\n  - first\n  - second  \n",
    );
    let response = session.diff(&worktree()).unwrap();
    assert_eq!(response.format_only_paths, [MD]);
    assert_eq!(response.format_only.files, 1);
}

#[test]
fn the_prettier_commit_of_acme_shop_keeps_client_ts_format_only() {
    let (_acme, session) = acme();
    let response = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::parse(RANGE).unwrap()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(response.format_only_paths, [CLIENT]);
    assert_eq!(response.format_only.files, 1);
}

/// shop-web and shop-api as workspace `shop`: `api` gets a Java file and `web` an Angular
/// template on main, then `edit_api` / `edit_web` rewrite them on their source branch.
fn space(api_java: &str, web_html: &str) -> (TempDir, Session) {
    let dir = TempDir::new().unwrap();
    let root = dir.path();
    for (name, file, before, after, branch) in [
        ("shop-api", JAVA, JAVA_BEFORE, api_java, "feat/order-total"),
        ("shop-web", HTML, HTML_BEFORE, web_html, "feat/order-badge"),
    ] {
        let repo = root.join(name);
        Fixture::load(name).unwrap().build(&repo).unwrap();
        let path = repo.join(file);
        git(&repo, &["checkout", "-q", "main"]);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, before).unwrap();
        git(&repo, &["add", file]);
        git(
            &repo,
            &["commit", "-q", "-m", "chore: add an unanalysed file"],
        );
        git(&repo, &["checkout", "-q", branch]);
        git(&repo, &["rebase", "-q", "main"]);
        fs::write(&path, after).unwrap();
        git(&repo, &["add", file]);
        git(&repo, &["commit", "-q", "-m", "edit it"]);
    }
    let ws = root.join("space");
    fs::create_dir(&ws).unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tests/fixtures/shop-space/shop.relief.json");
    fs::copy(source, ws.join("shop.relief.json")).unwrap();
    let session = Session::open_workspace(&ws, options(None)).unwrap();
    (dir, session)
}

#[test]
fn in_a_workspace_a_changed_java_file_is_not_format_only_but_a_reindented_template_is() {
    let (_dir, session) = space(
        "class Total {\n    int sum(int a, int b) {\n        return a * b;\n    }\n}\n",
        "<ul>\n\t<li *ngFor=\"let o of orders\">{{ o.id }}</li>\n</ul>\n",
    );
    let response = session.diff(&DiffRequest::default()).unwrap();
    let paths: Vec<&str> = response
        .diff
        .files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    assert!(
        paths.contains(&"repo:api/src/main/java/shop/Total.java"),
        "{paths:?}"
    );
    assert!(
        paths.contains(&"repo:web/src/app/orders.component.html"),
        "{paths:?}"
    );
    assert_eq!(
        response.format_only_paths,
        ["repo:web/src/app/orders.component.html"]
    );
    let summary = session
        .review_summary(&ReviewSummaryRequest { range: None })
        .unwrap();
    let only: Vec<&str> = summary
        .format_only_files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    assert_eq!(only, ["repo:web/src/app/orders.component.html"]);
}
