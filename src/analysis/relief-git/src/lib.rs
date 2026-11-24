//! Read-only access to a git repository: refs, trees and blobs.
//!
//! relief reads git objects without any checkout and never writes to the
//! analysed repository.

use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::path::{Path, PathBuf};

use gix::traverse::tree::Recorder;

/// Number of leading bytes inspected by [`is_binary`].
const BINARY_SNIFF_LEN: usize = 8 * 1024;

/// Errors raised while reading a repository.
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    /// The path is not inside a git repository.
    #[error("not a git repository: {0}")]
    NotARepository(String),
    /// The revision does not name any commit.
    #[error("unknown revision '{0}'")]
    UnknownRev(String),
    /// A short SHA matches several objects.
    #[error("ambiguous revision '{0}': several objects share this prefix")]
    AmbiguousRev(String),
    /// The text is not a valid revision expression.
    #[error("invalid revision expression '{0}'")]
    InvalidRevSpec(String),
    /// The repository has no commit to start from.
    #[error("repository has no commits")]
    NoCommits,
    /// Any other failure reported by the git backend.
    #[error("git error: {0}")]
    Backend(String),
}

fn backend<E: fmt::Display>(err: E) -> GitError {
    GitError::Backend(err.to_string())
}

/// Full SHA of a commit, or one of the virtual commits `WORKTREE` / `INDEX`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CommitId(CommitKind);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum CommitKind {
    Object(gix::ObjectId),
    Worktree,
    Index,
}

impl CommitId {
    fn object(id: gix::ObjectId) -> Self {
        Self(CommitKind::Object(id))
    }

    /// The real commit id, or an error for a virtual commit.
    fn oid(&self) -> Result<gix::ObjectId, GitError> {
        match self.0 {
            CommitKind::Object(id) => Ok(id),
            _ => Err(GitError::Backend(format!(
                "{self} is a virtual commit, not a git object"
            ))),
        }
    }

    fn is_virtual(&self) -> bool {
        !matches!(self.0, CommitKind::Object(_))
    }
}

impl fmt::Display for CommitId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.0 {
            CommitKind::Object(id) => id.fmt(f),
            CommitKind::Worktree => f.write_str("WORKTREE"),
            CommitKind::Index => f.write_str("INDEX"),
        }
    }
}

impl PartialEq<&str> for CommitId {
    fn eq(&self, other: &&str) -> bool {
        match &self.0 {
            CommitKind::Object(id) => other.parse::<gix::ObjectId>().is_ok_and(|o| o == *id),
            CommitKind::Worktree => *other == "WORKTREE",
            CommitKind::Index => *other == "INDEX",
        }
    }
}

/// Full SHA of a blob (or of a submodule commit for gitlink entries).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct BlobId(gix::ObjectId);

impl fmt::Display for BlobId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

/// A file (or submodule) listed in a tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    /// Path from the repository root, `/`-separated.
    pub path: String,
    /// Object id of the entry.
    pub blob: BlobId,
    /// Git file mode in octal form (`0o100644`, `0o160000` for a submodule).
    pub mode: u32,
}

/// A revision expression as typed by the user (`A..B`, `A...B`, a single ref,
/// `WORKTREE` or `INDEX`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RevSpec {
    /// One revision (for `relief show`).
    Single(String),
    /// `from..to`: compare the two trees as they are.
    Range { from: String, to: String },
    /// `from...to`: compare `to` against the merge base of both sides.
    MergeBase { from: String, to: String },
    /// The working tree, including uncommitted changes.
    Worktree,
    /// The index (staged changes).
    Index,
}

impl RevSpec {
    /// Parses the textual form of a revision expression.
    pub fn parse(text: &str) -> Result<Self, GitError> {
        let bad = || GitError::InvalidRevSpec(text.to_string());
        let split = |sep: &str| -> Result<(String, String), GitError> {
            let (from, to) = text.split_once(sep).ok_or_else(bad)?;
            if from.is_empty() || to.is_empty() || to.starts_with('.') || to.contains("..") {
                return Err(bad());
            }
            Ok((from.to_string(), to.to_string()))
        };
        if text.is_empty() {
            return Err(bad());
        }
        if text.contains("...") {
            let (from, to) = split("...")?;
            return Ok(Self::MergeBase { from, to });
        }
        if text.contains("..") {
            let (from, to) = split("..")?;
            return Ok(Self::Range { from, to });
        }
        Ok(match text {
            "WORKTREE" => Self::Worktree,
            "INDEX" => Self::Index,
            _ => Self::Single(text.to_string()),
        })
    }
}

