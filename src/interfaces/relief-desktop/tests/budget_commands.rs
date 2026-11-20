//! Seam 1 of ticket S01: the Tauri commands `snapshot`, `diff` (with `budget` and `expand`) and
//! `search`, called through the IPC of the mock runtime on the generated fixture `wide`.
//!
//! API expected: `snapshot { rev, budget?, expand? }`, `diff { range?, budget?, expand? }` and
//! `search { range?, query, limit }` -> `{ "hits": [{ "id", "kind" }] }`; closed containers carry
//! `childCount` in JSON; a budgeted diff carries `graph`. Arguments are camelCase JSON.

use std::sync::Arc;

use relief_app::{DataDirEnv, RangeSpec, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_ts::TsAdapter;
use serde_json::{Value, json};
use tauri::test::{INVOKE_KEY, MockRuntime, mock_builder, mock_context, noop_assets};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};
use tempfile::TempDir;

struct Harness {
    _app: tauri::App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
}

/// `wide` built once for the whole file (the built repository is shared, each test has its own
/// session and data folder so that the caches do not collide).
fn wide_path() -> &'static std::path::Path {
    static WIDE: std::sync::OnceLock<(TempDir, std::path::PathBuf)> = std::sync::OnceLock::new();
    &WIDE
        .get_or_init(|| {
            let dir = TempDir::new().unwrap();
            let path = dir.path().join("wide");
            Fixture::load("wide")
                .unwrap()
                .build_with_worktree(&path, |repo| {
                    std::fs::write(
                        repo.join("packages/pkg-02/file-005.ts"),
                        "export function f2x5(): number {\n  return 99999;\n}\n",
                    )
                    .unwrap();
                })
                .unwrap();
            (dir, path)
        })
        .1
}

/// One session for the file: it keeps the indexed commits in memory, so `wide` is indexed once
/// (the tests only read; each test has its own Tauri app and window).
fn shared_session() -> Arc<Session> {
    static SESSION: std::sync::OnceLock<(TempDir, Arc<Session>)> = std::sync::OnceLock::new();
    SESSION
        .get_or_init(|| {
            let data = TempDir::new().unwrap();
            let session = Arc::new(
                Session::open(
                    wide_path(),
                    SessionOptions {
                        data_dir: Some(DataDirEnv {
                            relief_cache_dir: Some(data.path().to_path_buf()),
                            xdg_cache_home: None,
                            home: None,
                        }),
                        range: Some(RangeSpec::worktree()),
                        detectors: default_detectors(),
                        adapters: vec![Box::new(TsAdapter::new())],
                    },
                )
                .unwrap(),
            );
            (data, session)
        })
        .1
        .clone()
}

fn harness() -> Harness {
    let session = shared_session();
    let builder = mock_builder()
        .register_uri_scheme_protocol("http", |_, _| tauri::http::Response::new(Vec::new()));
    let app = relief_desktop::register(builder, session)
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    Harness { _app: app, window }
}

fn call(h: &Harness, cmd: &str, args: Value) -> Result<Value, Value> {
    tauri::test::get_ipc_response(
        &h.window,
        InvokeRequest {
            cmd: cmd.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "http://tauri.localhost".parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<Value>().unwrap())
}

fn node<'a>(graph: &'a Value, id: &str) -> Option<&'a Value> {
    graph["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == id)
}

#[test]
fn the_snapshot_command_passes_the_budget_and_returns_closed_packages_with_their_count() {
    let h = harness();
    let got = call(&h, "snapshot", json!({ "rev": "HEAD", "budget": 2000 })).unwrap();
    let nodes = got["graph"]["nodes"].as_array().unwrap();
    assert!(nodes.len() <= 2000, "{} nodes", nodes.len());
    let pkg = node(&got["graph"], "pkg:wide/packages/pkg-03").expect("pkg-03");
    assert_eq!(pkg["childCount"], 300);
}

#[test]
fn the_snapshot_command_passes_expand_and_returns_the_files_of_the_package() {
    let h = harness();
    let got = call(
        &h,
        "snapshot",
        json!({ "rev": "HEAD", "budget": 2000, "expand": ["pkg:wide/packages/pkg-03"] }),
    )
    .unwrap();
    assert!(got["graph"]["nodes"].as_array().unwrap().len() <= 2000);
    let files = got["graph"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["parent"] == "pkg:wide/packages/pkg-03")
        .count();
    assert_eq!(files, 300);
}

#[test]
fn the_diff_command_passes_the_budget_and_returns_the_subgraph() {
    let h = harness();
    let got = call(&h, "diff", json!({ "budget": 2000 })).unwrap();
    let graph = &got["graph"];
    assert!(graph["nodes"].as_array().unwrap().len() <= 2000);
    assert!(
        node(
            graph,
            "pkg:wide/packages/pkg-02::file:packages/pkg-02/file-005.ts"
        )
        .is_some()
    );
    assert_eq!(
        node(graph, "pkg:wide/packages/pkg-00").unwrap()["childCount"],
        300
    );
}

#[test]
fn the_search_command_finds_a_symbol_of_an_unloaded_file() {
    let h = harness();
    let got = call(&h, "search", json!({ "query": "f7x42", "limit": 8 })).unwrap();
    assert_eq!(
        got["hits"][0]["id"],
        "pkg:wide/packages/pkg-07::file:packages/pkg-07/file-042.ts::sym:f7x42"
    );
    assert_eq!(got["hits"][0]["kind"], "symbol");
}

#[test]
fn the_search_command_honours_the_limit() {
    let h = harness();
    let got = call(
        &h,
        "search",
        json!({ "range": "HEAD", "query": "file-00", "limit": 3 }),
    )
    .unwrap();
    assert_eq!(got["hits"].as_array().unwrap().len(), 3);
}
