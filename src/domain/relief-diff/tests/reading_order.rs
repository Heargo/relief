//! Seam 1 of ticket 07: `reading_order` on in-memory snapshots (no git).
//!
//! API expected: `reading_order(&GraphDiff, &GraphSnapshot, Granularity) ->
//! Vec<ReadingItem>`, `Granularity::{File, Symbol}`, `ReadingItem { id: NodeId,
//! reasons: Vec<ReadingReason> }` and `ReadingReason::{BreakingSignature,
//! ModifiedSignature, Violation, New, Removed, MovedIdentical, Lines { added,
//! removed }}`, all exported by `relief_diff`.
//!
//! Rules pinned here: the changed files are those of `diff.files` that are not
//! format-only and not the old location of a moved file; dependencies come from
//! the head edges between changed files (or symbols); topological order,
//! dependencies first, ties and cycles broken by the smallest path (symbols:
//! file path, then symbol name). A reason list is ordered: signature, violation,
//! then the status (`New`, `Removed`, `MovedIdentical` or `Lines`).

use relief_diff::{Granularity, ReadingReason, reading_order};
use relief_model::testing::GraphBuilder;
use relief_model::{
    EdgeKind, FileChange, GraphDiff, GraphSnapshot, NodeChange, NodeId, NodeStatus,
    SignatureChange, SignatureReason,
};

const PKG: &str = "@acme/api";

fn file(path: &str) -> NodeId {
    NodeId::package(PKG).file(path)
}

fn sym(path: &str, name: &str) -> NodeId {
    file(path).symbol(name)
}

fn modified(id: NodeId) -> NodeChange {
    NodeChange {
        id,
        status: NodeStatus::Modified {
            body: true,
            signature: None,
        },
        lines_added: 1,
        lines_removed: 1,
    }
}

fn changed_file(path: &str, added: u32, removed: u32) -> FileChange {
    FileChange {
        path: path.to_owned(),
        lines_added: added,
        lines_removed: removed,
    }
}

/// Head graph with one symbol `f` per file, and `calls` edges between those symbols.
fn head_of(paths: &[&str], calls: &[(&str, &str)]) -> GraphSnapshot {
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    let mut ids = Vec::new();
    for path in paths {
        let f = b.file(&p, path);
        ids.push((*path, b.symbol(&f, "f")));
    }
    let id_of = |path: &str| ids.iter().find(|(p, _)| *p == path).unwrap().1.clone();
    for (from, to) in calls {
        b.edge(&id_of(from), &id_of(to), EdgeKind::Calls);
    }
    b.build()
}

/// Every file of `paths` has its `f` symbol modified.
fn diff_of(paths: &[&str]) -> GraphDiff {
    GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: paths.iter().map(|p| modified(sym(p, "f"))).collect(),
        files: paths.iter().map(|p| changed_file(p, 1, 1)).collect(),
        edges: Vec::new(),
    }
}

fn file_paths(diff: &GraphDiff, head: &GraphSnapshot) -> Vec<String> {
    reading_order(diff, head, Granularity::File)
        .iter()
        .map(|i| i.id.file_path().unwrap().to_owned())
        .collect()
}

#[test]
fn dependencies_are_read_before_their_dependents() {
    let paths = ["src/a.ts", "src/b.ts", "src/c.ts"];
    // a calls b, b calls c: the path order is the reverse of the reading order.
    let head = head_of(
        &paths,
        &[("src/a.ts", "src/b.ts"), ("src/b.ts", "src/c.ts")],
    );
    assert_eq!(
        file_paths(&diff_of(&paths), &head),
        ["src/c.ts", "src/b.ts", "src/a.ts"]
    );
}

#[test]
fn independent_files_are_ordered_by_path() {
    let paths = ["src/z.ts", "src/a.ts", "src/m.ts"];
    let head = head_of(&paths, &[]);
    assert_eq!(
        file_paths(&diff_of(&paths), &head),
        ["src/a.ts", "src/m.ts", "src/z.ts"]
    );
}

#[test]
fn ties_among_ready_files_go_to_the_smallest_path_after_each_dependency() {
    // z has no dependency; a depends on z; b has none: z and b are ready first.
    let paths = ["src/a.ts", "src/b.ts", "src/z.ts"];
    let head = head_of(&paths, &[("src/a.ts", "src/z.ts")]);
    assert_eq!(
        file_paths(&diff_of(&paths), &head),
        ["src/b.ts", "src/z.ts", "src/a.ts"]
    );
}

