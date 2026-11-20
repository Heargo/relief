use relief_model::testing::GraphBuilder;
use relief_model::{EdgeKind, NodeId};

fn ids<'a>(nodes: impl IntoIterator<Item = &'a relief_model::Node>) -> Vec<String> {
    nodes.into_iter().map(|n| n.id.to_string()).collect()
}

#[test]
fn valid_snapshot_passes_validation() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let file = b.file(&pkg, "src/x.ts");
    let sym = b.symbol(&file, "A.b");
    b.edge(&sym, &file, EdgeKind::References);
    assert!(b.build().validate().is_ok());
}

#[test]
fn edge_to_unknown_id_is_rejected_with_the_id_in_the_message() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let file = b.file(&pkg, "src/x.ts");
    let ghost = NodeId::package("@acme/api").file("src/ghost.ts");
    b.edge(&file, &ghost, EdgeKind::Imports);
    let err = b.build().validate().unwrap_err();
    assert!(
        err.to_string().contains("pkg:@acme/api::file:src/ghost.ts"),
        "message was: {err}"
    );
}

#[test]
fn edge_from_unknown_id_is_rejected_with_the_id_in_the_message() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let ghost = NodeId::package("@acme/api").file("src/ghost.ts");
    b.edge(&ghost, &pkg, EdgeKind::Imports);
    let err = b.build().validate().unwrap_err();
    assert!(
        err.to_string().contains("src/ghost.ts"),
        "message was: {err}"
    );
}

#[test]
fn unknown_parent_is_rejected_with_the_id_in_the_message() {
    let mut b = GraphBuilder::new("c0ffee");
    let ghost = NodeId::package("@acme/api").file("src/ghost.ts");
    b.symbol(&ghost, "orphan");
    let err = b.build().validate().unwrap_err();
    assert!(
        err.to_string().contains("src/ghost.ts"),
        "message was: {err}"
    );
}

#[test]
fn looks_up_a_node_by_id() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let file = b.file(&pkg, "src/x.ts");
    let snap = b.build();
    assert_eq!(
        snap.node(&file).map(|n| n.id.to_string()).as_deref(),
        Some("pkg:@acme/api::file:src/x.ts")
    );
    assert!(snap.node(&NodeId::package("nope")).is_none());
}

#[test]
fn children_are_the_direct_contained_nodes() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let f1 = b.file(&pkg, "src/a.ts");
    b.file(&pkg, "src/b.ts");
    b.symbol(&f1, "inner");
    let snap = b.build();
    assert_eq!(
        ids(snap.children(&pkg)),
        vec![
            "pkg:@acme/api::file:src/a.ts",
            "pkg:@acme/api::file:src/b.ts"
        ]
    );
    assert_eq!(
        ids(snap.children(&f1)),
        vec!["pkg:@acme/api::file:src/a.ts::sym:inner"]
    );
}

#[test]
fn ancestors_go_from_parent_up_to_the_root() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let file = b.file(&pkg, "src/x.ts");
    let sym = b.symbol(&file, "A.b");
    let snap = b.build();
    assert_eq!(
        ids(snap.ancestors(&sym)),
        vec!["pkg:@acme/api::file:src/x.ts", "pkg:@acme/api"]
    );
    assert!(snap.ancestors(&pkg).into_iter().next().is_none());
}

#[test]
fn leaves_are_nodes_without_children() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let f1 = b.file(&pkg, "src/a.ts");
    b.file(&pkg, "src/b.ts");
    b.symbol(&f1, "inner");
    let snap = b.build();
    assert_eq!(
        ids(snap.leaves()),
        vec![
            "pkg:@acme/api::file:src/a.ts::sym:inner",
            "pkg:@acme/api::file:src/b.ts"
        ]
    );
}
