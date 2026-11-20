use relief_detect::{Detection, detect};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_model::{Node, NodeKind};
use tempfile::TempDir;

/// Detects the acme-shop fixture at `main`, with the paths in the order `order` gives them.
fn detect_acme(order: impl FnOnce(&mut Vec<(String, Vec<u8>)>)) -> Detection {
    let dir = TempDir::new().expect("tempdir");
    Fixture::load("acme-shop")
        .expect("load acme-shop")
        .build(dir.path())
        .expect("build acme-shop");
    let source = GitSource::open(dir.path()).expect("open");
    let commit = source.resolve("main").expect("resolve main");
    let mut files: Vec<(String, Vec<u8>)> = source
        .list_tree(&commit)
        .expect("list tree")
        .into_iter()
        .map(|e| {
            let bytes = source.read_blob(&e.blob).expect("blob");
            (e.path, bytes)
        })
        .collect();
    order(&mut files);
    let paths: Vec<&str> = files.iter().map(|(p, _)| p.as_str()).collect();
    let read = |path: &str| {
        files
            .iter()
            .find(|(p, _)| p == path)
            .map(|(_, bytes)| bytes.clone())
    };
    detect("acme-shop", &paths, &read)
}

fn find<'a>(d: &'a Detection, id: &str) -> &'a Node {
    d.nodes
        .iter()
        .find(|n| n.id.to_string() == id)
        .unwrap_or_else(|| panic!("no node {id}"))
}

fn parent_of(d: &Detection, id: &str) -> Option<String> {
    find(d, id).parent.as_ref().map(ToString::to_string)
}

#[test]
fn acme_shop_workspace_nodes_snapshot() {
    let d = detect_acme(|_| {});
    let mut nodes: Vec<&Node> = d
        .nodes
        .iter()
        .filter(|n| n.kind != NodeKind::File || n.id.to_string().contains("apps/api/"))
        .collect();
    nodes.sort_by_key(|n| n.id.to_string());
    insta::assert_json_snapshot!(nodes);
}

#[test]
fn api_package_contains_auth_module_which_contains_session() {
    let d = detect_acme(|_| {});
    let api = find(&d, "pkg:@acme/api");
    assert_eq!(api.path.as_deref(), Some("apps/api"));

    let auth = find(&d, "pkg:@acme/api/auth");
    assert_eq!(auth.kind, NodeKind::Module);
    assert_eq!(auth.subkind, "module");
    assert_eq!(auth.path.as_deref(), Some("apps/api/auth"));
    assert_eq!(
        parent_of(&d, "pkg:@acme/api/auth").as_deref(),
        Some("pkg:@acme/api")
    );

    let session = "pkg:@acme/api/auth::file:apps/api/auth/session.ts";
    assert_eq!(find(&d, session).kind, NodeKind::File);
    assert_eq!(
        parent_of(&d, session).as_deref(),
        Some("pkg:@acme/api/auth")
    );
}

#[test]
fn routes_billing_and_jobs_are_modules_of_the_api_package() {
    let d = detect_acme(|_| {});
    for folder in ["routes", "billing", "jobs"] {
        let id = format!("pkg:@acme/api/{folder}");
        assert_eq!(find(&d, &id).kind, NodeKind::Module, "{id}");
        assert_eq!(
            find(&d, &id).path.as_deref(),
            Some(format!("apps/api/{folder}").as_str())
        );
        assert_eq!(parent_of(&d, &id).as_deref(), Some("pkg:@acme/api"));
    }
}

#[test]
fn ids_do_not_depend_on_the_order_of_the_paths() {
    let forward = detect_acme(|_| {});
    let reversed = detect_acme(|files| files.reverse());
    let ids = |d: &Detection| {
        let mut ids: Vec<(String, Option<String>, Option<String>)> = d
            .nodes
            .iter()
            .map(|n| {
                (
                    n.id.to_string(),
                    n.parent.as_ref().map(ToString::to_string),
                    n.path.clone(),
                )
            })
            .collect();
        ids.sort();
        ids
    };
    assert_eq!(ids(&forward), ids(&reversed));
}

#[test]
fn package_dirs_is_unchanged() {
    let d = detect_acme(|_| {});
    assert_eq!(
        d.package_dirs.get("@acme/api").map(String::as_str),
        Some("apps/api")
    );
    assert_eq!(
        d.package_dirs.get("@acme/db").map(String::as_str),
        Some("packages/db")
    );
}
