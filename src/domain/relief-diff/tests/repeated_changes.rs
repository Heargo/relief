//! Seam 1 of ticket E08: `repeated_changes` on in-memory snapshots (no git).
//!
//! API expected, exported by `relief_diff` and `relief_model`:
//! `relief_diff::repeated_changes(&GraphDiff, &GraphSnapshot) -> Vec<RepeatedChange>` with
//! `RepeatedChange { representative: NodeId, members: Vec<NodeId>, summary:
//! Vec<RepeatedChangeItem> }` (file node ids, head side) and
//! `RepeatedChangeItem::{EdgeAdded { kind: EdgeKind, target: NodeId },
//! EdgeRemoved { kind, target }, SymbolAdded { name: String },
//! SymbolRemoved { name: String }, SymbolRenamed { from: String, to: String }}`.
//!
//! Rules pinned here: the candidates are the files of the reading order (file
//! granularity); the signature of a file is the set of its added / removed edges
//! (kind + target, seen from the file or from one of its symbols) and of its
//! added / removed symbols by name; same signature = same group; a group has at
//! least 3 files; members are in reading order and the representative is the first;
//! groups are ordered by their representative's reading position; the summary lists
//! added edges, removed edges, added symbols, removed symbols, each by target / name.

use relief_diff::{Granularity, reading_order, repeated_changes};
use relief_model::testing::GraphBuilder;
use relief_model::{
    EdgeChange, EdgeKind, EdgeStatus, FileChange, GraphDiff, GraphSnapshot, NodeChange, NodeId,
    NodeStatus, RepeatedChangeItem,
};

const PKG: &str = "@acme/app";

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
        lines_removed: 0,
    }
}

fn edge(path: &str, target: &str, status: EdgeStatus) -> EdgeChange {
    EdgeChange {
        from: sym(path, "f"),
        to: file(target),
        kind: EdgeKind::Imports,
        status,
        commit: None,
    }
}

fn added(path: &str, target: &str) -> EdgeChange {
    edge(path, target, EdgeStatus::Added)
}

fn symbol_change(path: &str, name: &str, status: NodeStatus) -> NodeChange {
    NodeChange {
        id: sym(path, name),
        status,
        lines_added: 1,
        lines_removed: 0,
    }
}

/// Head graph: one symbol `f` per changed file, the shared targets, and `calls` edges.
fn head_of(paths: &[&str], targets: &[&str], calls: &[(&str, &str)]) -> GraphSnapshot {
    let mut b = GraphBuilder::new("head");
    let p = b.package(PKG);
    let mut ids = Vec::new();
    for path in paths.iter().chain(targets) {
        let f = b.file(&p, path);
        ids.push((*path, b.symbol(&f, "f")));
    }
    let id_of = |path: &str| ids.iter().find(|(p, _)| *p == path).unwrap().1.clone();
    for (from, to) in calls {
        b.edge(&id_of(from), &id_of(to), EdgeKind::Calls);
    }
    b.build()
}

fn diff_of(paths: &[&str], nodes: Vec<NodeChange>, edges: Vec<EdgeChange>) -> GraphDiff {
    let mut all: Vec<NodeChange> = paths.iter().map(|p| modified(sym(p, "f"))).collect();
    all.extend(nodes);
    GraphDiff {
        base: "base".into(),
        head: "head".into(),
        nodes: all,
        files: paths
            .iter()
            .map(|p| FileChange {
                path: (*p).to_owned(),
                lines_added: 1,
                lines_removed: 0,
            })
            .collect(),
        edges,
    }
}

fn ids(paths: &[&str]) -> Vec<NodeId> {
    paths.iter().map(|p| file(p)).collect()
}

const FOUR: [&str; 4] = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"];

#[test]
fn four_files_adding_the_same_import_make_one_group_of_four() {
    let head = head_of(&FOUR, &["src/util.ts"], &[]);
    let edges = FOUR.iter().map(|p| added(p, "src/util.ts")).collect();
    let groups = repeated_changes(&diff_of(&FOUR, vec![], edges), &head);

    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].representative, file("src/a.ts"));
    assert_eq!(groups[0].members, ids(&FOUR));
    assert_eq!(
        groups[0].summary,
        [RepeatedChangeItem::EdgeAdded {
            kind: EdgeKind::Imports,
            target: file("src/util.ts"),
        }]
    );
}

