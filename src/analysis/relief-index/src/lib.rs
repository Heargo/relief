//! Index: assembles a `GraphSnapshot` for a commit from detectors and adapters.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use rayon::prelude::*;
use relief_adapter_api::{Detector, Extraction, LanguageAdapter, LinkContext};
use relief_git::{BlobId, CommitId, GitError, GitSource};
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
    /// Taken from the base snapshot: nothing was read or parsed.
    reused: bool,
}

/// What one file contributed to a snapshot, kept to build a later snapshot from it.
#[derive(Debug)]
struct Part {
    file: Node,
    blob: BlobId,
    extraction: Arc<Extraction>,
    index: Option<String>,
    link: Arc<Extraction>,
}

/// The pieces of a snapshot that `Indexer::snapshot_from` reuses.
#[derive(Debug)]
struct Parts {
    detector: String,
    package_dirs: BTreeMap<String, String>,
    adapters: Vec<(String, u32)>,
    blobs: HashMap<String, BlobId>,
    routes: HashMap<NodeId, String>,
    files: HashMap<(usize, String), Arc<Part>>,
}

/// What a build takes from its base snapshot.
struct Reuse<'a> {
    base: &'a IndexedSnapshot,
    parts: &'a Parts,
    /// Base file nodes of the files whose bytes changed or that are gone.
    changed_ids: HashSet<NodeId>,
    /// Paths that did not exist in the base.
    added: HashSet<String>,
    routes_changed: bool,
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
#[derive(Debug, Clone)]
pub struct IndexedSnapshot {
    pub graph: GraphSnapshot,
    pub meta: SnapshotMeta,
    /// What `Indexer::snapshot_from` reuses; not part of the value.
    parts: Option<Arc<Parts>>,
}

impl PartialEq for IndexedSnapshot {
    fn eq(&self, other: &Self) -> bool {
        self.graph == other.graph && self.meta == other.meta
    }
}

