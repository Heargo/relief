//! Seam 1: edge diff, coupling aggregation and commit attribution on
//! `GraphBuilder` snapshots (no git).

use relief_diff::{
    CouplingChange, CouplingStatus, Level, SymbolTexts, attribute_edge_commits, coupling_changes,
    diff_graphs,
};
use relief_model::testing::GraphBuilder;
use relief_model::{EdgeChange, EdgeKind, EdgeStatus, GraphDiff, GraphSnapshot, NodeId};

const CART: &str = "apps/web/components/Cart.tsx";
const CHECKOUT: &str = "apps/web/pages/Checkout.tsx";
const HANDLER: &str = "apps/api/routes/checkout.ts";
const FIND: &str = "packages/db/repos/discountRepo.ts";
const SAVE: &str = "packages/db/repos/orderRepo.ts";

fn sym(pkg: &str, path: &str, name: &str) -> NodeId {
    NodeId::package(pkg).file(path).symbol(name)
}

fn cart() -> NodeId {
    sym("@acme/web", CART, "Cart")
}
fn checkout() -> NodeId {
    sym("@acme/web", CHECKOUT, "Checkout")
}
fn handler() -> NodeId {
    sym("@acme/api", HANDLER, "handler")
}
fn find() -> NodeId {
    sym("@acme/db", FIND, "find")
}
fn save() -> NodeId {
    sym("@acme/db", SAVE, "save")
}

/// Same nodes in every snapshot; only the edges differ.
fn graph(commit: &str, edges: &[(NodeId, NodeId, EdgeKind)]) -> GraphSnapshot {
    let mut b = GraphBuilder::new(commit);
    let web = b.package("@acme/web");
    let api = b.package("@acme/api");
    let db = b.package("@acme/db");
    let f = b.file(&web, CART);
    b.symbol(&f, "Cart");
    let f = b.file(&web, CHECKOUT);
    b.symbol(&f, "Checkout");
    let f = b.file(&api, HANDLER);
    b.symbol(&f, "handler");
    let f = b.file(&db, FIND);
    b.symbol(&f, "find");
    let f = b.file(&db, SAVE);
    b.symbol(&f, "save");
    for (from, to, kind) in edges {
        b.edge(from, to, *kind);
    }
    b.build()
}

/// base: handler -> save (calls), Checkout -> handler (http).
fn base() -> GraphSnapshot {
    graph(
        "base",
        &[
            (handler(), save(), EdgeKind::Calls),
            (checkout(), handler(), EdgeKind::Http),
        ],
    )
}

/// head: handler -> save (kept), handler -> find (added, calls),
/// Cart -> find (added, imports); Checkout -> handler removed.
fn head() -> GraphSnapshot {
    graph(
        "head",
        &[
            (handler(), save(), EdgeKind::Calls),
            (handler(), find(), EdgeKind::Calls),
            (cart(), find(), EdgeKind::Imports),
        ],
    )
}

fn diff_of(base: &GraphSnapshot, head: &GraphSnapshot) -> GraphDiff {
    diff_graphs(base, head, &[], &SymbolTexts::default())
}

fn edge(from: NodeId, to: NodeId, kind: EdgeKind, status: EdgeStatus) -> EdgeChange {
    EdgeChange {
        from,
        to,
        kind,
        status,
        commit: None,
    }
}

fn coupling(from: &str, to: &str, status: CouplingStatus) -> CouplingChange {
    CouplingChange {
        from: from.to_owned(),
        to: to.to_owned(),
        status,
    }
}

#[test]
fn an_added_edge_is_added() {
    let diff = diff_of(&base(), &head());
    assert!(
        diff.edges
            .contains(&edge(cart(), find(), EdgeKind::Imports, EdgeStatus::Added))
    );
    assert!(
        diff.edges
            .contains(&edge(handler(), find(), EdgeKind::Calls, EdgeStatus::Added))
    );
}

#[test]
fn a_removed_edge_is_removed() {
    let diff = diff_of(&base(), &head());
    assert!(diff.edges.contains(&edge(
        checkout(),
        handler(),
        EdgeKind::Http,
        EdgeStatus::Removed
    )));
}

#[test]
fn an_unchanged_edge_has_no_entry() {
    let diff = diff_of(&base(), &head());
    assert!(
        !diff
            .edges
            .iter()
            .any(|e| e.from == handler() && e.to == save())
    );
    assert_eq!(diff.edges.len(), 3);
}

#[test]
fn identical_snapshots_give_no_edge_changes() {
    let diff = diff_of(&base(), &base());
    assert!(diff.edges.is_empty());
}