/// The two commits a [`RevSpec`] range compares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedRange {
    /// The base side.
    pub old: CommitId,
    /// The compared side.
    pub new: CommitId,
}

/// How a file changed between two trees.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileStatus {
    Added,
    Deleted,
    Modified,
    /// Moved from `from`, with `similarity` as a percentage.
    Renamed {
        from: String,
        similarity: u32,
    },
}

/// One file changed between two trees.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub status: FileStatus,
    /// New path (for a rename, the destination).
    pub path: String,
    pub old_blob: Option<BlobId>,
    pub new_blob: Option<BlobId>,
    pub lines_added: u32,
    pub lines_removed: u32,
}

/// A commit of a log, with the files it changes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitInfo {
    pub id: CommitId,
    pub short: String,
    pub message: String,
    pub author: String,
    /// Author time, in seconds since the Unix epoch.
    pub date: i64,
    pub files: Vec<FileChange>,
}

/// A commit of a first-parent history, without its diff.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogItem {
    pub id: CommitId,
    pub short: String,
    /// First line of the message.
    pub subject: String,
    pub author: String,
    /// Author time, in seconds since the Unix epoch.
    pub date: i64,
}

/// The lines of one file a commit touched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TouchedFile {
    /// Path of the file after the commit.
    pub path: String,
    /// 1-based inclusive line ranges of the file after the commit that the commit added or
    /// changed; a pure deletion counts as the line that follows it. The whole file when the
    /// commit created it.
    pub lines: Vec<(u32, u32)>,
}

/// A commit of the history of a ref, with the lines it touched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TouchingCommit {
    pub id: CommitId,
    pub author: String,
    /// Author time, in seconds since the Unix epoch.
    pub date: i64,
    pub files: Vec<TouchedFile>,
}

/// Blob reader shareable between threads, from [`GitSource::blob_reader`].
pub struct BlobReader {
    repo: gix::ThreadSafeRepository,
    worktree_blobs: HashMap<gix::ObjectId, PathBuf>,
}

impl BlobReader {
    /// A reader for the current thread.
    pub fn local(&self) -> LocalBlobReader<'_> {
        LocalBlobReader {
            repo: self.repo.to_thread_local(),
            worktree_blobs: &self.worktree_blobs,
        }
    }
}

/// Blob reader bound to one thread.
pub struct LocalBlobReader<'a> {
    repo: gix::Repository,
    worktree_blobs: &'a HashMap<gix::ObjectId, PathBuf>,
}

impl LocalBlobReader<'_> {
    /// Reads the content of a blob.
    pub fn read_blob(&self, blob: &BlobId) -> Result<Vec<u8>, GitError> {
        read_blob_from(&self.repo, self.worktree_blobs, blob)
    }
}

/// A read-only view on a git repository.
pub struct GitSource {
    repo: gix::Repository,
    /// Working-tree blobs absent from the object database, by id.
    worktree_blobs: RefCell<HashMap<gix::ObjectId, PathBuf>>,
}

impl GitSource {
    /// Opens the repository containing `path`, searching parent folders.
    pub fn open(path: &Path) -> Result<Self, GitError> {
        let repo = gix::discover(path)
            .map_err(|_| GitError::NotARepository(path.display().to_string()))?;
        Ok(Self {
            repo,
            worktree_blobs: RefCell::default(),
        })
    }

    /// Resolves a revision (`HEAD`, branch, tag, short or full SHA) to a commit.
    pub fn resolve(&self, rev: &str) -> Result<CommitId, GitError> {
        match rev {
            "WORKTREE" => return Ok(CommitId(CommitKind::Worktree)),
            "INDEX" => return Ok(CommitId(CommitKind::Index)),
            _ => {}
        }
        let id = self.repo.rev_parse_single(rev).map_err(|err| {
            if format!("{err:?}").to_lowercase().contains("ambiguous") {
                GitError::AmbiguousRev(rev.to_string())
            } else {
                GitError::UnknownRev(rev.to_string())
            }
        })?;
        let commit = id
            .object()
            .map_err(backend)?
            .peel_to_commit()
            .map_err(|_| GitError::UnknownRev(rev.to_string()))?;
        Ok(CommitId::object(commit.id))
    }

