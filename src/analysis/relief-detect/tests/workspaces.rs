use relief_detect::{Detection, detect};
use relief_model::{EdgeKind, Node, NodeKind};

/// In-memory tree: `(path, content)`. The detector never sees git.
fn run(repo_name: &str, tree: &[(&str, &str)]) -> Detection {
    let paths: Vec<&str> = tree.iter().map(|(path, _)| *path).collect();
    let read_blob = |path: &str| {
        tree.iter()
            .find(|(candidate, _)| *candidate == path)
            .map(|(_, content)| content.as_bytes().to_vec())
    };
    detect(repo_name, &paths, &read_blob)
}

fn find<'a>(d: &'a Detection, id: &str) -> &'a Node {
    d.nodes
        .iter()
        .find(|n| n.id.to_string() == id)
        .unwrap_or_else(|| panic!("no node {id}"))
}

fn systems(d: &Detection) -> Vec<(String, NodeKind, String)> {
    let mut found: Vec<_> = d
        .nodes
        .iter()
        .filter(|n| matches!(n.kind, NodeKind::Service | NodeKind::Package))
        .map(|n| (n.id.to_string(), n.kind, n.subkind.clone()))
        .collect();
    found.sort_by(|a, b| a.0.cmp(&b.0));
    found
}

fn depends_on(d: &Detection) -> Vec<(String, String)> {
    let mut found: Vec<_> = d
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::DependsOn)
        .map(|e| (e.from.to_string(), e.to.to_string()))
        .collect();
    found.sort();
    found
}

fn pair(from: &str, to: &str) -> (String, String) {
    (from.to_owned(), to.to_owned())
}

fn pnpm_tree() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "pnpm-workspace.yaml",
            "packages:\n  - \"apps/*\"\n  - \"packages/*\"\n",
        ),
        ("package.json", r#"{ "name": "acme", "private": true }"#),
        (
            "apps/web/package.json",
            r#"{ "name": "@acme/web", "dependencies": { "@acme/shared": "workspace:*", "react": "^18" } }"#,
        ),
        ("apps/web/src/main.tsx", "export {};"),
        (
            "apps/api/package.json",
            r#"{ "name": "@acme/api", "dependencies": { "@acme/db": "workspace:*", "fastify": "^4" } }"#,
        ),
        ("apps/api/src/server.ts", "export {};"),
        (
            "packages/shared/package.json",
            r#"{ "name": "@acme/shared" }"#,
        ),
        ("packages/shared/money.ts", "export {};"),
        (
            "packages/db/package.json",
            r#"{ "name": "@acme/db", "peerDependencies": { "@acme/shared": "*" } }"#,
        ),
        ("packages/db/repo.ts", "export {};"),
    ]
}

#[test]
fn pnpm_workspace_yields_one_system_per_package() {
    let d = run("acme", &pnpm_tree());
    assert_eq!(d.detector, "workspaces");
    assert_eq!(
        systems(&d),
        vec![
            (
                "pkg:@acme/api".to_owned(),
                NodeKind::Service,
                "http-server".to_owned()
            ),
            (
                "pkg:@acme/db".to_owned(),
                NodeKind::Package,
                "library".to_owned()
            ),
            (
                "pkg:@acme/shared".to_owned(),
                NodeKind::Package,
                "library".to_owned()
            ),
            (
                "pkg:@acme/web".to_owned(),
                NodeKind::Service,
                "react-app".to_owned()
            ),
        ]
    );
    assert!(d.warnings.is_empty());
}

#[test]
fn workspace_edges_follow_all_three_dependency_fields() {
    let tree = vec![
        ("pnpm-workspace.yaml", "packages:\n  - \"packages/*\"\n"),
        (
            "packages/a/package.json",
            r#"{ "name": "a", "dependencies": { "b": "*" } }"#,
        ),
        (
            "packages/b/package.json",
            r#"{ "name": "b", "devDependencies": { "c": "*" } }"#,
        ),
        (
            "packages/c/package.json",
            r#"{ "name": "c", "peerDependencies": { "a": "*" } }"#,
        ),
    ];
    let d = run("trio", &tree);
    assert_eq!(
        depends_on(&d),
        vec![
            pair("pkg:a", "pkg:b"),
            pair("pkg:b", "pkg:c"),
            pair("pkg:c", "pkg:a")
        ]
    );
}

#[test]
fn external_dependencies_are_external_nodes_under_one_group() {
    let d = run("acme", &pnpm_tree());
    let externals: Vec<&Node> = d
        .nodes
        .iter()
        .filter(|n| n.kind == NodeKind::External)
        .collect();
    let mut ids: Vec<String> = externals.iter().map(|n| n.id.to_string()).collect();
    ids.sort();
    assert_eq!(ids, vec!["pkg:external/fastify", "pkg:external/react"]);

    let group = externals[0].parent.clone().expect("grouped externals");
    assert!(externals.iter().all(|n| n.parent.as_ref() == Some(&group)));
    assert_eq!(find(&d, &group.to_string()).kind, NodeKind::Module);
    assert_eq!(group.to_string(), "pkg:external");

    let edges = depends_on(&d);
    assert!(edges.contains(&pair("pkg:@acme/web", "pkg:external/react")));
    assert!(edges.contains(&pair("pkg:@acme/api", "pkg:external/fastify")));
}

