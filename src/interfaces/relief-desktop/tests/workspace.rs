//! Seam 2 of ticket K07: the workspace commands. A window opened on the welcome screen creates
//! or opens a workspace, adds and removes repositories, and opens a repository as a workspace;
//! every command answers the `meta` of the new session (`"workspace": { "repos": [...] }`).
//!
//! API expected:
//! - the `SessionOpener` given to `register_welcome` also receives the path of a workspace (its
//!   `.relief.json` file or its folder): here it calls `Session::open_workspace` when
//!   `relief_app::Workspace::locate(path)` finds a file, else `Session::open`.
//! - commands `create_workspace { dir, name }`, `open_workspace { path }` (file or folder),
//!   `open_repo_as_workspace { repo, dir }`, `add_workspace_repo { repo, labels }` and
//!   `remove_workspace_repo { name }`; the last two work on the open workspace and fail with the
//!   code `bad_request` on a window that shows a single repository (or no session).
//! - the workspace opened (not the ones only created in the background) goes to the recents as
//!   `{ "kind": "workspace", "path": "<dir>/<name>.relief.json", "name": "<name>" }`.

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

fn opener() -> relief_desktop::SessionOpener {
    Arc::new(|path: &Path| -> Result<Session, AppError> {
        let options = SessionOptions {
            data_dir: Some(DataDirEnv::default()),
            range: None,
            detectors: default_detectors(),
            adapters: vec![Box::new(TsAdapter::new())],
        };
        if Workspace::locate(path).is_some() {
            Session::open_workspace(path, options)
        } else {
            Session::open(path, options)
        }
    })
}

fn harness() -> Harness {
    let dir = TempDir::new().unwrap();
    let acme = dir.path().join("acme");
    let tiny = dir.path().join("tiny");
    let ws = dir.path().join("space");
    Fixture::load("acme-shop").unwrap().build(&acme).unwrap();
    Fixture::load("tiny").unwrap().build(&tiny).unwrap();
    std::fs::create_dir(&ws).unwrap();
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

fn create(h: &Harness) -> Value {
    call(
        h,
        "create_workspace",
        json!({ "dir": p(&h.ws), "name": "shop" }),
    )
    .unwrap()
}

#[test]
fn create_workspace_opens_an_empty_workspace_in_the_window() {
    let h = harness();
    let meta = create(&h);
    assert_eq!(meta["repo"], "shop");
    assert_eq!(meta["workspace"], json!({ "repos": [] }));
    assert!(h.ws.join("shop.relief.json").is_file());
    assert_eq!(call(&h, "meta", json!({})).unwrap()["repo"], "shop");
}

#[test]
fn add_workspace_repo_adds_the_repository_with_its_labels() {
    let h = harness();
    create(&h);
    let meta = call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&h.acme), "labels": ["back"] }),
    )
    .unwrap();
    assert_eq!(
        meta["workspace"],
        json!({ "repos": [{ "name": "acme", "labels": ["back"] }] })
    );
    let meta = call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&h.tiny), "labels": [] }),
    )
    .unwrap();
    assert_eq!(
        meta["workspace"],
        json!({ "repos": [
            { "name": "acme", "labels": ["back"] },
            { "name": "tiny", "labels": [] },
        ] })
    );
    assert_eq!(
        call(&h, "meta", json!({})).unwrap()["workspace"]["repos"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let file: Value =
        serde_json::from_str(&std::fs::read_to_string(h.ws.join("shop.relief.json")).unwrap())
            .unwrap();
    assert_eq!(file["repos"][1]["path"], "../tiny");
}

#[test]
fn remove_workspace_repo_removes_it() {
    let h = harness();
    create(&h);
    for repo in [&h.acme, &h.tiny] {
        call(
            &h,
            "add_workspace_repo",
            json!({ "repo": p(repo), "labels": [] }),
        )
        .unwrap();
    }
    let meta = call(&h, "remove_workspace_repo", json!({ "name": "acme" })).unwrap();
    assert_eq!(
        meta["workspace"],
        json!({ "repos": [{ "name": "tiny", "labels": [] }] })
    );
}

#[test]
fn open_repo_as_workspace_creates_a_workspace_named_after_the_repository() {
    let h = harness();
    let meta = call(
        &h,
        "open_repo_as_workspace",
        json!({ "repo": p(&h.acme), "dir": p(&h.ws) }),
    )
    .unwrap();
    assert_eq!(meta["repo"], "acme");
    assert_eq!(
        meta["workspace"],
        json!({ "repos": [{ "name": "acme", "labels": [] }] })
    );
    assert!(h.ws.join("acme.relief.json").is_file());
}

#[test]
fn open_workspace_reopens_a_workspace_by_its_file_and_by_its_folder() {
    let h = harness();
    create(&h);
    call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&h.acme), "labels": ["ops"] }),
    )
    .unwrap();
    let file = h.ws.join("shop.relief.json");
    for path in [p(&file), p(&h.ws)] {
        let meta = call(&h, "open_workspace", json!({ "path": path })).unwrap();
        assert_eq!(meta["repo"], "shop");
        assert_eq!(
            meta["workspace"],
            json!({ "repos": [{ "name": "acme", "labels": ["ops"] }] })
        );
    }
}

#[test]
fn opening_a_workspace_adds_it_to_the_recents_by_its_file() {
    let h = harness();
    create(&h);
    call(&h, "open_workspace", json!({ "path": p(&h.ws) })).unwrap();
    let file = h.ws.join("shop.relief.json");
    assert_eq!(
        call(&h, "recents", json!({})).unwrap(),
        json!([{ "kind": "workspace", "path": p(&file), "name": "shop" }])
    );
}

#[test]
fn open_workspace_on_a_folder_without_a_workspace_fails_and_keeps_the_window_as_it_was() {
    let h = harness();
    let error = call(&h, "open_workspace", json!({ "path": p(&h.acme) })).expect_err("no file");
    assert!(
        error["message"].as_str().is_some_and(|m| !m.is_empty()),
        "{error}"
    );
    let meta = call(&h, "meta", json!({})).expect_err("still no session");
    assert_eq!(meta["code"], "no_session");
    assert_eq!(call(&h, "recents", json!({})).unwrap(), json!([]));
}

#[test]
fn add_workspace_repo_needs_an_open_workspace() {
    let h = harness();
    let error = call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&h.acme), "labels": [] }),
    )
    .expect_err("no session");
    assert_eq!(error["code"], "bad_request", "{error}");

    call(&h, "open_repo", json!({ "path": p(&h.acme) })).unwrap();
    let error = call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&h.tiny), "labels": [] }),
    )
    .expect_err("a single repository is open");
    assert_eq!(error["code"], "bad_request", "{error}");
    let error = call(&h, "remove_workspace_repo", json!({ "name": "acme" }))
        .expect_err("a single repository is open");
    assert_eq!(error["code"], "bad_request", "{error}");
}

#[test]
fn add_workspace_repo_refuses_a_folder_that_is_not_a_repository() {
    let h = harness();
    create(&h);
    let plain = h.ws.join("plain");
    std::fs::create_dir(&plain).unwrap();
    let error = call(
        &h,
        "add_workspace_repo",
        json!({ "repo": p(&plain), "labels": [] }),
    )
    .expect_err("not a repository");
    assert!(
        error["message"].as_str().is_some_and(|m| !m.is_empty()),
        "{error}"
    );
    assert_eq!(
        call(&h, "meta", json!({})).unwrap()["workspace"],
        json!({ "repos": [] })
    );
}
