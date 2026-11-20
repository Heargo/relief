//! Seam 1 of ticket 05: the Tauri commands `meta`, `snapshot`, `diff`,
//! `review_summary` and `code`, called through the IPC of the mock runtime on
//! acme-shop.
//!
//! API expected: `relief_desktop::register<R: Runtime>(tauri::Builder<R>,
//! Arc<Session>) -> tauri::Builder<R>` registering the session state and the
//! five commands.
//! Arguments are camelCase JSON (`rev`, `range`, `node`, `side`); an error is
//! `{ "code": ..., "message": ... }`.

use std::sync::Arc;

use relief_app::{
    DiffRequest, RangeSpec, ReviewSummaryRequest, Session, SessionOptions, SnapshotRequest,
};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_ts::TsAdapter;
use serde_json::{Value, json};
use tauri::test::{INVOKE_KEY, MockRuntime, mock_builder, mock_context, noop_assets};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};
use tempfile::TempDir;

const RANGE: &str = "main...feat/promo-codes";
const INVOICE_FILE: &str = "pkg:@acme/api/billing::file:apps/api/billing/invoice.ts";
const REFRESH: &str = "pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh";
const COMPUTE_TOTAL: &str =
    "pkg:@acme/api/billing::file:apps/api/billing/invoice.ts::sym:computeTotal";

struct Harness {
    _dir: TempDir,
    _data: Option<TempDir>,
    session: Arc<Session>,
    // Keeps the app alive as long as the window is used.
    _app: tauri::App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
}

fn harness() -> Harness {
    harness_with(false)
}

/// With `with_data`, the session has a temporary data folder (`relief_cache_dir`).
fn harness_with(with_data: bool) -> Harness {
    harness_on("acme-shop", RANGE, with_data)
}

