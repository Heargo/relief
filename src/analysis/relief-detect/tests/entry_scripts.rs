//! Seam: the workspaces detector flags the `package.json` scripts as entry points of type
//! `script` through `Detection.entries` (`Vec<EntryPoint { node, entry_type }>`, the same
//! contract as `Extraction.entries`): one entry per script, on the node of the package.

use relief_detect::{Detection, detect};

fn run(tree: &[(&str, &str)]) -> Detection {
    let paths: Vec<&str> = tree.iter().map(|(path, _)| *path).collect();
    let read_blob = |path: &str| {
        tree.iter()
            .find(|(candidate, _)| *candidate == path)
            .map(|(_, content)| content.as_bytes().to_vec())
    };
    detect("acme", &paths, &read_blob)
}

fn tree(api_package_json: &'static str) -> Vec<(&'static str, &'static str)> {
    vec![
        ("pnpm-workspace.yaml", "packages:\n  - \"apps/*\"\n"),
        ("package.json", r#"{ "name": "acme", "private": true }"#),
        ("apps/api/package.json", api_package_json),
        ("apps/api/src/server.ts", "export {};"),
    ]
}

#[test]
fn each_script_of_a_package_json_is_a_script_entry_point_on_its_package() {
    let d = run(&tree(
        r#"{ "name": "@acme/api", "scripts": { "build": "tsc", "start": "node dist/server.js" } }"#,
    ));
    let entries: Vec<(String, String)> = d
        .entries
        .iter()
        .map(|e| (e.node.to_string(), e.entry_type.clone()))
        .collect();
    assert_eq!(
        entries,
        [
            ("pkg:@acme/api".to_owned(), "script".to_owned()),
            ("pkg:@acme/api".to_owned(), "script".to_owned()),
        ]
    );
}

#[test]
fn a_package_json_without_scripts_gives_no_entry_point() {
    let d = run(&tree(r#"{ "name": "@acme/api" }"#));
    assert!(d.entries.is_empty(), "{:?}", d.entries);
}

#[test]
fn an_empty_scripts_object_gives_no_entry_point() {
    let d = run(&tree(r#"{ "name": "@acme/api", "scripts": {} }"#));
    assert!(d.entries.is_empty(), "{:?}", d.entries);
}
