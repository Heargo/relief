//! Review fixes of K06: a map already open opens another repository, one recent per folder.

use relief_app::{AppError, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_ts::TsAdapter;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::test::{INVOKE_KEY, MockRuntime, mock_builder, mock_context, noop_assets};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};
use tempfile::TempDir;

struct Harness {
    _dir: TempDir,
    config: TempDir,
    acme: PathBuf,
    _app: tauri::App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
}

fn opener() -> relief_desktop::SessionOpener {
    Arc::new(|path: &Path| -> Result<Session, AppError> {
        Session::open(
            path,
            SessionOptions {
                data_dir: None,
                range: None,
                detectors: default_detectors(),
                adapters: vec![Box::new(TsAdapter::new())],
            },
        )
    })
}

fn harness() -> Harness {
    let dir = TempDir::new().unwrap();
    let acme = dir.path().join("acme");
    Fixture::load("acme-shop").unwrap().build(&acme).unwrap();
    let config = TempDir::new().unwrap();
    let builder = mock_builder()
        .register_uri_scheme_protocol("http", |_, _| tauri::http::Response::new(Vec::new()));
    let app = relief_desktop::register_welcome(builder, config.path().to_path_buf(), opener())
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    Harness {
        _dir: dir,
        config,
        acme,
        _app: app,
        window,
    }
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

fn open(h: &Harness, path: &Path) -> Result<Value, Value> {
    call(h, "open_repo", json!({ "path": path.to_str().unwrap() }))
}

// Review fixes: an already open map can open another repository too, and the recents hold one
// entry per real folder.

fn session_harness() -> Harness {
    let dir = TempDir::new().unwrap();
    let acme = dir.path().join("acme");
    Fixture::load("acme-shop").unwrap().build(&acme).unwrap();
    let config = TempDir::new().unwrap();
    let session = Arc::new(opener()(&acme).unwrap());
    let builder = mock_builder()
        .register_uri_scheme_protocol("http", |_, _| tauri::http::Response::new(Vec::new()));
    let app =
        relief_desktop::register_session(builder, session, config.path().to_path_buf(), opener())
            .build(mock_context(noop_assets()))
            .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    Harness {
        _dir: dir,
        config,
        acme,
        _app: app,
        window,
    }
}

#[test]
fn a_map_already_open_can_open_another_repository() {
    let h = session_harness();
    let other = h._dir.path().join("other");
    Fixture::load("tiny").unwrap().build(&other).unwrap();
    assert_eq!(call(&h, "meta", json!({})).unwrap()["repo"], "acme");
    assert_eq!(open(&h, &other).unwrap()["repo"], "other");
    assert_eq!(call(&h, "meta", json!({})).unwrap()["repo"], "other");
    let recents = call(&h, "recents", json!({})).unwrap();
    assert_eq!(recents[0]["name"], "other", "{recents}");
    assert!(h.config.path().join("recents.json").is_file());
}

#[test]
fn the_same_folder_written_two_ways_is_one_recent() {
    let h = harness();
    open(&h, &h.acme).unwrap();
    let detour = h.acme.join("..").join("acme");
    open(&h, &detour).unwrap();
    let recents = call(&h, "recents", json!({})).unwrap();
    assert_eq!(recents.as_array().unwrap().len(), 1, "{recents}");
    assert_eq!(
        recents[0]["path"],
        h.acme.canonicalize().unwrap().to_str().unwrap()
    );
}
