//! Seam 3: the crate graph (`cargo metadata`, every kind of dependency).
//! Extractors do not depend on the index, the index chooses no extractor.

use std::collections::BTreeSet;
use std::process::Command;

use serde_json::Value;

/// Names of the workspace crates `krate` depends on, all kinds mixed.
fn relief_deps(krate: &str) -> BTreeSet<String> {
    relief_deps_of_kind(krate, false)
}

/// Names of the workspace crates `krate` depends on, normal dependencies only
/// (dev and build dependencies left out).
fn relief_normal_deps(krate: &str) -> BTreeSet<String> {
    relief_deps_of_kind(krate, true)
}

fn relief_deps_of_kind(krate: &str, normal_only: bool) -> BTreeSet<String> {
    let out = Command::new(env!("CARGO"))
        .args(["metadata", "--format-version", "1", "--no-deps"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("cargo metadata runs");
    assert!(out.status.success(), "cargo metadata failed");
    let meta: Value = serde_json::from_slice(&out.stdout).expect("json");
    let package = meta["packages"]
        .as_array()
        .expect("packages")
        .iter()
        .find(|p| p["name"] == krate)
        .unwrap_or_else(|| panic!("no crate {krate} in the workspace"));
    package["dependencies"]
        .as_array()
        .expect("dependencies")
        .iter()
        .filter(|d| !normal_only || d["kind"].is_null())
        .filter_map(|d| d["name"].as_str())
        .filter(|n| n.starts_with("relief-"))
        .map(str::to_owned)
        .collect()
}

#[test]
fn lang_ts_does_not_depend_on_the_index() {
    assert!(!relief_deps("relief-lang-ts").contains("relief-index"));
}

#[test]
fn detect_does_not_depend_on_the_index() {
    assert!(!relief_deps("relief-detect").contains("relief-index"));
}

#[test]
fn index_depends_on_no_language_crate_nor_detect() {
    let deps = relief_deps("relief-index");
    let forbidden: Vec<&String> = deps
        .iter()
        .filter(|n| n.starts_with("relief-lang-") || *n == "relief-detect")
        .collect();
    assert!(
        forbidden.is_empty(),
        "relief-index depends on {forbidden:?}"
    );
}

#[test]
fn adapter_api_depends_only_on_model() {
    let deps = relief_deps("relief-adapter-api");
    assert_eq!(deps, BTreeSet::from(["relief-model".to_owned()]));
}

fn forbidden_in<'a>(deps: &'a BTreeSet<String>, extra: &[&str]) -> Vec<&'a String> {
    deps.iter()
        .filter(|n| n.starts_with("relief-lang-") || extra.contains(&n.as_str()))
        .collect()
}

#[test]
fn app_depends_on_no_extractor_nor_interface() {
    let deps = relief_normal_deps("relief-app");
    let forbidden = forbidden_in(&deps, &["relief-detect", "relief-server", "relief-cli"]);
    assert!(forbidden.is_empty(), "relief-app depends on {forbidden:?}");
}

fn metadata() -> Value {
    let out = Command::new(env!("CARGO"))
        .args(["metadata", "--format-version", "1", "--no-deps"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("cargo metadata runs");
    assert!(out.status.success(), "cargo metadata failed");
    serde_json::from_slice(&out.stdout).expect("json")
}

#[test]
fn no_workspace_member_depends_on_the_http_stack() {
    let meta = metadata();
    let mut found = Vec::new();
    for p in meta["packages"].as_array().expect("packages") {
        for d in p["dependencies"].as_array().expect("dependencies") {
            let name = d["name"].as_str().unwrap_or_default();
            if ["axum", "tower", "rust-embed"].contains(&name) {
                found.push(format!("{} -> {name}", p["name"]));
            }
        }
    }
    assert!(found.is_empty(), "HTTP stack still used: {found:?}");
}

#[test]
fn the_http_and_cli_packages_are_gone() {
    let meta = metadata();
    let names: Vec<&str> = meta["packages"]
        .as_array()
        .expect("packages")
        .iter()
        .filter_map(|p| p["name"].as_str())
        .collect();
    assert!(!names.contains(&"relief-server"), "{names:?}");
    assert!(!names.contains(&"relief-cli"), "{names:?}");
}

#[test]
fn the_desktop_package_builds_the_relief_binary() {
    let meta = metadata();
    let package = meta["packages"]
        .as_array()
        .expect("packages")
        .iter()
        .find(|p| p["name"] == "relief-desktop")
        .expect("relief-desktop package");
    let bins: Vec<&str> = package["targets"]
        .as_array()
        .expect("targets")
        .iter()
        .filter(|t| {
            t["kind"]
                .as_array()
                .is_some_and(|k| k.iter().any(|k| k == "bin"))
        })
        .filter_map(|t| t["name"].as_str())
        .collect();
    assert_eq!(bins, ["relief"]);
}

#[test]
fn rules_depends_only_on_the_model_among_workspace_crates() {
    let deps = relief_normal_deps("relief-rules");
    assert_eq!(deps, BTreeSet::from(["relief-model".to_owned()]));
}

#[test]
fn rules_depends_on_no_io_crate() {
    let meta = metadata();
    let package = meta["packages"]
        .as_array()
        .expect("packages")
        .iter()
        .find(|p| p["name"] == "relief-rules")
        .expect("relief-rules package");
    let io = [
        "gix", "rusqlite", "tokio", "reqwest", "walkdir", "ignore", "notify",
    ];
    let names: Vec<&str> = package["dependencies"]
        .as_array()
        .expect("dependencies")
        .iter()
        .filter(|d| d["kind"].is_null())
        .filter_map(|d| d["name"].as_str())
        .collect();
    let found: Vec<&&str> = names.iter().filter(|n| io.contains(n)).collect();
    assert!(found.is_empty(), "relief-rules depends on {found:?}");
    assert!(
        names.contains(&"globset"),
        "globs are compiled with globset: {names:?}"
    );
}
