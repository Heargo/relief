//! Seam 1 of ticket U19 (pick base and head), on acme-shop.
//!
//! API expected: `Session::log(rev: &str, limit: usize, query: Option<&str>) ->
//! Result<Vec<LogEntry>, AppError>` with `LogEntry { sha: String (full), short: String (7
//! chars), subject: String (first line), author: String, time: i64 (author time, Unix
//! seconds) }`, first parent only, newest first, filtered on sha (prefix) and subject
//! (case-insensitive substring).

mod common;

use common::*;
use relief_app::LogEntry;

fn subjects(entries: &[LogEntry]) -> Vec<&str> {
    entries.iter().map(|e| e.subject.as_str()).collect()
}

#[test]
fn the_log_of_the_pr_branch_lists_its_commits_newest_first() {
    let (_acme, session) = acme();
    let entries = session.log("feat/promo-codes", 50, None).unwrap();
    assert_eq!(
        subjects(&entries),
        [
            "feat(checkout): champ code promo et route /promo/validate",
            "refactor: formatPrice déplacé dans shared (+ prettier)",
            "refactor(auth): refresh() renvoie null au lieu de lever",
            "feat(billing): remise dans computeTotal",
            "feat(db): table discounts et repo",
            "chore: acme-shop before the promo codes pull request",
        ]
    );
}

#[test]
fn an_entry_carries_sha_short_author_and_time() {
    let (acme, session) = acme();
    let entries = session.log("feat/promo-codes", 50, None).unwrap();
    let auth = acme.repo.sha("auth").unwrap();
    let entry = entries.iter().find(|e| e.sha == auth).unwrap();
    assert_eq!(entry.short, auth[..7]);
    assert_eq!(
        entry.subject,
        "refactor(auth): refresh() renvoie null au lieu de lever"
    );
    assert!(!entry.author.is_empty());
    // 2024-03-06T10:00:00Z
    assert_eq!(entry.time, 1_709_719_200);
}

#[test]
fn the_log_of_main_is_the_base_commit_alone() {
    let (_acme, session) = acme();
    let entries = session.log("main", 50, None).unwrap();
    assert_eq!(
        subjects(&entries),
        ["chore: acme-shop before the promo codes pull request"]
    );
}

#[test]
fn limit_keeps_the_newest_commits() {
    let (_acme, session) = acme();
    let entries = session.log("feat/promo-codes", 2, None).unwrap();
    assert_eq!(
        subjects(&entries),
        [
            "feat(checkout): champ code promo et route /promo/validate",
            "refactor: formatPrice déplacé dans shared (+ prettier)",
        ]
    );
}

#[test]
fn the_query_filters_on_the_subject() {
    let (_acme, session) = acme();
    let entries = session
        .log("feat/promo-codes", 50, Some("REFACTOR"))
        .unwrap();
    assert_eq!(
        subjects(&entries),
        [
            "refactor: formatPrice déplacé dans shared (+ prettier)",
            "refactor(auth): refresh() renvoie null au lieu de lever",
        ]
    );
}

#[test]
fn the_query_filters_on_the_sha() {
    let (acme, session) = acme();
    let discount = acme.repo.sha("discount").unwrap();
    let entries = session
        .log("feat/promo-codes", 50, Some(&discount[..9]))
        .unwrap();
    assert_eq!(
        subjects(&entries),
        ["feat(billing): remise dans computeTotal"]
    );
}

#[test]
fn the_limit_applies_after_the_filter() {
    let (_acme, session) = acme();
    let entries = session.log("feat/promo-codes", 1, Some("feat(")).unwrap();
    assert_eq!(
        subjects(&entries),
        ["feat(checkout): champ code promo et route /promo/validate"]
    );
}

#[test]
fn an_unknown_revision_is_an_error() {
    let (_acme, session) = acme();
    assert!(session.log("no-such-branch", 10, None).is_err());
}
