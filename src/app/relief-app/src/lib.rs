//! Application layer: the use cases of relief over one opened repository.
//!
//! It sits above git, index, diff and adapters, which cannot call each other
//! (`relief-index` does not depend on `relief-diff`, query crates know no git),
//! and only calls those lower layers: it holds no diff rule of its own. The
//! caller (composition root) provides the detectors and adapters.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use relief_adapter_api::{Detector, LanguageAdapter};
use relief_diff::{
    DiffOptions, SignatureTexts, attribute_edge_commits, diff_graphs_with_options,
    format_only_summary,
};
use relief_git::{CommitId, FileStatus, GitError, GitSource, ResolvedRange, RevSpec};
use relief_index::{IndexedSnapshot, Indexer};
use relief_model::{
    CoChangePair, CoChangeResponse, CommitReadingEntry, CommitReadingResponse, DiffResponse,
    EdgeKind, FileChange, FileRename, GraphDiff, GraphSnapshot, ImpactDirection, ImpactResponse,
    ImpactedNode, MetaResponse, Metrics, MetricsResponse, NodeId, NodeKind, NodeStatus,
    ReadingItem, ReadingOrderResponse, ReadingReason, ReviewState, ReviewSummary, SearchHit,
    SearchResponse, SnapshotResponse, WorkspaceMeta, WorkspaceRepoMeta,
};
use relief_rules::{Config, ConfigError, Rule, parse_config};

mod data_dir;
mod error;
mod range;
mod union;
mod workspace;

pub use data_dir::{DataDir, DataDirEnv};
pub use error::AppError;
pub use range::{
    CoChangeRequest, CodeRequest, CommitReadingRequest, DiffRequest, EdgeUsagesRequest,
    ImpactRequest, MetricsRequest, RangeSpec, ReadingOrderRequest, ReviewSummaryRequest,
    SearchRequest, Side, SnapshotRequest,
};
pub use relief_diff::Granularity;
pub use relief_model::{EdgeUsagesResponse, FileUsages, LogEntry, LogResponse, Settings};
pub use workspace::{Workspace, WorkspaceRepo};

/// What the import edges of one source file ask `edge_usages` to look for.
struct Wanted {
    file: NodeId,
    /// Names imported from the target, by name.
    bindings: Vec<String>,
    /// Files imported by default or as a namespace, by repository path.
    targets: Vec<String>,
}

impl Wanted {
    fn new(file: NodeId) -> Self {
        Self {
            file,
            bindings: Vec::new(),
            targets: Vec::new(),
        }
    }
}

/// Most usages an `edge_usages` answer lists, all files together.
pub const EDGE_USAGES_CAP: usize = 200;

const CONFIG_FILE: &str = "relief.config.yaml";
const DEFAULT_CHURN_DAYS: u32 = 90;
const DAY_SECONDS: i64 = 86_400;
const DEFAULT_CO_CHANGE_MIN_COMMITS: u32 = 2;
/// A commit touching more files than this (a mass refactor) says nothing about coupling.
const CO_CHANGE_MAX_FILES: usize = 30;

/// The rules of a repository and the text they come from.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
pub struct RulesResponse {
    pub rules: Vec<Rule>,
    /// Text of `relief.config.yaml`; absent when the repository has none.
    pub source: Option<String>,
}

/// JSON Schema of [`RulesResponse`] (the `rules` command), pretty-printed, ending with a newline.
pub fn rules_response_schema() -> String {
    let mut json =
        serde_json::to_string_pretty(&schemars::schema_for!(RulesResponse)).unwrap_or_default();
    json.push('\n');
    json
}

/// How a session is opened.
pub struct SessionOptions {
    /// Where the data folder is resolved from; nothing is written when absent.
    pub data_dir: Option<DataDirEnv>,
    /// Range shown by default; HEAD against the working tree when absent.
    pub range: Option<RangeSpec>,
    pub detectors: Vec<Box<dyn Detector>>,
    pub adapters: Vec<Box<dyn LanguageAdapter>>,
}

/// A diff with the snapshots it compares.
pub struct DiffAnalysis {
    pub base: GraphSnapshot,
    pub head: GraphSnapshot,
    pub diff: GraphDiff,
    pub renames: Vec<FileRename>,
    /// Short SHA of the base really compared.
    pub base_resolved: String,
    /// Cache warnings raised while indexing.
    pub warnings: Vec<String>,
}

impl DiffAnalysis {
    /// The API form of the diff.
    pub fn into_response(self) -> DiffResponse {
        DiffResponse {
            format_only: format_only_summary(&self.diff),
            renames: self.renames,
            diff: self.diff,
            base_resolved: self.base_resolved,
            graph: None,
        }
    }
}

/// The review state file: the range in clear next to its state.
#[derive(serde::Serialize, serde::Deserialize)]
struct StoredReviewState {
    range: String,
    #[serde(flatten)]
    state: ReviewState,
}

/// The sides of a range typed as `A...B`, `A..B` or `REV`.
fn settings_of_range(text: &str) -> Option<Settings> {
    let (destination, source) = if let Some((a, b)) = text.split_once("...") {
        (a, b)
    } else if let Some((a, b)) = text.split_once("..") {
        (a, b)
    } else if matches!(text, "WORKTREE" | "INDEX") {
        return None;
    } else {
        (text, "WORKTREE")
    };
    Some(Settings {
        source: source.to_owned(),
        destination: destination.to_owned(),
    })
}

fn reading_reason(reason: relief_diff::ReadingReason) -> ReadingReason {
    use relief_diff::ReadingReason as R;
    match reason {
        R::BreakingSignature => ReadingReason::BreakingSignature,
        R::ModifiedSignature => ReadingReason::ModifiedSignature,
        R::Violation => ReadingReason::Violation,
        R::New => ReadingReason::New,
        R::Removed => ReadingReason::Removed,
        R::MovedIdentical => ReadingReason::MovedIdentical,
        R::Lines { added, removed } => ReadingReason::Lines { added, removed },
    }
}

