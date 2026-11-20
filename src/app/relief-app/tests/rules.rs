//! Seam 2 of ticket 01: `Session::rules` reads `relief.config.yaml` at the head ref.

mod common;

use std::fs;
use std::path::Path;
use std::process::Command;

use common::*;
use relief_app::{RangeSpec, Session, SnapshotRequest};
use relief_fixtures::Fixture;
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

#[test]
fn acme_shop_config_gives_three_rules() {
    let (_acme, session) = acme();
    let response = session.rules(&RangeSpec::parse(RANGE).unwrap()).unwrap();
    let ids: Vec<&str> = response.rules.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(
        ids,
        ["web-sans-db", "packages-sans-apps", "routes-via-repos"]
    );
    assert_eq!(response.rules[0].from, "apps/web/**");
    assert_eq!(response.rules[0].deny, "packages/db/**");
}

#[test]
fn the_source_text_of_the_file_is_returned() {
    let (_acme, session) = acme();
    let response = session.rules(&RangeSpec::parse(RANGE).unwrap()).unwrap();
    let source = response.source.expect("the file exists");
    assert!(
        source.starts_with("# relief.config.yaml\nrules:\n"),
        "{source}"
    );
    assert!(source.contains("id: routes-via-repos"));
}

#[test]
fn rules_come_from_the_head_ref_not_the_base() {
    let acme = build(|repo| {
        fs::write(
            repo.join("relief.config.yaml"),
            "rules:\n  - id: only-on-head\n    from: a/**\n    deny: b/**\n",
        )
        .unwrap();
        git(repo, &["add", "relief.config.yaml"]);
        git(repo, &["commit", "-q", "-m", "chore: change the rules"]);
    });
    let session = Session::open(&acme.path, options(None)).unwrap();
    let head = session.rules(&RangeSpec::parse(RANGE).unwrap()).unwrap();
    let ids: Vec<&str> = head.rules.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(ids, ["only-on-head"]);
}

#[test]
fn no_config_file_means_no_rules_and_no_error() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("tiny");
    Fixture::load("tiny").unwrap().build(&path).unwrap();
    let session = Session::open(&path, options(None)).unwrap();
    let response = session
        .rules(&RangeSpec::parse("HEAD~1..HEAD").unwrap())
        .unwrap();
    assert!(response.rules.is_empty());
    assert_eq!(response.source, None);
}

#[test]
fn an_invalid_config_is_an_error_citing_the_line() {
    let acme = build(|repo| {
        fs::write(
            repo.join("relief.config.yaml"),
            "rules:\n  - id: a\n    from: x/**\n    deny: \"[abc\"\n",
        )
        .unwrap();
        git(repo, &["add", "relief.config.yaml"]);
        git(repo, &["commit", "-q", "-m", "chore: broken rules"]);
    });
    let session = Session::open(&acme.path, options(None)).unwrap();
    let err = session
        .rules(&RangeSpec::parse(RANGE).unwrap())
        .unwrap_err();
    assert!(err.to_string().contains("line 4"), "{err}");
}

#[test]
fn exclude_removes_files_from_the_snapshot() {
    let acme = build(|repo| {
        fs::write(
            repo.join("relief.config.yaml"),
            "exclude:\n  - apps/api/billing/discount.ts\nrules: []\n",
        )
        .unwrap();
        git(repo, &["add", "relief.config.yaml"]);
        git(repo, &["commit", "-q", "-m", "chore: exclude discount.ts"]);
    });
    let session = Session::open(&acme.path, options(None)).unwrap();
    let snapshot = session
        .snapshot(&SnapshotRequest {
            rev: "HEAD".to_owned(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let dump = format!("{:?}", snapshot.graph);
    assert!(!dump.contains("discount.ts"), "excluded file still indexed");
    assert!(dump.contains("invoice.ts"), "the rest is still indexed");
}
