//! Seam 1: moves and renames in `diff_graphs`, on `GraphBuilder` snapshots
//! (no git: file renames arrive as a plain list).

use relief_diff::{
    CouplingStatus, FileRename, Level, SymbolTexts, coupling_changes, diff_graphs,
    diff_graphs_with_renames,
};
use relief_model::testing::GraphBuilder;
use relief_model::{
    EdgeChange, EdgeKind, EdgeStatus, GraphDiff, GraphSnapshot, NodeId, NodeStatus,
};

const PKG: &str = "@acme/web";
const OLD: &str = "src/utils/format.ts";
const NEW: &str = "src/money/format.ts";
const PAGE: &str = "src/pages/Page.tsx";

fn sym(path: &str, name: &str) -> NodeId {
    NodeId::package(PKG).file(path).symbol(name)
}

/// Files with their `(symbol, content_hash)` list; the hash is set by hand.
fn snap(
    commit: &str,
    files: &[(&str, &[(&str, &str)])],
    edges: &[(NodeId, NodeId)],
) -> GraphSnapshot {
    let mut b = GraphBuilder::new(commit);
    let p = b.package(PKG);
    for (path, syms) in files {
        let f = b.file(&p, path);
        for (name, _) in *syms {
            b.symbol(&f, name);
        }
    }
    for (from, to) in edges {
        b.edge(from, to, EdgeKind::Imports);
    }
    let g = b.build();
    let mut nodes = g.nodes().to_vec();
    for n in &mut nodes {
        for (path, syms) in files {
            for (name, hash) in *syms {
                if n.id == sym(path, name) {
                    n.content_hash = (*hash).to_owned();
                }
            }
        }
    }
    GraphSnapshot::new(g.commit().to_owned(), nodes, g.edges().to_vec())
}

fn status<'a>(diff: &'a GraphDiff, id: &NodeId) -> Vec<&'a NodeStatus> {
    diff.nodes
        .iter()
        .filter(|c| &c.id == id)
        .map(|c| &c.status)
        .collect()
}

fn renamed() -> Vec<FileRename> {
    vec![FileRename {
        from: OLD.to_owned(),
        to: NEW.to_owned(),
    }]
}

#[test]
fn a_symbol_with_the_same_name_and_hash_moved_between_files_is_moved() {
    let base = snap("base", &[(OLD, &[("formatPrice", "h1")])], &[]);
    let head = snap("head", &[(NEW, &[("formatPrice", "h1")])], &[]);

    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());

    assert_eq!(
        status(&diff, &sym(NEW, "formatPrice")),
        vec![&NodeStatus::Moved {
            from: sym(OLD, "formatPrice"),
            body: false
        }]
    );
    assert!(status(&diff, &sym(OLD, "formatPrice")).is_empty());
}

#[test]
fn a_different_name_is_not_a_move() {
    let base = snap("base", &[(OLD, &[("formatPrice", "h1")])], &[]);
    let head = snap("head", &[(NEW, &[("renderPrice", "h1")])], &[]);

    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());

    assert_eq!(
        status(&diff, &sym(NEW, "renderPrice")),
        vec![&NodeStatus::Added]
    );
    assert_eq!(
        status(&diff, &sym(OLD, "formatPrice")),
        vec![&NodeStatus::Removed]
    );
}

#[test]
fn a_different_hash_between_unrenamed_files_is_not_a_move() {
    let base = snap("base", &[(OLD, &[("formatPrice", "h1")])], &[]);
    let head = snap("head", &[(NEW, &[("formatPrice", "h2")])], &[]);

    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());

    assert_eq!(
        status(&diff, &sym(NEW, "formatPrice")),
        vec![&NodeStatus::Added]
    );
    assert_eq!(
        status(&diff, &sym(OLD, "formatPrice")),
        vec![&NodeStatus::Removed]
    );
}

#[test]
fn the_symbols_of_a_renamed_file_are_moved() {
    let base = snap(
        "base",
        &[(OLD, &[("formatPrice", "h1"), ("formatDate", "h2")])],
        &[],
    );
    let head = snap(
        "head",
        &[(NEW, &[("formatPrice", "h1"), ("formatDate", "h2")])],
        &[],
    );

    let diff = diff_graphs_with_renames(&base, &head, &[], &SymbolTexts::default(), &renamed());

    for name in ["formatPrice", "formatDate"] {
        assert_eq!(
            status(&diff, &sym(NEW, name)),
            vec![&NodeStatus::Moved {
                from: sym(OLD, name),
                body: false
            }],
            "{name}"
        );
        assert!(status(&diff, &sym(OLD, name)).is_empty(), "{name}");
    }
}