/// A repository opened for analysis. It remembers the snapshots of real
/// commits; the working tree and the index are recomputed on each call.
pub struct Session {
    path: PathBuf,
    name: String,
    range: Option<RangeSpec>,
    indexer: Indexer,
    data_dir: Option<DataDir>,
    workspace: Option<Workspace>,
    /// The comparisons changed in session, by repository: (source, destination).
    comparisons: Mutex<HashMap<String, (String, String)>>,
    memory: Mutex<HashMap<String, IndexedSnapshot>>,
    indexed: AtomicUsize,
}

impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session")
            .field("path", &self.path)
            .field("range", &self.range)
            .finish_non_exhaustive()
    }
}

/// Name of the repository directory at `path`.
fn repo_name(path: &Path) -> String {
    path.canonicalize()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "repo".to_owned())
}

/// The most frequent author; the first in alphabetical order on a tie.
fn majority(authors: &[&str]) -> Option<String> {
    let mut counts: std::collections::BTreeMap<&str, usize> = std::collections::BTreeMap::new();
    for author in authors {
        *counts.entry(author).or_default() += 1;
    }
    let best = counts.values().copied().max()?;
    counts
        .into_iter()
        .find(|(_, n)| *n == best)
        .map(|(a, _)| a.to_owned())
}

fn is_virtual(commit: &CommitId) -> bool {
    matches!(commit.to_string().as_str(), "WORKTREE" | "INDEX")
}

fn cache_warnings(snapshot: &IndexedSnapshot) -> impl Iterator<Item = String> + '_ {
    snapshot
        .meta
        .warnings
        .iter()
        .filter(|w| w.starts_with("cache "))
        .cloned()
}

impl Session {
    /// Opens the repository at `path` and checks the opening range.
    pub fn open(path: &Path, options: SessionOptions) -> Result<Self, AppError> {
        let source = GitSource::open(path)?;
        let name = repo_name(path);
        let mut indexer = Indexer::new(&name).with_detectors(options.detectors);
        for adapter in options.adapters {
            indexer = indexer.with_adapter(adapter);
        }
        let data_dir = match &options.data_dir {
            Some(env) => Some(DataDir::open(path, env)?),
            None => None,
        };
        if let Some(data) = &data_dir {
            indexer = indexer.with_cache(data.cache_dir());
        }
        let session = Self {
            path: path.to_path_buf(),
            name,
            range: options.range,
            indexer,
            data_dir,
            workspace: None,
            comparisons: Mutex::new(HashMap::new()),
            memory: Mutex::new(HashMap::new()),
            indexed: AtomicUsize::new(0),
        };
        session.sides(&source, None)?;
        Ok(session)
    }

    /// Opens the workspace at `path` (its `.relief.json` file or its folder). The data folder is
    /// the `.relief/` next to the file; the repositories are checked but never written.
    pub fn open_workspace(path: &Path, options: SessionOptions) -> Result<Self, AppError> {
        let workspace = Workspace::open(path)?;
        for repo in &workspace.repos {
            let path = workspace.path_of(repo);
            GitSource::open(&path)?;
            Workspace::check_outside(workspace.dir(), &path)?;
        }
        let mut indexer = Indexer::new(&workspace.name).with_detectors(options.detectors);
        for adapter in options.adapters {
            indexer = indexer.with_adapter(adapter);
        }
        let data_dir = match &options.data_dir {
            Some(env) => Some(DataDir::open_workspace(
                workspace.dir(),
                &workspace.name,
                env,
            )?),
            None => None,
        };
        if let Some(data) = &data_dir {
            indexer = indexer.with_cache(data.cache_dir());
        }
        Ok(Self {
            path: workspace.dir().to_path_buf(),
            name: workspace.name.clone(),
            range: options.range,
            indexer,
            data_dir,
            workspace: Some(workspace),
            comparisons: Mutex::new(HashMap::new()),
            memory: Mutex::new(HashMap::new()),
            indexed: AtomicUsize::new(0),
        })
    }

    /// The workspace file, when the session is a workspace.
    pub fn workspace_file(&self) -> Option<&Path> {
        self.workspace.as_ref().map(Workspace::file)
    }

    /// The git source of the repository; a workspace has none until the multi-repository
    /// snapshot exists.
    fn git(&self) -> Result<GitSource, AppError> {
        if self.workspace.is_some() {
            return Err(AppError::Workspace(
                "this operation is not available on a workspace yet".to_owned(),
            ));
        }
        Ok(GitSource::open(&self.path)?)
    }

    /// The data folder, when the session writes one.
    pub fn data_dir(&self) -> Option<&DataDir> {
        self.data_dir.as_ref()
    }

    /// Number of indexings really done (memory hits excluded).
    pub fn indexed_count(&self) -> usize {
        self.indexed.load(Ordering::SeqCst)
    }

    /// Repository name, opening range, branches and tags.
    pub fn meta(&self) -> MetaResponse {
        let source = if self.workspace.is_some() {
            None
        } else {
            GitSource::open(&self.path).ok()
        };
        MetaResponse {
            repo: self.name.clone(),
            range: self.range.as_ref().map(|r| r.text().to_owned()),
            branches: source
                .as_ref()
                .and_then(|s| s.branches().ok())
                .unwrap_or_default(),
            tags: source
                .as_ref()
                .and_then(|s| s.tags().ok())
                .unwrap_or_default(),
            workspace: self.workspace.as_ref().map(|w| WorkspaceMeta {
                repos: w
                    .repos
                    .iter()
                    .map(|r| WorkspaceRepoMeta {
                        name: r.name.clone(),
                        labels: r.labels.clone(),
                    })
                    .collect(),
            }),
        }
    }

