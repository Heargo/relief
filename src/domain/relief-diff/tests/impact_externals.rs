//! Ticket X02: the "dependencies" walk of `impact` also reaches the externals imported by the
//! file of a reached symbol (edges `file -> pkg:external/x`, kind `imports`).
//!
//! Depth: an external is one hop past the symbol whose file imports it (depth of the symbol + 1,
//! the seed counting 0): the seed's own file gives depth 1. `callers` is unchanged.

use relief_diff::{Direction, ImpactOptions, Reached, impact};
use relief_model::testing::GraphBuilder;
use relief_model::{Edge, EdgeKind, GraphSnapshot, Node, NodeId, NodeKind, Precision, Visibility};

fn opts() -> ImpactOptions {
    ImpactOptions {
        max_depth: 8,
        follow_http: true,
    }
}

fn external(name: &str) -> (NodeId, Node) {
    let id: NodeId = format!("pkg:external/{name}").parse().unwrap();
    let node = Node {
        id: id.clone(),
        kind: NodeKind::External,
        subkind: "external".to_owned(),
        parent: None,
        lang: None,
        span: None,
        visibility: Visibility::Public,
        content_hash: String::new(),
        signature_hash: None,
        metrics: None,
        path: None,
        route: None,
        entry: false,
        entry_type: None,
        child_count: None,
        is_test: false,
        branch: None,
        labels: None,
    };
    (id, node)
}

struct World {
    snap: GraphSnapshot,
    s: NodeId,
    t: NodeId,
    x: NodeId,
    y: NodeId,
}

/// S (a.ts, which imports y) calls T (b.ts, which imports x).
fn world() -> World {
    let mut g = GraphBuilder::new("head");
    let p = g.package("p");
    let fa = g.file(&p, "a.ts");
    let fb = g.file(&p, "b.ts");
    let s = g.symbol(&fa, "S");
    let t = g.symbol(&fb, "T");
    g.edge(&s, &t, EdgeKind::Calls);
    let snap = g.build();
    let (x, xn) = external("x");
    let (y, yn) = external("y");
    let mut nodes = snap.nodes().to_vec();
    nodes.extend([xn, yn]);
    let mut edges = snap.edges().to_vec();
    for (from, to) in [(&fa, &y), (&fb, &x)] {
        edges.push(Edge {
            from: from.clone(),
            to: to.clone(),
            kind: EdgeKind::Imports,
            precision: Precision::Syntactic,
            heuristic: false,
            count: None,
        });
    }
    World {
        snap: GraphSnapshot::new(snap.commit().to_owned(), nodes, edges),
        s,
        t,
        x,
        y,
    }
}

fn depth_of(reached: &[Reached], id: &NodeId) -> Option<usize> {
    reached.iter().find(|r| &r.node == id).map(|r| r.depth)
}

#[test]
fn dependencies_reach_the_externals_imported_by_the_seed_file_at_depth_one() {
    let w = world();
    let reached = impact(&w.snap, &[w.s.clone()], Direction::Dependencies, &opts());
    assert_eq!(depth_of(&reached, &w.y), Some(1), "{reached:#?}");
}

#[test]
fn dependencies_reach_the_externals_imported_by_the_file_of_a_reached_symbol() {
    let w = world();
    let reached = impact(&w.snap, &[w.s.clone()], Direction::Dependencies, &opts());
    assert_eq!(depth_of(&reached, &w.t), Some(1));
    assert_eq!(depth_of(&reached, &w.x), Some(2), "{reached:#?}");
}

#[test]
fn the_depth_limit_still_applies_to_externals() {
    let w = world();
    let limited = ImpactOptions {
        max_depth: 1,
        follow_http: true,
    };
    let reached = impact(&w.snap, &[w.s.clone()], Direction::Dependencies, &limited);
    assert_eq!(depth_of(&reached, &w.y), Some(1));
    assert_eq!(depth_of(&reached, &w.x), None);
}

#[test]
fn callers_never_reach_externals() {
    let w = world();
    let reached = impact(&w.snap, &[w.t.clone()], Direction::Callers, &opts());
    assert_eq!(depth_of(&reached, &w.s), Some(1));
    assert_eq!(depth_of(&reached, &w.x), None);
    assert_eq!(depth_of(&reached, &w.y), None);
    assert_eq!(reached.len(), 1);
}
