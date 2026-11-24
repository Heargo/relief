//! K13 review: the workspace commands also work when the app is started by `relief <path>`
//! (`register_session`), not only from the welcome screen (`register_welcome`).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use relief_app::{AppError, DataDirEnv, Session, SessionOptions, Workspace};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_ts::TsAdapter;
use serde_json::{Value, json};
use tauri::test::{INVOKE_KEY, MockRuntime, mock_builder, mock_context, noop_assets};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};
use tempfile::TempDir;

struct Harness {
    _dir: TempDir,
    _config: TempDir,
    acme: PathBuf,
    tiny: PathBuf,
    ws: PathBuf,
    _app: tauri::App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
}

fn options() -> SessionOptions {
    SessionOptions {
        data_dir: Some(DataDirEnv::default()),
        range: None,
        detectors: default_detectors(),
        adapters: vec![Box::new(TsAdapter::new())],
    }
}

fn opener() -> relief_desktop::SessionOpener {
    Arc::new(|path: &Path| -> Result<Session, AppError> {
        if Workspace::locate(path).is_some() {
            Session::open_workspace(path, options())
        } else {
            Session::open(path, options())
        }
    })
}

/// The app started on the repository acme-shop, as `relief <path>` does.
fn harness() -> Harness {
    let dir = TempDir::new().unwrap();
    let acme = dir.path().join("acme");
    let tiny = dir.path().join("tiny");
    let ws = dir.path().join("space");
    Fixture::load("acme-shop").unwrap().build(&acme).unwrap();
    Fixture::load("tiny").unwrap().build(&tiny).unwrap();
    std::fs::create_dir(&ws).unwrap();
    let config = TempDir::new().unwrap();
    let session = Arc::new(Session::open(&acme, options()).unwrap());
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
        _config: config,
        acme,
        tiny,
        ws,
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

fn p(path: &Path) -> &str {
    path.to_str().unwrap()
}

#[test]
fn a_repository_opened_from_the_command_line_becomes_a_workspace() {
    let h = harness();
    let meta = call(
        &h,
        "open_repo_as_workspace",
        json!({ "repo": p(&h.acme), "dir": p(&h.ws) }),
    )
    .unwrap();
    assert_eq!(
        meta["workspace"],
        json!({ "repos": [{ "name": "acme", "labels": [] }] })
    );
    assert!(h.ws.join("acme.relief.json").is_file());
    // the window now shows the workspace, and a repository can be added to it
    let meta = call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&h.tiny), "labels": ["back"] }),
    )
    .unwrap();
    assert_eq!(meta["workspace"]["repos"].as_array().unwrap().len(), 2);
}

#[test]
fn a_workspace_can_be_created_and_opened_from_the_command_line_window() {
    let h = harness();
    let meta = call(
        &h,
        "create_workspace",
        json!({ "dir": p(&h.ws), "name": "shop" }),
    )
    .unwrap();
    assert_eq!(meta["repo"], "shop");
    let meta = call(&h, "open_workspace", json!({ "path": p(&h.ws) })).unwrap();
    assert_eq!(meta["repo"], "shop");
}

#[test]
fn adding_a_repository_to_a_single_repository_window_is_refused() {
    let h = harness();
    let err = call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&h.tiny), "labels": [] }),
    )
    .unwrap_err();
    assert_eq!(err["code"], "bad_request");
}