    /// The architecture rules of the head side of `range`, with the source text of the file.
    pub fn rules(&self, range: &RangeSpec) -> Result<RulesResponse, AppError> {
        let source = self.git()?;
        let head = self.sides(&source, Some(range))?.new;
        match self.read_config(&source, &head)? {
            None => Ok(RulesResponse {
                rules: Vec::new(),
                source: None,
            }),
            Some((text, config)) => Ok(RulesResponse {
                rules: config.map_err(|e| AppError::Config(e.to_string()))?.rules,
                source: Some(text),
            }),
        }
    }

    /// The text of `relief.config.yaml` at `commit` and its analysis, when the file exists.
    #[allow(clippy::type_complexity)]
    fn read_config(
        &self,
        source: &GitSource,
        commit: &CommitId,
    ) -> Result<Option<(String, Result<Config, ConfigError>)>, AppError> {
        let entries = source.list_tree(commit)?;
        let Some(entry) = entries.iter().find(|e| e.path == CONFIG_FILE) else {
            return Ok(None);
        };
        let bytes = source.read_blob(&entry.blob)?;
        let config = parse_config(&bytes);
        Ok(Some((String::from_utf8_lossy(&bytes).into_owned(), config)))
    }

    /// The graph of a ref (or `WORKTREE` / `INDEX`).
    pub fn snapshot(&self, request: &SnapshotRequest) -> Result<SnapshotResponse, AppError> {
        let indexed = if self.workspace.is_some() {
            // A workspace reads each repository at its own source: `rev` is ignored.
            self.workspace_snapshot()?
        } else {
            let source = self.git()?;
            let commit = self.resolve(&source, &request.rev)?;
            let indexed = self.indexed_snapshot(&source, &commit)?;
            SnapshotResponse {
                graph: indexed.graph,
                meta: indexed.meta,
            }
        };
        let graph = match request.budget {
            Some(budget) => relief_diff::budgeted(&indexed.graph, budget, &request.expand),
            None => indexed.graph,
        };
        Ok(SnapshotResponse {
            graph,
            meta: indexed.meta,
        })
    }

    /// The diff of a range; with a budget, also the head subgraph of the review.
    pub fn diff(&self, request: &DiffRequest) -> Result<DiffResponse, AppError> {
        let analysed = self.analyse(request)?;
        let graph = request.budget.map(|budget| {
            let changed: Vec<NodeId> = analysed
                .diff
                .nodes
                .iter()
                .filter(|c| !matches!(c.status, NodeStatus::Removed))
                .map(|c| c.id.clone())
                .collect();
            relief_diff::review_subgraph(&analysed.head, budget, &changed, &request.expand)
        });
        let mut response = analysed.into_response();
        response.graph = graph;
        Ok(response)
    }

    /// The nodes of the head snapshot of a range whose name matches `query`, best match first.
    pub fn search(&self, request: &SearchRequest) -> Result<SearchResponse, AppError> {
        let source = self.git()?;
        let head = self.sides(&source, request.range.as_ref())?.new;
        let graph = self.indexed_snapshot(&source, &head)?.graph;
        let hits = relief_diff::rank_search(&graph, &request.query, request.limit)
            .into_iter()
            .filter_map(|id| {
                let kind = graph.nodes().iter().find(|n| n.id == id)?.kind;
                Some(SearchHit { id, kind })
            })
            .collect();
        Ok(SearchResponse { hits })
    }

    /// The diff of a range with the snapshots it compares and the cache warnings.
    pub fn analyse(&self, request: &DiffRequest) -> Result<DiffAnalysis, AppError> {
        if self.workspace.is_some() {
            return self.workspace_analysis();
        }
        let source = self.git()?;
        let sides = self.sides(&source, request.range.as_ref())?;
        self.analyse_sides(&source, &sides)
    }

    /// Reading aids of a range: signature verdicts with callers, couplings, violations.
    pub fn review_summary(
        &self,
        request: &ReviewSummaryRequest,
    ) -> Result<ReviewSummary, AppError> {
        if self.workspace.is_some() {
            let analysed = self.workspace_analysis()?;
            return Ok(relief_diff::review_summary(
                &analysed.base,
                &analysed.head,
                &analysed.diff,
                &analysed.renames,
            ));
        }
        let source = self.git()?;
        let sides = self.sides(&source, request.range.as_ref())?;
        let analysed = self.analyse_sides(&source, &sides)?;
        let mut summary = relief_diff::review_summary(
            &analysed.base,
            &analysed.head,
            &analysed.diff,
            &analysed.renames,
        );
        if let Some(config) = self
            .read_config(&source, &sides.new)?
            .and_then(|(_, c)| c.ok())
        {
            summary.violations = relief_rules::violations(&config, &analysed.head, &analysed.diff);
        }
        Ok(summary)
    }

    /// The changed files or symbols of a range, dependencies first.
    pub fn reading_order(
        &self,
        request: &ReadingOrderRequest,
    ) -> Result<ReadingOrderResponse, AppError> {
        let analysed = self.analyse_range(request.range.as_ref())?;
        let items = relief_diff::reading_order(&analysed.diff, &analysed.head, request.granularity)
            .into_iter()
            .map(|item| ReadingItem {
                id: item.id,
                reasons: item.reasons.into_iter().map(reading_reason).collect(),
            })
            .collect();
        Ok(ReadingOrderResponse { items })
    }

