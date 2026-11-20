//! Seam 1: `impact` and `out_of_diff` on in-memory snapshots.

use relief_diff::{Direction, ImpactOptions, Reached, impact, out_of_diff};
use relief_model::testing::GraphBuilder;
use relief_model::{
    EdgeKind, FileChange, GraphDiff, GraphSnapshot, NodeChange, NodeId, NodeStatus,
};

fn opts() -> ImpactOptions {
    ImpactOptions {
        max_depth: 8,
        follow_http: true,
    }
}

fn set_subkind(snap: GraphSnapshot, id: &NodeId, subkind: &str) -> GraphSnapshot {
    let mut nodes = snap.nodes().to_vec();
    for n in &mut nodes {
        if &n.id == id {
            n.subkind = subkind.to_owned();
        }
    }
    GraphSnapshot::new(snap.commit().to_owned(), nodes, snap.edges().to_vec())
}

/// `(symbol name, depth)` of each reached node, sorted.
fn rows(reached: &[Reached]) -> Vec<(String, usize)> {
    let mut rows: Vec<_> = reached
        .iter()
        .map(|r| {
            let name = r.node.symbol_key().unwrap_or_else(|| r.node.to_string());
            (name, r.depth)
        })
        .collect();
    rows.sort();
    rows
}

fn row(name: &str, depth: usize) -> (String, usize) {
    (name.to_owned(), depth)
}

fn find<'a>(reached: &'a [Reached], name: &str) -> &'a Reached {
    reached
        .iter()
        .find(|r| r.node.symbol_key().as_deref() == Some(name))
        .unwrap_or_else(|| panic!("{name} not reached"))
}

struct Chain {
    snap: GraphSnapshot,
    a: NodeId,
    b: NodeId,
    c: NodeId,
    d: NodeId,
}

/// a calls b, b calls c, c calls d.
fn chain() -> Chain {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let f = g.file(&p, "src/lib.ts");
    let (a, b, c, d) = (
        g.symbol(&f, "a"),
        g.symbol(&f, "b"),
        g.symbol(&f, "c"),
        g.symbol(&f, "d"),
    );
    g.edge(&a, &b, EdgeKind::Calls);
    g.edge(&b, &c, EdgeKind::Calls);
    g.edge(&c, &d, EdgeKind::Calls);
    Chain {
        snap: g.build(),
        a,
        b,
        c,
        d,
    }
}

#[test]
fn callers_are_the_transitive_reverse_closure_with_depth_and_via() {
    let ch = chain();

    let reached = impact(&ch.snap, &[ch.d.clone()], Direction::Callers, &opts());

    assert_eq!(rows(&reached), [row("a", 3), row("b", 2), row("c", 1)]);
    assert_eq!(find(&reached, "c").via, [ch.d.clone()]);
    assert_eq!(find(&reached, "a").via, [ch.d, ch.c, ch.b]);
}

#[test]
fn dependencies_are_the_transitive_forward_closure_with_depth_and_via() {
    let ch = chain();

    let reached = impact(&ch.snap, &[ch.a.clone()], Direction::Dependencies, &opts());

    assert_eq!(rows(&reached), [row("b", 1), row("c", 2), row("d", 3)]);
    assert_eq!(find(&reached, "b").via, [ch.a.clone()]);
    assert_eq!(find(&reached, "d").via, [ch.a, ch.b, ch.c]);
}

#[test]
fn the_seed_itself_is_not_reached() {
    let ch = chain();

    let reached = impact(&ch.snap, &[ch.b], Direction::Callers, &opts());

    assert_eq!(rows(&reached), [row("a", 1)]);
}

#[test]
fn a_call_cycle_terminates_and_never_reports_the_seed() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let f = g.file(&p, "src/lib.ts");
    let (a, b, c) = (g.symbol(&f, "a"), g.symbol(&f, "b"), g.symbol(&f, "c"));
    g.edge(&a, &b, EdgeKind::Calls);
    g.edge(&b, &c, EdgeKind::Calls);
    g.edge(&c, &a, EdgeKind::Calls);
    let snap = g.build();

    let callers = impact(&snap, &[a.clone()], Direction::Callers, &opts());
    let deps = impact(&snap, &[a], Direction::Dependencies, &opts());

    assert_eq!(rows(&callers), [row("b", 2), row("c", 1)]);
    assert_eq!(rows(&deps), [row("b", 1), row("c", 2)]);
}

