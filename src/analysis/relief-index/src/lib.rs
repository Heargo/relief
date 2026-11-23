//! Index: assembles a `GraphSnapshot` for a commit from detectors and adapters.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rayon::prelude::*;
use relief_adapter_api::{Detector, Extraction, LanguageAdapter, LinkContext};
use relief_git::{CommitId, GitError, GitSource};
use relief_model::{GraphSnapshot, Node, NodeId, NodeKind, ValidationError};

mod cache;
use cache::{Cache, Payload};

/// Extractions kept in memory by (blob, adapter name, adapter version).
type Memory = Mutex<HashMap<(String, String, u32), Payload>>;

/// What one file yielded in the parallel extraction step.
struct Extracted {
    extraction: Extraction,
    index: Option<String>,
    key: Option<(String, String, u32)>,
    /// Payload to store: the file was just parsed.
    fresh: Option<Payload>,
    /// Payload found in memory or in the cache.
    hit: Option<Payload>,
}

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
    /// Blobs already extracted by this indexer: a snapshot of a nearby commit reparses only
    /// the blobs that changed.
    memory: Memory,
    /// Pool of the per-file work; the default rayon pool when absent.
    pool: Option<rayon::ThreadPool>,
}

impl Indexer {
    /// Indexer with no detector and no adapter: the caller registers them.
    pub fn new(repo_name: &str) -> Self {
        Self {
            repo_name: repo_name.to_owned(),
            detectors: Vec::new(),
            adapters: Vec::new(),
            cache_dir: None,
            memory: Mutex::new(HashMap::new()),
            pool: None,
        }
    }