#[test]
fn the_edge_key_includes_the_kind() {
    let before = graph("base", &[(cart(), find(), EdgeKind::Calls)]);
    let after = graph(
        "head",
        &[
            (cart(), find(), EdgeKind::Calls),
            (cart(), find(), EdgeKind::Imports),
        ],
    );
    let diff = diff_of(&before, &after);
    assert_eq!(
        diff.edges,
        vec![edge(cart(), find(), EdgeKind::Imports, EdgeStatus::Added)]
    );
}

#[test]
fn module_level_lists_new_and_gone_pairs_only() {
    let (b, h) = (base(), head());
    let diff = diff_of(&b, &h);
    let changes = coupling_changes(&b, &h, &diff, Level::Module);
    // handler -> find joins apps/api/routes and packages/db/repos, which
    // already had handler -> save: not new.
    assert_eq!(
        changes,
        vec![
            coupling(
                "apps/web/components",
                "packages/db/repos",
                CouplingStatus::New
            ),
            coupling("apps/web/pages", "apps/api/routes", CouplingStatus::Gone),
        ]
    );
}

#[test]
fn file_level_pairs_are_files() {
    let (b, h) = (base(), head());
    let diff = diff_of(&b, &h);
    let changes = coupling_changes(&b, &h, &diff, Level::File);
    assert_eq!(
        changes,
        vec![
            coupling(CART, FIND, CouplingStatus::New),
            coupling(HANDLER, FIND, CouplingStatus::New),
            coupling(CHECKOUT, HANDLER, CouplingStatus::Gone),
        ]
    );
}

#[test]
fn system_level_pairs_are_packages() {
    let (b, h) = (base(), head());
    let diff = diff_of(&b, &h);
    let changes = coupling_changes(&b, &h, &diff, Level::System);
    // @acme/api -> @acme/db already existed through handler -> save.
    assert_eq!(
        changes,
        vec![
            coupling("pkg:@acme/web", "pkg:@acme/db", CouplingStatus::New),
            coupling("pkg:@acme/web", "pkg:@acme/api", CouplingStatus::Gone),
        ]
    );
}

#[test]
fn a_pair_that_still_has_a_fine_edge_is_not_gone() {
    // Removing handler -> save while handler -> find remains keeps the
    // routes -> repos module pair alive.
    let before = graph(
        "base",
        &[
            (handler(), save(), EdgeKind::Calls),
            (handler(), find(), EdgeKind::Calls),
        ],
    );
    let after = graph("head", &[(handler(), find(), EdgeKind::Calls)]);
    let diff = diff_of(&before, &after);
    assert_eq!(diff.edges.len(), 1);
    assert!(coupling_changes(&before, &after, &diff, Level::Module).is_empty());
}

#[test]
fn an_edge_appears_in_the_first_commit_of_the_range_that_has_it() {
    let c1 = graph("c1", &[(handler(), save(), EdgeKind::Calls)]);
    let c2 = graph(
        "c2",
        &[
            (handler(), save(), EdgeKind::Calls),
            (cart(), find(), EdgeKind::Imports),
        ],
    );
    let c3 = graph(
        "c3",
        &[
            (handler(), save(), EdgeKind::Calls),
            (handler(), find(), EdgeKind::Calls),
            (cart(), find(), EdgeKind::Imports),
        ],
    );
    let mut diff = diff_of(&base(), &c3);

    attribute_edge_commits(&mut diff, &[c1, c2, c3]);

    let commit_of = |from: NodeId, to: NodeId| {
        diff.edges
            .iter()
            .find(|e| e.from == from && e.to == to)
            .and_then(|e| e.commit.clone())
    };
    assert_eq!(commit_of(cart(), find()), Some("c2".to_owned()));
    assert_eq!(commit_of(handler(), find()), Some("c3".to_owned()));
}

#[test]
fn without_commit_snapshots_the_commit_stays_empty() {
    let mut diff = diff_of(&base(), &head());
    attribute_edge_commits(&mut diff, &[]);
    assert!(diff.edges.iter().all(|e| e.commit.is_none()));
}

#[test]
fn edge_change_json_shape() {
    let added = EdgeChange {
        commit: Some("c2".to_owned()),
        ..edge(cart(), find(), EdgeKind::Imports, EdgeStatus::Added)
    };
    assert_eq!(
        serde_json::to_value(&added).unwrap(),
        serde_json::json!({
            "from": "pkg:@acme/web::file:apps/web/components/Cart.tsx::sym:Cart",
            "to": "pkg:@acme/db::file:packages/db/repos/discountRepo.ts::sym:find",
            "kind": "imports",
            "status": "added",
            "commit": "c2"
        })
    );
    let v = serde_json::to_value(diff_of(&base(), &head())).unwrap();
    assert_eq!(v["edges"].as_array().unwrap().len(), 3);
}