#[test]
fn a_cycle_is_broken_deterministically_at_the_smallest_path() {
    // a <-> b is a cycle, d depends on a, c is free.
    let paths = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"];
    let head = head_of(
        &paths,
        &[
            ("src/a.ts", "src/b.ts"),
            ("src/b.ts", "src/a.ts"),
            ("src/d.ts", "src/a.ts"),
        ],
    );
    let diff = diff_of(&paths);
    let expected = ["src/c.ts", "src/a.ts", "src/b.ts", "src/d.ts"];
    assert_eq!(file_paths(&diff, &head), expected);
    assert_eq!(file_paths(&diff, &head), expected, "same answer twice");
}

#[test]
fn only_the_changed_files_are_listed_once_each() {
    // Two symbols changed in the same file give one entry; an edge to a file
    // outside the diff does not bring it in.
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    let a = b.file(&p, "src/a.ts");
    let (f1, f2) = (b.symbol(&a, "f"), b.symbol(&a, "g"));
    let other = b.file(&p, "src/other.ts");
    let o = b.symbol(&other, "o");
    b.edge(&f1, &o, EdgeKind::Calls);
    let head = b.build();
    let diff = GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: vec![modified(f1.clone()), modified(f2.clone())],
        files: vec![changed_file("src/a.ts", 2, 2)],
        edges: Vec::new(),
    };
    assert_eq!(file_paths(&diff, &head), ["src/a.ts"]);
}

#[test]
fn format_only_files_are_left_out() {
    // `src/fmt.ts` is in the file list but has no changed node nor edge.
    let paths = ["src/a.ts", "src/fmt.ts"];
    let head = head_of(&paths, &[]);
    let mut diff = diff_of(&["src/a.ts"]);
    diff.files.push(changed_file("src/fmt.ts", 29, 29));
    assert_eq!(file_paths(&diff, &head), ["src/a.ts"]);
}

#[test]
fn the_old_location_of_a_moved_file_is_left_out() {
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    let new = b.file(&p, "src/new/format.ts");
    let moved = b.symbol(&new, "formatPrice");
    let head = b.build();
    let diff = GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: vec![
            NodeChange {
                id: moved,
                status: NodeStatus::Moved {
                    from: sym("src/old/format.ts", "formatPrice"),
                    body: false,
                },
                lines_added: 0,
                lines_removed: 0,
            },
            NodeChange {
                id: file("src/old/format.ts"),
                status: NodeStatus::Removed,
                lines_added: 0,
                lines_removed: 0,
            },
        ],
        files: vec![
            changed_file("src/new/format.ts", 0, 0),
            changed_file("src/old/format.ts", 0, 5),
        ],
        edges: Vec::new(),
    };
    assert_eq!(file_paths(&diff, &head), ["src/new/format.ts"]);
    let symbols = reading_order(&diff, &head, Granularity::Symbol);
    assert_eq!(symbols.len(), 1, "{symbols:?}");
    assert_eq!(
        symbols[0].id,
        sym("src/new/format.ts", "formatPrice"),
        "the symbol is read at its new place"
    );
}

#[test]
fn file_reasons_say_what_happened_to_each_file() {
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    for (path, name) in [
        ("src/breaking.ts", "f"),
        ("src/compatible.ts", "f"),
        ("src/fresh.ts", "f"),
        ("src/plain.ts", "f"),
    ] {
        let f = b.file(&p, path);
        b.symbol(&f, name);
    }
    let head = b.build();
    let signature = |breaking: bool| {
        Some(SignatureChange {
            before: "f(a: A)".into(),
            after: "f(a: A, b: B)".into(),
            breaking,
            reason: SignatureReason::ParamRequiredAdded { param: "b".into() },
            internal: false,
        })
    };
    let node = |path: &str, status: NodeStatus| NodeChange {
        id: sym(path, "f"),
        status,
        lines_added: 0,
        lines_removed: 0,
    };
    let diff = GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: vec![
            node(
                "src/breaking.ts",
                NodeStatus::Modified {
                    body: true,
                    signature: signature(true),
                },
            ),
            node(
                "src/compatible.ts",
                NodeStatus::Modified {
                    body: false,
                    signature: signature(false),
                },
            ),
            node("src/fresh.ts", NodeStatus::Added),
            node(
                "src/plain.ts",
                NodeStatus::Modified {
                    body: true,
                    signature: None,
                },
            ),
            NodeChange {
                id: file("src/fresh.ts"),
                status: NodeStatus::Added,
                lines_added: 0,
                lines_removed: 0,
            },
            NodeChange {
                id: file("src/gone.ts"),
                status: NodeStatus::Removed,
                lines_added: 0,
                lines_removed: 0,
            },
        ],
        files: vec![
            changed_file("src/breaking.ts", 3, 1),
            changed_file("src/compatible.ts", 2, 0),
            changed_file("src/fresh.ts", 8, 0),
            changed_file("src/gone.ts", 0, 6),
            changed_file("src/plain.ts", 4, 2),
        ],
        edges: Vec::new(),
    };
    let items = reading_order(&diff, &head, Granularity::File);
    let reasons = |path: &str| {
        items
            .iter()
            .find(|i| i.id.file_path() == Some(path))
            .unwrap_or_else(|| panic!("{path} missing from {items:?}"))
            .reasons
            .clone()
    };
    assert_eq!(
        reasons("src/breaking.ts"),
        [
            ReadingReason::BreakingSignature,
            ReadingReason::Lines {
                added: 3,
                removed: 1
            }
        ]
    );
    assert_eq!(
        reasons("src/compatible.ts"),
        [
            ReadingReason::ModifiedSignature,
            ReadingReason::Lines {
                added: 2,
                removed: 0
            }
        ]
    );
    assert_eq!(reasons("src/fresh.ts"), [ReadingReason::New]);
    assert_eq!(reasons("src/gone.ts"), [ReadingReason::Removed]);
    assert_eq!(
        reasons("src/plain.ts"),
        [ReadingReason::Lines {
            added: 4,
            removed: 2
        }]
    );
}