    /// Runs the per-file work (parse, extraction, linking) in a pool of `threads` threads.
    pub fn with_threads(mut self, threads: usize) -> Self {
        #[allow(clippy::expect_used)]
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads.max(1))
            .build()
            .expect("cannot start the indexing thread pool");
        self.pool = Some(pool);
        self
    }

    fn run<R: Send>(&self, work: impl FnOnce() -> R + Send) -> R {
        match &self.pool {
            Some(pool) => pool.install(work),
            None => work(),
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
        let cache_reader = cache.map(Mutex::new);
        let (mut parsed_files, mut cached_files) = (0, 0);
        let mut indexes: HashMap<(usize, String), String> = HashMap::new();
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
        // Per-file jobs, in the order the graph is assembled: adapter, then file.
        let mut jobs: Vec<(usize, &Node, &String)> = Vec::new();
        for (ai, adapter) in self.adapters.iter().enumerate() {
            for (file, path) in &file_paths {
                if file.lang.as_deref().is_some_and(|l| adapter.handles(l)) {
                    jobs.push((ai, file, path));
                }
            }
        }
        let blobs = source.blob_reader();
        let blob_of = |path: &str| by_path.get(path).map(|&i| &entries[i].blob);

        // Read, parse and extract in parallel; the results keep the order of `jobs`.
        let extracted: Vec<Option<Extracted>> = self.run(|| {
            jobs.par_iter()
                .map_init(
                    || blobs.local(),
                    |local, &(ai, file, path)| {
                        let adapter = &self.adapters[ai];
                        let bytes = local.read_blob(blob_of(path)?).ok()?;
                        let key = blob_of(path)
                            .map(|b| (b.to_string(), adapter.name().to_owned(), adapter.version()));
                        let remembered = key
                            .as_ref()
                            .and_then(|k| self.memory.lock().ok()?.get(k).cloned());
                        let hit = remembered.or_else(|| {
                            let (b, name, version) = key.as_ref()?;
                            let json =
                                cache_reader.as_ref()?.lock().ok()?.get(b, name, *version)?;
                            Payload::parse(&json)
                        });
                        Some(if let Some(hit) = hit {
                            let (extraction, index) = hit.clone().into_parts(&file.id);
                            Extracted {
                                extraction,
                                index,
                                key,
                                fresh: None,
                                hit: Some(hit),
                            }
                        } else {
                            let (extraction, index) = adapter.extract_indexed(file, &bytes);
                            let fresh = key
                                .is_some()
                                .then(|| Payload::new(&file.id, &extraction, index.clone()));
                            Extracted {
                                extraction,
                                index,
                                key,
                                fresh,
                                hit: None,
                            }
                        })
                    },
                )
                .collect()
        });

        // Sequential assembly: the only writer of the caches.
        let mut seen: HashSet<(String, String, u32)> = HashSet::new();
        for (&(ai, _, path), outcome) in jobs.iter().zip(extracted) {
            let Some(done) = outcome else { continue };
            let adapter = &self.adapters[ai];
            let duplicate = done.key.as_ref().is_some_and(|k| !seen.insert(k.clone()));
            if let Some(hit) = done.hit {
                cached_files += 1;
                if let Some(k) = &done.key
                    && let Ok(mut memory) = self.memory.lock()
                {
                    memory.entry(k.clone()).or_insert(hit);
                }
            } else if duplicate {
                // Same blob as an earlier file of this run: the sequential indexer found it in memory.
                cached_files += 1;
            } else {
                parsed_files += 1;
            }
            if let (Some(k), Some(payload)) = (&done.key, done.fresh) {
                if let Some(c) = &cache_reader
                    && let Ok(c) = c.lock()
                {
                    c.put(&k.0, &k.1, k.2, &payload);
                }
                if let Ok(mut memory) = self.memory.lock() {
                    memory.insert(k.clone(), payload);
                }
            }
            if let Some(index) = done.index {
                indexes.insert((ai, path.clone()), index);
            }
            nodes.extend(done.extraction.nodes);
            edges.extend(done.extraction.edges);
            warnings.extend(done.extraction.warnings);
            if !used.iter().any(|n: &String| n == adapter.name()) {
                used.push(adapter.name().to_owned());
            }
        }
        let by_file: HashMap<String, NodeId> = file_paths
            .iter()
            .map(|(file, path)| (path.clone(), file.id.clone()))
            .collect();
        let repo = NodeId::package(&self.repo_name);
        let known: HashSet<NodeId> = nodes.iter().map(|n| n.id.clone()).collect();
        let routes: HashMap<NodeId, String> = nodes
            .iter()
            .filter_map(|n| Some((n.id.clone(), n.route.clone()?)))
            .collect();
        let mut flagged = detection.entries.clone();
        let mut adapter_indexes: Vec<HashMap<String, String>> =
            vec![HashMap::new(); self.adapters.len()];
        for ((ai, path), index) in &indexes {
            adapter_indexes[*ai].insert(path.clone(), index.clone());
        }
        // Link every file in parallel, against the nodes extracted above.
        let linked: Vec<Option<Extraction>> = self.run(|| {
            jobs.par_iter()
                .map_init(
                    || blobs.local(),
                    |local, &(ai, file, path)| {
                        let read = |p: &str| local.read_blob(blob_of(p)?).ok();
                        let bytes = read(path)?;
                        let ctx = LinkContext {
                            indexes: &adapter_indexes[ai],
                            path,
                            paths: &paths,
                            read: &read,
                            package_dirs: &detection.package_dirs,
                            files: &by_file,
                            nodes: &known,
                            routes: &routes,
                            repo: &repo,
                        };
                        Some(self.adapters[ai].link_indexed(
                            file,
                            &bytes,
                            indexes.get(&(ai, path.clone())).map(String::as_str),
                            &ctx,
                        ))
                    },
                )
                .collect()
        });
        let mut known = known;
        for extraction in linked.into_iter().flatten() {
            for node in extraction.nodes {
                if known.insert(node.id.clone()) {
                    nodes.push(node);
                }
            }
            edges.extend(extraction.edges);
            warnings.extend(extraction.warnings);
            flagged.extend(extraction.entries);
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

        if let Some(Ok(cache)) = cache_reader.map(Mutex::into_inner) {
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
