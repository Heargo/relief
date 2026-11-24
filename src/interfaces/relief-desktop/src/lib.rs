//! relief desktop app: the Tauri commands over a [`Session`].
//!
//! [`register`] is generic over the runtime so the tests drive the same
//! commands with the mock runtime; `main` uses the real one.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use relief_app::{
    AppError, CoChangeRequest, CodeRequest, CommitReadingRequest, DiffRequest, EdgeUsagesRequest,
    ImpactRequest, MetricsRequest, RangeSpec, ReadingOrderRequest, ReviewSummaryRequest,
    RulesResponse, SearchRequest, Session, Side, SnapshotRequest, Workspace,
};
use relief_model::{
    ApiError, CoChangeResponse, CommitReadingResponse, DiffResponse, EdgeUsagesResponse,
    ImpactDirection, ImpactResponse, LogResponse, MetaResponse, MetricsResponse, NodeId,
    ReadingOrderResponse, ReviewState, ReviewSummary, SearchResponse, Settings, SnapshotResponse,
};
use tauri::{AppHandle, Builder, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder};

mod recents;

/// The session of the window: absent until a repository is opened (welcome screen).
struct Slot(RwLock<Option<Arc<Session>>>);

type Shared<'a> = State<'a, Slot>;

/// Builds the session of a repository path (the composition root provides the extractors).
pub type SessionOpener = Arc<dyn Fn(&Path) -> Result<Session, AppError> + Send + Sync>;

/// What `open_repo` and `recents` need: the user's configuration folder and the opener.
struct Welcome {
    config_dir: PathBuf,
    opener: SessionOpener,
}

/// The user's configuration folder: `RELIEF_CONFIG_DIR`, else `$XDG_CONFIG_HOME/relief`, else
/// `~/.config/relief`.
pub fn config_dir(
    relief_config_dir: Option<OsString>,
    xdg_config_home: Option<OsString>,
    home: Option<OsString>,
) -> PathBuf {
    let set = |v: Option<OsString>| v.filter(|v| !v.is_empty());
    if let Some(dir) = set(relief_config_dir) {
        return PathBuf::from(dir);
    }
    if let Some(dir) = set(xdg_config_home) {
        return PathBuf::from(dir).join("relief");
    }
    PathBuf::from(set(home).unwrap_or_default())
        .join(".config")
        .join("relief")
}

/// The repository path given on the command line, read from the folder the user started from.
/// Under an AppImage, `AppRun` moves to `$APPDIR/usr` (the bundled webkit finds its helper
/// processes from there, so relief stays) and that folder is in `OWD` (`main` passes
/// `std::env::var_os("OWD")`). An absolute path, or no `OWD`, is kept as is.
pub fn repo_path(path: &std::path::Path, owd: Option<std::ffi::OsString>) -> std::path::PathBuf {
    match owd.filter(|dir| !dir.is_empty()) {
        Some(dir) if path.is_relative() => std::path::PathBuf::from(dir).join(path),
        _ => path.to_path_buf(),
    }
}

/// Registers the session as state and the commands on a tauri builder.
pub fn register<R: Runtime>(builder: Builder<R>, session: Arc<Session>) -> Builder<R> {
    handlers(builder.manage(Slot(RwLock::new(Some(session)))))
}

/// Like [`register`], and `open_repo` / `recents` work too: the menu can open another repository
/// on a map already open. The recents live in `config_dir`.
pub fn register_session<R: Runtime>(
    builder: Builder<R>,
    session: Arc<Session>,
    config_dir: PathBuf,
    opener: SessionOpener,
) -> Builder<R> {
    handlers(
        builder
            .manage(Slot(RwLock::new(Some(session))))
            .manage(Welcome { config_dir, opener }),
    )
}

/// Registers the commands with no session: the window shows the welcome screen, and `open_repo`
/// creates the session with `opener`. The recents live in `config_dir`.
pub fn register_welcome<R: Runtime>(
    builder: Builder<R>,
    config_dir: PathBuf,
    opener: SessionOpener,
) -> Builder<R> {
    handlers(
        builder
            .manage(Slot(RwLock::new(None)))
            .manage(Welcome { config_dir, opener }),
    )
}

fn handlers<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
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
        settings,
        set_settings,
        reading_order,
        commit_reading,
        log,
        metrics,
        co_change,
        open_docs,
        open_repo,
        create_workspace,
        open_workspace,
        open_repo_as_workspace,
        add_workspace_repo,
        remove_workspace_repo,
        workspace_labels,
        set_workspace_repo_labels,
        recents
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
    let session = session
        .0
        .read()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| ApiError {
            code: "no_session".to_owned(),
            message: "no session".to_owned(),
        })?;
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
async fn settings(session: Shared<'_>) -> Result<Settings, ApiError> {
    run(session, |s| s.settings().map_err(api_error)).await
}

