//! Seam 1 of ticket S01: the budgeted snapshot, the budgeted diff and `Session::search`, on the
//! generated fixture `wide` (10 packages x 300 files, one function per file) opened as a `Session`.
//!
//! `wide` has the shape repo > `packages` > `pkg-00..pkg-09` > 300 files each > 1 symbol each:
//! 6 012 nodes, and no edge at all (the files do not import each other).
//!
//! API expected (contract chosen by the red step, to be kept by green):
//! - `SnapshotRequest { rev, budget: Option<usize>, expand: Vec<NodeId> }` and
//!   `DiffRequest { range, budget: Option<usize>, expand: Vec<NodeId> }`;
//! - budget: the response holds the levels of the tree (repo, then its children, ...) one after
//!   the other for as long as the total stays within the budget; a container whose children are
//!   not in the response carries `Node.child_count: Option<usize>` (JSON `childCount`), the exact
//!   number of its direct children in the full graph; without a budget, or when the whole graph
//!   fits, no node has a `child_count`;
//! - `expand`: the direct children of each listed container are added (closed in turn when they
//!   are containers), whatever the levels reached;
//! - closed containers: `Edge.count: Option<u32>` (JSON `count`) on an edge aggregated between
//!   two containers, the number of real edges it stands for;
//! - `DiffResponse.graph: Option<GraphSnapshot>` (JSON `graph`), only with a budget: the head
//!   subgraph of a review = changed nodes + their 1-hop neighbours + all their ancestors, every
//!   other container closed with its `child_count`; a container that has only some of its children
//!   in it also carries its `child_count`;
//! - `Session::search(&SearchRequest { range: Option<RangeSpec>, query: String, limit: usize })
//!   -> Result<SearchResponse, AppError>`, `SearchResponse { hits: Vec<SearchHit> }`,
//!   `SearchHit { id: NodeId, kind: NodeKind }`, over the head snapshot of the range (worktree
//!   by default), best match first, at most `limit` hits, never `repo` nor `external` nodes.

mod common;

use std::path::PathBuf;
use std::sync::OnceLock;

use common::{acme, options};
use relief_app::{DiffRequest, RangeSpec, SearchRequest, Session, SnapshotRequest};
use relief_fixtures::Fixture;
use relief_model::{GraphSnapshot, NodeId};
use tempfile::TempDir;

const PKG: &str = "pkg:wide/packages/pkg-03";
const CHANGED_A: &str = "pkg:wide/packages/pkg-02::file:packages/pkg-02/file-005.ts";
const CHANGED_A_SYM: &str = "pkg:wide/packages/pkg-02::file:packages/pkg-02/file-005.ts::sym:f2x5";
const CHANGED_B: &str = "pkg:wide/packages/pkg-07::file:packages/pkg-07/file-250.ts";

struct Wide {
    _dir: TempDir,
    session: Session,
}

/// `wide` built once for the whole file, with two files modified in the working tree.
fn wide() -> &'static Wide {
    static WIDE: OnceLock<Wide> = OnceLock::new();
    WIDE.get_or_init(|| {
        let dir = TempDir::new().unwrap();
        let path: PathBuf = dir.path().join("wide");
        Fixture::load("wide")
            .unwrap()
            .build_with_worktree(&path, |repo| {
                for (file, name) in [
                    ("pkg-02/file-005.ts", "f2x5"),
                    ("pkg-07/file-250.ts", "f7x250"),
                ] {
                    std::fs::write(
                        repo.join("packages").join(file),
                        format!("export function {name}(): number {{\n  return 99999;\n}}\n"),
                    )
                    .unwrap();
                }
            })
            .unwrap();
        let session = Session::open(&path, options(None)).unwrap();
        Wide { _dir: dir, session }
    })
}

fn id(text: &str) -> NodeId {
    text.parse().unwrap()
}

fn snapshot(budget: Option<usize>, expand: &[&str]) -> GraphSnapshot {
    wide()
        .session
        .snapshot(&SnapshotRequest {
            rev: "HEAD".into(),
            budget,
            expand: expand.iter().map(|e| id(e)).collect(),
        })
        .unwrap()
        .graph
}

fn has(graph: &GraphSnapshot, node: &str) -> bool {
    graph.node(&id(node)).is_some()
}

fn child_count(graph: &GraphSnapshot, node: &str) -> Option<usize> {
    graph.node(&id(node)).unwrap().child_count
}

fn children(graph: &GraphSnapshot, node: &str) -> usize {
    graph.children(&id(node)).count()
}

#[test]
fn a_budget_of_2000_returns_at_most_2000_nodes_with_exact_counts_on_the_closed_packages() {
    let graph = snapshot(Some(2000), &[]);
    assert!(graph.nodes().len() <= 2000, "{} nodes", graph.nodes().len());
    for p in 0..10 {
        let pkg = format!("pkg:wide/packages/pkg-{p:02}");
        assert!(has(&graph, &pkg), "{pkg} is in the subgraph");
        assert_eq!(child_count(&graph, &pkg), Some(300), "{pkg}");
        assert_eq!(children(&graph, &pkg), 0, "{pkg} is closed");
    }
    assert!(!has(
        &graph,
        &format!("{PKG}::file:packages/pkg-03/file-007.ts")
    ));
}

#[test]
fn without_a_budget_the_snapshot_is_the_whole_graph_without_counts() {
    let graph = snapshot(None, &[]);
    assert_eq!(graph.nodes().len(), 6012);
    assert!(graph.nodes().iter().all(|n| n.child_count.is_none()));
}

