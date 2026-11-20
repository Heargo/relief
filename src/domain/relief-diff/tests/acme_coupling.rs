//! Seam 2: coupling changes on the real acme-shop edges, base to head of the
//! promo codes branch.

use std::path::Path;

use relief_diff::{CouplingStatus, Level, SymbolTexts, coupling_changes, diff_graphs};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use relief_model::GraphSnapshot;
use tempfile::TempDir;

fn index(source: &GitSource, rev: &str) -> GraphSnapshot {
    let commit = source.resolve(rev).unwrap();
    Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(source, &commit)
        .unwrap()
        .graph
}

fn is_new(changes: &[relief_diff::CouplingChange], from: &str, to: &str) -> bool {
    changes
        .iter()
        .any(|c| c.from == from && c.to == to && c.status == CouplingStatus::New)
}

#[test]
fn promo_codes_adds_the_web_to_repos_coupling_but_not_the_api_one() {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let base = index(&source, "main");
    let head = index(&source, "feat/promo-codes");

    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());
    let changes = coupling_changes(&base, &head, &diff, Level::Module);

    assert!(
        is_new(&changes, "apps/web/components", "packages/db/repos"),
        "{changes:?}"
    );
    assert!(
        !changes
            .iter()
            .any(|c| c.from == "apps/api/routes" && c.to == "packages/db/repos"),
        "{changes:?}"
    );
}
