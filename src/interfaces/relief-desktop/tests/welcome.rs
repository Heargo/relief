//! Seam 1 of ticket K06: `relief` without a path starts with no session. `meta` says so, the
//! commands `open_repo` and `recents` work on the user's configuration folder (a temporary one
//! here, never the real `~/.config`), and `open_repo` creates the session in the same window.
//!
//! API expected:
//! - `relief_desktop::register_welcome<R: Runtime>(Builder<R>, PathBuf, SessionOpener) ->
//!   Builder<R>`: no session yet; the folder holds `recents.json`; the opener builds the session
//!   of a repository path (`SessionOpener = Arc<dyn Fn(&Path) -> Result<Session, AppError> + Send
//!   + Sync>`).
//! - `relief_desktop::config_dir(relief_config_dir, xdg_config_home, home) -> PathBuf`.
//! - commands `open_repo { path }` (answers the `meta` of the new session) and `recents` (list of
//!   `{ kind: "repo" | "workspace", path, name }`, most recent first).
//! - `recents.json`: `{ "entries": [{ "kind": "repo", "path": "/abs/path" }] }`.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use relief_app::{AppError, Session, SessionOptions};
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

#[test]
fn without_a_session_meta_says_there_is_no_session() {
    let h = harness();
    let error = call(&h, "meta", json!({})).expect_err("no session yet");
    assert_eq!(error["code"], "no_session", "{error}");
    assert_eq!(error["message"], "no session", "{error}");
}

#[test]
fn without_a_session_the_other_commands_say_so_too() {
    let h = harness();
    let error = call(&h, "snapshot", json!({ "rev": "main" })).expect_err("no session yet");
    assert_eq!(error["code"], "no_session", "{error}");
}

#[test]
fn recents_start_empty() {
    let h = harness();
    assert_eq!(call(&h, "recents", json!({})).unwrap(), json!([]));
}

#[test]
fn open_repo_creates_the_session_in_the_same_window() {
    let h = harness();
    let meta = open(&h, &h.acme).unwrap();
    assert_eq!(meta["repo"], "acme");
    let branches = meta["branches"].as_array().unwrap();
    assert!(branches.contains(&json!("main")), "{branches:?}");

    let meta = call(&h, "meta", json!({})).unwrap();
    assert_eq!(meta["repo"], "acme");
    let snapshot = call(&h, "snapshot", json!({ "rev": "main" })).unwrap();
    assert!(
        snapshot["graph"]["nodes"]
            .as_array()
            .is_some_and(|n| !n.is_empty())
    );
}

#[test]
fn open_repo_adds_the_repository_to_the_recents() {
    let h = harness();
    open(&h, &h.acme).unwrap();
    assert_eq!(
        call(&h, "recents", json!({})).unwrap(),
        json!([{ "kind": "repo", "path": h.acme.to_str().unwrap(), "name": "acme" }])
    );
    // Written in the configuration folder, not anywhere else.
    assert!(h.config.path().join("recents.json").is_file());
}

#[test]
fn opening_the_same_repository_again_does_not_duplicate_it() {
    let h = harness();
    let other = h._dir.path().join("other");
    Fixture::load("tiny").unwrap().build(&other).unwrap();
    open(&h, &h.acme).unwrap();
    open(&h, &other).unwrap();
    open(&h, &h.acme).unwrap();
    let recents = call(&h, "recents", json!({})).unwrap();
    let names: Vec<&str> = recents
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["acme", "other"], "most recent first: {recents}");
}

#[test]
fn open_repo_on_a_folder_that_is_not_a_repository_fails_and_is_not_remembered() {
    let h = harness();
    let empty = TempDir::new().unwrap();
    let error = open(&h, empty.path()).expect_err("not a repository");
    assert!(
        error["message"].as_str().is_some_and(|m| !m.is_empty()),
        "{error}"
    );
    assert_eq!(call(&h, "recents", json!({})).unwrap(), json!([]));
    let meta = call(&h, "meta", json!({})).expect_err("still no session");
    assert_eq!(meta["code"], "no_session");
}

#[test]
fn recents_are_read_from_the_configuration_folder() {
    let h = harness();
    std::fs::write(
        h.config.path().join("recents.json"),
        json!({ "entries": [
            { "kind": "repo", "path": h.acme.to_str().unwrap() },
            { "kind": "workspace", "path": "/work/shop/shop.relief.json" },
        ] })
        .to_string(),
    )
    .unwrap();
    assert_eq!(
        call(&h, "recents", json!({})).unwrap(),
        json!([
            { "kind": "repo", "path": h.acme.to_str().unwrap(), "name": "acme" },
            { "kind": "workspace", "path": "/work/shop/shop.relief.json", "name": "shop" },
        ])
    );
}

#[test]
fn the_configuration_folder_comes_from_the_override_then_xdg_then_home() {
    let os = |s: &str| Some(OsString::from(s));
    assert_eq!(
        relief_desktop::config_dir(os("/tmp/cfg"), os("/xdg"), os("/home/me")),
        PathBuf::from("/tmp/cfg")
    );
    assert_eq!(
        relief_desktop::config_dir(None, os("/xdg"), os("/home/me")),
        PathBuf::from("/xdg/relief")
    );
    assert_eq!(
        relief_desktop::config_dir(None, None, os("/home/me")),
        PathBuf::from("/home/me/.config/relief")
    );
}