#[test]
fn pnpm_workspace_edges_are_between_workspace_packages() {
    let d = run("acme", &pnpm_tree());
    let internal: Vec<_> = depends_on(&d)
        .into_iter()
        .filter(|(_, to)| !to.starts_with("pkg:external"))
        .collect();
    assert_eq!(
        internal,
        vec![
            pair("pkg:@acme/api", "pkg:@acme/db"),
            pair("pkg:@acme/db", "pkg:@acme/shared"),
            pair("pkg:@acme/web", "pkg:@acme/shared"),
        ]
    );
}

#[test]
fn package_names_map_to_their_directories() {
    let d = run("acme", &pnpm_tree());
    let dir = |name: &str| d.package_dirs.get(name).map(String::as_str);
    assert_eq!(dir("@acme/shared"), Some("packages/shared"));
    assert_eq!(dir("@acme/db"), Some("packages/db"));
    assert_eq!(dir("@acme/web"), Some("apps/web"));
    assert_eq!(dir("@acme/api"), Some("apps/api"));
    assert_eq!(dir("react"), None);
}

#[test]
fn yarn_workspaces_array_is_recognised() {
    let tree = vec![
        (
            "package.json",
            r#"{ "name": "mono", "private": true, "workspaces": ["apps/*", "libs/*"] }"#,
        ),
        (
            "apps/site/package.json",
            r#"{ "name": "site", "dependencies": { "ui": "*", "react": "^18" } }"#,
        ),
        ("libs/ui/package.json", r#"{ "name": "ui" }"#),
        ("yarn.lock", "# lock"),
    ];
    let d = run("mono", &tree);
    assert_eq!(d.detector, "workspaces");
    assert_eq!(
        systems(&d),
        vec![
            (
                "pkg:site".to_owned(),
                NodeKind::Service,
                "react-app".to_owned()
            ),
            ("pkg:ui".to_owned(), NodeKind::Package, "library".to_owned()),
        ]
    );
    assert!(depends_on(&d).contains(&pair("pkg:site", "pkg:ui")));
    assert_eq!(
        d.package_dirs.get("ui").map(String::as_str),
        Some("libs/ui")
    );
}

#[test]
fn yarn_workspaces_object_form_is_recognised() {
    let tree = vec![
        (
            "package.json",
            r#"{ "name": "mono", "workspaces": { "packages": ["packages/*"] } }"#,
        ),
        ("packages/one/package.json", r#"{ "name": "one" }"#),
        ("packages/two/package.json", r#"{ "name": "two" }"#),
    ];
    let d = run("mono", &tree);
    assert_eq!(d.detector, "workspaces");
    assert_eq!(systems(&d).len(), 2);
}

#[test]
fn start_or_dev_script_makes_a_service_outside_apps() {
    let tree = vec![
        ("pnpm-workspace.yaml", "packages:\n  - \"packages/*\"\n"),
        (
            "packages/worker/package.json",
            r#"{ "name": "worker", "scripts": { "start": "node ." }, "dependencies": { "express": "^4" } }"#,
        ),
        (
            "packages/playground/package.json",
            r#"{ "name": "playground", "scripts": { "dev": "vite" } }"#,
        ),
        (
            "packages/lib/package.json",
            r#"{ "name": "lib", "scripts": { "test": "vitest" } }"#,
        ),
    ];
    let d = run("scripts", &tree);
    assert_eq!(
        systems(&d),
        vec![
            (
                "pkg:lib".to_owned(),
                NodeKind::Package,
                "library".to_owned()
            ),
            (
                "pkg:playground".to_owned(),
                NodeKind::Service,
                "library".to_owned()
            ),
            (
                "pkg:worker".to_owned(),
                NodeKind::Service,
                "http-server".to_owned()
            ),
        ]
    );
}

#[test]
fn globs_matching_nothing_fall_back_to_the_generic_detector() {
    let tree = vec![
        ("pnpm-workspace.yaml", "packages:\n  - \"packages/*\"\n"),
        ("package.json", r#"{ "name": "lonely" }"#),
        ("src/index.ts", "export {};"),
    ];
    let d = run("lonely", &tree);
    assert_eq!(d.detector, "generic");
    assert_eq!(find(&d, "pkg:lonely").kind, NodeKind::Repo);
    assert!(
        d.nodes
            .iter()
            .all(|n| !matches!(n.kind, NodeKind::Service | NodeKind::Package))
    );
    assert!(d.edges.is_empty());
}

#[test]
fn invalid_package_json_is_a_warning_not_an_error() {
    let tree = vec![
        ("pnpm-workspace.yaml", "packages:\n  - \"packages/*\"\n"),
        ("packages/ok/package.json", r#"{ "name": "ok" }"#),
        ("packages/broken/package.json", "{ \"name\": "),
    ];
    let d = run("warn", &tree);
    assert_eq!(d.detector, "workspaces");
    assert_eq!(
        systems(&d),
        vec![("pkg:ok".to_owned(), NodeKind::Package, "library".to_owned())]
    );
    assert_eq!(d.warnings.len(), 1);
    assert!(
        d.warnings[0].contains("packages/broken/package.json"),
        "warning was: {}",
        d.warnings[0]
    );
}
