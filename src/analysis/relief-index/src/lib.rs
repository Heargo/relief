//! Index: assembles a `GraphSnapshot` for a commit from detectors and adapters.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use relief_adapter_api::{Detector, LanguageAdapter, LinkContext};
use relief_git::{CommitId, GitError, GitSource};
use relief_model::{GraphSnapshot, Node, NodeId, NodeKind, ValidationError};

mod cache;
use cache::Cache;

/// Errors raised while indexing a commit.
#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error(transparent)]
    Git(#[from] GitError),
    #[error("invalid graph: {0}")]
    Invalid(#[from] ValidationError),
    #[error("no detector registered, or none recognised the repository")]
    NoDetector,
}

pub use relief_model::SnapshotMeta;

/// A graph and the description of the run that produced it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedSnapshot {
    pub graph: GraphSnapshot,
    pub meta: SnapshotMeta,
}

/// Registry of detectors and adapters for one repository.
pub struct Indexer {
    repo_name: String,
    detectors: Vec<Box<dyn Detector>>,
    adapters: Vec<Box<dyn LanguageAdapter>>,
    cache_dir: Option<PathBuf>,
}

impl Indexer {
    /// Indexer with no detector and no adapter: the caller registers them.
    pub fn new(repo_name: &str) -> Self {
        Self {
            repo_name: repo_name.to_owned(),
            detectors: Vec::new(),
            adapters: Vec::new(),
            cache_dir: None,
        }
    }

    /// Registers a detector, tried after the ones already registered.
    pub fn with_detector(mut self, detector: Box<dyn Detector>) -> Self {
        self.detectors.push(detector);
        self
    }

    /// Registers detectors, in order.
    pub fn with_detectors(mut self, detectors: Vec<Box<dyn Detector>>) -> Self {
        self.detectors.extend(detectors);
        self
    }

    /// Registers a language adapter.
    pub fn with_adapter(mut self, adapter: Box<dyn LanguageAdapter>) -> Self {
        self.adapters.push(adapter);
        self
    }

    /// Keeps extractions per blob in `<dir>/index.sqlite`.
    pub fn with_cache(mut self, dir: impl AsRef<Path>) -> Self {
        // Creates a missing cache file now; an existing one is checked (and its
        // warning raised) when indexing.
        if !dir.as_ref().join("index.sqlite").exists() {
            drop(Cache::open(dir.as_ref()));
        }
        self.cache_dir = Some(dir.as_ref().to_path_buf());
        self
    }

    /// The registered language adapters.
    pub fn adapters(&self) -> &[Box<dyn LanguageAdapter>] {
        &self.adapters
    }

    /// Workspace package name to directory, as detected in `commit`.
    pub fn package_dirs(
        &self,
        source: &GitSource,
        commit: &CommitId,
    ) -> Result<std::collections::BTreeMap<String, String>, IndexError> {
        let entries = source.list_tree(commit)?;
        let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        let by_path: HashMap<&str, usize> = entries
            .iter()
            .enumerate()
            .map(|(i, e)| (e.path.as_str(), i))
            .collect();
        let read = |path: &str| {
            let entry = &entries[*by_path.get(path)?];
            source.read_blob(&entry.blob).ok()
        };
        Ok(self
            .detectors
            .iter()
            .find_map(|d| d.detect(&self.repo_name, &paths, &read))
            .map(|d| d.package_dirs)
            .unwrap_or_default())
    }

    /// Builds the snapshot of `commit`.
    pub fn snapshot(
        &self,
        source: &GitSource,
        commit: &CommitId,
    ) -> Result<IndexedSnapshot, IndexError> {
        self.snapshot_excluding(source, commit, None)
    }

