//! Seam 2 of ticket K11: a workspace session where a repository imports a package published by
//! another one (spec « Arêtes entre dépôts », ADR 0010).
//!
//! Behaviour expected:
//! - TS: `shop-web` imports `@shop/api`, published by `shop-api` (`package.json`, `main`
//!   `src/types.ts`). In the `shop-space` workspace the snapshot has an `imports` edge from a
//!   file of `repo:web` to the entry file of `repo:api` (or one of its symbols), and no external
//!   node for `@shop/api`.
//! - Python: `py-app` imports `shop_core`, published by `py-core` (`[project].name`
//!   `shop-core`): same, to `repo:core/.../shop_core/__init__.py`.
//! - On a single repository the same import is still an external node.

mod common;

use std::fs;
use std::path::{Path, PathBuf};

use relief_app::{RangeSpec, Session, SessionOptions, SnapshotRequest};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_python::PythonAdapter;
use relief_lang_ts::TsAdapter;
use serde_json::Value;
use tempfile::TempDir;

fn options(range: Option<RangeSpec>) -> SessionOptions {
    SessionOptions {
        data_dir: None,
        range,
        detectors: default_detectors(),
        adapters: vec![Box::new(TsAdapter::new()), Box::new(PythonAdapter::new())],
    }
}

/// The fixtures `repos` built side by side, and the workspace file `file` of `space`.
fn space(repos: &[&str], space: &str, file: &str) -> (TempDir, PathBuf) {
    let dir = TempDir::new().unwrap();
    for repo in repos {
        Fixture::load(repo)
            .unwrap()
            .build(&dir.path().join(repo))
            .unwrap();
    }
    let ws = dir.path().join(space);
    fs::create_dir(&ws).unwrap();
    fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/fixtures")
            .join(space)
            .join(file),
        ws.join(file),
    )
    .unwrap();
    (dir, ws)
}

fn graph(session: &Session) -> Value {
    let response = session
        .snapshot(&SnapshotRequest {
            rev: "HEAD".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    serde_json::to_value(&response.graph).unwrap()
}

fn node_ids(graph: &Value) -> Vec<String> {
    graph["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["id"].as_str().unwrap().to_owned())
        .collect()
}

/// `(from, to)` of the `imports` edges.
fn imports(graph: &Value) -> Vec<(String, String)> {
    graph["edges"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "imports")
        .map(|e| {
            (
                e["from"].as_str().unwrap().to_owned(),
                e["to"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

#[test]
fn a_ts_import_of_a_package_published_by_another_repository_is_an_edge_between_them() {
    let (_dir, ws) = space(&["shop-api", "shop-web"], "shop-space", "shop.relief.json");
    let graph = graph(&Session::open_workspace(&ws, options(None)).unwrap());
    let edges = imports(&graph);
    assert!(
        edges.iter().any(|(from, to)| {
            from.starts_with("repo:web/")
                && from.contains("::file:src/OrderList.ts")
                && to.starts_with("repo:api/")
                && to.contains("::file:src/types.ts")
        }),
        "{edges:#?}"
    );
}

#[test]
fn the_published_ts_package_is_no_longer_an_external_node() {
    let (_dir, ws) = space(&["shop-api", "shop-web"], "shop-space", "shop.relief.json");
    let graph = graph(&Session::open_workspace(&ws, options(None)).unwrap());
    let externals: Vec<String> = node_ids(&graph)
        .into_iter()
        .filter(|id| id.contains("external/@shop/api"))
        .collect();
    assert_eq!(externals, Vec::<String>::new());
}

#[test]
fn a_python_import_of_a_package_published_by_another_repository_is_an_edge_between_them() {
    let (_dir, ws) = space(&["py-core", "py-app"], "py-space", "py.relief.json");
    let graph = graph(&Session::open_workspace(&ws, options(None)).unwrap());
    let edges = imports(&graph);
    assert!(
        edges.iter().any(|(from, to)| {
            from.starts_with("repo:app/")
                && from.contains("::file:app/main.py")
                && to.starts_with("repo:core/")
                && to.contains("::file:shop_core/__init__.py")
        }),
        "{edges:#?}"
    );
}

#[test]
fn the_published_python_package_is_no_longer_an_external_node() {
    let (_dir, ws) = space(&["py-core", "py-app"], "py-space", "py.relief.json");
    let graph = graph(&Session::open_workspace(&ws, options(None)).unwrap());
    let externals: Vec<String> = node_ids(&graph)
        .into_iter()
        .filter(|id| id.ends_with("external/shop_core"))
        .collect();
    assert_eq!(externals, Vec::<String>::new());
}

#[test]
fn on_a_single_repository_the_package_is_still_external() {
    let dir = TempDir::new().unwrap();
    let web = dir.path().join("shop-web");
    Fixture::load("shop-web").unwrap().build(&web).unwrap();
    let session = Session::open(&web, options(None)).unwrap();
    let graph = graph(&session);
    assert!(
        node_ids(&graph).contains(&"pkg:external/@shop/api".to_owned()),
        "{:?}",
        node_ids(&graph)
    );
}
