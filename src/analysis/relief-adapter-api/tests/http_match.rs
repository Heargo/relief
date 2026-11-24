use relief_adapter_api::{http_edge, verb_matches};
use relief_model::{EdgeKind, NodeId};

#[test]
fn a_call_reaches_a_route_of_the_same_verb_or_of_an_unknown_verb() {
    assert!(verb_matches(Some("GET"), "GET"));
    assert!(verb_matches(None, "POST"));
    assert!(!verb_matches(Some("POST"), "GET"));
}

#[test]
fn the_edge_is_heuristic_when_the_verb_is_unknown() {
    let id: NodeId = "pkg:a::file:x.ts::sym:f".parse().unwrap();
    let known = http_edge(id.clone(), id.clone(), Some("GET"));
    assert_eq!(known.kind, EdgeKind::Http);
    assert!(!known.heuristic);
    assert!(http_edge(id.clone(), id, None).heuristic);
}
