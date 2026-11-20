//! Seam 3: the "prettier" commit of acme-shop (`auth` -> `move`), indexed on
//! both sides with the line counts read from git.

use std::path::Path;

use relief_diff::FileRename;
use relief_diff::{
    FormatOnlySummary, SymbolTexts, diff_graphs_with_renames, format_only_files,
    format_only_summary,
};
use relief_fixtures::Fixture;
use relief_git::{FileStatus, GitSource};
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use relief_model::{FileChange, GraphDiff, GraphSnapshot};
use tempfile::TempDir;

const CLIENT: &str = "packages/shared/http/client.ts";

fn index(source: &GitSource, sha: &str) -> GraphSnapshot {
    let commit = source.resolve(sha).unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(source, &commit)
        .unwrap()
        .graph
}

fn prettier_commit() -> GraphDiff {
    let dir = TempDir::new().unwrap();
    let built = Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let (before, after) = (built.sha("auth").unwrap(), built.sha("move").unwrap());
    let changes = source
        .diff_trees(
            &source.resolve(before).unwrap(),
            &source.resolve(after).unwrap(),
        )
        .unwrap();
    let files: Vec<FileChange> = changes
        .iter()
        .map(|c| FileChange {
            path: c.path.clone(),
            lines_added: c.lines_added,
            lines_removed: c.lines_removed,
        })
        .collect();
    let renames: Vec<FileRename> = changes
        .iter()
        .filter_map(|c| match &c.status {
            FileStatus::Renamed { from, .. } => Some(FileRename {
                from: from.clone(),
                to: c.path.clone(),
            }),
            _ => None,
        })
        .collect();
    diff_graphs_with_renames(
        &index(&source, before),
        &index(&source, after),
        &files,
        &SymbolTexts::default(),
        &renames,
    )
}

#[test]
fn prettier_only_client_ts_is_format_only_with_29_added_and_29_removed() {
    let only = format_only_files(&prettier_commit());
    let client: Vec<_> = only.iter().filter(|f| f.path == CLIENT).collect();
    assert_eq!(client.len(), 1, "{only:?}");
    assert_eq!(client[0].lines_added, 29);
    assert_eq!(client[0].lines_removed, 29);
}

#[test]
fn the_files_that_really_changed_in_that_commit_are_not_format_only() {
    let only = format_only_files(&prettier_commit());
    assert!(
        !only.iter().any(|f| f.path.ends_with("Invoices.tsx")),
        "{only:?}"
    );
}

#[test]
fn the_summary_of_the_commit_counts_one_file_and_58_ignored_lines() {
    assert_eq!(
        format_only_summary(&prettier_commit()),
        FormatOnlySummary {
            files: 1,
            lines_added: 29,
            lines_removed: 29,
        }
    );
}