    /// Lists every file of the commit tree recursively, sorted by path.
    /// Submodules are listed with mode `0o160000` and are not followed.
    pub fn list_tree(&self, commit: &CommitId) -> Result<Vec<TreeEntry>, GitError> {
        match commit.0 {
            CommitKind::Worktree => return self.worktree_entries(),
            CommitKind::Index => return self.index_entries(),
            CommitKind::Object(_) => {}
        }
        let tree = self
            .repo
            .find_commit(commit.oid()?)
            .map_err(backend)?
            .tree()
            .map_err(backend)?;
        let mut recorder = Recorder::default();
        tree.traverse()
            .breadthfirst(&mut recorder)
            .map_err(backend)?;
        let mut entries: Vec<TreeEntry> = recorder
            .records
            .into_iter()
            .filter(|r| !r.mode.is_tree())
            .map(|r| TreeEntry {
                path: r.filepath.to_string(),
                blob: BlobId(r.oid),
                mode: u32::from(r.mode.value()),
            })
            .collect();
        entries.retain(|e| !is_relief_path(&e.path));
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(entries)
    }

    /// The working tree folder, absent for a bare repository.
    pub fn workdir(&self) -> Option<&Path> {
        self.repo.workdir()
    }

    /// Reads the content of a blob.
    pub fn read_blob(&self, blob: &BlobId) -> Result<Vec<u8>, GitError> {
        read_blob_from(&self.repo, &self.worktree_blobs.borrow(), blob)
    }

    /// A reader of blobs that several threads can share (each takes its own [`LocalBlobReader`]).
    /// It knows the working-tree blobs listed so far.
    pub fn blob_reader(&self) -> BlobReader {
        BlobReader {
            repo: self.repo.clone().into_sync(),
            worktree_blobs: self.worktree_blobs.borrow().clone(),
        }
    }

    /// Committer time of the commit, in seconds since the Unix epoch.
    /// A virtual commit (`WORKTREE`, `INDEX`) takes the time of `HEAD`.
    pub fn commit_time(&self, commit: &CommitId) -> Result<i64, GitError> {
        let head;
        let commit = if commit.is_virtual() {
            head = self.resolve("HEAD")?;
            &head
        } else {
            commit
        };
        let commit = self.repo.find_commit(commit.oid()?).map_err(backend)?;
        Ok(commit.committer().map_err(backend)?.seconds())
    }

    /// Resolves a `A..B` or `A...B` expression to the two commits to compare.
    pub fn resolve_range(&self, spec: &RevSpec) -> Result<ResolvedRange, GitError> {
        match spec {
            RevSpec::Range { from, to } => Ok(ResolvedRange {
                old: self.resolve(from)?,
                new: self.resolve(to)?,
            }),
            RevSpec::MergeBase { from, to } => {
                let new = self.resolve(to)?;
                let old = self.merge_base(&self.resolve(from)?, &new)?;
                Ok(ResolvedRange { old, new })
            }
            _ => Err(GitError::InvalidRevSpec(format!("{spec:?} is not a range"))),
        }
    }

    /// Best common ancestor of two commits.
    pub fn merge_base(&self, a: &CommitId, b: &CommitId) -> Result<CommitId, GitError> {
        let base = self
            .repo
            .merge_base(a.oid()?, b.oid()?)
            .map_err(backend)?
            .ok_or_else(|| GitError::Backend(format!("no merge base between {a} and {b}")))?;
        Ok(CommitId::object(base.detach()))
    }

    /// Files changed between two commits, sorted by path, with renames
    /// detected at 50 % similarity.
    pub fn diff_trees(&self, old: &CommitId, new: &CommitId) -> Result<Vec<FileChange>, GitError> {
        if old.is_virtual() || new.is_virtual() {
            return self.diff_entries(&self.list_tree(old)?, &self.list_tree(new)?);
        }
        let old_tree = self
            .repo
            .find_commit(old.oid()?)
            .map_err(backend)?
            .tree()
            .map_err(backend)?;
        let new_tree = self
            .repo
            .find_commit(new.oid()?)
            .map_err(backend)?
            .tree()
            .map_err(backend)?;
        self.diff_tree_objects(Some(&old_tree), &new_tree)
    }

