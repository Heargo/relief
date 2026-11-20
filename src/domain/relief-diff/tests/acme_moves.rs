//! Seam 2: the `move` commit of acme-shop, indexed on both sides, with the
//! renames detected by git passed to `diff_graphs_with_renames`.

use std::path::Path;

use relief_diff::{
    CouplingStatus, FileRename, Level, SymbolTexts, coupling_changes, diff_graphs_with_renames,
};
use relief_fixtures::Fixture;
use relief_git::{FileStatus, GitSource};
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use relief_model::{EdgeStatus, GraphDiff, GraphSnapshot, NodeId, NodeStatus};
use tempfile::TempDir;

const OLD: &str = "apps/web/utils/format.ts";
const NEW: &str = "packages/shared/money/format.ts";
const INVOICES: &str = "apps/web/pages/Invoices.tsx";

fn index(source: &GitSource, sha: &str) -> GraphSnapshot {
    let commit = source.resolve(sha).unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(source, &commit)
        .unwrap()
        .graph
}

fn move_commit() -> (GraphSnapshot, GraphSnapshot, GraphDiff) {
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
    let (base, head) = (index(&source, before), index(&source, after));
    let diff = diff_graphs_with_renames(&base, &head, &[], &SymbolTexts::default(), &renames);
    (base, head, diff)
}

#[test]
fn format_price_is_moved_from_web_utils_to_shared_money() {
    let (_, _, diff) = move_commit();
    let old = NodeId::package("@acme/web/utils")
        .file(OLD)
        .symbol("formatPrice");
    let new = NodeId::package("@acme/shared/money")
        .file(NEW)
        .symbol("formatPrice");

    let of_new: Vec<_> = diff.nodes.iter().filter(|c| c.id == new).collect();
    assert_eq!(of_new.len(), 1, "{:?}", diff.nodes);
    assert_eq!(
        of_new[0].status,
        NodeStatus::Moved {
            from: old.clone(),
            body: false
        }
    );
    assert!(!diff.nodes.iter().any(|c| c.id == old), "{:?}", diff.nodes);
}

#[test]
fn invoices_page_has_a_single_moved_edge_and_no_new_coupling() {
    let (base, head, diff) = move_commit();
    let page = NodeId::package("@acme/web/pages")
        .file(INVOICES)
        .symbol("InvoicesPage");
    let new = NodeId::package("@acme/shared/money")
        .file(NEW)
        .symbol("formatPrice");

    let of_page: Vec<_> = diff.edges.iter().filter(|e| e.from == page).collect();
    assert_eq!(of_page.len(), 1, "{of_page:?}");
    assert_eq!(of_page[0].status, EdgeStatus::Moved);
    assert_eq!(of_page[0].to, new);

    let changes = coupling_changes(&base, &head, &diff, Level::File);
    assert!(
        !changes
            .iter()
            .any(|c| c.from == INVOICES && c.status == CouplingStatus::New),
        "{changes:?}"
    );
}
