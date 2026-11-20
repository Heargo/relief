//! Seam 1 of ticket S03: the ranking of the search, a pure function on a snapshot (no git).
//!
//! API expected: `relief_diff::rank_search(&GraphSnapshot, query: &str, limit: usize) ->
//! Vec<NodeId>`, best match first. Rules (those `Session::search` applies today): the query is
//! trimmed and lowercased, an empty query finds nothing,
//! rank 0 = the name or the label equals the query, 1 = starts with it, 2 = the label contains
//! it, 3 = the whole id contains it; ties keep the order of the snapshot; at most `limit` ids.

use relief_diff::rank_search;
use relief_model::testing::GraphBuilder;
use relief_model::{GraphSnapshot, NodeId};

fn graph() -> (GraphSnapshot, Vec<NodeId>) {
    let mut b = GraphBuilder::new("c1");
    let pkg = b.package("@acme/api");
    // Snapshot order: contains, prefix, exact, then hits through the path only.
    let file = b.file(&pkg, "src/billing.ts");
    let contains = b.symbol(&file, "computeTotal");
    let prefix = b.symbol(&file, "totalsOf");
    let exact = b.symbol(&file, "total");
    let util = b.file(&pkg, "src/total/util.ts");
    let by_id = b.symbol(&util, "helper");
    (b.build(), vec![file, contains, prefix, exact, util, by_id])
}

#[test]
fn ranks_exact_then_prefix_then_contains_then_id() {
    let (g, ids) = graph();
    // Ranks: total 0, totalsOf 1, computeTotal 2, the file `src/total/util.ts` 2 (its label
    // contains the query), `helper` 3 (only its id does); ties in snapshot order.
    assert_eq!(
        rank_search(&g, "total", 10),
        vec![
            ids[3].clone(),
            ids[2].clone(),
            ids[1].clone(),
            ids[4].clone(),
            ids[5].clone()
        ]
    );
}

#[test]
fn is_case_insensitive_and_trims_the_query() {
    let (g, ids) = graph();
    assert_eq!(rank_search(&g, "  TOTAL ", 1), vec![ids[3].clone()]);
}

#[test]
fn an_empty_query_finds_nothing() {
    let (g, _) = graph();
    assert!(rank_search(&g, "   ", 10).is_empty());
}

#[test]
fn stops_at_the_limit() {
    let (g, ids) = graph();
    assert_eq!(
        rank_search(&g, "total", 2),
        vec![ids[3].clone(), ids[2].clone()]
    );
}

#[test]
fn ties_keep_the_snapshot_order() {
    let mut b = GraphBuilder::new("c1");
    let pkg = b.package("p");
    let file = b.file(&pkg, "a.ts");
    let first = b.symbol(&file, "fooB");
    let second = b.symbol(&file, "fooA");
    let g = b.build();
    assert_eq!(rank_search(&g, "foo", 10), vec![first, second]);
}