    /// The first-parent history of `rev`, newest first, keeping the commits whose SHA starts with
    /// `query` or whose subject contains it (case-insensitive), at most `limit`.
    pub fn log(
        &self,
        rev: &str,
        limit: usize,
        query: Option<&str>,
    ) -> Result<Vec<LogEntry>, AppError> {
        let source = self.git()?;
        let head = source.resolve(rev)?;
        let query = query.map(str::trim).filter(|q| !q.is_empty());
        let needle = query.map(str::to_lowercase);
        let items = source.first_parent_log(&head, limit, |item| match &needle {
            None => true,
            Some(q) => {
                item.id.to_string().starts_with(q) || item.subject.to_lowercase().contains(q)
            }
        })?;
        Ok(items
            .into_iter()
            .map(|item| LogEntry {
                sha: item.id.to_string(),
                short: item.short,
                subject: item.subject,
                author: item.author,
                time: item.date,
            })
            .collect())
    }

    /// The reading list of each commit of a range, oldest first: the diff of a
    /// commit is taken against the previous commit (the base for the first).
    pub fn commit_reading(
        &self,
        request: &CommitReadingRequest,
    ) -> Result<CommitReadingResponse, AppError> {
        let source = self.git()?;
        let sides = self.sides(&source, request.range.as_ref())?;
        let log = source.log(&sides)?;
        let mut steps = Vec::new();
        let mut parent = sides.old.clone();
        for info in &log {
            let step = ResolvedRange {
                old: parent,
                new: info.id.clone(),
            };
            let analysed = self.analyse_sides(&source, &step)?;
            steps.push((analysed.diff, analysed.head));
            parent = info.id.clone();
        }
        let commits = log
            .iter()
            .zip(relief_diff::reading_by_commit(&steps))
            .map(|(info, reading)| CommitReadingEntry {
                commit: info.id.to_string(),
                short: info.short.clone(),
                message: info.message.lines().next().unwrap_or_default().to_owned(),
                files: reading
                    .files
                    .into_iter()
                    .map(|item| ReadingItem {
                        id: item.id,
                        reasons: item.reasons.into_iter().map(reading_reason).collect(),
                    })
                    .collect(),
                other_files: reading.other_files,
            })
            .collect();
        Ok(CommitReadingResponse { commits })
    }

    /// What the reviewer marked as seen in a range; empty when never saved.
    pub fn review_state(&self, range: &RangeSpec) -> Result<ReviewState, AppError> {
        let file = self.review_state_file(range)?;
        match fs::read_to_string(&file) {
            Ok(text) => {
                let stored: StoredReviewState = serde_json::from_str(&text).map_err(|e| {
                    AppError::DataDir(format!("cannot read {}: {e}", file.display()))
                })?;
                Ok(stored.state)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ReviewState::default()),
            Err(e) => Err(AppError::DataDir(format!(
                "cannot read {}: {e}",
                file.display()
            ))),
        }
    }