    fn diff_tree_objects(
        &self,
        old_tree: Option<&gix::Tree<'_>>,
        new_tree: &gix::Tree<'_>,
    ) -> Result<Vec<FileChange>, GitError> {
        use gix::object::tree::diff::ChangeDetached as C;
        use gix::prelude::TreeDiffChangeExt as _;

        let changes = self
            .repo
            .diff_tree_to_tree(old_tree, Some(new_tree), None)
            .map_err(backend)?;
        let mut cache = self
            .repo
            .diff_resource_cache_for_tree_diff()
            .map_err(backend)?;
        let mut out = Vec::new();
        for change in &changes {
            let (status, path, old_blob, new_blob, counts) = match change {
                C::Addition {
                    entry_mode,
                    id,
                    location,
                    ..
                } if !entry_mode.is_tree() => (
                    FileStatus::Added,
                    location.to_string(),
                    None,
                    Some(BlobId(*id)),
                    None,
                ),
                C::Deletion {
                    entry_mode,
                    id,
                    location,
                    ..
                } if !entry_mode.is_tree() => (
                    FileStatus::Deleted,
                    location.to_string(),
                    Some(BlobId(*id)),
                    None,
                    None,
                ),
                C::Modification {
                    entry_mode,
                    previous_id,
                    id,
                    location,
                    ..
                } if !entry_mode.is_tree() => (
                    FileStatus::Modified,
                    location.to_string(),
                    Some(BlobId(*previous_id)),
                    Some(BlobId(*id)),
                    None,
                ),
                C::Rewrite {
                    entry_mode,
                    source_location,
                    source_id,
                    diff,
                    id,
                    location,
                    ..
                } if !entry_mode.is_tree() => {
                    let similarity = diff.map_or(100, |d| (d.similarity * 100.0).round() as u32);
                    (
                        FileStatus::Renamed {
                            from: source_location.to_string(),
                            similarity,
                        },
                        location.to_string(),
                        Some(BlobId(*source_id)),
                        Some(BlobId(*id)),
                        Some(diff.map_or((0, 0), |d| (d.insertions, d.removals))),
                    )
                }
                _ => continue,
            };
            let (lines_added, lines_removed) = match counts {
                Some(c) => c,
                None => {
                    let counts = change
                        .attach(&self.repo, &self.repo)
                        .diff(&mut cache)
                        .ok()
                        .and_then(|mut p| p.line_counts().ok().flatten());
                    cache.clear_resource_cache_keep_allocation();
                    counts.map_or((0, 0), |c| (c.insertions, c.removals))
                }
            };
            out.push(FileChange {
                status,
                path,
                old_blob,
                new_blob,
                lines_added,
                lines_removed,
            });
        }
        out.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(out)
    }

    /// Diff of two flat entry lists (used when a side is a virtual commit).
    /// Renames are not detected.
    fn diff_entries(
        &self,
        old: &[TreeEntry],
        new: &[TreeEntry],
    ) -> Result<Vec<FileChange>, GitError> {
        let old: BTreeMap<&str, &TreeEntry> = old.iter().map(|e| (e.path.as_str(), e)).collect();
        let new: BTreeMap<&str, &TreeEntry> = new.iter().map(|e| (e.path.as_str(), e)).collect();
        let mut out = Vec::new();
        for (path, n) in &new {
            let (status, old_blob) = match old.get(path) {
                None => (FileStatus::Added, None),
                Some(o) if o.blob == n.blob => continue,
                Some(o) => (FileStatus::Modified, Some(o.blob.clone())),
            };
            let (lines_added, lines_removed) = self.line_counts(old_blob.as_ref(), Some(&n.blob));
            out.push(FileChange {
                status,
                path: (*path).to_string(),
                old_blob,
                new_blob: Some(n.blob.clone()),
                lines_added,
                lines_removed,
            });
        }
        for (path, o) in &old {
            if !new.contains_key(path) {
                let (lines_added, lines_removed) = self.line_counts(Some(&o.blob), None);
                out.push(FileChange {
                    status: FileStatus::Deleted,
                    path: (*path).to_string(),
                    old_blob: Some(o.blob.clone()),
                    new_blob: None,
                    lines_added,
                    lines_removed,
                });
            }
        }
        out.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(out)
    }