impl Eq for IndexedSnapshot {}

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
    /// Blobs handed to the detectors so far.
    detector_reads: AtomicUsize,
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
            detector_reads: AtomicUsize::new(0),
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

    /// Number of blobs read by the detectors so far (cumulative).
    pub fn detector_reads(&self) -> usize {
        self.detector_reads.load(Ordering::Relaxed)
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
            self.detector_reads.fetch_add(1, Ordering::Relaxed);
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
        self.build(source, commit, exclude, None)
    }

    /// Builds the snapshot of `commit` from `base`, the snapshot of `base_commit`: only the
    /// files whose bytes differ are extracted again, and only those and the files whose links
    /// may change are linked again. A change the index cannot follow (a manifest, a
    /// configuration read by linking, other workspace packages) indexes in full instead.
    pub fn snapshot_from(
        &self,
        source: &GitSource,
        base_commit: &CommitId,
        base: &IndexedSnapshot,
        commit: &CommitId,
    ) -> Result<IndexedSnapshot, IndexError> {
        self.snapshot_from_excluding(source, base_commit, base, commit, None)
    }

    /// Like `snapshot_from`, leaving out the paths `exclude` accepts.
    pub fn snapshot_from_excluding(
        &self,
        source: &GitSource,
        base_commit: &CommitId,
        base: &IndexedSnapshot,
        commit: &CommitId,
        exclude: Option<&dyn Fn(&str) -> bool>,
    ) -> Result<IndexedSnapshot, IndexError> {
        let known = base.meta.commit == base_commit.to_string();
        self.build(source, commit, exclude, known.then_some(base))
    }

    /// What can be reused from `base` for a tree of `entries` and this `detection`.
    #[allow(clippy::too_many_arguments)]
    fn reuse_from<'a>(
        &self,
        base: &'a IndexedSnapshot,
        entries: &[relief_git::TreeEntry],
        by_path: &HashMap<&str, usize>,
        detection: &relief_adapter_api::Detection,
        job_paths: &HashSet<&str>,
        paths: &[&str],
        read: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Option<Reuse<'a>> {
        let parts = base.parts.as_deref()?;
        let signature: Vec<(String, u32)> = self
            .adapters
            .iter()
            .map(|a| (a.name().to_owned(), a.version()))
            .collect();
        if parts.detector != detection.detector
            || parts.package_dirs != detection.package_dirs
            || parts.adapters != signature
        {
            return None;
        }
        let mut changed: HashSet<&str> = HashSet::new();
        let mut added: HashSet<String> = HashSet::new();
        for entry in entries {
            match parts.blobs.get(&entry.path) {
                Some(blob) if *blob == entry.blob => {}
                Some(_) => {
                    changed.insert(&entry.path);
                }
                None => {
                    changed.insert(&entry.path);
                    added.insert(entry.path.clone());
                }
            }
        }
        for path in parts.blobs.keys() {
            if !by_path.contains_key(path.as_str()) {
                changed.insert(path);
            }
        }
        let base_jobs: HashSet<&str> = parts.files.keys().map(|(_, p)| p.as_str()).collect();
        for path in &changed {
            let source_file = job_paths.contains(path) || base_jobs.contains(path);
            if !source_file
                && self
                    .adapters
                    .iter()
                    .any(|a| a.link_input(path, paths, read))
            {
                return None;
            }
        }
        let changed_ids = parts
            .files
            .iter()
            .filter(|((_, p), _)| changed.contains(p.as_str()))
            .map(|(_, part)| part.file.id.clone())
            .collect();
        Some(Reuse {
            base,
            parts,
            changed_ids,
            added,
            routes_changed: false,
        })
    }

    fn build(
        &self,
        source: &GitSource,
        commit: &CommitId,
        exclude: Option<&dyn Fn(&str) -> bool>,
        base: Option<&IndexedSnapshot>,
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
        let counted_read = |path: &str| {
            self.detector_reads.fetch_add(1, Ordering::Relaxed);
            read(path)
        };
        // Content hashes of the base for the files whose blob did not change.
        let base_hashes: HashMap<String, &str> = base
            .and_then(|b| {
                let parts = b.parts.as_deref()?;
                Some(
                    b.graph
                        .nodes()
                        .iter()
                        .filter(|n| n.kind == NodeKind::File)
                        .filter_map(|n| {
                            let path = n.id.file_path()?;
                            let same = parts.blobs.get(path).is_some_and(|old| {
                                by_path.get(path).is_some_and(|&i| entries[i].blob == *old)
                            });
                            same.then(|| (path.to_owned(), n.content_hash.as_str()))
                        })
                        .collect(),
                )
            })
            .unwrap_or_default();
        let known = |path: &str| base_hashes.get(path).map(|h| (*h).to_owned());
        let detection = self
            .detectors
            .iter()
            .find_map(|d| d.detect_with(&self.repo_name, &paths, &counted_read, &known))
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
        let job_set: HashSet<&str> = jobs.iter().map(|&(_, _, p)| p.as_str()).collect();
        let mut reuse = base.and_then(|b| {
            self.reuse_from(b, &entries, &by_path, &detection, &job_set, &paths, &read)
        });
        // The part of the base each job can keep: same adapter, same bytes, same file node.
        let reused_of: Vec<Option<Arc<Part>>> = jobs
            .iter()
            .map(|&(ai, file, path)| {
                let part = reuse.as_ref()?.parts.files.get(&(ai, path.clone()))?;
                (part.file == *file && blob_of(path) == Some(&part.blob)).then(|| part.clone())
            })
            .collect();

        // Read, parse and extract in parallel; the results keep the order of `jobs`.
        let extracted: Vec<Option<Extracted>> = self.run(|| {
            jobs.par_iter()
                .enumerate()
                .map_init(
                    || blobs.local(),
                    |local, (ji, &(ai, file, path))| {
                        let adapter = &self.adapters[ai];
                        if let Some(part) = &reused_of[ji] {
                            return Some(Extracted {
                                extraction: (*part.extraction).clone(),
                                index: part.index.clone(),
                                key: None,
                                fresh: None,
                                hit: None,
                                reused: true,
                            });
                        }
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
                                reused: false,
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
                                reused: false,
                            }
                        })
                    },
                )
                .collect()
        });

        // Sequential assembly: the only writer of the caches.
        let mut seen: HashSet<(String, String, u32)> = HashSet::new();
        let mut extractions: Vec<Option<Arc<Extraction>>> = vec![None; jobs.len()];
        for (ji, (&(ai, _, path), outcome)) in jobs.iter().zip(extracted).enumerate() {
            let Some(done) = outcome else { continue };
            let adapter = &self.adapters[ai];
            let duplicate = done.key.as_ref().is_some_and(|k| !seen.insert(k.clone()));
            if done.reused {
                cached_files += 1;
            } else if let Some(hit) = done.hit {
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
            nodes.extend(done.extraction.nodes.iter().cloned());
            edges.extend(done.extraction.edges.iter().cloned());
            warnings.extend(done.extraction.warnings.iter().cloned());
            extractions[ji] = Some(match &reused_of[ji] {
                Some(part) => part.extraction.clone(),
                None => Arc::new(done.extraction),
            });
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
        if let Some(reuse) = reuse.as_mut() {
            reuse.routes_changed = reuse.parts.routes != routes;
        }
        let mut flagged = detection.entries.clone();
        let mut adapter_indexes: Vec<HashMap<String, String>> =
            vec![HashMap::new(); self.adapters.len()];
        for ((ai, path), index) in &indexes {
            adapter_indexes[*ai].insert(path.clone(), index.clone());
        }
        // Link in parallel, against the nodes extracted above; a file of the base keeps its
        // links unless they point into a changed file or its resolution may have changed.
        let linked: Vec<Option<Arc<Extraction>>> = self.run(|| {
            jobs.par_iter()
                .enumerate()
                .map_init(
                    || blobs.local(),
                    |local, (ji, &(ai, file, path))| {
                        let read = |p: &str| local.read_blob(blob_of(p)?).ok();
                        let ctx = |path| LinkContext {
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
                        if let (Some(part), Some(reuse)) = (&reused_of[ji], &reuse) {
                            let points_into_change = part.link.edges.iter().any(|e| {
                                reuse.base.graph.node(&e.to).is_some_and(|n| {
                                    let id = match n.kind {
                                        NodeKind::File => &n.id,
                                        _ => n.parent.as_ref().unwrap_or(&n.id),
                                    };
                                    reuse.changed_ids.contains(id)
                                })
                            });
                            let affected = points_into_change
                                || self.adapters[ai].link_affected(
                                    path,
                                    part.index.as_deref(),
                                    &ctx(path),
                                    &reuse.added,
                                    reuse.routes_changed,
                                );
                            if !affected {
                                return Some(part.link.clone());
                            }
                        }
                        let bytes = read(path)?;
                        Some(Arc::new(self.adapters[ai].link_indexed(
                            file,
                            &bytes,
                            indexes.get(&(ai, path.clone())).map(String::as_str),
                            &ctx(path),
                        )))
                    },
                )
                .collect()
        });
        let mut known = known;
        let mut files_kept: HashMap<(usize, String), Arc<Part>> = HashMap::new();
        for (ji, link) in linked.into_iter().enumerate() {
            let Some(link) = link else { continue };
            for node in &link.nodes {
                if known.insert(node.id.clone()) {
                    nodes.push(node.clone());
                }
            }
            edges.extend(link.edges.iter().cloned());
            warnings.extend(link.warnings.iter().cloned());
            flagged.extend(link.entries.iter().cloned());
            let (ai, file, path) = jobs[ji];
            if let (Some(extraction), Some(blob)) = (&extractions[ji], blob_of(path)) {
                files_kept.insert(
                    (ai, path.clone()),
                    Arc::new(Part {
                        file: file.clone(),
                        blob: blob.clone(),
                        extraction: extraction.clone(),
                        index: indexes.get(&(ai, path.clone())).cloned(),
                        link,
                    }),
                );
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
        let parts = Parts {
            detector: detection.detector.clone(),
            package_dirs: detection.package_dirs.clone(),
            adapters: self
                .adapters
                .iter()
                .map(|a| (a.name().to_owned(), a.version()))
                .collect(),
            blobs: entries
                .iter()
                .map(|e| (e.path.clone(), e.blob.clone()))
                .collect(),
            routes,
            files: files_kept,
        };
        Ok(IndexedSnapshot {
            graph,
            meta,
            parts: Some(Arc::new(parts)),
        })
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
