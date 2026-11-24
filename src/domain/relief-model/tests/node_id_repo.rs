use relief_model::NodeId;
use relief_model::testing::GraphBuilder;

fn file_id() -> NodeId {
    NodeId::package("@acme/api").file("src/billing/invoice.ts")
}

fn symbol_id() -> NodeId {
    file_id().symbol("computeTotal")
}

#[test]
fn prefixes_an_id_with_its_repo() {
    let id = NodeId::package("@acme/api")
        .file("src/a.ts")
        .in_repo("api")
        .unwrap();
    assert_eq!(id.to_string(), "repo:api/pkg:@acme/api::file:src/a.ts");
}

#[test]
fn prefixed_id_round_trips_for_every_node_kind() {
    let cases = [
        (NodeId::package("@acme/api"), "repo:api/pkg:@acme/api"),
        (
            file_id(),
            "repo:api/pkg:@acme/api::file:src/billing/invoice.ts",
        ),
        (
            symbol_id(),
            "repo:api/pkg:@acme/api::file:src/billing/invoice.ts::sym:computeTotal",
        ),
    ];
    for (local, text) in cases {
        let id = local.clone().in_repo("api").unwrap();
        assert_eq!(id.to_string(), text);
        let parsed: NodeId = text.parse().unwrap();
        assert_eq!(parsed, id);
        assert_eq!(parsed.to_string(), text);
        assert_eq!(parsed.repo(), Some("api"));
        assert_eq!(parsed.without_repo(), local);
    }
}

#[test]
fn id_without_prefix_is_unchanged_and_has_no_repo() {
    let text = "pkg:@acme/api::file:src/billing/invoice.ts::sym:computeTotal";
    let id: NodeId = text.parse().unwrap();
    assert_eq!(id.to_string(), text);
    assert_eq!(id.repo(), None);
    assert_eq!(id.without_repo(), id);
    assert_eq!(symbol_id().repo(), None);
}

#[test]
fn repo_name_with_dashes_dots_and_spaces_round_trips() {
    for name in ["my-api", "api.v2", "my api"] {
        let id = file_id().in_repo(name).unwrap();
        let parsed: NodeId = id.to_string().parse().unwrap();
        assert_eq!(parsed.repo(), Some(name));
        assert_eq!(parsed, id);
    }
}

#[test]
fn same_local_id_in_two_repos_gives_distinct_ids() {
    let a = file_id().in_repo("api").unwrap();
    let b = file_id().in_repo("web").unwrap();
    assert_ne!(a, b);
    assert_ne!(a, file_id());
    assert_eq!(a.without_repo(), b.without_repo());
}

#[test]
fn prefixed_id_keeps_its_accessors() {
    let id = symbol_id().in_repo("api").unwrap();
    assert_eq!(id.file_path(), Some("src/billing/invoice.ts"));
    assert_eq!(id.symbol_key().as_deref(), Some("computeTotal"));
    assert_eq!(id.file_id(), file_id().in_repo("api").unwrap());
}

#[test]
fn refuses_invalid_repo_names() {
    assert!(file_id().in_repo("").is_err());
    assert!(file_id().in_repo("a/b").is_err());
}

#[test]
fn rejects_a_prefix_with_an_empty_repo_name() {
    assert!("repo:/pkg:@acme/api".parse::<NodeId>().is_err());
}

#[test]
fn prefixed_id_serializes_as_a_plain_json_string() {
    let id = file_id().in_repo("api").unwrap();
    let json = serde_json::to_string(&id).unwrap();
    assert_eq!(
        json,
        r#""repo:api/pkg:@acme/api::file:src/billing/invoice.ts""#
    );
    let back: NodeId = serde_json::from_str(&json).unwrap();
    assert_eq!(back, id);
}

#[test]
fn single_repo_graph_json_has_no_prefix() {
    let mut b = GraphBuilder::new("c0ffee");
    let pkg = b.package("@acme/api");
    b.file(&pkg, "src/a.ts");
    let v = serde_json::to_value(b.build()).unwrap();
    assert_eq!(v["nodes"][1]["id"], "pkg:@acme/api::file:src/a.ts");
    assert!(!v.to_string().contains("repo:"));
    // ...and a prefixed id is a distinct, explicit opt-in.
    assert_eq!(
        serde_json::to_value(pkg.in_repo("api").unwrap()).unwrap(),
        "repo:api/pkg:@acme/api"
    );
}
