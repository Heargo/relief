//! relief desktop app: the Tauri commands over a [`Session`].
//!
//! [`register`] is generic over the runtime so the tests drive the same
//! commands with the mock runtime; `main` uses the real one.

use std::sync::Arc;

use relief_app::{
    AppError, CoChangeRequest, CodeRequest, CommitReadingRequest, DiffRequest, EdgeUsagesRequest,
    ImpactRequest, MetricsRequest, RangeSpec, ReadingOrderRequest, ReviewSummaryRequest,
    RulesResponse, SearchRequest, Session, Side, SnapshotRequest,
};
use relief_model::{
    ApiError, CoChangeResponse, CommitReadingResponse, DiffResponse, EdgeUsagesResponse,
    ImpactDirection, ImpactResponse, LogResponse, MetaResponse, MetricsResponse, NodeId,
    ReadingOrderResponse, ReviewState, ReviewSummary, SearchResponse, SnapshotResponse,
};
use tauri::{AppHandle, Builder, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder};

type Shared<'a> = State<'a, Arc<Session>>;

/// Registers the session as state and the commands on a tauri builder.
pub fn register<R: Runtime>(builder: Builder<R>, session: Arc<Session>) -> Builder<R> {
    builder
        .manage(session)
        .invoke_handler(tauri::generate_handler![
            meta,
            snapshot,
            diff,
            search,
            review_summary,
            rules,
            impact,
            code,
            edge_usages,
            review_state,
            set_review_state,
            reading_order,
            commit_reading,
            log,
            metrics,
            co_change,
            open_docs
        ])
}

fn api_error(err: AppError) -> ApiError {
    ApiError {
        code: err.code().to_owned(),
        message: err.to_string(),
    }
}

fn parse_range(range: Option<String>) -> Result<Option<RangeSpec>, ApiError> {
    range
        .map(|text| RangeSpec::parse(&text))
        .transpose()
        .map_err(api_error)
}

fn parse_nodes(ids: Option<Vec<String>>) -> Result<Vec<NodeId>, ApiError> {
    ids.unwrap_or_default()
        .iter()
        .map(|id| {
            id.parse::<NodeId>().map_err(|_| ApiError {
                code: "unknown_node".to_owned(),
                message: format!("unknown node '{id}'"),
            })
        })
        .collect()
}