    /// Added and removed line counts between two blobs; `(0, 0)` for binary
    /// or unreadable content.
    fn line_counts(&self, old: Option<&BlobId>, new: Option<&BlobId>) -> (u32, u32) {
        let read = |b: Option<&BlobId>| match b {
            Some(b) => self.read_blob(b).ok(),
            None => Some(Vec::new()),
        };
        let (Some(old), Some(new)) = (read(old), read(new)) else {
            return (0, 0);
        };
        if is_binary(&old) || is_binary(&new) {
            return (0, 0);
        }
        let input = gix::diff::blob::InternedInput::new(old.as_slice(), new.as_slice());
        let diff = gix::diff::blob::Diff::compute(gix::diff::blob::Algorithm::Histogram, &input);
        (diff.count_additions(), diff.count_removals())
    }

    /// The tree of the index (stage 0 entries).
    fn index_entries(&self) -> Result<Vec<TreeEntry>, GitError> {
        let index = self.repo.index_or_empty().map_err(backend)?;
        let mut entries: Vec<TreeEntry> = index
            .entries()
            .iter()
            .filter(|e| e.stage_raw() == 0)
            .map(|e| TreeEntry {
                path: e.path(&index).to_string(),
                blob: BlobId(e.id),
                mode: e.mode.bits(),
            })
            .filter(|e| !is_relief_path(&e.path))
            .collect();
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(entries)
    }

    /// HEAD and the index, with what the working tree changes on top:
    /// modified and added files (untracked, not ignored), minus deleted ones.
    fn worktree_entries(&self) -> Result<Vec<TreeEntry>, GitError> {
        let workdir = self
            .repo
            .workdir()
            .ok_or_else(|| GitError::Backend("repository has no working tree".to_string()))?
            .to_path_buf();
        let head = self.resolve("HEAD")?;
        let mut known: BTreeMap<String, TreeEntry> = BTreeMap::new();
        for entry in self
            .list_tree(&head)?
            .into_iter()
            .chain(self.index_entries()?)
        {
            known.insert(entry.path.clone(), entry);
        }

        let index = self.repo.index_or_empty().map_err(backend)?;
        let mut excludes = self
            .repo
            .excludes(
                &index,
                None,
                gix::worktree::stack::state::ignore::Source::WorktreeThenIdMappingIfNotSkipped,
            )
            .map_err(backend)?;
        let mut untracked = Vec::new();
        let mut stack = vec![String::new()];
        while let Some(dir) = stack.pop() {
            let Ok(read_dir) = std::fs::read_dir(workdir.join(&dir)) else {
                continue;
            };
            for item in read_dir.flatten() {
                let name = item.file_name().to_string_lossy().into_owned();
                if dir.is_empty() && (name == ".git" || name == ".relief") {
                    continue;
                }
                let rel = if dir.is_empty() {
                    name
                } else {
                    format!("{dir}/{name}")
                };
                let Ok(kind) = item.file_type() else { continue };
                if kind.is_dir() {
                    let ignored = excludes
                        .at_path(&rel, Some(gix::index::entry::Mode::DIR))
                        .map_err(backend)?
                        .is_excluded();
                    if !ignored {
                        stack.push(rel);
                    }
                } else if !known.contains_key(&rel) {
                    let ignored = excludes
                        .at_path(&rel, Some(gix::index::entry::Mode::FILE))
                        .map_err(backend)?
                        .is_excluded();
                    if !ignored {
                        untracked.push(rel);
                    }
                }
            }
        }

        let mut entries = Vec::new();
        let candidates = known
            .into_values()
            .map(Ok)
            .chain(untracked.into_iter().map(Err));
        for candidate in candidates {
            let (path, tracked) = match candidate {
                Ok(entry) => (entry.path.clone(), Some(entry)),
                Err(path) => (path, None),
            };
            if tracked.as_ref().is_some_and(|e| e.mode == 0o160000) {
                entries.extend(tracked);
                continue;
            }
            let full = workdir.join(&path);
            let Ok(meta) = std::fs::symlink_metadata(&full) else {
                continue;
            };
            if meta.is_dir() {
                continue;
            }
            let mode = if meta.is_symlink() {
                0o120000
            } else if is_executable(&meta) {
                0o100755
            } else {
                0o100644
            };
            let data = read_worktree_file(&full)?;
            let id =
                gix::objs::compute_hash(self.repo.object_hash(), gix::object::Kind::Blob, &data)
                    .map_err(backend)?;
            self.worktree_blobs.borrow_mut().insert(id, full);
            entries.push(TreeEntry {
                path,
                blob: BlobId(id),
                mode,
            });
        }
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(entries)
    }

