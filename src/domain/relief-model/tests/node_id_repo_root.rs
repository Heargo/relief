use relief_model::NodeId;

#[test]
fn repo_root_id_is_repo_name_and_round_trips() {
    let id = NodeId::repo_root("api").unwrap();
    assert_eq!(id.to_string(), "repo:api");
    let parsed: NodeId = "repo:api".parse().unwrap();
    assert_eq!(parsed, id);
    assert_eq!(parsed.repo(), Some("api"));
}

#[test]
fn repo_root_refuses_invalid_names() {
    assert!(NodeId::repo_root("").is_err());
    assert!(NodeId::repo_root("a/b").is_err());
}

#[test]
fn a_second_repo_prefix_is_refused() {
    assert!("repo:a/repo:b/pkg:x".parse::<NodeId>().is_err());
    assert!("repo:a/repo:b".parse::<NodeId>().is_err());
}

#[test]
fn a_trailing_slash_is_refused() {
    assert!("repo:api/".parse::<NodeId>().is_err());
}

#[test]
fn in_repo_on_a_prefixed_id_is_an_error() {
    let id = NodeId::package("x").in_repo("a").unwrap();
    assert!(id.in_repo("b").is_err());
    assert!(NodeId::repo_root("a").unwrap().in_repo("b").is_err());
}

#[test]
fn ids_order_unprefixed_before_repos_by_name() {
    let local = NodeId::package("x");
    let a = local.clone().in_repo("a").unwrap();
    let b = local.clone().in_repo("b").unwrap();
    assert!(local < a);
    assert!(a < b);
}

#[test]
fn repo_name_with_colons_and_spaces_round_trips() {
    for text in ["repo:my: repo", "repo:my: repo/pkg:x::file:a.ts"] {
        let id: NodeId = text.parse().unwrap();
        assert_eq!(id.repo(), Some("my: repo"));
        assert_eq!(id.to_string(), text);
    }
    let id = NodeId::package("x").in_repo("a:b c").unwrap();
    assert_eq!(id.to_string().parse::<NodeId>().unwrap(), id);
}