#[test]
fn two_files_with_another_import_make_no_group() {
    let paths = [
        "src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts", "src/f.ts",
    ];
    let head = head_of(&paths, &["src/util.ts", "src/other.ts"], &[]);
    let mut edges: Vec<EdgeChange> = paths[..4].iter().map(|p| added(p, "src/util.ts")).collect();
    edges.extend(paths[4..].iter().map(|p| added(p, "src/other.ts")));
    let groups = repeated_changes(&diff_of(&paths, vec![], edges), &head);

    assert_eq!(groups.len(), 1, "only the group of four");
    assert_eq!(groups[0].members, ids(&paths[..4]));
}

#[test]
fn two_identical_files_are_below_the_threshold() {
    let paths = ["src/a.ts", "src/b.ts"];
    let head = head_of(&paths, &["src/util.ts"], &[]);
    let edges = paths.iter().map(|p| added(p, "src/util.ts")).collect();
    assert!(repeated_changes(&diff_of(&paths, vec![], edges), &head).is_empty());
}

#[test]
fn three_identical_files_are_enough() {
    let paths = ["src/a.ts", "src/b.ts", "src/c.ts"];
    let head = head_of(&paths, &["src/util.ts"], &[]);
    let edges = paths.iter().map(|p| added(p, "src/util.ts")).collect();
    let groups = repeated_changes(&diff_of(&paths, vec![], edges), &head);
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].members.len(), 3);
}

#[test]
fn a_file_with_an_extra_change_leaves_the_group() {
    let head = head_of(&FOUR, &["src/util.ts"], &[]);
    let mut edges: Vec<EdgeChange> = FOUR.iter().map(|p| added(p, "src/util.ts")).collect();
    edges.push(added("src/d.ts", "src/more.ts"));
    let groups = repeated_changes(&diff_of(&FOUR, vec![], edges), &head);

    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].members, ids(&FOUR[..3]));
}

#[test]
fn the_same_target_with_another_kind_or_status_is_another_change() {
    let paths = ["src/a.ts", "src/b.ts", "src/c.ts"];
    let head = head_of(&paths, &["src/util.ts"], &[]);
    let mut edges = vec![
        added("src/a.ts", "src/util.ts"),
        added("src/b.ts", "src/util.ts"),
        edge("src/c.ts", "src/util.ts", EdgeStatus::Removed),
    ];
    assert!(repeated_changes(&diff_of(&paths, vec![], edges.clone()), &head).is_empty());
    edges[2] = EdgeChange {
        kind: EdgeKind::Calls,
        ..added("src/c.ts", "src/util.ts")
    };
    assert!(repeated_changes(&diff_of(&paths, vec![], edges), &head).is_empty());
}

#[test]
fn the_summary_lists_added_and_removed_edges_then_added_and_removed_symbols() {
    let head = head_of(&FOUR, &["src/util.ts", "src/old.ts"], &[]);
    let mut edges = Vec::new();
    let mut nodes = Vec::new();
    for p in FOUR {
        edges.push(edge(p, "src/old.ts", EdgeStatus::Removed));
        edges.push(added(p, "src/util.ts"));
        nodes.push(symbol_change(p, "legacy", NodeStatus::Removed));
        nodes.push(symbol_change(p, "fresh", NodeStatus::Added));
    }
    let groups = repeated_changes(&diff_of(&FOUR, nodes, edges), &head);

    assert_eq!(groups.len(), 1);
    assert_eq!(
        groups[0].summary,
        [
            RepeatedChangeItem::EdgeAdded {
                kind: EdgeKind::Imports,
                target: file("src/util.ts"),
            },
            RepeatedChangeItem::EdgeRemoved {
                kind: EdgeKind::Imports,
                target: file("src/old.ts"),
            },
            RepeatedChangeItem::SymbolAdded {
                name: "fresh".into()
            },
            RepeatedChangeItem::SymbolRemoved {
                name: "legacy".into()
            },
        ]
    );
}

#[test]
fn files_adding_the_same_symbol_name_are_grouped() {
    let head = head_of(&FOUR, &[], &[]);
    let nodes = FOUR
        .iter()
        .map(|p| symbol_change(p, "migrated", NodeStatus::Added))
        .collect();
    let groups = repeated_changes(&diff_of(&FOUR, nodes, vec![]), &head);
    assert_eq!(groups.len(), 1);
    assert_eq!(
        groups[0].summary,
        [RepeatedChangeItem::SymbolAdded {
            name: "migrated".into()
        }]
    );
}

#[test]
fn files_without_any_edge_or_symbol_change_are_not_grouped() {
    let head = head_of(&FOUR, &[], &[]);
    assert!(repeated_changes(&diff_of(&FOUR, vec![], vec![]), &head).is_empty());
}