/// Runs a use case on a blocking thread: indexing can take a while.
async fn run<T, F>(session: Shared<'_>, work: F) -> Result<T, ApiError>
where
    T: Send + 'static,
    F: FnOnce(&Session) -> Result<T, ApiError> + Send + 'static,
{
    let session = Arc::clone(&session);
    tauri::async_runtime::spawn_blocking(move || work(&session))
        .await
        .map_err(|e| ApiError {
            code: "index".to_owned(),
            message: e.to_string(),
        })?
}

#[tauri::command]
async fn meta(session: Shared<'_>) -> Result<MetaResponse, ApiError> {
    run(session, |s| Ok(s.meta())).await
}

#[tauri::command]
async fn snapshot(
    session: Shared<'_>,
    rev: String,
    budget: Option<usize>,
    expand: Option<Vec<String>>,
) -> Result<SnapshotResponse, ApiError> {
    run(session, move |s| {
        let expand = parse_nodes(expand)?;
        s.snapshot(&SnapshotRequest {
            rev,
            budget,
            expand,
        })
        .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn diff(
    session: Shared<'_>,
    range: Option<String>,
    budget: Option<usize>,
    expand: Option<Vec<String>>,
) -> Result<DiffResponse, ApiError> {
    run(session, move |s| {
        let range = parse_range(range)?;
        let expand = parse_nodes(expand)?;
        s.diff(&DiffRequest {
            range,
            budget,
            expand,
        })
        .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn search(
    session: Shared<'_>,
    range: Option<String>,
    query: String,
    limit: usize,
) -> Result<SearchResponse, ApiError> {
    run(session, move |s| {
        let range = parse_range(range)?;
        s.search(&SearchRequest {
            range,
            query,
            limit,
        })
        .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn review_summary(
    session: Shared<'_>,
    range: Option<String>,
) -> Result<ReviewSummary, ApiError> {
    run(session, move |s| {
        let range = parse_range(range)?;
        s.review_summary(&ReviewSummaryRequest { range })
            .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn rules(session: Shared<'_>, range: String) -> Result<RulesResponse, ApiError> {
    run(session, move |s| {
        let range = RangeSpec::parse(&range).map_err(api_error)?;
        s.rules(&range).map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn impact(
    session: Shared<'_>,
    seeds: Vec<String>,
    direction: ImpactDirection,
    max_depth: usize,
    follow_http: bool,
    range: Option<String>,
) -> Result<ImpactResponse, ApiError> {
    run(session, move |s| {
        let seeds = seeds
            .iter()
            .map(|seed| {
                seed.parse::<NodeId>().map_err(|_| ApiError {
                    code: "unknown_node".to_owned(),
                    message: format!("unknown node '{seed}'"),
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let range = parse_range(range)?;
        s.impact(&ImpactRequest {
            range,
            seeds,
            direction,
            max_depth,
            follow_http,
        })
        .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn code(
    session: Shared<'_>,
    node: String,
    side: String,
    range: Option<String>,
) -> Result<String, ApiError> {
    run(session, move |s| {
        let side = match side.as_str() {
            "base" => Side::Base,
            "head" => Side::Head,
            other => {
                return Err(ApiError {
                    code: "bad_request".to_owned(),
                    message: format!("side must be 'base' or 'head', got '{other}'"),
                });
            }
        };
        let node: NodeId = node.parse().map_err(|_| ApiError {
            code: "unknown_node".to_owned(),
            message: format!("unknown node '{node}'"),
        })?;
        let range = parse_range(range)?;
        s.code(&CodeRequest { node, side, range })
            .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn edge_usages(
    session: Shared<'_>,
    from: String,
    to: String,
    side: String,
    range: Option<String>,
) -> Result<EdgeUsagesResponse, ApiError> {
    run(session, move |s| {
        let side = match side.as_str() {
            "base" => Side::Base,
            "head" => Side::Head,
            other => {
                return Err(ApiError {
                    code: "bad_request".to_owned(),
                    message: format!("side must be 'base' or 'head', got '{other}'"),
                });
            }
        };
        let node = |id: String| {
            id.parse::<NodeId>().map_err(|_| ApiError {
                code: "unknown_node".to_owned(),
                message: format!("unknown node '{id}'"),
            })
        };
        let (from, to) = (node(from)?, node(to)?);
        let range = parse_range(range)?;
        s.edge_usages(&EdgeUsagesRequest {
            range,
            side,
            from,
            to,
        })
        .map_err(api_error)
    })
    .await
}

fn required_range(range: String) -> Result<RangeSpec, ApiError> {
    RangeSpec::parse(&range).map_err(api_error)
}

#[tauri::command]
async fn review_state(session: Shared<'_>, range: String) -> Result<ReviewState, ApiError> {
    run(session, move |s| {
        s.review_state(&required_range(range)?).map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn set_review_state(
    session: Shared<'_>,
    range: String,
    state: ReviewState,
) -> Result<(), ApiError> {
    run(session, move |s| {
        s.set_review_state(&required_range(range)?, &state)
            .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn reading_order(
    session: Shared<'_>,
    granularity: String,
    range: Option<String>,
) -> Result<ReadingOrderResponse, ApiError> {
    run(session, move |s| {
        let granularity = match granularity.as_str() {
            "file" => relief_app::Granularity::File,
            "symbol" => relief_app::Granularity::Symbol,
            other => {
                return Err(ApiError {
                    code: "bad_request".to_owned(),
                    message: format!("granularity must be 'file' or 'symbol', got '{other}'"),
                });
            }
        };
        let range = parse_range(range)?;
        s.reading_order(&ReadingOrderRequest { range, granularity })
            .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn commit_reading(
    session: Shared<'_>,
    range: Option<String>,
) -> Result<CommitReadingResponse, ApiError> {
    run(session, move |s| {
        let range = parse_range(range)?;
        s.commit_reading(&CommitReadingRequest { range })
            .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn log(
    session: Shared<'_>,
    rev: String,
    limit: usize,
    query: Option<String>,
) -> Result<LogResponse, ApiError> {
    run(session, move |s| {
        s.log(&rev, limit, query.as_deref())
            .map(|entries| LogResponse { entries })
            .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn metrics(
    session: Shared<'_>,
    rev: String,
    since_days: Option<u32>,
) -> Result<MetricsResponse, ApiError> {
    run(session, move |s| {
        s.metrics(&MetricsRequest { rev, since_days })
            .map_err(api_error)
    })
    .await
}

#[tauri::command]
async fn co_change(
    session: Shared<'_>,
    rev: String,
    since_days: Option<u32>,
    min_commits: Option<u32>,
) -> Result<CoChangeResponse, ApiError> {
    run(session, move |s| {
        s.co_change(&CoChangeRequest {
            rev,
            since_days,
            min_commits,
        })
        .map_err(api_error)
    })
    .await
}

/// Opens the user docs (embedded under `docs/`) in the one window labelled
/// `docs`. If it already exists it is destroyed and created again on the right
/// page: that also covers a window whose page was closed behind Tauri's back.
#[tauri::command]
async fn open_docs<R: Runtime>(app: AppHandle<R>, lang: String) -> Result<(), ApiError> {
    let page = match lang.as_str() {
        "fr" => "docs/index.html",
        "en" => "docs/en/index.html",
        other => {
            return Err(ApiError {
                code: "bad_request".to_owned(),
                message: format!("unknown docs language: {other}"),
            });
        }
    };
    let failed = |e: tauri::Error| ApiError {
        code: "index".to_owned(),
        message: e.to_string(),
    };
    if let Some(window) = app.get_webview_window("docs") {
        window.destroy().map_err(failed)?;
        // Destruction is asynchronous: wait for the label to be free again.
        for _ in 0..50 {
            if app.get_webview_window("docs").is_none() {
                break;
            }
            pause().await;
        }
    }
    if let Some(window) = app.get_webview_window("docs") {
        // Still there (a runtime that keeps it): bring it back on the right page.
        let target = window.url().map_err(failed)?.join(&format!("/{page}"));
        if let Ok(target) = target {
            window.navigate(target).map_err(failed)?;
        }
        window.show().map_err(failed)?;
        window.set_focus().map_err(failed)?;
    } else {
        WebviewWindowBuilder::new(&app, "docs", WebviewUrl::App(page.into()))
            .title("relief docs")
            .inner_size(1100.0, 800.0)
            .build()
            .map_err(failed)?;
    }
    Ok(())
}

/// A short pause that does not block the async runtime.
async fn pause() {
    let _ = tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_millis(20));
    })
    .await;
}
