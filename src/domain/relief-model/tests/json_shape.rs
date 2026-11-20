use relief_model::testing::GraphBuilder;
use relief_model::{EdgeKind, GraphSnapshot};

fn small_graph() -> GraphSnapshot {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    let a = b.file(&pkg, "src/a.ts");
    let c = b.file(&pkg, "src/c.ts");
    let sym = b.symbol(&a, "A.b");
    b.edge(&a, &c, EdgeKind::Imports);
    b.edge(&sym, &c, EdgeKind::Calls);
    b.build()
}

#[test]
fn json_snapshot_of_a_small_graph() {
    insta::assert_json_snapshot!(small_graph());
}

#[test]
fn json_uses_camel_case_and_lowercase_enums() {
    let v = serde_json::to_value(small_graph()).unwrap();
    assert_eq!(v["commit"], "c0ffee");
    assert_eq!(v["nodes"][0]["id"], "pkg:@acme/api");
    assert_eq!(v["nodes"][0]["kind"], "package");
    assert!(v["nodes"][0].get("contentHash").is_some());
    assert!(v["nodes"][0].get("content_hash").is_none());
    assert_eq!(v["edges"][0]["kind"], "imports");
    assert_eq!(v["edges"][1]["kind"], "calls");
}

#[test]
fn json_round_trips() {
    let snap = small_graph();
    let json = serde_json::to_string(&snap).unwrap();
    let back: GraphSnapshot = serde_json::from_str(&json).unwrap();
    assert_eq!(serde_json::to_string(&back).unwrap(), json);
}