    /// Commits reachable from `range.new` but not from `range.old`, oldest
    /// first, merges excluded.
    pub fn log(&self, range: &ResolvedRange) -> Result<Vec<CommitInfo>, GitError> {
        let walk = self
            .repo
            .rev_walk([range.new.oid()?])
            .with_hidden([range.old.oid()?])
            .all()
            .map_err(backend)?;
        let mut ids = Vec::new();
        for info in walk {
            let info = info.map_err(backend)?;
            ids.push(info.id);
        }
        ids.reverse();
        let mut commits = Vec::new();
        for id in ids {
            let commit = self.repo.find_commit(id).map_err(backend)?;
            let parents: Vec<_> = commit.parent_ids().map(|p| p.detach()).collect();
            if parents.len() > 1 {
                continue;
            }
            let tree = commit.tree().map_err(backend)?;
            let parent_tree = self.parent_tree(parents.first().copied())?;
            let files = self.diff_tree_objects(parent_tree.as_ref(), &tree)?;
            let author = commit.author().map_err(backend)?;
            commits.push(CommitInfo {
                id: CommitId::object(id),
                short: id.to_hex_with_len(7).to_string(),
                message: commit.message_raw().map_err(backend)?.to_string(),
                author: author.name.to_string(),
                date: author.seconds(),
                files,
            });
        }
        Ok(commits)
    }

    /// The first-parent history of `head`, newest first, keeping the commits `keep` accepts, at
    /// most `limit` of them.
    pub fn first_parent_log(
        &self,
        head: &CommitId,
        limit: usize,
        keep: impl Fn(&LogItem) -> bool,
    ) -> Result<Vec<LogItem>, GitError> {
        let walk = self
            .repo
            .rev_walk([head.oid()?])
            .first_parent_only()
            .all()
            .map_err(backend)?;
        let mut items = Vec::new();
        for info in walk {
            if items.len() >= limit {
                break;
            }
            let id = info.map_err(backend)?.id;
            let commit = self.repo.find_commit(id).map_err(backend)?;
            let author = commit.author().map_err(backend)?;
            let message = commit.message_raw().map_err(backend)?.to_string();
            let item = LogItem {
                id: CommitId::object(id),
                short: id.to_hex_with_len(7).to_string(),
                subject: message.lines().next().unwrap_or_default().to_owned(),
                author: author.name.to_string(),
                date: author.seconds(),
            };
            if keep(&item) {
                items.push(item);
            }
        }
        Ok(items)
    }

    /// The commits reachable from `head` whose author time is at least `since` (seconds since
    /// the Unix epoch), newest first, merges excluded, with the lines each one touched.
    pub fn touching_commits(
        &self,
        head: &CommitId,
        since: i64,
    ) -> Result<Vec<TouchingCommit>, GitError> {
        let walk = self.repo.rev_walk([head.oid()?]).all().map_err(backend)?;
        let mut commits = Vec::new();
        for info in walk {
            let id = info.map_err(backend)?.id;
            let commit = self.repo.find_commit(id).map_err(backend)?;
            let author = commit.author().map_err(backend)?;
            let date = author.seconds();
            let parents: Vec<_> = commit.parent_ids().map(|p| p.detach()).collect();
            if date < since || parents.len() > 1 {
                continue;
            }
            let author = author.name.to_string();
            let tree = commit.tree().map_err(backend)?;
            let parent_tree = self.parent_tree(parents.first().copied())?;
            if parent_tree.is_none() && !parents.is_empty() {
                // The boundary of a shallow clone: its parent is not stored, so there is no diff.
                continue;
            }
            let files = self
                .diff_tree_objects(parent_tree.as_ref(), &tree)?
                .into_iter()
                .filter_map(|change| {
                    let new = change.new_blob.as_ref()?;
                    let lines = self.touched_lines(change.old_blob.as_ref(), new)?;
                    Some(TouchedFile {
                        path: change.path,
                        lines,
                    })
                })
                .collect();
            commits.push(TouchingCommit {
                id: CommitId::object(id),
                author,
                date,
                files,
            });
        }
        Ok(commits)
    }

