//! Seam 1: the `Detector` contract of `relief-adapter-api`, implemented by
//! `WorkspacesDetector` and `GenericDetector`, and the default chain.

use relief_adapter_api::Detector;
use relief_detect::{GenericDetector, WorkspacesDetector, default_detectors, detect};

const WORKSPACE_TREE: &[(&str, &str)] = &[
    (
        "package.json",
        r#"{"name":"acme","private":true,"workspaces":["packages/*"]}"#,
    ),
    (
        "packages/core/package.json",
        r#"{"name":"@acme/core","version":"1.0.0"}"#,
    ),
    ("packages/core/src/index.ts", "export const a = 1;\n"),
];

const PLAIN_TREE: &[(&str, &str)] = &[
    ("go.mod", "module example.com/shop\n"),
    ("main.go", "package main\n"),
];

fn run(detector: &dyn Detector, tree: &[(&str, &str)]) -> Option<relief_adapter_api::Detection> {
    let paths: Vec<&str> = tree.iter().map(|(path, _)| *path).collect();
    let read_blob = |path: &str| {
        tree.iter()
            .find(|(candidate, _)| *candidate == path)
            .map(|(_, content)| content.as_bytes().to_vec())
    };
    detector.detect("acme", &paths, &read_blob)
}

#[test]
fn workspaces_detector_answers_none_without_workspace() {
    assert!(run(&WorkspacesDetector::new(), PLAIN_TREE).is_none());
}

#[test]
fn workspaces_detector_answers_on_a_workspace() {
    let found = run(&WorkspacesDetector::new(), WORKSPACE_TREE).expect("a workspace");
    assert_eq!(found.detector, "workspaces");
    assert_eq!(
        found.package_dirs.get("@acme/core").map(String::as_str),
        Some("packages/core")
    );
    assert!(
        found
            .nodes
            .iter()
            .any(|n| n.id.to_string() == "pkg:@acme/core")
    );
}

#[test]
fn generic_detector_always_answers() {
    for tree in [PLAIN_TREE, WORKSPACE_TREE, &[]] {
        let found = run(&GenericDetector::new(), tree).expect("generic always answers");
        assert_eq!(found.detector, "generic");
        assert!(found.edges.is_empty());
    }
}

#[test]
fn default_chain_is_workspaces_then_generic() {
    let chain = default_detectors();
    let names: Vec<String> = [WORKSPACE_TREE, PLAIN_TREE]
        .iter()
        .map(|tree| {
            chain
                .iter()
                .find_map(|d| run(d.as_ref(), tree))
                .expect("the chain answers")
                .detector
        })
        .collect();
    assert_eq!(names, ["workspaces", "generic"]);
}

#[test]
fn default_chain_gives_the_same_result_as_detect() {
    for tree in [WORKSPACE_TREE, PLAIN_TREE] {
        let paths: Vec<&str> = tree.iter().map(|(path, _)| *path).collect();
        let read_blob = |path: &str| {
            tree.iter()
                .find(|(candidate, _)| *candidate == path)
                .map(|(_, content)| content.as_bytes().to_vec())
        };
        let shortcut = detect("acme", &paths, &read_blob);
        let chained = default_detectors()
            .iter()
            .find_map(|d| d.detect("acme", &paths, &read_blob))
            .expect("the chain answers");
        assert_eq!(chained, shortcut);
    }
}