#[test]
fn symbols_are_read_dependencies_first_with_ties_by_file_path_then_name() {
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    let fa = b.file(&p, "src/a.ts");
    let fb = b.file(&p, "src/b.ts");
    let a_use = b.symbol(&fa, "use");
    let a_alone = b.symbol(&fa, "alone");
    let b_helper = b.symbol(&fb, "helper");
    b.edge(&a_use, &b_helper, EdgeKind::Calls);
    let head = b.build();
    let diff = GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: vec![
            modified(a_use.clone()),
            modified(a_alone.clone()),
            modified(b_helper.clone()),
        ],
        files: vec![
            changed_file("src/a.ts", 2, 2),
            changed_file("src/b.ts", 1, 1),
        ],
        edges: Vec::new(),
    };
    let ids: Vec<NodeId> = reading_order(&diff, &head, Granularity::Symbol)
        .into_iter()
        .map(|i| i.id)
        .collect();
    // `alone` (a.ts) is ready first; `helper` before `use`, which calls it.
    assert_eq!(ids, [a_alone, b_helper, a_use]);
}

#[test]
fn a_symbol_cycle_does_not_loop_and_lists_every_symbol_once() {
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    let f = b.file(&p, "src/a.ts");
    let (x, y) = (b.symbol(&f, "x"), b.symbol(&f, "y"));
    b.edge(&x, &y, EdgeKind::Calls);
    b.edge(&y, &x, EdgeKind::Calls);
    let head = b.build();
    let diff = GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: vec![modified(x.clone()), modified(y.clone())],
        files: vec![changed_file("src/a.ts", 2, 2)],
        edges: Vec::new(),
    };
    let ids: Vec<NodeId> = reading_order(&diff, &head, Granularity::Symbol)
        .into_iter()
        .map(|i| i.id)
        .collect();
    assert_eq!(ids, [x, y]);
}

#[test]
fn symbol_mode_gives_added_and_removed_symbols_their_lines_too() {
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    let f = b.file(&p, "src/a.ts");
    b.symbol(&f, "fresh");
    let head = b.build();
    let node = |name: &str, status: NodeStatus, added: u32, removed: u32| NodeChange {
        id: sym("src/a.ts", name),
        status,
        lines_added: added,
        lines_removed: removed,
    };
    let diff = GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: vec![
            node("fresh", NodeStatus::Added, 5, 0),
            node("gone", NodeStatus::Removed, 0, 3),
        ],
        files: vec![changed_file("src/a.ts", 5, 3)],
        edges: Vec::new(),
    };
    let items = reading_order(&diff, &head, Granularity::Symbol);
    let reasons_of = |name: &str| {
        items
            .iter()
            .find(|i| i.id == sym("src/a.ts", name))
            .unwrap_or_else(|| panic!("{name} missing from {items:?}"))
            .reasons
            .clone()
    };
    assert_eq!(
        reasons_of("fresh"),
        [
            ReadingReason::New,
            ReadingReason::Lines {
                added: 5,
                removed: 0
            }
        ]
    );
    assert_eq!(
        reasons_of("gone"),
        [
            ReadingReason::Removed,
            ReadingReason::Lines {
                added: 0,
                removed: 3
            }
        ]
    );
}
