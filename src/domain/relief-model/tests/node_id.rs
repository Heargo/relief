use relief_model::NodeId;

#[test]
fn builds_the_documented_stable_id() {
    let id = NodeId::package("@acme/api")
        .file("src/billing/invoice.ts")
        .symbol("computeTotal");
    assert_eq!(
        id.to_string(),
        "pkg:@acme/api::file:src/billing/invoice.ts::sym:computeTotal"
    );
}

#[test]
fn method_symbol_keeps_its_dotted_name() {
    let id = NodeId::package("@acme/api")
        .file("src/x.ts")
        .symbol("SessionStore.refresh");
    assert_eq!(
        id.to_string(),
        "pkg:@acme/api::file:src/x.ts::sym:SessionStore.refresh"
    );
}

#[test]
fn text_to_id_to_text_is_identical() {
    let text = "pkg:@acme/api::file:src/billing/invoice.ts::sym:computeTotal";
    let id: NodeId = text.parse().unwrap();
    assert_eq!(id.to_string(), text);
    assert_eq!(
        id,
        NodeId::package("@acme/api")
            .file("src/billing/invoice.ts")
            .symbol("computeTotal")
    );
}

#[test]
fn round_trips_names_containing_double_colons() {
    let id = NodeId::package("pkg::weird")
        .file("a::b.ts")
        .symbol("ns::fn");
    let text = id.to_string();
    let parsed: NodeId = text.parse().unwrap();
    assert_eq!(parsed, id);
    assert_eq!(parsed.to_string(), text);
}

#[test]
fn round_trips_names_containing_spaces() {
    let id = NodeId::package("my pkg")
        .file("src/my file.ts")
        .symbol("a b");
    let text = id.to_string();
    let parsed: NodeId = text.parse().unwrap();
    assert_eq!(parsed, id);
    assert_eq!(parsed.to_string(), text);
}

#[test]
fn escaped_double_colon_does_not_add_a_segment() {
    let one = NodeId::package("a").file("x::y");
    let two = NodeId::package("a").file("x").file("y");
    assert_ne!(one, two);
    assert_ne!(one.to_string(), two.to_string());
}

#[test]
fn rejects_text_without_a_known_segment_kind() {
    assert!("nope:abc".parse::<NodeId>().is_err());
    assert!("".parse::<NodeId>().is_err());
}
