//! Seam 2: `TsAdapter` registered in `relief_index::Indexer`, import
//! resolution into `imports` edges.
//!
//! Unresolved imports go to an `External` node whose id contains
//! `unresolved` (green picks the exact id, e.g. `pkg:external/unresolved`),
//! with a warning in `meta.warnings` naming the file and the specifier.

use std::path::Path;

use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::{IndexedSnapshot, Indexer};
use relief_lang_ts::TsAdapter;
use relief_model::{EdgeKind, NodeKind};
use tempfile::TempDir;

fn index(fixture: &str, rev: &str, dir: &Path) -> IndexedSnapshot {
    Fixture::load(fixture).unwrap().build(dir).unwrap();
    let source = GitSource::open(dir).unwrap();
    let commit = source.resolve(rev).unwrap();
    Indexer::new(fixture)
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(&source, &commit)
        .unwrap()
}

/// Ids of the targets of `imports` edges whose source is `from_suffix` or a
/// symbol of that file.
fn import_targets(indexed: &IndexedSnapshot, file_suffix: &str) -> Vec<String> {
    indexed
        .graph
        .edges()
        .iter()
        .filter(|e| e.kind == EdgeKind::Imports)
        .filter(|e| {
            let from = e.from.to_string();
            from.ends_with(file_suffix) || from.contains(&format!("{file_suffix}::sym:"))
        })
        .map(|e| e.to.to_string())
        .collect()
}

fn has_target(targets: &[String], suffix: &str) -> bool {
    targets.iter().any(|t| t.ends_with(suffix))
}

#[test]
fn cart_summary_imports_format_price_through_the_workspace_alias() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    indexed.graph.validate().unwrap();
    let targets = import_targets(&indexed, "::file:apps/web/components/CartSummary.tsx");
    assert!(
        has_target(
            &targets,
            "::file:packages/shared/money/format.ts::sym:formatPrice"
        ),
        "{targets:?}"
    );
}

#[test]
fn promo_code_input_imports_find_discount_by_code() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    let targets = import_targets(&indexed, "::file:apps/web/components/PromoCodeInput.tsx");
    assert!(
        has_target(
            &targets,
            "::file:packages/db/repos/discountRepo.ts::sym:findDiscountByCode"
        ),
        "{targets:?}"
    );
}

#[test]
fn an_import_of_react_leads_to_the_external_node() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    let targets = import_targets(&indexed, "::file:apps/web/components/PromoCodeInput.tsx");
    assert!(
        targets.contains(&"pkg:external/react".to_owned()),
        "{targets:?}"
    );
    let react = indexed
        .graph
        .nodes()
        .iter()
        .find(|n| n.id.to_string() == "pkg:external/react")
        .unwrap();
    assert_eq!(react.kind, NodeKind::External);
}

#[test]
fn imports_edges_are_syntactic() {
    let dir = TempDir::new().unwrap();
    let indexed = index("acme-shop", "feat/promo-codes", dir.path());
    let edges: Vec<_> = indexed
        .graph
        .edges()
        .iter()
        .filter(|e| e.kind == EdgeKind::Imports)
        .collect();
    assert!(!edges.is_empty());
    assert!(
        edges
            .iter()
            .all(|e| e.precision == relief_model::Precision::Syntactic)
    );
}

#[test]
fn relative_imports_resolve_extensions_and_index_files() {
    let dir = TempDir::new().unwrap();
    let indexed = index("ts-imports", "HEAD", dir.path());
    indexed.graph.validate().unwrap();
    let targets = import_targets(&indexed, "::file:src/app.ts");
    assert!(
        has_target(&targets, "::file:src/util.ts::sym:helper"),
        "{targets:?}"
    );
    assert!(
        has_target(&targets, "::file:src/widgets/index.ts::sym:Widget"),
        "{targets:?}"
    );
}

#[test]
fn tsconfig_paths_are_followed_through_extends() {
    let dir = TempDir::new().unwrap();
    let indexed = index("ts-imports", "HEAD", dir.path());
    let targets = import_targets(&indexed, "::file:src/app.ts");
    assert!(
        has_target(&targets, "::file:libs/greet.ts::sym:greet"),
        "{targets:?}"
    );
}

#[test]
fn package_exports_map_the_subpath_to_a_file() {
    let dir = TempDir::new().unwrap();
    let indexed = index("ts-imports", "HEAD", dir.path());
    let targets = import_targets(&indexed, "::file:src/app.ts");
    assert!(
        has_target(
            &targets,
            "::file:packages/ui/src/button/index.ts::sym:Button"
        ),
        "{targets:?}"
    );
    assert!(
        has_target(&targets, "::file:packages/ui/src/main.ts::sym:mainUi"),
        "{targets:?}"
    );
}

#[test]
fn a_broken_relative_import_leads_to_the_unresolved_node_with_a_warning() {
    let dir = TempDir::new().unwrap();
    let indexed = index("ts-imports", "HEAD", dir.path());
    indexed.graph.validate().unwrap();
    let targets = import_targets(&indexed, "::file:src/app.ts");
    let unresolved = targets
        .iter()
        .find(|t| t.contains("unresolved"))
        .unwrap_or_else(|| panic!("no unresolved target in {targets:?}"));
    let node = indexed
        .graph
        .nodes()
        .iter()
        .find(|n| &n.id.to_string() == unresolved)
        .unwrap();
    assert_eq!(node.kind, NodeKind::External);
    let warnings: Vec<_> = indexed
        .meta
        .warnings
        .iter()
        .filter(|w| w.contains("src/app.ts") && w.contains("./missing"))
        .collect();
    assert_eq!(warnings.len(), 1, "{:?}", indexed.meta.warnings);
}