#[test]
fn max_depth_bounds_the_closure() {
    let ch = chain();
    let options = ImpactOptions {
        max_depth: 2,
        follow_http: true,
    };

    let reached = impact(&ch.snap, &[ch.d], Direction::Callers, &options);

    assert_eq!(rows(&reached), [row("b", 2), row("c", 1)]);
}

#[test]
fn a_node_reachable_by_two_paths_keeps_its_shortest_depth() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let f = g.file(&p, "src/lib.ts");
    let (top, mid, leaf) = (
        g.symbol(&f, "top"),
        g.symbol(&f, "mid"),
        g.symbol(&f, "leaf"),
    );
    g.edge(&top, &mid, EdgeKind::Calls);
    g.edge(&mid, &leaf, EdgeKind::Calls);
    g.edge(&top, &leaf, EdgeKind::Calls);

    let reached = impact(&g.build(), &[leaf.clone()], Direction::Callers, &opts());

    assert_eq!(rows(&reached), [row("mid", 1), row("top", 1)]);
    assert_eq!(find(&reached, "top").via, [leaf]);
}

#[test]
fn each_reached_node_carries_the_kind_of_its_last_edge() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/web");
    let f = g.file(&p, "src/ui.tsx");
    let (page, button, theme) = (
        g.symbol(&f, "Page"),
        g.symbol(&f, "Button"),
        g.symbol(&f, "Theme"),
    );
    g.edge(&page, &button, EdgeKind::Renders);
    g.edge(&button, &theme, EdgeKind::References);

    let reached = impact(&g.build(), &[theme], Direction::Callers, &opts());

    assert_eq!(find(&reached, "Button").kind, EdgeKind::References);
    assert_eq!(find(&reached, "Page").kind, EdgeKind::Renders);
}

#[test]
fn only_calls_imports_renders_references_and_http_are_followed() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let f = g.file(&p, "src/lib.ts");
    let (target, calls, extends, implements, depends) = (
        g.symbol(&f, "target"),
        g.symbol(&f, "viaCalls"),
        g.symbol(&f, "viaExtends"),
        g.symbol(&f, "viaImplements"),
        g.symbol(&f, "viaDependsOn"),
    );
    g.edge(&calls, &target, EdgeKind::Calls);
    g.edge(&extends, &target, EdgeKind::Extends);
    g.edge(&implements, &target, EdgeKind::Implements);
    g.edge(&depends, &target, EdgeKind::DependsOn);

    let reached = impact(&g.build(), &[target], Direction::Callers, &opts());

    assert_eq!(rows(&reached), [row("viaCalls", 1)]);
}

#[test]
fn http_edges_are_followed_unless_follow_http_is_off() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/web");
    let f = g.file(&p, "src/client.ts");
    let (client, handler) = (g.symbol(&f, "client"), g.symbol(&f, "handler"));
    g.edge(&client, &handler, EdgeKind::Http);
    let snap = g.build();
    let off = ImpactOptions {
        max_depth: 8,
        follow_http: false,
    };

    let with = impact(&snap, &[handler.clone()], Direction::Callers, &opts());
    let without = impact(&snap, &[handler], Direction::Callers, &off);

    assert_eq!(rows(&with), [row("client", 1)]);
    assert_eq!(with[0].kind, EdgeKind::Http);
    assert!(without.is_empty(), "{without:?}");
}

#[test]
fn a_test_symbol_with_a_direct_edge_makes_the_node_tested() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let f = g.file(&p, "src/lib.ts");
    let (covered, bare, caller, check) = (
        g.symbol(&f, "covered"),
        g.symbol(&f, "bare"),
        g.symbol(&f, "caller"),
        g.symbol(&f, "checksCovered"),
    );
    g.edge(&caller, &covered, EdgeKind::Calls);
    g.edge(&caller, &bare, EdgeKind::Calls);
    g.edge(&check, &covered, EdgeKind::Calls);
    let snap = set_subkind(g.build(), &check, "test");
    let seed = snap
        .nodes()
        .iter()
        .find(|n| n.id.symbol_key().as_deref() == Some("caller"))
        .map(|n| n.id.clone())
        .unwrap();

    let callers_of_covered = impact(&snap, &[covered], Direction::Callers, &opts());
    let callers_of_bare = impact(&snap, &[bare], Direction::Callers, &opts());
    let deps = impact(&snap, &[seed], Direction::Dependencies, &opts());

    assert!(!find(&callers_of_covered, "caller").tested);
    assert!(find(&deps, "covered").tested);
    assert!(!find(&deps, "bare").tested);
    assert_eq!(rows(&callers_of_bare), [row("caller", 1)]);
}