#[tauri::command]
async fn set_settings(session: Shared<'_>, settings: Settings) -> Result<(), ApiError> {
    run(session, move |s| {
        s.set_settings(&settings).map_err(api_error)
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

fn welcome<R: Runtime>(app: &AppHandle<R>) -> Result<State<'_, Welcome>, ApiError> {
    app.try_state::<Welcome>().ok_or_else(|| ApiError {
        code: "bad_request".to_owned(),
        message: "this window opens a repository from the command line".to_owned(),
    })
}

/// Starts the session on a repository (welcome screen), remembers it in the recents, and answers
/// the `meta` of the new session.
#[tauri::command]
async fn open_repo<R: Runtime>(app: AppHandle<R>, path: String) -> Result<MetaResponse, ApiError> {
    let (config_dir, opener) = {
        let welcome = welcome(&app)?;
        (welcome.config_dir.clone(), Arc::clone(&welcome.opener))
    };
    // One entry per repository in the recents, whatever the way the path was written.
    let path = std::fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(path));
    let opened = path.clone();
    let session = tauri::async_runtime::spawn_blocking(move || opener(&opened))
        .await
        .map_err(|e| ApiError {
            code: "index".to_owned(),
            message: e.to_string(),
        })?
        .map_err(api_error)?;
    let meta = session.meta();
    if let Ok(mut slot) = app.state::<Slot>().0.write() {
        *slot = Some(Arc::new(session));
    }
    recents::remember(&config_dir, "repo", &path);
    Ok(meta)
}

/// Starts the session of the workspace `file` in the window, and answers its `meta`.
async fn start_workspace<R: Runtime>(
    app: &AppHandle<R>,
    file: PathBuf,
    remember: bool,
) -> Result<MetaResponse, ApiError> {
    let (config_dir, opener) = {
        let welcome = welcome(app)?;
        (welcome.config_dir.clone(), Arc::clone(&welcome.opener))
    };
    let opened = file.clone();
    let session = tauri::async_runtime::spawn_blocking(move || opener(&opened))
        .await
        .map_err(|e| ApiError {
            code: "index".to_owned(),
            message: e.to_string(),
        })?
        .map_err(api_error)?;
    let meta = session.meta();
    if let Ok(mut slot) = app.state::<Slot>().0.write() {
        *slot = Some(Arc::new(session));
    }
    if remember {
        recents::remember(&config_dir, "workspace", &file);
    }
    Ok(meta)
}

/// Creates `<dir>/<name>.relief.json`, empty, and opens it in the window.
#[tauri::command]
async fn create_workspace<R: Runtime>(
    app: AppHandle<R>,
    dir: String,
    name: String,
) -> Result<MetaResponse, ApiError> {
    welcome(&app)?;
    let workspace = Workspace::create(Path::new(&dir), &name).map_err(api_error)?;
    let file = std::fs::canonicalize(workspace.file()).unwrap_or_else(|_| workspace.file().into());
    start_workspace(&app, file, true).await
}

/// Opens the workspace of a `.relief.json` file or of the folder that contains it.
#[tauri::command]
async fn open_workspace<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<MetaResponse, ApiError> {
    welcome(&app)?;
    let path = std::fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(path));
    let workspace = Workspace::open(&path).map_err(api_error)?;
    start_workspace(&app, workspace.file().to_path_buf(), true).await
}

/// Makes a workspace named after the repository in `dir`, and opens it.
#[tauri::command]
async fn open_repo_as_workspace<R: Runtime>(
    app: AppHandle<R>,
    repo: String,
    dir: String,
) -> Result<MetaResponse, ApiError> {
    welcome(&app)?;
    let workspace = Workspace::from_repo(Path::new(&repo), Path::new(&dir)).map_err(api_error)?;
    let file = std::fs::canonicalize(workspace.file()).unwrap_or_else(|_| workspace.file().into());
    start_workspace(&app, file, true).await
}

/// The workspace file of the session of the window, when it shows a workspace.
fn open_workspace_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, ApiError> {
    app.state::<Slot>()
        .0
        .read()
        .ok()
        .and_then(|slot| {
            slot.as_ref()
                .and_then(|s| s.workspace_file().map(Path::to_path_buf))
        })
        .ok_or_else(|| ApiError {
            code: "bad_request".to_owned(),
            message: "no workspace is open in this window".to_owned(),
        })
}

/// Adds a repository to the open workspace and reopens it.
#[tauri::command]
async fn add_workspace_repo<R: Runtime>(
    app: AppHandle<R>,
    repo: String,
    labels: Vec<String>,
) -> Result<MetaResponse, ApiError> {
    welcome(&app)?;
    let file = open_workspace_file(&app)?;
    let mut workspace = Workspace::open(&file).map_err(api_error)?;
    let labels: Vec<&str> = labels.iter().map(String::as_str).collect();
    workspace
        .add_repo(Path::new(&repo), &labels)
        .map_err(api_error)?;
    start_workspace(&app, file, false).await
}

/// Removes a repository from the open workspace and reopens it.
#[tauri::command]
async fn remove_workspace_repo<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<MetaResponse, ApiError> {
    welcome(&app)?;
    let file = open_workspace_file(&app)?;
    let mut workspace = Workspace::open(&file).map_err(api_error)?;
    workspace.remove_repo(&name).map_err(api_error)?;
    start_workspace(&app, file, false).await
}

/// The labels a repository of the open workspace can carry.
#[tauri::command]
fn workspace_labels<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, ApiError> {
    welcome(&app)?;
    let file = open_workspace_file(&app)?;
    Ok(Workspace::open(&file)
        .map_err(api_error)?
        .available_labels())
}

/// Replaces the labels of a repository of the open workspace and reopens it.
#[tauri::command]
async fn set_workspace_repo_labels<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    labels: Vec<String>,
) -> Result<MetaResponse, ApiError> {
    welcome(&app)?;
    let file = open_workspace_file(&app)?;
    let mut workspace = Workspace::open(&file).map_err(api_error)?;
    let labels: Vec<&str> = labels.iter().map(String::as_str).collect();
    workspace.set_labels(&name, &labels).map_err(api_error)?;
    start_workspace(&app, file, false).await
}

/// The repositories and workspaces opened before, most recent first.
#[tauri::command]
fn recents<R: Runtime>(app: AppHandle<R>) -> Result<Vec<recents::Recent>, ApiError> {
    Ok(recents::list(&welcome(&app)?.config_dir))
}