#[test]
fn a_graph_that_fits_the_budget_is_returned_whole_without_counts() {
    let (_acme, session) = acme();
    let full = session
        .snapshot(&SnapshotRequest {
            rev: "main".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap()
        .graph;
    let budgeted = session
        .snapshot(&SnapshotRequest {
            rev: "main".into(),
            budget: Some(2000),
            expand: vec![],
        })
        .unwrap()
        .graph;
    assert_eq!(budgeted.nodes().len(), full.nodes().len());
    assert_eq!(budgeted.edges().len(), full.edges().len());
    assert!(budgeted.nodes().iter().all(|n| n.child_count.is_none()));
}

#[test]
fn expanding_a_package_adds_its_300_files_closed_on_their_symbol() {
    let graph = snapshot(Some(2000), &[PKG]);
    assert!(graph.nodes().len() <= 2000, "{} nodes", graph.nodes().len());
    assert_eq!(children(&graph, PKG), 300);
    let file = format!("{PKG}::file:packages/pkg-03/file-007.ts");
    assert!(has(&graph, &file));
    assert_eq!(child_count(&graph, &file), Some(1));
    assert!(!has(&graph, &format!("{file}::sym:f3x7")), "one level only");
    // The other packages stay closed.
    assert_eq!(children(&graph, "pkg:wide/packages/pkg-04"), 0);
    assert_eq!(child_count(&graph, "pkg:wide/packages/pkg-04"), Some(300));
}

#[test]
fn expanding_a_file_reveals_its_symbol() {
    let file = format!("{PKG}::file:packages/pkg-03/file-007.ts");
    let graph = snapshot(Some(2000), &[PKG, &file]);
    assert!(has(&graph, &format!("{file}::sym:f3x7")));
}

#[test]
fn closed_containers_carry_aggregated_edges_with_the_number_of_edges_they_stand_for() {
    // acme-shop has 4 packages and the externals at the first levels: a budget of 20 stops
    // there, so the edges between the real nodes are replaced by edges between containers.
    let (_acme, session) = acme();
    let graph = session
        .snapshot(&SnapshotRequest {
            rev: "main".into(),
            budget: Some(20),
            expand: vec![],
        })
        .unwrap()
        .graph;
    assert!(graph.nodes().len() <= 20, "{} nodes", graph.nodes().len());
    assert_eq!(child_count(&graph, "pkg:@acme/api"), Some(5));
    assert!(
        !graph.edges().is_empty(),
        "aggregated edges are pre-computed"
    );
    for e in graph.edges() {
        assert!(
            graph.node(&e.from).is_some(),
            "{} is in the subgraph",
            e.from
        );
        assert!(graph.node(&e.to).is_some(), "{} is in the subgraph", e.to);
        assert!(e.count.is_some_and(|c| c >= 1), "{} -> {}", e.from, e.to);
    }
    assert!(
        graph.edges().iter().any(|e| e.count.is_some_and(|c| c > 1)),
        "at least one edge stands for several imports"
    );
}

#[test]
fn the_budgeted_diff_keeps_the_changed_files_their_ancestors_and_closes_the_rest() {
    let response = wide()
        .session
        .diff(&DiffRequest {
            range: None,
            budget: Some(2000),
            expand: vec![],
        })
        .unwrap();
    // The diff itself is the full one: two files, two symbols.
    let changed: Vec<String> = response.diff.files.iter().map(|f| f.path.clone()).collect();
    assert_eq!(changed.len(), 2, "{changed:?}");
    let graph = response
        .graph
        .expect("a budgeted diff carries the subgraph");
    assert!(graph.nodes().len() <= 2000, "{} nodes", graph.nodes().len());
    for node in [
        CHANGED_A,
        CHANGED_A_SYM,
        CHANGED_B,
        "pkg:wide/packages/pkg-02",
        "pkg:wide/packages/pkg-07",
        "pkg:wide/packages",
        "pkg:wide",
    ] {
        assert!(has(&graph, node), "{node} is in the subgraph");
    }
    // A package with changes lists only those, and says how many files it has.
    assert_eq!(children(&graph, "pkg:wide/packages/pkg-02"), 1);
    assert_eq!(child_count(&graph, "pkg:wide/packages/pkg-02"), Some(300));
    // An untouched package is closed.
    assert_eq!(children(&graph, "pkg:wide/packages/pkg-00"), 0);
    assert_eq!(child_count(&graph, "pkg:wide/packages/pkg-00"), Some(300));
}

#[test]
fn the_diff_without_a_budget_carries_no_subgraph() {
    let response = wide()
        .session
        .diff(&DiffRequest {
            range: None,
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert!(response.graph.is_none());
}

#[test]
fn search_finds_a_symbol_that_the_budgeted_snapshot_does_not_hold() {
    assert!(!has(
        &snapshot(Some(2000), &[]),
        "pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts::sym:f7x42"
    ));
    let found = wide()
        .session
        .search(&SearchRequest {
            range: None,
            query: "f7x42".into(),
            limit: 8,
        })
        .unwrap();
    let first = found.hits.first().expect("a hit");
    assert_eq!(
        first.id.to_string(),
        "pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts::sym:f7x42"
    );
    assert_eq!(format!("{:?}", first.kind), "Symbol");
}

#[test]
fn search_stops_at_the_limit_and_never_returns_the_repo() {
    let found = wide()
        .session
        .search(&SearchRequest {
            range: Some(RangeSpec::parse("HEAD").unwrap()),
            query: "file-00".into(),
            limit: 5,
        })
        .unwrap();
    assert_eq!(found.hits.len(), 5);
    assert!(found.hits.iter().all(|h| h.id.to_string() != "pkg:wide"));
}

#[test]
fn search_without_a_match_returns_no_hit() {
    let found = wide()
        .session
        .search(&SearchRequest {
            range: None,
            query: "zzzzqqq".into(),
            limit: 8,
        })
        .unwrap();
    assert!(found.hits.is_empty());
}
