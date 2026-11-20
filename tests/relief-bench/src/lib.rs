//! Benchmark harness: times `relief-app` use cases on a repository.

use std::fs;
use std::path::Path;
use std::time::Instant;

use relief_app::{
    AppError, DataDirEnv, DiffRequest, RangeSpec, Session, SessionOptions, SnapshotRequest,
};
use relief_detect::default_detectors;
use relief_lang_python::PythonAdapter;
use relief_lang_ts::TsAdapter;
use relief_model::{GraphSnapshot, NodeKind};

/// What to measure: the range given to `analyse` (e.g. `main..feat/promo-codes`)
/// and the node budget given to the budgeted `snapshot`.
#[derive(Debug, Clone)]
pub struct BenchPlan {
    pub range: String,
    pub budget: usize,
}

/// One report line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Measure {
    pub name: String,
    pub millis: u128,
    pub nodes: usize,
    pub files: usize,
}

/// Why a bench run failed.
#[derive(Debug, thiserror::Error)]
pub enum BenchError {
    #[error(transparent)]
    App(#[from] AppError),
    #[error("cache folder: {0}")]
    Io(#[from] std::io::Error),
}

/// The session as the desktop app opens it: data folder in the repository, default detectors,
/// TypeScript and Python adapters.
fn open(repo: &Path) -> Result<Session, AppError> {
    let env = DataDirEnv {
        relief_cache_dir: None,
        ..DataDirEnv::from_process()
    };
    Session::open(
        repo,
        SessionOptions {
            data_dir: Some(env),
            range: None,
            detectors: default_detectors(),
            adapters: vec![Box::new(TsAdapter::new()), Box::new(PythonAdapter::new())],
        },
    )
}

fn snapshot_request(budget: Option<usize>) -> SnapshotRequest {
    SnapshotRequest {
        rev: "HEAD".to_owned(),
        budget,
        expand: Vec::new(),
    }
}

fn file_count(graph: &GraphSnapshot) -> usize {
    graph
        .nodes()
        .iter()
        .filter(|n| n.kind == NodeKind::File)
        .count()
}

fn timed<T>(f: impl FnOnce() -> Result<T, BenchError>) -> Result<(T, u128), BenchError> {
    let start = Instant::now();
    let value = f()?;
    Ok((value, start.elapsed().as_millis()))
}

fn measure(name: &str, millis: u128, nodes: usize, files: usize) -> Measure {
    Measure {
        name: name.to_owned(),
        millis,
        nodes,
        files,
    }
}

/// Runs the four measures on the repository at `repo`: open + snapshot of HEAD with the cache
/// folder deleted, the same warm, `analyse` of `plan.range`, and a snapshot capped at `plan.budget`.
/// The repository gets its own `.relief/` folder, created by the session.
pub fn run(repo: &Path, plan: &BenchPlan) -> Result<Vec<Measure>, BenchError> {
    let cache = repo.join(".relief").join("cache");
    if cache.exists() {
        fs::remove_dir_all(&cache)?;
    }
    let mut measures = Vec::new();

    let (graph, millis) = timed(|| {
        let session = open(repo)?;
        Ok(session.snapshot(&snapshot_request(None))?.graph)
    })?;
    measures.push(measure(
        "open_snapshot_cold",
        millis,
        graph.nodes().len(),
        file_count(&graph),
    ));

    let (session_graph, millis) = timed(|| {
        let session = open(repo)?;
        let graph = session.snapshot(&snapshot_request(None))?.graph;
        Ok((session, graph))
    })?;
    let (session, graph) = session_graph;
    measures.push(measure(
        "open_snapshot_warm",
        millis,
        graph.nodes().len(),
        file_count(&graph),
    ));

    let request = DiffRequest {
        range: Some(RangeSpec::parse(&plan.range)?),
        ..DiffRequest::default()
    };
    let (analysis, millis) = timed(|| Ok(session.analyse(&request)?))?;
    measures.push(measure(
        "analyse",
        millis,
        analysis.diff.nodes.len(),
        analysis.diff.files.len(),
    ));

    let (budgeted, millis) = timed(|| {
        Ok(session
            .snapshot(&snapshot_request(Some(plan.budget)))?
            .graph)
    })?;
    measures.push(measure(
        "snapshot_budget",
        millis,
        budgeted.nodes().len(),
        file_count(&budgeted),
    ));
    Ok(measures)
}