    /// Saves the review state of a range (temporary file, then `rename`).
    pub fn set_review_state(&self, range: &RangeSpec, state: &ReviewState) -> Result<(), AppError> {
        let file = self.review_state_file(range)?;
        let io =
            |e: std::io::Error| AppError::DataDir(format!("cannot write {}: {e}", file.display()));
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir).map_err(io)?;
        }
        let stored = StoredReviewState {
            range: range.text().to_owned(),
            state: state.clone(),
        };
        let text = serde_json::to_string_pretty(&stored)
            .map_err(|e| AppError::DataDir(format!("cannot write {}: {e}", file.display())))?;
        let tmp = file.with_extension(format!("json.{}.tmp", std::process::id()));
        fs::write(&tmp, text).map_err(io)?;
        fs::rename(&tmp, &file).map_err(io)
    }

    /// The comparison to start from: the opening range, else the saved defaults, else the
    /// working tree against `main` (or the default branch of the repository).
    pub fn settings(&self) -> Result<Settings, AppError> {
        if let Some(range) = &self.range
            && let Some(settings) = settings_of_range(range.text())
        {
            return Ok(settings);
        }
        if let Some(data) = &self.data_dir {
            let file = data.root().join("settings.json");
            // A missing, unreadable or corrupt file gives the computed defaults.
            if let Some(saved) = fs::read_to_string(&file)
                .ok()
                .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
            {
                return Ok(saved);
            }
        }
        let source = self.git()?;
        let branches = source.branches()?;
        let destination = if branches.iter().any(|b| b == "main") {
            "main".to_owned()
        } else {
            // A detached HEAD has no branch name: HEAD always exists.
            source.current_branch().unwrap_or_else(|| "HEAD".to_owned())
        };
        Ok(Settings {
            source: "WORKTREE".to_owned(),
            destination,
        })
    }

    /// Saves the default comparison in `settings.json` (temporary file, then `rename`).
    pub fn set_settings(&self, settings: &Settings) -> Result<(), AppError> {
        let data = self.data_dir.as_ref().ok_or(AppError::NoDataDir)?;
        let file = data.root().join("settings.json");
        let io =
            |e: std::io::Error| AppError::DataDir(format!("cannot write {}: {e}", file.display()));
        let text = serde_json::to_string_pretty(settings)
            .map_err(|e| AppError::DataDir(format!("cannot write {}: {e}", file.display())))?;
        let tmp = file.with_extension(format!("json.{}.tmp", std::process::id()));
        fs::write(&tmp, text).map_err(io)?;
        fs::rename(&tmp, &file).map_err(io)
    }

    fn review_state_file(&self, range: &RangeSpec) -> Result<PathBuf, AppError> {
        let data = self.data_dir.as_ref().ok_or(AppError::NoDataDir)?;
        // FNV-1a: stable across runs and platforms.
        let hash = range.text().bytes().fold(0xcbf29ce484222325_u64, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x100000001b3)
        });
        Ok(data
            .state_dir()
            .join("review")
            .join(format!("{hash:016x}.json")))
    }

    /// The symbols reached from the seeds in the head of a range, with their
    /// path, whether a test reaches them and whether the range left them untouched.
    pub fn impact(&self, request: &ImpactRequest) -> Result<ImpactResponse, AppError> {
        let analysed = self.analyse_range(request.range.as_ref())?;
        let direction = match request.direction {
            ImpactDirection::Callers => relief_diff::Direction::Callers,
            ImpactDirection::Dependencies => relief_diff::Direction::Dependencies,
        };
        let options = relief_diff::ImpactOptions {
            max_depth: request.max_depth,
            follow_http: request.follow_http,
        };
        let reached = relief_diff::impact(&analysed.head, &request.seeds, direction, &options);
        let untouched: HashSet<NodeId> = relief_diff::out_of_diff(&analysed.diff, &reached)
            .into_iter()
            .map(|r| r.node)
            .collect();
        Ok(ImpactResponse {
            reached: reached
                .into_iter()
                .map(|r| ImpactedNode {
                    out_of_diff: untouched.contains(&r.node),
                    node: r.node,
                    depth: r.depth,
                    via: r.via,
                    kind: r.kind,
                    tested: r.tested,
                })
                .collect(),
        })
    }

    /// Churn, owner, complexity and tests of the files and symbols of a ref. Kept apart from the
    /// snapshot: the churn depends on the window, counted back from the date of the commit.
    /// The answer is kept in the cache folder, keyed by commit and window.
    pub fn metrics(&self, request: &MetricsRequest) -> Result<MetricsResponse, AppError> {
        let source = self.git()?;
        let commit = self.resolve(&source, &request.rev)?;
        let since_days = request.since_days.unwrap_or(DEFAULT_CHURN_DAYS);
        let cache = self.metrics_cache_file(&commit, since_days);
        if let Some(file) = &cache
            && let Some(hit) = fs::read_to_string(file)
                .ok()
                .and_then(|text| serde_json::from_str::<MetricsResponse>(&text).ok())
        {
            return Ok(hit);
        }
        let response = self.compute_metrics(&source, &commit, since_days)?;
        if let Some(file) = &cache
            && let Ok(text) = serde_json::to_string(&response)
        {
            // Best effort: a cache that cannot be written is only slower.
            if let Some(dir) = file.parent() {
                let _ = fs::create_dir_all(dir);
            }
            let tmp = file.with_extension(format!("json.{}.tmp", std::process::id()));
            if fs::write(&tmp, text).is_ok() {
                let _ = fs::rename(&tmp, file);
            }
        }
        Ok(response)
    }

    /// The cache file of a real commit; none for a virtual commit or without a data folder.
    fn metrics_cache_file(&self, commit: &CommitId, since_days: u32) -> Option<PathBuf> {
        if is_virtual(commit) {
            return None;
        }
        let versions: Vec<String> = self
            .indexer
            .adapters()
            .iter()
            .map(|a| format!("{}{}", a.name(), a.version()))
            .collect();
        let data = self.data_dir.as_ref()?;
        Some(data.cache_dir().join(format!(
            "metrics-{commit}-{since_days}d-{}.json",
            versions.join("-")
        )))
    }

    fn compute_metrics(
        &self,
        source: &GitSource,
        commit: &CommitId,
        since_days: u32,
    ) -> Result<MetricsResponse, AppError> {
        let graph = self.indexed_snapshot(source, commit)?.graph;
        let log_head = if is_virtual(commit) {
            source.resolve("HEAD")?
        } else {
            commit.clone()
        };
        let since = source.commit_time(&log_head)? - i64::from(since_days) * DAY_SECONDS;
        let history = source.touching_commits(&log_head, since)?;
        let blobs: HashMap<String, relief_git::BlobId> = source
            .list_tree(commit)?
            .into_iter()
            .map(|e| (e.path, e.blob))
            .collect();
        // Same definition as the impact (a test has a direct edge to the node); a file also
        // counts as tested when a test reaches one of its symbols (an import names them).
        let tested = relief_diff::tested_nodes(&graph);
        let tested_files: HashSet<&str> = tested.iter().filter_map(|id| id.file_path()).collect();
        let mut complexities: HashMap<String, HashMap<String, u32>> = HashMap::new();
        let mut nodes = std::collections::BTreeMap::new();
        for node in graph.nodes() {
            if !matches!(node.kind, NodeKind::File | NodeKind::Symbol) {
                continue;
            }
            let Some(path) = node.id.file_path() else {
                continue;
            };
            let authors: Vec<&str> = history
                .iter()
                .filter(|c| {
                    c.files.iter().any(|f| {
                        f.path == path
                            && match node.span.filter(|_| node.kind == NodeKind::Symbol) {
                                Some(span) => f
                                    .lines
                                    .iter()
                                    .any(|(a, b)| *a <= span.end_line && *b >= span.start_line),
                                None => true,
                            }
                    })
                })
                .map(|c| c.author.as_str())
                .collect();
            let complexity = match (node.kind, node.id.symbol_key()) {
                (NodeKind::Symbol, Some(name)) => {
                    if !complexities.contains_key(path) {
                        let found = match (blobs.get(path), node.lang.as_deref()) {
                            (Some(blob), Some(lang)) => {
                                let bytes = source.read_blob(blob)?;
                                self.indexer
                                    .adapters()
                                    .iter()
                                    .find(|a| a.handles(lang))
                                    .map(|a| a.complexity(path, &bytes))
                                    .unwrap_or_default()
                            }
                            _ => Vec::new(),
                        };
                        complexities.insert(path.to_owned(), found.into_iter().collect());
                    }
                    complexities.get(path).and_then(|c| c.get(&name)).copied()
                }
                _ => None,
            };
            let loc = match (node.kind, node.span) {
                (NodeKind::Symbol, Some(span)) => {
                    (span.end_line + 1).saturating_sub(span.start_line)
                }
                _ => match blobs.get(path) {
                    Some(blob) => source
                        .read_blob(blob)?
                        .iter()
                        .filter(|b| **b == b'\n')
                        .count() as u32,
                    None => 0,
                },
            };
            nodes.insert(
                node.id.to_string(),
                Metrics {
                    loc,
                    complexity,
                    churn: Some(authors.len() as u32),
                    owner: majority(&authors),
                    tested: Some(match node.kind {
                        NodeKind::File => tested_files.contains(path),
                        _ => tested.contains(&node.id),
                    }),
                },
            );
        }
        Ok(MetricsResponse { since_days, nodes })
    }

    /// Pairs of files changed in the same commits over a period before a ref. Kept apart from the
    /// snapshot (it depends on the history); the answer is kept in the cache folder.
    pub fn co_change(&self, request: &CoChangeRequest) -> Result<CoChangeResponse, AppError> {
        let source = self.git()?;
        let commit = self.resolve(&source, &request.rev)?;
        let since_days = request.since_days.unwrap_or(DEFAULT_CHURN_DAYS);
        let min_commits = match request.min_commits {
            Some(min) => min,
            None => self
                .read_config(&source, &commit)?
                .and_then(|(_, config)| config.ok())
                .and_then(|config| config.co_change.min_commits)
                .unwrap_or(DEFAULT_CO_CHANGE_MIN_COMMITS),
        };
        let cache = if is_virtual(&commit) {
            None
        } else {
            self.data_dir.as_ref().map(|data| {
                data.cache_dir().join(format!(
                    "co_change-{commit}-{since_days}d-{min_commits}.json"
                ))
            })
        };
        if let Some(file) = &cache
            && let Some(hit) = fs::read_to_string(file)
                .ok()
                .and_then(|text| serde_json::from_str::<CoChangeResponse>(&text).ok())
        {
            return Ok(hit);
        }
        let log_head = if is_virtual(&commit) {
            source.resolve("HEAD")?
        } else {
            commit.clone()
        };
        let since = source.commit_time(&log_head)? - i64::from(since_days) * DAY_SECONDS;
        let history = source.touching_commits(&log_head, since)?;
        let counted: Vec<Vec<&str>> = history
            .iter()
            .filter(|c| c.files.len() <= CO_CHANGE_MAX_FILES)
            .map(|c| c.files.iter().map(|f| f.path.as_str()).collect())
            .collect();
        let mut per_file: HashMap<&str, u32> = HashMap::new();
        let mut together: HashMap<(&str, &str), u32> = HashMap::new();
        for files in &counted {
            let mut files = files.clone();
            files.sort_unstable();
            files.dedup();
            for (i, a) in files.iter().enumerate() {
                *per_file.entry(a).or_default() += 1;
                for b in &files[i + 1..] {
                    *together.entry((a, b)).or_default() += 1;
                }
            }
        }
        let total = counted.len() as f64;
        let mut pairs: Vec<CoChangePair> = together
            .into_iter()
            .filter(|(_, n)| *n >= min_commits)
            .map(|((a, b), n)| {
                let busiest = per_file[a].max(per_file[b]);
                CoChangePair {
                    a: a.to_owned(),
                    b: b.to_owned(),
                    commits: n,
                    support: f64::from(n) / total,
                    confidence: f64::from(n) / f64::from(busiest),
                }
            })
            .collect();
        pairs.sort_by(|x, y| {
            y.commits
                .cmp(&x.commits)
                .then_with(|| x.a.cmp(&y.a))
                .then_with(|| x.b.cmp(&y.b))
        });
        let response = CoChangeResponse { pairs };
        if let Some(file) = &cache
            && let Ok(text) = serde_json::to_string(&response)
        {
            // Best effort: a cache that cannot be written is only slower.
            if let Some(dir) = file.parent() {
                let _ = fs::create_dir_all(dir);
            }
            let tmp = file.with_extension(format!("json.{}.tmp", std::process::id()));
            if fs::write(&tmp, text).is_ok() {
                let _ = fs::rename(&tmp, file);
            }
        }
        Ok(response)
    }

    /// The text of a node (a file, or the declaration of a symbol) at one side of a range.
    pub fn code(&self, request: &CodeRequest) -> Result<String, AppError> {
        let source = self.git()?;
        let sides = self.sides(&source, request.range.as_ref())?;
        let head = request.side == Side::Head;
        let commit = if head { &sides.new } else { &sides.old };
        let node = request.node.to_string();
        let graph = self.indexed_snapshot(&source, commit)?.graph;
        // A symbol moved to another file has another id on the base side.
        let mut wanted = node.clone();
        if !head && !graph.nodes().iter().any(|n| n.id.to_string() == node) {
            let analysed = self.analyse_sides(&source, &sides)?;
            let moved = analysed.diff.nodes.iter().find_map(|c| match &c.status {
                NodeStatus::Moved { from, .. } if c.id.to_string() == node => {
                    Some(from.to_string())
                }
                _ => None,
            });
            if let Some(from) = moved {
                wanted = from;
            }
        }
        // Only ids of the graph are served: nothing is read from a forged path.
        let found = graph
            .nodes()
            .iter()
            .find(|n| n.id.to_string() == wanted)
            .ok_or_else(|| AppError::UnknownNode(format!("unknown node '{node}'")))?;
        let path = found
            .id
            .file_path()
            .ok_or_else(|| AppError::UnknownNode("this node has no code".to_owned()))?;
        let entry = source
            .list_tree(commit)?
            .into_iter()
            .find(|e| e.path == path)
            .ok_or_else(|| AppError::UnknownNode(format!("no file '{path}'")))?;
        let bytes = source.read_blob(&entry.blob)?;
        let text = String::from_utf8_lossy(&bytes).into_owned();
        Ok(match (found.id.symbol_key(), found.span) {
            (Some(_), Some(span)) => text
                .lines()
                .skip(span.start_line.saturating_sub(1) as usize)
                .take((span.end_line + 1).saturating_sub(span.start_line) as usize)
                .collect::<Vec<_>>()
                .join("\n"),
            _ => text,
        })
    }

    /// Where the source files of an edge use the symbols they import from its target, read in
    /// the blobs of one side of a range. At most [`EDGE_USAGES_CAP`] usages are listed.
    pub fn edge_usages(&self, request: &EdgeUsagesRequest) -> Result<EdgeUsagesResponse, AppError> {
        let source = self.git()?;
        let sides = self.sides(&source, request.range.as_ref())?;
        let commit = if request.side == Side::Head {
            &sides.new
        } else {
            &sides.old
        };
        let graph = self.indexed_snapshot(&source, commit)?.graph;
        let within =
            |id: &NodeId, root: &NodeId| id == root || graph.ancestors(id).any(|a| &a.id == root);
        // Imported symbols and imported files per source file, from the import edges under the
        // requested edge.
        let mut wanted: std::collections::BTreeMap<String, Wanted> =
            std::collections::BTreeMap::new();
        for edge in graph.edges().iter().filter(|e| e.kind == EdgeKind::Imports) {
            let Some(path) = edge.from.file_path() else {
                continue;
            };
            if !within(&edge.from, &request.from) || !within(&edge.to, &request.to) {
                continue;
            }
            let entry = wanted
                .entry(path.to_owned())
                .or_insert_with(|| Wanted::new(file_id(&edge.from)));
            match (edge.to.symbol_key(), edge.to.file_path()) {
                (Some(binding), _) => {
                    if !entry.bindings.contains(&binding) {
                        entry.bindings.push(binding);
                    }
                }
                (None, Some(target)) => {
                    if !entry.targets.iter().any(|t| t == target) {
                        entry.targets.push(target.to_owned());
                    }
                }
                (None, None) => {}
            }
        }
        let tree = source.list_tree(commit)?;
        let paths: Vec<&str> = tree.iter().map(|e| e.path.as_str()).collect();
        let blobs: HashMap<&str, _> = tree.iter().map(|e| (e.path.as_str(), &e.blob)).collect();
        let package_dirs = self.indexer.package_dirs(&source, commit)?;
        let read = |p: &str| source.read_blob(blobs.get(p)?).ok();
        let env = relief_adapter_api::ResolveEnv {
            paths: &paths,
            read: &read,
            package_dirs: &package_dirs,
        };
        let mut supported = wanted.is_empty();
        let mut total = 0;
        let mut files = Vec::new();
        let mut left = EDGE_USAGES_CAP;
        for (
            path,
            Wanted {
                file,
                bindings,
                targets,
            },
        ) in wanted
        {
            let Some(blob) = blobs.get(path.as_str()) else {
                continue;
            };
            let bytes = source.read_blob(blob)?;
            let adapters = self.indexer.adapters();
            let mut usages = Vec::new();
            let mut handled = false;
            if !bindings.is_empty()
                && let Some(found) = adapters
                    .iter()
                    .find_map(|a| a.usages(&path, &bytes, &bindings))
            {
                handled = true;
                usages.extend(found);
            }
            for target in &targets {
                if let Some(found) = adapters
                    .iter()
                    .find_map(|a| a.module_usages(&path, &bytes, target, &env))
                {
                    handled = true;
                    usages.extend(found);
                }
            }
            if !handled {
                continue;
            }
            supported = true;
            usages.sort_by_key(|u| (u.line, u.column));
            total += usages.len();
            usages.truncate(left);
            left -= usages.len();
            if !usages.is_empty() {
                files.push(FileUsages { file, usages });
            }
        }
        Ok(EdgeUsagesResponse {
            supported,
            total,
            files,
        })
    }

    /// Resolves `rev`; an unknown rev in an empty repository is `NoCommits`.
    fn resolve(&self, source: &GitSource, rev: &str) -> Result<CommitId, AppError> {
        match source.resolve(rev) {
            Ok(commit) => Ok(commit),
            Err(GitError::UnknownRev(_)) if source.repo_id().is_err() => {
                Err(GitError::NoCommits.into())
            }
            Err(err) => Err(err.into()),
        }
    }

    /// The two commits a range compares; without a range, the opening range,
    /// else HEAD against the working tree.
    fn sides(
        &self,
        source: &GitSource,
        range: Option<&RangeSpec>,
    ) -> Result<ResolvedRange, AppError> {
        let worktree = RangeSpec::worktree();
        let spec = range.or(self.range.as_ref()).unwrap_or(&worktree).spec();
        Ok(match spec {
            RevSpec::Range { .. } | RevSpec::MergeBase { .. } => source.resolve_range(spec)?,
            RevSpec::Single(rev) => ResolvedRange {
                old: self.resolve(source, rev)?,
                new: source.resolve("WORKTREE")?,
            },
            RevSpec::Worktree => ResolvedRange {
                old: self.resolve(source, "HEAD")?,
                new: source.resolve("WORKTREE")?,
            },
            RevSpec::Index => ResolvedRange {
                old: self.resolve(source, "HEAD")?,
                new: source.resolve("INDEX")?,
            },
        })
    }

    /// The snapshot of `commit`, from memory for a real commit.
    fn indexed_snapshot(
        &self,
        source: &GitSource,
        commit: &CommitId,
    ) -> Result<IndexedSnapshot, AppError> {
        self.indexed_snapshot_from(source, commit, None)
    }

    /// Like `indexed_snapshot`; a snapshot to start from (its commit and the snapshot) lets
    /// the indexer extract and link only what differs.
    fn indexed_snapshot_from(
        &self,
        source: &GitSource,
        commit: &CommitId,
        from: Option<(&CommitId, &IndexedSnapshot)>,
    ) -> Result<IndexedSnapshot, AppError> {
        let key = commit.to_string();
        let real = !is_virtual(commit);
        if real && let Some(hit) = self.memory.lock().ok().and_then(|m| m.get(&key).cloned()) {
            return Ok(hit);
        }
        let config = self.read_config(source, commit)?.and_then(|(_, c)| c.ok());
        let exclude = |path: &str| config.as_ref().is_some_and(|c| c.is_excluded(path));
        let exclude: Option<&dyn Fn(&str) -> bool> = config.as_ref().map(|_| &exclude as _);
        // A workspace names the root of each repository after its folder.
        let name = match (&self.workspace, source.workdir()) {
            (Some(_), Some(dir)) => repo_name(dir),
            _ => self.name.clone(),
        };
        let indexed = match from {
            Some((base_commit, base)) => self.indexer.snapshot_from_named_excluding(
                &name,
                source,
                base_commit,
                base,
                commit,
                exclude,
            )?,
            None => self
                .indexer
                .snapshot_named_excluding(&name, source, commit, exclude)?,
        };
        self.indexed.fetch_add(1, Ordering::SeqCst);
        if real && let Ok(mut memory) = self.memory.lock() {
            memory.insert(key, indexed.clone());
        }
        Ok(indexed)
    }

    /// Normalised signature text of the symbols of `paths`, at `commit`.
    fn signature_texts(
        &self,
        source: &GitSource,
        commit: &CommitId,
        graph: &GraphSnapshot,
        paths: &HashSet<&str>,
    ) -> Result<HashMap<NodeId, String>, GitError> {
        let files: HashMap<&str, &NodeId> = graph
            .nodes()
            .iter()
            .filter(|n| n.kind == NodeKind::File)
            .filter_map(|n| Some((n.id.file_path()?, &n.id)))
            .collect();
        let mut texts = HashMap::new();
        for entry in source.list_tree(commit)? {
            let Some(file) = files.get(entry.path.as_str()) else {
                continue;
            };
            if !paths.contains(entry.path.as_str()) {
                continue;
            }
            let bytes = source.read_blob(&entry.blob)?;
            for adapter in self.indexer.adapters() {
                for (name, signature) in adapter.symbol_signatures(&entry.path, &bytes) {
                    texts.insert((*file).clone().symbol(&name), signature);
                }
            }
        }
        Ok(texts)
    }

    /// The analysis of a range; a workspace diffs each repository on its own range.
    fn analyse_range(&self, range: Option<&RangeSpec>) -> Result<DiffAnalysis, AppError> {
        if self.workspace.is_some() {
            return self.workspace_analysis();
        }
        let source = self.git()?;
        let sides = self.sides(&source, range)?;
        self.analyse_sides(&source, &sides)
    }

    /// Indexes both sides of `sides` and computes the `GraphDiff` between them:
    /// renames, signature verdicts and the commit of each changed edge.
    fn analyse_sides(
        &self,
        source: &GitSource,
        sides: &ResolvedRange,
    ) -> Result<DiffAnalysis, AppError> {
        let base = self.indexed_snapshot(source, &sides.old)?;
        let head = self.indexed_snapshot_from(source, &sides.new, Some((&sides.old, &base)))?;
        let mut warnings: Vec<String> =
            cache_warnings(&base).chain(cache_warnings(&head)).collect();
        let base_indexed = base;
        let (base, head) = (&base_indexed.graph, head.graph);
        let changes = source.diff_trees(&sides.old, &sides.new)?;
        let renames: Vec<FileRename> = changes
            .iter()
            .filter_map(|c| match &c.status {
                FileStatus::Renamed { from, .. } => Some(FileRename {
                    from: from.clone(),
                    to: c.path.clone(),
                }),
                _ => None,
            })
            .collect();
        let old_paths: HashSet<&str> = changes
            .iter()
            .map(|c| match &c.status {
                FileStatus::Renamed { from, .. } => from.as_str(),
                _ => c.path.as_str(),
            })
            .collect();
        let new_paths: HashSet<&str> = changes.iter().map(|c| c.path.as_str()).collect();
        let signatures = SignatureTexts {
            base: self.signature_texts(source, &sides.old, base, &old_paths)?,
            head: self.signature_texts(source, &sides.new, &head, &new_paths)?,
        };
        let files: Vec<FileChange> = changes
            .iter()
            .map(|c| FileChange {
                path: c.path.clone(),
                lines_added: c.lines_added,
                lines_removed: c.lines_removed,
            })
            .collect();
        let adapter = self.indexer.adapters().first();
        let compare = |a: &str, b: &str| match adapter {
            Some(adapter) => adapter.compare_signatures(a, b),
            None => relief_model::SignatureVerdict {
                breaking: a != b,
                reason: relief_model::SignatureReason::Unspecified,
                equivalent: a == b,
            },
        };
        let options = DiffOptions {
            signatures,
            renames: renames.clone(),
            compare: Some(&compare),
            ..DiffOptions::default()
        };
        let mut diff = diff_graphs_with_options(base, &head, &files, &options);
        if !is_virtual(&sides.old) && !is_virtual(&sides.new) {
            let mut commits = Vec::new();
            for info in source.log(sides)? {
                let snapshot = self.indexed_snapshot_from(
                    source,
                    &info.id,
                    Some((&sides.old, &base_indexed)),
                )?;
                warnings.extend(cache_warnings(&snapshot));
                commits.push(snapshot.graph);
            }
            attribute_edge_commits(&mut diff, &commits);
        }
        Ok(DiffAnalysis {
            base: base_indexed.graph,
            head,
            diff,
            renames,
            base_resolved: sides.old.to_string().chars().take(7).collect(),
            warnings,
        })
    }
}

/// The file node an id (a file or one of its symbols) belongs to.
fn file_id(id: &NodeId) -> NodeId {
    let text = id.to_string();
    let end = text.find("::sym:").unwrap_or(text.len());
    text[..end].parse().unwrap_or_else(|_| id.clone())
}