#[test]
fn the_representative_is_the_first_member_in_reading_order() {
    // a calls z: z is read first although a has the smallest path.
    let paths = ["src/a.ts", "src/b.ts", "src/z.ts"];
    let head = head_of(&paths, &["src/util.ts"], &[("src/a.ts", "src/z.ts")]);
    let edges = paths.iter().map(|p| added(p, "src/util.ts")).collect();
    let diff = diff_of(&paths, vec![], edges);
    let order: Vec<NodeId> = reading_order(&diff, &head, Granularity::File)
        .into_iter()
        .map(|i| i.id)
        .collect();
    assert_eq!(order[0], file("src/b.ts"), "reading order sanity");

    let groups = repeated_changes(&diff, &head);
    assert_eq!(groups[0].representative, order[0]);
    assert_eq!(groups[0].members, order);
}

#[test]
fn groups_follow_the_reading_position_of_their_representative() {
    let paths = [
        "src/a.ts", "src/b.ts", "src/c.ts", "src/m.ts", "src/n.ts", "src/o.ts",
    ];
    let head = head_of(&paths, &["src/x.ts", "src/y.ts"], &[]);
    let mut edges: Vec<EdgeChange> = paths[3..].iter().map(|p| added(p, "src/x.ts")).collect();
    edges.extend(paths[..3].iter().map(|p| added(p, "src/y.ts")));
    let groups = repeated_changes(&diff_of(&paths, vec![], edges), &head);

    let reps: Vec<NodeId> = groups.iter().map(|g| g.representative.clone()).collect();
    assert_eq!(reps, ids(&["src/a.ts", "src/m.ts"]));
}

#[test]
fn the_answer_does_not_depend_on_the_order_of_the_diff() {
    let head = head_of(&FOUR, &["src/util.ts"], &[]);
    let edges: Vec<EdgeChange> = FOUR.iter().map(|p| added(p, "src/util.ts")).collect();
    let straight = repeated_changes(&diff_of(&FOUR, vec![], edges.clone()), &head);

    let mut reversed_paths = FOUR;
    reversed_paths.reverse();
    let mut reversed_edges = edges;
    reversed_edges.reverse();
    let reversed = repeated_changes(&diff_of(&reversed_paths, vec![], reversed_edges), &head);

    assert_eq!(straight, reversed);
    assert_eq!(straight[0].representative, file("src/a.ts"));
}

fn to_symbol(path: &str, target: &str, kind: EdgeKind) -> EdgeChange {
    EdgeChange {
        from: sym(path, "f"),
        to: sym("src/util.ts", target),
        kind,
        status: EdgeStatus::Added,
        commit: None,
    }
}

#[test]
fn calls_to_different_symbols_make_distinct_groups() {
    let paths = [
        "src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts", "src/f.ts",
    ];
    let head = head_of(&paths, &["src/util.ts"], &[]);
    let mut edges: Vec<EdgeChange> = paths[..3]
        .iter()
        .map(|p| to_symbol(p, "a", EdgeKind::Calls))
        .collect();
    edges.extend(
        paths[3..]
            .iter()
            .map(|p| to_symbol(p, "b", EdgeKind::Calls)),
    );
    let groups = repeated_changes(&diff_of(&paths, vec![], edges), &head);

    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0].members, ids(&paths[..3]));
    assert_eq!(groups[1].members, ids(&paths[3..]));
    assert_eq!(
        groups[0].summary,
        [RepeatedChangeItem::EdgeAdded {
            kind: EdgeKind::Calls,
            target: sym("src/util.ts", "a"),
        }]
    );
}

#[test]
fn imports_of_different_symbols_of_one_file_stay_grouped_at_the_file() {
    let paths = ["src/a.ts", "src/b.ts", "src/c.ts"];
    let head = head_of(&paths, &["src/util.ts"], &[]);
    let edges = vec![
        to_symbol("src/a.ts", "a", EdgeKind::Imports),
        to_symbol("src/b.ts", "b", EdgeKind::Imports),
        to_symbol("src/c.ts", "a", EdgeKind::Imports),
    ];
    let groups = repeated_changes(&diff_of(&paths, vec![], edges), &head);

    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].members, ids(&paths));
    assert_eq!(
        groups[0].summary,
        [RepeatedChangeItem::EdgeAdded {
            kind: EdgeKind::Imports,
            target: file("src/util.ts"),
        }]
    );
}