#[test]
fn a_test_file_importing_the_node_makes_it_tested() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let lib = g.file(&p, "src/lib.ts");
    let spec = g.file(&p, "src/lib.spec.ts");
    let (entry, covered, bare) = (
        g.symbol(&lib, "entry"),
        g.symbol(&lib, "covered"),
        g.symbol(&lib, "bare"),
    );
    g.edge(&entry, &covered, EdgeKind::Calls);
    g.edge(&entry, &bare, EdgeKind::Calls);
    g.edge(&spec, &covered, EdgeKind::Imports);

    let reached = impact(&g.build(), &[entry], Direction::Dependencies, &opts());

    assert!(find(&reached, "covered").tested);
    assert!(!find(&reached, "bare").tested);
}

#[test]
fn test_files_and_test_symbols_are_never_reached() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let lib = g.file(&p, "src/lib.ts");
    let spec = g.file(&p, "src/lib.spec.ts");
    let target = g.symbol(&lib, "target");
    let prod = g.symbol(&lib, "prod");
    let in_spec = g.symbol(&spec, "specHelper");
    let loose_test = g.symbol(&lib, "looseTest");
    g.edge(&prod, &target, EdgeKind::Calls);
    g.edge(&in_spec, &target, EdgeKind::Calls);
    g.edge(&loose_test, &target, EdgeKind::Calls);
    g.edge(&spec, &target, EdgeKind::Imports);
    let snap = set_subkind(g.build(), &loose_test, "test");

    let reached = impact(&snap, &[target], Direction::Callers, &opts());

    assert_eq!(rows(&reached), [row("prod", 1)]);
    assert!(!find(&reached, "prod").tested);
}

#[test]
fn only_symbols_are_reported_not_the_files_that_import_them() {
    let mut g = GraphBuilder::new("head");
    let p = g.package("@acme/api");
    let lib = g.file(&p, "src/lib.ts");
    let user = g.file(&p, "src/user.ts");
    let target = g.symbol(&lib, "target");
    let caller = g.symbol(&user, "caller");
    g.edge(&user, &target, EdgeKind::Imports);
    g.edge(&caller, &target, EdgeKind::Calls);

    let reached = impact(&g.build(), &[target], Direction::Callers, &opts());

    assert_eq!(rows(&reached), [row("caller", 1)]);
}

fn modified(id: &NodeId) -> NodeChange {
    NodeChange {
        id: id.clone(),
        status: NodeStatus::Modified {
            body: true,
            signature: None,
        },
        lines_added: 1,
        lines_removed: 0,
    }
}

#[test]
fn out_of_diff_keeps_the_reached_nodes_the_range_did_not_touch() {
    let ch = chain();
    let reached = impact(&ch.snap, &[ch.d.clone()], Direction::Callers, &opts());
    let diff = GraphDiff {
        base: "base".to_owned(),
        head: "head".to_owned(),
        nodes: vec![modified(&ch.c), modified(&ch.d)],
        files: Vec::<FileChange>::new(),
        edges: vec![],
    };

    let outside = out_of_diff(&diff, &reached);

    assert_eq!(rows(&outside), [row("a", 3), row("b", 2)]);
}

#[test]
fn out_of_diff_treats_added_and_moved_nodes_as_in_the_diff() {
    let ch = chain();
    let reached = impact(&ch.snap, &[ch.d.clone()], Direction::Callers, &opts());
    let diff = GraphDiff {
        base: "base".to_owned(),
        head: "head".to_owned(),
        nodes: vec![
            NodeChange {
                id: ch.c.clone(),
                status: NodeStatus::Added,
                lines_added: 3,
                lines_removed: 0,
            },
            NodeChange {
                id: ch.b.clone(),
                status: NodeStatus::Moved {
                    from: ch.b.clone(),
                    body: false,
                },
                lines_added: 0,
                lines_removed: 0,
            },
        ],
        files: vec![],
        edges: vec![],
    };

    let outside = out_of_diff(&diff, &reached);

    assert_eq!(rows(&outside), [row("a", 3)]);
}
