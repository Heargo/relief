//! Seam 1 of ticket K10 (commands): the comparison of each repository of the open workspace, on
//! the fixture workspace `tests/fixtures/shop-space` (`web` on `feat/order-badge`, `api` on
//! `feat/order-total`, both into `main`).
//!
//! API expected:
//! - `workspace_comparisons {}` answers `[{ name, source, destination, branches }]`, in file
//!   order;
//! - `set_workspace_repo_comparison { name, source, destination, save }` changes the comparison
//!   of one repository for the open session (the next `diff` follows) and, with `save`, in the
//!   workspace file too; it answers the same list as `workspace_comparisons`;
//! - both fail with the code `bad_request` on a single repository; an unknown repository fails.

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
    ws: PathBuf,
    api: PathBuf,
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
    let root = dir.path();
    let api = root.join("shop-api");
    Fixture::load("shop-api").unwrap().build(&api).unwrap();
    Fixture::load("shop-web")
        .unwrap()
        .build(&root.join("shop-web"))
        .unwrap();
    let ws = root.join("shop-space");
    std::fs::create_dir(&ws).unwrap();
    std::fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/fixtures/shop-space/shop.relief.json"),
        ws.join("shop.relief.json"),
    )
    .unwrap();
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
        ws,
        api,
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

fn open_space(h: &Harness) {
    call(
        h,
        "open_workspace",
        json!({ "path": h.ws.to_str().unwrap() }),
    )
    .unwrap();
}

fn file(h: &Harness) -> Value {
    serde_json::from_str(&std::fs::read_to_string(h.ws.join("shop.relief.json")).unwrap()).unwrap()
}

fn changed_ids(h: &Harness) -> Vec<String> {
    let mut ids: Vec<String> = call(h, "diff", json!({})).unwrap()["diff"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["id"].as_str().unwrap().to_owned())
        .collect();
    ids.sort();
    ids
}

const API_CREATE_ORDER: &str = "repo:api/pkg:shop-api/src::file:src/orders.ts::sym:createOrder";
const WEB_RENDER_ORDERS: &str =
    "repo:web/pkg:shop-web/src::file:src/OrderList.ts::sym:renderOrders";

#[test]
fn workspace_comparisons_lists_each_repository_with_its_sides() {
    let h = harness();
    open_space(&h);
    let list = call(&h, "workspace_comparisons", json!({})).unwrap();
    let list = list.as_array().unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0]["name"], "web");
    assert_eq!(list[0]["source"], "feat/order-badge");
    assert_eq!(list[0]["destination"], "main");
    assert_eq!(list[1]["name"], "api");
    assert_eq!(list[1]["source"], "feat/order-total");
    assert!(
        list[1]["branches"]
            .as_array()
            .unwrap()
            .contains(&json!("main"))
    );
}

#[test]
fn a_change_in_session_moves_the_diff_and_leaves_the_file_alone() {
    let h = harness();
    open_space(&h);
    assert_eq!(
        changed_ids(&h),
        [API_CREATE_ORDER.to_owned(), WEB_RENDER_ORDERS.to_owned()]
    );
    let list = call(
        &h,
        "set_workspace_repo_comparison",
        json!({ "name": "api", "source": "main", "destination": "main", "save": false }),
    )
    .unwrap();
    assert_eq!(list[1]["source"], "main");
    assert_eq!(list[0]["source"], "feat/order-badge");
    assert_eq!(changed_ids(&h), [WEB_RENDER_ORDERS.to_owned()]);
    assert_eq!(file(&h)["repos"][1]["source"], "feat/order-total");
}

#[test]
fn saving_writes_the_comparison_in_the_workspace_file() {
    let h = harness();
    open_space(&h);
    call(
        &h,
        "set_workspace_repo_comparison",
        json!({ "name": "api", "source": "main", "destination": "main", "save": true }),
    )
    .unwrap();
    assert_eq!(file(&h)["repos"][1]["source"], "main");
    assert_eq!(file(&h)["repos"][1]["destination"], "main");
    assert_eq!(file(&h)["repos"][0]["source"], "feat/order-badge");
    assert_eq!(changed_ids(&h), [WEB_RENDER_ORDERS.to_owned()]);
}

#[test]
fn an_unknown_repository_fails_and_changes_nothing() {
    let h = harness();
    open_space(&h);
    let error = call(
        &h,
        "set_workspace_repo_comparison",
        json!({ "name": "nope", "source": "main", "destination": "main", "save": true }),
    )
    .expect_err("unknown repository");
    assert!(
        error["message"]
            .as_str()
            .is_some_and(|m| m.contains("nope")),
        "{error}"
    );
    assert_eq!(file(&h)["repos"][1]["source"], "feat/order-total");
}

#[test]
fn the_comparison_commands_need_an_open_workspace() {
    let h = harness();
    call(&h, "open_repo", json!({ "path": h.api.to_str().unwrap() })).unwrap();
    let error = call(&h, "workspace_comparisons", json!({})).expect_err("single repository");
    assert_eq!(error["code"], "bad_request", "{error}");
    let error = call(
        &h,
        "set_workspace_repo_comparison",
        json!({ "name": "shop-api", "source": "main", "destination": "main", "save": false }),
    )
    .expect_err("single repository");
    assert_eq!(error["code"], "bad_request", "{error}");
}
