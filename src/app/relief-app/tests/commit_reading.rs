//! Seam 1 of ticket R06 (reading order by commit), on acme-shop `main...feat/promo-codes`.
//!
//! API expected: `Session::commit_reading(&CommitReadingRequest { range: Option<RangeSpec> })
//! -> Result<CommitReadingResponse, AppError>` with `CommitReadingResponse { commits:
//! Vec<CommitReadingEntry> }`, oldest commit first, and `CommitReadingEntry { commit: String
//! (full sha), short: String (7 chars), message: String, files: Vec<ReadingItem> (files with a
//! structural change), other_files: usize }`. Also: `RangeSpec::parse("<parent>..<commit>")`
//! and `Session::diff` on it.

mod common;

use common::*;
use relief_app::{CommitReadingRequest, DiffRequest, RangeSpec};

const SESSION_FILE: &str = "pkg:@acme/api/auth::file:apps/api/auth/session.ts";
const PAYMENT_FILE: &str = "pkg:@acme/api/billing::file:apps/api/billing/payment.ts";

fn request() -> CommitReadingRequest {
    CommitReadingRequest {
        range: Some(RangeSpec::parse(RANGE).unwrap()),
    }
}

#[test]
fn the_range_lists_its_five_commits_oldest_first_with_sha_and_message() {
    let (acme, session) = acme();
    let commits = session.commit_reading(&request()).unwrap().commits;

    let messages: Vec<&str> = commits.iter().map(|c| c.message.as_str()).collect();
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
    let auth = acme.repo.sha("auth").unwrap();
    assert_eq!(commits[2].commit, auth);
    assert_eq!(commits[2].short, auth[..7]);
}

#[test]
fn the_auth_commit_reads_session_and_payment_and_nothing_else() {
    let (_acme, session) = acme();
    let commits = session.commit_reading(&request()).unwrap().commits;
    let auth = &commits[2];

    let mut files: Vec<String> = auth.files.iter().map(|f| f.id.to_string()).collect();
    files.sort();
    assert_eq!(files, [SESSION_FILE, PAYMENT_FILE].map(String::from));
    assert_eq!(auth.other_files, 0);
}

#[test]
fn the_formatting_only_files_of_the_move_commit_are_counted_not_listed() {
    let (_acme, session) = acme();
    let commits = session.commit_reading(&request()).unwrap().commits;
    let moved = &commits[3];

    assert!(
        moved.other_files >= 1,
        "the prettier pass touches client.ts"
    );
    assert!(
        moved
            .files
            .iter()
            .all(|f| !f.id.to_string().ends_with("packages/shared/http/client.ts"))
    );
}

#[test]
fn a_range_of_one_commit_has_one_entry() {
    let (acme, session) = acme();
    let spec = format!(
        "{}..{}",
        acme.repo.sha("discount").unwrap(),
        acme.repo.sha("auth").unwrap()
    );
    let response = session
        .commit_reading(&CommitReadingRequest {
            range: Some(RangeSpec::parse(&spec).unwrap()),
        })
        .unwrap();
    assert_eq!(response.commits.len(), 1);
    assert_eq!(response.commits[0].commit, acme.repo.sha("auth").unwrap());
}

#[test]
fn diff_accepts_one_commit_as_parent_dot_dot_commit() {
    let (acme, session) = acme();
    let spec = format!(
        "{}..{}",
        acme.repo.sha("discount").unwrap(),
        acme.repo.sha("auth").unwrap()
    );
    let response = session
        .diff(&DiffRequest {
            range: Some(RangeSpec::parse(&spec).unwrap()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let mut paths: Vec<&str> = response
        .diff
        .files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    paths.sort();
    assert_eq!(
        paths,
        ["apps/api/auth/session.ts", "apps/api/billing/payment.ts"]
    );
}