    /// Line ranges of `new` that differ from `old` (all of `new` without `old`); `None` for a
    /// binary or unreadable blob.
    fn touched_lines(&self, old: Option<&BlobId>, new: &BlobId) -> Option<Vec<(u32, u32)>> {
        let new_bytes = self.read_blob(new).ok()?;
        let old_bytes = match old {
            Some(old) => self.read_blob(old).ok()?,
            None => Vec::new(),
        };
        if is_binary(&old_bytes) || is_binary(&new_bytes) {
            return None;
        }
        let input = gix::diff::blob::InternedInput::new(old_bytes.as_slice(), new_bytes.as_slice());
        let diff = gix::diff::blob::Diff::compute(gix::diff::blob::Algorithm::Histogram, &input);
        Some(
            diff.hunks()
                .map(|h| {
                    if h.after.is_empty() {
                        (h.after.start + 1, h.after.start + 1)
                    } else {
                        (h.after.start + 1, h.after.end)
                    }
                })
                .collect(),
        )
    }

    /// Short names of the local branches, sorted.
    pub fn branches(&self) -> Result<Vec<String>, GitError> {
        self.ref_names(false)
    }

    /// The branch `HEAD` points at, when it points at one.
    pub fn current_branch(&self) -> Option<String> {
        let name = self.repo.head_name().ok()??;
        Some(name.shorten().to_string())
    }

    /// Names of the tags, sorted.
    pub fn tags(&self) -> Result<Vec<String>, GitError> {
        self.ref_names(true)
    }

    fn ref_names(&self, tags: bool) -> Result<Vec<String>, GitError> {
        let platform = self.repo.references().map_err(backend)?;
        let iter = if tags {
            platform.tags()
        } else {
            platform.local_branches()
        }
        .map_err(backend)?;
        let mut names = Vec::new();
        for reference in iter {
            let reference = reference.map_err(backend)?;
            names.push(reference.name().shorten().to_string());
        }
        names.sort();
        Ok(names)
    }

    /// The tree of a parent commit; none for a root commit, or for the boundary of a shallow clone.
    fn parent_tree(
        &self,
        parent: Option<gix::ObjectId>,
    ) -> Result<Option<gix::Tree<'_>>, GitError> {
        let Some(parent) = parent else {
            return Ok(None);
        };
        match self.repo.find_commit(parent) {
            Ok(commit) => Ok(Some(commit.tree().map_err(backend)?)),
            Err(_) if self.repo.is_shallow().unwrap_or(false) => Ok(None),
            Err(err) => Err(backend(err)),
        }
    }

    /// Identifier of the repository: the SHA of its first commit. In a shallow clone it is the
    /// oldest stored commit, so it differs from the id of a full clone and between clones of
    /// different depths.
    pub fn repo_id(&self) -> Result<CommitId, GitError> {
        let head = self.repo.head_id().map_err(|_| GitError::NoCommits)?;
        let mut current = self.repo.find_commit(head.detach()).map_err(backend)?;
        loop {
            let parent = current.parent_ids().next().map(|p| p.detach());
            let Some(parent) = parent else { break };
            // The parent of the oldest commit of a shallow clone is not stored.
            current = match self.repo.find_commit(parent) {
                Ok(commit) => commit,
                Err(_) if self.repo.is_shallow().unwrap_or(false) => break,
                Err(err) => return Err(backend(err)),
            };
        }
        Ok(CommitId::object(current.id))
    }
}

/// Content of a working-tree file as git would store it: the link target for
/// a symlink.
fn read_blob_from(
    repo: &gix::Repository,
    worktree_blobs: &HashMap<gix::ObjectId, PathBuf>,
    blob: &BlobId,
) -> Result<Vec<u8>, GitError> {
    if let Ok(object) = repo.find_object(blob.0) {
        return Ok(object.detach().data);
    }
    match worktree_blobs.get(&blob.0) {
        Some(path) => read_worktree_file(path),
        None => Err(GitError::Backend(format!("blob {blob} not found"))),
    }
}

fn read_worktree_file(path: &Path) -> Result<Vec<u8>, GitError> {
    let meta = std::fs::symlink_metadata(path).map_err(backend)?;
    if meta.is_symlink() {
        let target = std::fs::read_link(path).map_err(backend)?;
        return Ok(target.to_string_lossy().into_owned().into_bytes());
    }
    std::fs::read(path).map_err(backend)
}

#[cfg(unix)]
fn is_executable(meta: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    meta.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_meta: &std::fs::Metadata) -> bool {
    false
}

/// Whether `path` lives under the `.relief/` data folder at the repository root.
fn is_relief_path(path: &str) -> bool {
    path.starts_with(".relief/")
}

/// Heuristic: a NUL byte in the first 8 KiB marks the content as binary.
pub fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(BINARY_SNIFF_LEN).any(|&b| b == 0)
}