#[test]
fn a_symbol_moved_and_modified_in_a_renamed_file_has_a_body_change() {
    let base = snap(
        "base",
        &[(OLD, &[("formatPrice", "h1"), ("formatDate", "h2")])],
        &[],
    );
    let head = snap(
        "head",
        &[(NEW, &[("formatPrice", "h1-bis"), ("formatDate", "h2")])],
        &[],
    );

    let diff = diff_graphs_with_renames(&base, &head, &[], &SymbolTexts::default(), &renamed());

    assert_eq!(
        status(&diff, &sym(NEW, "formatPrice")),
        vec![&NodeStatus::Moved {
            from: sym(OLD, "formatPrice"),
            body: true
        }]
    );
    assert_eq!(
        status(&diff, &sym(NEW, "formatDate")),
        vec![&NodeStatus::Moved {
            from: sym(OLD, "formatDate"),
            body: false
        }]
    );
}

#[test]
fn a_new_symbol_in_a_renamed_file_is_added_and_a_dropped_one_removed() {
    let base = snap(
        "base",
        &[(OLD, &[("formatPrice", "h1"), ("legacy", "h3")])],
        &[],
    );
    let head = snap(
        "head",
        &[(NEW, &[("formatPrice", "h1"), ("fresh", "h4")])],
        &[],
    );

    let diff = diff_graphs_with_renames(&base, &head, &[], &SymbolTexts::default(), &renamed());

    assert_eq!(status(&diff, &sym(NEW, "fresh")), vec![&NodeStatus::Added]);
    assert_eq!(
        status(&diff, &sym(OLD, "legacy")),
        vec![&NodeStatus::Removed]
    );
}

/// base: Page -> OLD::formatPrice. head: formatPrice lives in NEW, Page -> it.
fn moved_edge_graphs() -> (GraphSnapshot, GraphSnapshot) {
    let base = snap(
        "base",
        &[(OLD, &[("formatPrice", "h1")]), (PAGE, &[("Page", "p1")])],
        &[(sym(PAGE, "Page"), sym(OLD, "formatPrice"))],
    );
    let head = snap(
        "head",
        &[(NEW, &[("formatPrice", "h1")]), (PAGE, &[("Page", "p1")])],
        &[(sym(PAGE, "Page"), sym(NEW, "formatPrice"))],
    );
    (base, head)
}

#[test]
fn an_edge_to_a_moved_symbol_is_one_moved_edge() {
    let (base, head) = moved_edge_graphs();

    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());

    assert_eq!(
        diff.edges,
        vec![EdgeChange {
            from: sym(PAGE, "Page"),
            to: sym(NEW, "formatPrice"),
            kind: EdgeKind::Imports,
            status: EdgeStatus::Moved,
            commit: None,
        }]
    );
}

#[test]
fn a_moved_edge_creates_no_new_or_gone_coupling() {
    let (base, head) = moved_edge_graphs();
    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());

    for level in [Level::File, Level::Module, Level::System] {
        let changes = coupling_changes(&base, &head, &diff, level);
        assert!(
            !changes
                .iter()
                .any(|c| matches!(c.status, CouplingStatus::New | CouplingStatus::Gone)),
            "{level:?}: {changes:?}"
        );
    }
}

#[test]
fn an_edge_to_a_symbol_that_was_really_removed_stays_removed() {
    let base = snap(
        "base",
        &[(OLD, &[("formatPrice", "h1")]), (PAGE, &[("Page", "p1")])],
        &[(sym(PAGE, "Page"), sym(OLD, "formatPrice"))],
    );
    let head = snap("head", &[(PAGE, &[("Page", "p1")])], &[]);

    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());

    assert_eq!(
        diff.edges,
        vec![EdgeChange {
            from: sym(PAGE, "Page"),
            to: sym(OLD, "formatPrice"),
            kind: EdgeKind::Imports,
            status: EdgeStatus::Removed,
            commit: None,
        }]
    );
}
