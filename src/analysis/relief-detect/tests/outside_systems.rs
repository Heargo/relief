//! Seam 1 of ticket 04: files outside any system are filed in folder modules (as the generic
//! detector does), and manifests under fixture folders create no system. In-memory trees.

use relief_detect::{Detection, detect};
use relief_model::{Node, NodeKind};

fn run(tree: &[(&str, &str)]) -> Detection {
    let paths: Vec<&str> = tree.iter().map(|(p, _)| *p).collect();
    let read = |path: &str| {
        tree.iter()
            .find(|(c, _)| *c == path)
            .map(|(_, content)| content.as_bytes().to_vec())
    };
    detect("shop", &paths, &read)
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

fn systems(d: &Detection) -> Vec<String> {
    let mut ids: Vec<String> = d
        .nodes
        .iter()
        .filter(|n| matches!(n.kind, NodeKind::Service | NodeKind::Package))
        .map(|n| n.id.to_string())
        .collect();
    ids.sort();
    ids
}

fn workspace_tree() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "package.json",
            r#"{ "name": "root", "workspaces": ["apps/*"] }"#,
        ),
        ("apps/api/package.json", r#"{ "name": "@acme/api" }"#),
        ("apps/api/src/main.ts", "export {};"),
        ("docs/guide.md", "# guide"),
        ("docs/adr/0001.md", "# adr"),
        ("README.md", "# shop"),
    ]
}

fn check_outside_files(d: &Detection) {
    let docs = find(d, "pkg:shop/docs");
    assert_eq!(docs.kind, NodeKind::Module);
    assert_eq!(docs.subkind, "module");
    assert_eq!(docs.path.as_deref(), Some("docs"));
    assert_eq!(parent_of(d, "pkg:shop/docs").as_deref(), Some("pkg:shop"));
    let adr = find(d, "pkg:shop/docs/adr");
    assert_eq!(adr.kind, NodeKind::Module);
    assert_eq!(adr.path.as_deref(), Some("docs/adr"));
    assert_eq!(
        parent_of(d, "pkg:shop/docs/adr").as_deref(),
        Some("pkg:shop/docs")
    );
    assert_eq!(
        parent_of(d, "pkg:shop/docs::file:docs/guide.md").as_deref(),
        Some("pkg:shop/docs")
    );
    assert_eq!(
        parent_of(d, "pkg:shop/docs/adr::file:docs/adr/0001.md").as_deref(),
        Some("pkg:shop/docs/adr")
    );
    assert_eq!(
        parent_of(d, "pkg:shop::file:README.md").as_deref(),
        Some("pkg:shop")
    );
}

#[test]
fn workspaces_files_outside_a_package_are_filed_in_folder_modules() {
    let d = run(&workspace_tree());
    assert_eq!(d.detector, "workspaces");
    check_outside_files(&d);
    assert_eq!(systems(&d), vec!["pkg:@acme/api"]);
}

#[test]
fn pyproject_files_outside_a_project_are_filed_in_folder_modules() {
    let d = run(&[
        ("services/api/pyproject.toml", "[project]\nname = \"api\"\n"),
        ("services/api/app.py", "x = 1\n"),
        ("docs/guide.md", "# guide"),
        ("docs/adr/0001.md", "# adr"),
        ("README.md", "# shop"),
    ]);
    assert_eq!(d.detector, "pyproject");
    check_outside_files(&d);
    assert_eq!(systems(&d), vec!["pkg:api"]);
}

#[test]
fn outside_modules_have_the_same_ids_whatever_the_path_order() {
    let tree = workspace_tree();
    let forward = run(&tree);
    let mut reversed_tree = tree.clone();
    reversed_tree.reverse();
    let backward = run(&reversed_tree);
    let summary = |d: &Detection| {
        let mut rows: Vec<_> = d
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
        rows.sort();
        rows
    };
    assert!(
        summary(&forward)
            .iter()
            .any(|(id, _, _)| id == "pkg:shop/docs/adr")
    );
    assert_eq!(summary(&forward), summary(&backward));
}

#[test]
fn a_pyproject_under_fixtures_creates_no_system() {
    let d = run(&[
        (
            "tests/fixtures/x/pyproject.toml",
            "[project]\nname = \"x\"\n",
        ),
        ("tests/fixtures/x/app.py", "x = 1\n"),
        ("src/main.py", "y = 2\n"),
    ]);
    assert_eq!(d.detector, "generic");
    assert!(systems(&d).is_empty());
    // Fixture files stay in the map, in folders.
    assert_eq!(
        parent_of(
            &d,
            "pkg:shop/tests/fixtures/x::file:tests/fixtures/x/app.py"
        )
        .as_deref(),
        Some("pkg:shop/tests/fixtures/x")
    );
}

#[test]
fn every_fixture_folder_name_is_ignored_at_any_depth() {
    for dir in ["fixtures", "__fixtures__", "testdata", "test-fixtures"] {
        let manifest = format!("packages/lib/{dir}/x/pyproject.toml");
        let d = run(&[
            (manifest.as_str(), "[project]\nname = \"x\"\n"),
            ("a.py", ""),
        ]);
        assert_eq!(d.detector, "generic", "{dir}");
        assert!(systems(&d).is_empty(), "{dir}");
    }
}

#[test]
fn a_workspaces_package_json_under_fixtures_creates_no_system() {
    let d = run(&[
        (
            "package.json",
            r#"{ "name": "root", "workspaces": ["tests/fixtures/*"] }"#,
        ),
        (
            "tests/fixtures/a/package.json",
            r#"{ "name": "fixture-a" }"#,
        ),
        ("tests/fixtures/a/index.ts", "export {};"),
    ]);
    assert_eq!(d.detector, "generic");
    assert!(systems(&d).is_empty());
}

#[test]
fn a_root_pyproject_wins_over_one_under_fixtures() {
    let d = run(&[
        ("pyproject.toml", "[project]\nname = \"root-app\"\n"),
        ("app.py", "x = 1\n"),
        (
            "tests/fixtures/x/pyproject.toml",
            "[project]\nname = \"fixture-x\"\n",
        ),
    ]);
    assert_eq!(d.detector, "pyproject");
    assert_eq!(systems(&d), vec!["pkg:root-app"]);
}

#[test]
fn acme_shop_types_folder_is_a_module() {
    use relief_fixtures::Fixture;
    use relief_git::GitSource;
    let dir = tempfile::TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(dir.path())
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let commit = source.resolve("main").unwrap();
    let files: Vec<(String, Vec<u8>)> = source
        .list_tree(&commit)
        .unwrap()
        .into_iter()
        .map(|e| (e.path, source.read_blob(&e.blob).unwrap()))
        .collect();
    let paths: Vec<&str> = files.iter().map(|(p, _)| p.as_str()).collect();
    let read = |p: &str| files.iter().find(|(c, _)| c == p).map(|(_, b)| b.clone());
    let d = detect("acme-shop", &paths, &read);
    let types = find(&d, "pkg:acme-shop/types");
    assert_eq!(types.kind, NodeKind::Module);
    assert_eq!(types.path.as_deref(), Some("types"));
    assert_eq!(
        parent_of(&d, "pkg:acme-shop/types::file:types/external.d.ts").as_deref(),
        Some("pkg:acme-shop/types")
    );
}
