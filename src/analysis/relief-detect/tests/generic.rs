use relief_adapter_api::Detector;
use relief_detect::GenericDetector;
use relief_model::{Node, NodeKind};

/// In-memory tree: `(path, content)`. The detector never sees git, only paths
/// and a blob reader supplied by the caller.
fn detect(repo_name: &str, tree: &[(&str, &[u8])]) -> Vec<Node> {
    let paths: Vec<&str> = tree.iter().map(|(path, _)| *path).collect();
    let read_blob = |path: &str| {
        tree.iter()
            .find(|(candidate, _)| *candidate == path)
            .map(|(_, content)| content.to_vec())
    };
    GenericDetector::new()
        .detect(repo_name, &paths, &read_blob)
        .expect("the generic detector always answers")
        .nodes
}

fn file_ids(nodes: &[Node]) -> Vec<String> {
    nodes
        .iter()
        .filter(|node| node.kind == NodeKind::File)
        .map(|node| node.id.to_string())
        .collect()
}

fn has_file(nodes: &[Node], path: &str) -> bool {
    file_ids(nodes)
        .iter()
        .any(|id| id.ends_with(&format!("file:{path}")))
}

#[test]
fn go_project_produces_the_expected_nodes() {
    let nodes = detect(
        "shop-api",
        &[
            ("go.mod", b"module example.com/shop\n"),
            ("main.go", b"package main\n"),
            ("cmd/server/main.go", b"package main\n"),
            ("internal/billing/invoice.go", b"package billing\n"),
            ("internal/billing/invoice_test.go", b"package billing\n"),
            ("internal/catalog/product.go", b"package catalog\n"),
            ("README.md", b"# shop\n"),
        ],
    );
    insta::assert_json_snapshot!(nodes);
}

#[test]
fn files_carry_a_lang_from_their_extension() {
    let tree: Vec<(&str, &[u8])> = vec![
        ("a.ts", b"x"),
        ("b.tsx", b"x"),
        ("c.py", b"x"),
        ("d.go", b"x"),
        ("e.rs", b"x"),
        ("f.md", b"x"),
        ("g.toml", b"x"),
        ("h.yaml", b"x"),
        ("Makefile", b"x"),
    ];
    let nodes = detect("langs", &tree);
    let lang_of = |path: &str| {
        nodes
            .iter()
            .find(|n| {
                n.kind == NodeKind::File && n.id.to_string().ends_with(&format!("file:{path}"))
            })
            .unwrap_or_else(|| panic!("no file node for {path}"))
            .lang
            .clone()
    };
    assert_eq!(lang_of("a.ts").as_deref(), Some("ts"));
    assert_eq!(lang_of("b.tsx").as_deref(), Some("tsx"));
    assert_eq!(lang_of("c.py").as_deref(), Some("py"));
    assert_eq!(lang_of("d.go").as_deref(), Some("go"));
    assert_eq!(lang_of("e.rs").as_deref(), Some("rs"));
    assert_eq!(lang_of("f.md").as_deref(), Some("md"));
    assert_eq!(lang_of("g.toml").as_deref(), Some("toml"));
    assert_eq!(lang_of("h.yaml").as_deref(), Some("yaml"));
    assert_eq!(lang_of("Makefile"), None);
}

#[test]
fn default_exclusions_drop_dependencies_lockfiles_images_and_build_output() {
    let nodes = detect(
        "web-app",
        &[
            ("src/app.js", b"console.log(1)"),
            ("node_modules/x.js", b"module.exports = 1"),
            ("yarn.lock", b"# yarn lockfile v1"),
            ("assets/logo.png", b"\x89PNG\r\n\x1a\n"),
            ("dist/app.js", b"var a=1"),
        ],
    );
    assert!(has_file(&nodes, "src/app.js"));
    assert!(!has_file(&nodes, "node_modules/x.js"));
    assert!(!has_file(&nodes, "yarn.lock"));
    assert!(!has_file(&nodes, "assets/logo.png"));
    assert!(!has_file(&nodes, "dist/app.js"));
    assert_eq!(file_ids(&nodes).len(), 1);
}

#[test]
fn other_default_excluded_directories_are_dropped() {
    let nodes = detect(
        "mixed",
        &[
            ("src/lib.rs", b"fn a() {}"),
            ("vendor/dep/dep.go", b"package dep"),
            ("build/out.js", b"x"),
            ("target/debug/out.rs", b"x"),
            ("package-lock.json", b"{}"),
            ("Cargo.lock", b"# lock"),
        ],
    );
    assert_eq!(file_ids(&nodes).len(), 1);
    assert!(has_file(&nodes, "src/lib.rs"));
}

#[test]
fn a_file_with_a_nul_byte_is_excluded_as_binary_through_the_blob_reader() {
    let nodes = detect(
        "blobs",
        &[
            ("data/blob.dat", b"abc\0def"),
            ("data/notes.txt", b"plain text"),
        ],
    );
    assert!(!has_file(&nodes, "data/blob.dat"));
    assert!(has_file(&nodes, "data/notes.txt"));
}

#[test]
fn single_child_directory_chain_is_merged_into_one_module_keeping_the_full_path() {
    let nodes = detect(
        "shop-java",
        &[("src/main/java/com/acme/App.java", b"class App {}")],
    );
    let modules: Vec<String> = nodes
        .iter()
        .filter(|n| n.kind == NodeKind::Module)
        .map(|n| n.id.to_string())
        .collect();
    assert_eq!(modules.len(), 1, "modules: {modules:?}");
    assert!(
        modules[0].contains("src/main/java/com/acme"),
        "module id lost the full path: {}",
        modules[0]
    );
    assert!(has_file(&nodes, "src/main/java/com/acme/App.java"));
}

#[test]
fn a_directory_with_several_children_is_not_merged() {
    let nodes = detect(
        "shop",
        &[
            ("src/billing/a.go", b"package a"),
            ("src/catalog/b.go", b"package b"),
        ],
    );
    let modules = nodes.iter().filter(|n| n.kind == NodeKind::Module).count();
    assert_eq!(modules, 3, "src, src/billing, src/catalog");
}

#[test]
fn the_system_is_named_after_the_repository_folder() {
    let nodes = detect("shop-api", &[("main.go", b"package main")]);
    let roots: Vec<&Node> = nodes.iter().filter(|n| n.parent.is_none()).collect();
    assert_eq!(roots.len(), 1);
    assert!(roots[0].id.to_string().contains("shop-api"));
}