    /// Builds the snapshot of `commit`, leaving out the paths `exclude` accepts.
    /// The blob cache is untouched: the exclusion applies to the tree listing.
    pub fn snapshot_excluding(
        &self,
        source: &GitSource,
        commit: &CommitId,
        exclude: Option<&dyn Fn(&str) -> bool>,
    ) -> Result<IndexedSnapshot, IndexError> {
        let mut entries = source.list_tree(commit)?;
        if let Some(exclude) = exclude {
            entries.retain(|e| !exclude(&e.path));
        }
        let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        let by_path: HashMap<&str, usize> = entries
            .iter()
            .enumerate()
            .map(|(i, e)| (e.path.as_str(), i))
            .collect();
        let read = |path: &str| {
            let entry = &entries[*by_path.get(path)?];
            source.read_blob(&entry.blob).ok()
        };
        let detection = self
            .detectors
            .iter()
            .find_map(|d| d.detect(&self.repo_name, &paths, &read))
            .ok_or(IndexError::NoDetector)?;
        let mut nodes = detection.nodes.clone();
        let kept = nodes.iter().filter(|n| n.kind == NodeKind::File).count();

        let mut edges = detection.edges.clone();
        let mut used = Vec::new();
        let mut warnings = detection.warnings.clone();
        let cache = self.cache_dir.as_deref().and_then(|dir| {
            let (cache, warning) = Cache::open(dir);
            warnings.extend(warning);
            cache
        });
        let (mut parsed_files, mut cached_files) = (0, 0);
        let files: Vec<Node> = nodes
            .iter()
            .filter(|n| n.kind == NodeKind::File)
            .cloned()
            .collect();
        let mut file_paths: Vec<(&Node, String)> = Vec::new();
        for file in &files {
            if let Some((_, path)) = file.id.to_string().split_once("::file:") {
                file_paths.push((file, path.to_owned()));
            }
        }
        for adapter in &self.adapters {
            for (file, path) in &file_paths {
                if !file.lang.as_deref().is_some_and(|l| adapter.handles(l)) {
                    continue;
                }
                let Some(bytes) = read(path) else { continue };
                let blob = by_path
                    .get(path.as_str())
                    .map(|&i| entries[i].blob.to_string());
                let hit = cache
                    .as_ref()
                    .zip(blob.as_deref())
                    .and_then(|(c, b)| c.get(b, adapter.name(), adapter.version(), &file.id));
                let extraction = if let Some(hit) = hit {
                    cached_files += 1;
                    hit
                } else {
                    let extraction = adapter.extract(file, &bytes);
                    parsed_files += 1;
                    if let Some((c, b)) = cache.as_ref().zip(blob.as_deref()) {
                        c.put(b, adapter.name(), adapter.version(), &file.id, &extraction);
                    }
                    extraction
                };
                nodes.extend(extraction.nodes);
                edges.extend(extraction.edges);
                warnings.extend(extraction.warnings);
                if !used.iter().any(|n: &String| n == adapter.name()) {
                    used.push(adapter.name().to_owned());
                }
            }
        }
        let by_path: HashMap<String, NodeId> = file_paths
            .iter()
            .map(|(file, path)| (path.clone(), file.id.clone()))
            .collect();
        let repo = NodeId::package(&self.repo_name);
        let mut known: HashSet<NodeId> = nodes.iter().map(|n| n.id.clone()).collect();
        let routes: HashMap<NodeId, String> = nodes
            .iter()
            .filter_map(|n| Some((n.id.clone(), n.route.clone()?)))
            .collect();
        let mut flagged = detection.entries.clone();
        for adapter in &self.adapters {
            for (file, path) in &file_paths {
                if !file.lang.as_deref().is_some_and(|l| adapter.handles(l)) {
                    continue;
                }
                let Some(bytes) = read(path) else { continue };
                let ctx = LinkContext {
                    path,
                    paths: &paths,
                    read: &read,
                    package_dirs: &detection.package_dirs,
                    files: &by_path,
                    nodes: &known,
                    routes: &routes,
                    repo: &repo,
                };
                let extraction = adapter.link(file, &bytes, &ctx);
                for node in extraction.nodes {
                    if known.insert(node.id.clone()) {
                        nodes.push(node);
                    }
                }
                edges.extend(extraction.edges);
                warnings.extend(extraction.warnings);
                flagged.extend(extraction.entries);
            }
        }
        let position: HashMap<NodeId, usize> = nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.id.clone(), i))
            .collect();
        for entry in flagged {
            if let Some(&i) = position.get(&entry.node) {
                nodes[i].entry = true;
                nodes[i].entry_type = Some(entry.entry_type);
            }
        }

        if let Some(cache) = &cache {
            cache.commit();
        }
        let graph = GraphSnapshot::new(commit.to_string(), nodes, edges);
        graph.validate()?;
        let meta = SnapshotMeta {
            commit: commit.to_string(),
            date: iso_utc(source.commit_time(commit)?),
            detector: detection.detector.clone(),
            adapters: used,
            ignored_files: entries.len() - kept,
            parsed_files,
            cached_files,
            warnings,
        };
        Ok(IndexedSnapshot { graph, meta })
    }
}

/// Formats Unix seconds as `YYYY-MM-DDTHH:MM:SSZ`.
fn iso_utc(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Civil-from-days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}
