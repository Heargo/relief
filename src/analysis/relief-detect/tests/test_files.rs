//! R17: the core flags the test files (`is_test`, JSON `isTest`) and the modules that hold
//! nothing but tests. Fixture `test-files`: names and folders that count, and look-alikes.

use relief_detect::{Detection, detect};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_model::NodeKind;
use tempfile::TempDir;

fn detect_fixture() -> Detection {
    let dir = TempDir::new().expect("tempdir");
    Fixture::load("test-files")
        .expect("load test-files")
        .build(dir.path())
        .expect("build test-files");
    let source = GitSource::open(dir.path()).expect("open");
    let commit = source.resolve("HEAD").expect("resolve HEAD");
    let files: Vec<(String, Vec<u8>)> = source
        .list_tree(&commit)
        .expect("list tree")
        .into_iter()
        .map(|e| {
            let bytes = source.read_blob(&e.blob).expect("blob");
            (e.path, bytes)
        })
        .collect();
    let paths: Vec<&str> = files.iter().map(|(p, _)| p.as_str()).collect();
    let read = |path: &str| {
        files
            .iter()
            .find(|(p, _)| p == path)
            .map(|(_, bytes)| bytes.clone())
    };
    detect("test-files", &paths, &read)
}

fn is_test_file(d: &Detection, path: &str) -> bool {
    d.nodes
        .iter()
        .find(|n| n.kind == NodeKind::File && n.id.to_string().ends_with(&format!("file:{path}")))
        .unwrap_or_else(|| panic!("no file node {path}"))
        .is_test
}

fn is_test_module(d: &Detection, id: &str) -> bool {
    d.nodes
        .iter()
        .find(|n| n.id.to_string() == id)
        .unwrap_or_else(|| panic!("no node {id}"))
        .is_test
}

#[test]
fn files_named_test_spec_or_e2e_are_tests() {
    let d = detect_fixture();
    assert!(is_test_file(&d, "src/app.test.ts"));
    assert!(is_test_file(&d, "src/app.spec.tsx"));
    assert!(is_test_file(&d, "src/app.e2e.ts"));
}

#[test]
fn files_under_a_test_folder_are_tests() {
    let d = detect_fixture();
    for path in [
        "test/a.ts",
        "tests/b.ts",
        "__tests__/d.ts",
        "e2e/e.ts",
        "spec/f.ts",
        "src/__tests__/deep.ts",
    ] {
        assert!(is_test_file(&d, path), "{path} should be a test");
    }
}

#[test]
fn look_alikes_are_not_tests() {
    let d = detect_fixture();
    for path in [
        "src/app.ts",
        "src/latest.ts",
        "src/testing.ts",
        "src/contest/x.ts",
    ] {
        assert!(!is_test_file(&d, path), "{path} should not be a test");
    }
}

#[test]
fn a_module_holding_only_tests_is_a_test_one_with_code_is_not() {
    let d = detect_fixture();
    assert!(is_test_module(&d, "pkg:test-files/tests"));
    assert!(is_test_module(&d, "pkg:test-files/src/__tests__"));
    assert!(!is_test_module(&d, "pkg:test-files/src"));
    assert!(!is_test_module(&d, "pkg:test-files/src/contest"));
    assert!(!is_test_module(&d, "pkg:test-files"));
}

#[test]
fn is_test_is_serialized_as_is_test_only_when_true() {
    let d = detect_fixture();
    let json = |path: &str| {
        let node = d
            .nodes
            .iter()
            .find(|n| n.id.to_string().ends_with(&format!("file:{path}")))
            .expect("node");
        serde_json::to_value(node).expect("json")
    };
    assert_eq!(json("src/app.test.ts")["isTest"], true);
    assert!(json("src/app.ts").get("isTest").is_none());
}