fn harness_on(fixture: &str, range: &str, with_data: bool) -> Harness {
    let data = with_data.then(|| TempDir::new().unwrap());
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("acme");
    Fixture::load(fixture).unwrap().build(&path).unwrap();
    let session = Arc::new(
        Session::open(
            &path,
            SessionOptions {
                data_dir: data.as_ref().map(|d| relief_app::DataDirEnv {
                    relief_cache_dir: Some(d.path().to_path_buf()),
                    xdg_cache_home: None,
                    home: None,
                }),
                range: Some(RangeSpec::parse(range).unwrap()),
                detectors: default_detectors(),
                adapters: vec![Box::new(TsAdapter::new())],
            },
        )
        .unwrap(),
    );
    // The `http` scheme makes the IPC origin `http://tauri.localhost` count as local on Linux.
    let builder = mock_builder()
        .register_uri_scheme_protocol("http", |_, _| tauri::http::Response::new(Vec::new()));
    let app = relief_desktop::register(builder, session.clone())
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    Harness {
        _dir: dir,
        _data: data,
        session,
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

fn assert_error(result: Result<Value, Value>, code: &str) {
    let error = result.expect_err("an error was expected");
    assert_eq!(error["code"], code, "{error}");
    assert!(
        error["message"].as_str().is_some_and(|m| !m.is_empty()),
        "{error}"
    );
}

#[test]
fn meta_returns_the_repository_and_the_opening_range() {
    let h = harness();
    let meta = call(&h, "meta", json!({})).unwrap();
    assert_eq!(meta["repo"], "acme");
    assert_eq!(meta["range"], RANGE);
    let branches = meta["branches"].as_array().unwrap();
    assert!(branches.contains(&json!("main")), "{branches:?}");
    assert!(
        branches.contains(&json!("feat/promo-codes")),
        "{branches:?}"
    );
}

#[test]
fn snapshot_returns_the_graph_of_a_ref() {
    let h = harness();
    let got = call(&h, "snapshot", json!({ "rev": "main" })).unwrap();
    let expected = h
        .session
        .snapshot(&SnapshotRequest {
            rev: "main".into(),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(got, serde_json::to_value(expected).unwrap());
    assert!(
        got["graph"]["nodes"]
            .as_array()
            .is_some_and(|n| !n.is_empty())
    );
}

#[test]
fn snapshot_of_an_unknown_ref_is_unknown_ref() {
    let h = harness();
    assert_error(
        call(&h, "snapshot", json!({ "rev": "nope" })),
        "unknown_ref",
    );
}

#[test]
fn diff_returns_the_diff_of_the_range() {
    let h = harness();
    let got = call(&h, "diff", json!({ "range": RANGE })).unwrap();
    let expected = h
        .session
        .diff(&DiffRequest {
            range: Some(RangeSpec::parse(RANGE).unwrap()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    assert_eq!(got, serde_json::to_value(expected).unwrap());
    assert!(got.to_string().contains(COMPUTE_TOTAL));
}

#[test]
fn diff_without_a_range_uses_the_opening_range() {
    let h = harness();
    let with = call(&h, "diff", json!({ "range": RANGE })).unwrap();
    let without = call(&h, "diff", json!({})).unwrap();
    assert_eq!(without, with);
}

#[test]
fn diff_of_a_malformed_range_is_invalid_range() {
    let h = harness();
    assert_error(
        call(&h, "diff", json!({ "range": "main..." })),
        "invalid_range",
    );
}

#[test]
fn review_summary_returns_the_reading_aids_of_the_range() {
    let h = harness();
    let got = call(&h, "review_summary", json!({ "range": RANGE })).unwrap();
    let expected = h
        .session
        .review_summary(&ReviewSummaryRequest {
            range: Some(RangeSpec::parse(RANGE).unwrap()),
        })
        .unwrap();
    assert_eq!(got, serde_json::to_value(expected).unwrap());
    assert!(got.to_string().contains(COMPUTE_TOTAL));
}

#[test]
fn review_summary_serializes_the_rule_violations() {
    let h = harness();
    let got = call(&h, "review_summary", json!({ "range": RANGE })).unwrap();
    let violations = got["violations"].as_array().unwrap();
    assert_eq!(violations.len(), 2, "{violations:?}");
    let by_rule = |id: &str| violations.iter().find(|v| v["rule"] == id).unwrap();
    let introduced = by_rule("web-sans-db");
    assert_eq!(introduced["introduced"], true);
    assert!(
        introduced["edge"]["from"]
            .as_str()
            .unwrap()
            .ends_with("::sym:validateCodeLocally")
    );
    assert!(
        introduced["edge"]["to"]
            .as_str()
            .unwrap()
            .ends_with("::sym:findDiscountByCode")
    );
    let existing = by_rule("routes-via-repos");
    assert_eq!(existing["introduced"], false);
    assert!(
        existing["edge"]["from"]
            .as_str()
            .unwrap()
            .ends_with("::sym:listInvoices")
    );
    assert!(
        existing["edge"]["to"]
            .as_str()
            .unwrap()
            .ends_with("::sym:invoicesTable")
    );
}

#[test]
fn rules_returns_the_three_rules_and_the_yaml_of_acme_shop() {
    let h = harness();
    let got = call(&h, "rules", json!({ "range": RANGE })).unwrap();
    let ids: Vec<&str> = got["rules"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["id"].as_str().unwrap())
        .collect();
    assert_eq!(
        ids,
        ["web-sans-db", "packages-sans-apps", "routes-via-repos"]
    );
    assert_eq!(got["rules"][0]["from"], "apps/web/**");
    assert_eq!(got["rules"][0]["deny"], "packages/db/**");
    assert_eq!(
        got["rules"][0]["description"],
        "le front ne parle jamais directement à la base"
    );
    let source = got["source"].as_str().unwrap();
    assert!(
        source.starts_with("# relief.config.yaml\nrules:\n"),
        "{source}"
    );
    assert!(source.contains("id: routes-via-repos"), "{source}");
}

#[test]
fn rules_without_a_config_file_is_an_empty_list_and_no_source() {
    let h = harness_on("tiny", "HEAD~1..HEAD", false);
    let got = call(&h, "rules", json!({ "range": "HEAD~1..HEAD" })).unwrap();
    assert_eq!(got["rules"], json!([]));
    assert!(got["source"].is_null(), "{got}");
}

#[test]
fn rules_of_a_malformed_range_is_invalid_range() {
    let h = harness();
    assert_error(
        call(&h, "rules", json!({ "range": "main..." })),
        "invalid_range",
    );
}

#[test]
fn impact_returns_the_callers_of_a_node_through_the_ipc() {
    let h = harness();
    let args = |direction: &str, follow_http: bool| {
        json!({
            "seeds": [REFRESH],
            "direction": direction,
            "maxDepth": 8,
            "followHttp": follow_http,
            "range": RANGE,
        })
    };
    let with_http = call(&h, "impact", args("callers", true)).unwrap();
    assert_eq!(with_http["reached"].as_array().unwrap().len(), 8);
    let without = call(&h, "impact", args("callers", false)).unwrap();
    assert_eq!(without["reached"].as_array().unwrap().len(), 6);
    let first = &without["reached"][0];
    assert_eq!(first["depth"], 1);
    assert!(first["outOfDiff"].is_boolean() && first["tested"].is_boolean());

    let shallow = call(
        &h,
        "impact",
        json!({ "seeds": [REFRESH], "direction": "callers", "maxDepth": 1,
                "followHttp": false, "range": RANGE }),
    )
    .unwrap();
    assert_eq!(shallow["reached"].as_array().unwrap().len(), 3);

    let deps = call(&h, "impact", args("dependencies", true)).unwrap();
    assert_ne!(deps, with_http);
    assert!(deps.to_string().contains("verifyToken"));
}

#[test]
fn impact_of_an_unknown_node_is_unknown_node() {
    let h = harness();
    assert_error(
        call(
            &h,
            "impact",
            json!({ "seeds": ["nope"], "direction": "callers", "maxDepth": 8,
                    "followHttp": true, "range": RANGE }),
        ),
        "unknown_node",
    );
}

#[test]
fn reading_order_returns_14_files_by_file_and_22_symbols_by_symbol() {
    let h = harness();
    let files = call(
        &h,
        "reading_order",
        json!({ "granularity": "file", "range": RANGE }),
    )
    .unwrap();
    assert_eq!(files["items"].as_array().unwrap().len(), 14);
    let symbols = call(
        &h,
        "reading_order",
        json!({ "granularity": "symbol", "range": RANGE }),
    )
    .unwrap();
    assert_eq!(symbols["items"].as_array().unwrap().len(), 22);
    assert!(symbols.to_string().contains(COMPUTE_TOTAL));
}

#[test]
fn reading_order_with_an_unknown_granularity_is_bad_request() {
    let h = harness();
    assert_error(
        call(
            &h,
            "reading_order",
            json!({ "granularity": "commit", "range": RANGE }),
        ),
        "bad_request",
    );
}

#[test]
fn commit_reading_lists_the_five_commits_of_the_default_range() {
    let h = harness();
    let response = call(&h, "commit_reading", json!({})).unwrap();
    let commits = response["commits"].as_array().unwrap();
    assert_eq!(commits.len(), 5);
    assert_eq!(
        commits[2]["message"],
        "refactor(auth): refresh() renvoie null au lieu de lever"
    );
    assert_eq!(commits[2]["files"].as_array().unwrap().len(), 2);
    assert_eq!(commits[2]["otherFiles"], 0);
    assert_eq!(commits[2]["short"].as_str().unwrap().len(), 7);
}

#[test]
fn commit_reading_of_a_malformed_range_is_invalid_range() {
    let h = harness();
    assert_error(
        call(&h, "commit_reading", json!({ "range": "main..." })),
        "invalid_range",
    );
}

#[test]
fn review_state_round_trips_through_the_ipc() {
    let h = harness_with(true);
    let empty = call(&h, "review_state", json!({ "range": RANGE })).unwrap();
    assert_eq!(empty["seen"], json!([]));
    call(
        &h,
        "set_review_state",
        json!({ "range": RANGE, "state": { "seen": [COMPUTE_TOTAL, INVOICE_FILE] } }),
    )
    .unwrap();
    let got = call(&h, "review_state", json!({ "range": RANGE })).unwrap();
    assert_eq!(got["seen"], json!([COMPUTE_TOTAL, INVOICE_FILE]));
}

#[test]
fn review_state_without_a_data_dir_is_no_data_dir() {
    let h = harness();
    assert_error(
        call(&h, "review_state", json!({ "range": RANGE })),
        "no_data_dir",
    );
    assert_error(
        call(
            &h,
            "set_review_state",
            json!({ "range": RANGE, "state": { "seen": [COMPUTE_TOTAL] } }),
        ),
        "no_data_dir",
    );
}

#[test]
fn review_summary_of_an_unknown_ref_is_unknown_ref() {
    let h = harness();
    assert_error(
        call(&h, "review_summary", json!({ "range": "nope...main" })),
        "unknown_ref",
    );
}

#[test]
fn code_returns_the_source_of_a_node_on_one_side() {
    let h = harness();
    let head = call(
        &h,
        "code",
        json!({ "node": INVOICE_FILE, "side": "head", "range": RANGE }),
    )
    .unwrap();
    assert!(
        head.as_str()
            .expect("code is a string")
            .contains("discount?: DiscountCode")
    );
    let base = call(
        &h,
        "code",
        json!({ "node": INVOICE_FILE, "side": "base", "range": RANGE }),
    )
    .unwrap();
    assert!(!base.as_str().unwrap().contains("DiscountCode"));
}

#[test]
fn code_of_an_unknown_node_is_unknown_node() {
    let h = harness();
    assert_error(
        call(
            &h,
            "code",
            json!({
                "node": "pkg:@acme/api::file:apps/api/billing/missing.ts",
                "side": "head",
            }),
        ),
        "unknown_node",
    );
}

#[test]
fn code_with_an_invalid_side_is_bad_request() {
    let h = harness();
    assert_error(
        call(
            &h,
            "code",
            json!({ "node": INVOICE_FILE, "side": "middle" }),
        ),
        "bad_request",
    );
}

// Ticket 08: `open_docs { lang }`. Creating the second window under `MockRuntime`
// is only partly observable: the contract (accepted and refused languages) and
// the existence of the `docs` window are tested; its URL is left to the e2e.

#[test]
fn open_docs_with_an_unknown_language_is_bad_request() {
    let h = harness();
    assert_error(
        call(&h, "open_docs", json!({ "lang": "de" })),
        "bad_request",
    );
    assert!(h._app.get_webview_window("docs").is_none());
}

#[test]
fn open_docs_accepts_french_and_english() {
    let h = harness();
    call(&h, "open_docs", json!({ "lang": "fr" })).expect("fr is accepted");
    call(&h, "open_docs", json!({ "lang": "en" })).expect("en is accepted");
}

#[test]
fn open_docs_creates_one_window_labelled_docs() {
    let h = harness();
    call(&h, "open_docs", json!({ "lang": "fr" })).unwrap();
    call(&h, "open_docs", json!({ "lang": "en" })).unwrap();
    let docs: Vec<_> = h
        ._app
        .webview_windows()
        .into_keys()
        .filter(|label| label == "docs")
        .collect();
    assert_eq!(docs.len(), 1);
}

#[test]
fn metrics_returns_churn_owner_and_complexity_of_a_ref_through_the_ipc() {
    let h = harness_on("churn", "main~1..main", false);
    let got = call(&h, "metrics", json!({ "rev": "main", "sinceDays": 90 })).unwrap();
    let pricing = &got["nodes"]["pkg:acme/src::file:src/pricing.ts"];
    assert_eq!(pricing["churn"], 3, "{got}");
    assert_eq!(pricing["owner"], "bob");
    assert_eq!(pricing["tested"], true);
    let total = &got["nodes"]["pkg:acme/src::file:src/pricing.ts::sym:total"];
    assert_eq!(total["churn"], 2);
    assert_eq!(total["complexity"], 3);
}

#[test]
fn metrics_without_since_days_uses_90_days_and_an_unknown_ref_is_an_error() {
    let h = harness_on("churn", "main~1..main", false);
    let got = call(&h, "metrics", json!({ "rev": "main" })).unwrap();
    assert_eq!(
        got["nodes"]["pkg:acme/src::file:src/pricing.ts"]["churn"],
        3
    );
    assert_error(call(&h, "metrics", json!({ "rev": "nope" })), "unknown_ref");
}

#[test]
fn co_change_returns_the_pairs_of_files_changed_together_through_the_ipc() {
    let h = harness_on("cochange", "main~1..main", false);
    let got = call(&h, "co_change", json!({ "rev": "main", "sinceDays": 365 })).unwrap();
    let pairs = got["pairs"].as_array().unwrap();
    assert_eq!(pairs.len(), 1, "{got}");
    assert_eq!(pairs[0]["a"], "src/a.md");
    assert_eq!(pairs[0]["b"], "src/b.md");
    assert_eq!(pairs[0]["commits"], 4);
    assert!((pairs[0]["confidence"].as_f64().unwrap() - 0.8).abs() < 1e-9);
}

#[test]
fn co_change_takes_an_optional_threshold_and_an_unknown_ref_is_an_error() {
    let h = harness_on("cochange", "main~1..main", false);
    let got = call(
        &h,
        "co_change",
        json!({ "rev": "main", "sinceDays": 365, "minCommits": 5 }),
    )
    .unwrap();
    assert_eq!(got["pairs"].as_array().unwrap().len(), 0, "{got}");
    // Default period and threshold: k3 and k5 only.
    let got = call(&h, "co_change", json!({ "rev": "main" })).unwrap();
    assert_eq!(got["pairs"][0]["commits"], 2, "{got}");
    assert_error(
        call(&h, "co_change", json!({ "rev": "nope" })),
        "unknown_ref",
    );
}
