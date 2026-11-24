//! The snapshot and the analysis of a workspace (ADR 0010): the union of the repositories, each
//! under its `repo:<name>` node, with prefixed ids, each read at its own source and diffed on its
//! own range (the workspace file's `source` into `destination`).

use relief_git::{CommitId, GitSource, ResolvedRange};
use relief_model::{
    Edge, EdgeChange, FileChange, FileRename, GraphDiff, GraphSnapshot, Node, NodeChange, NodeId,
    NodeKind, NodeStatus, RepoComparison, SnapshotMeta, SnapshotResponse, Visibility,
};

use crate::{AppError, DiffAnalysis, Session, Workspace, WorkspaceRepo, is_virtual};

/// One repository of the workspace, open.
struct Member {
    repo: WorkspaceRepo,
    source: GitSource,
}

/// A repository of the workspace, its `repo:<name>` node and its graph.
struct Part {
    root: Node,
    name: String,
    graph: GraphSnapshot,
}

fn prefixed(id: &NodeId, repo: &str) -> Result<NodeId, AppError> {
    id.clone()
        .in_repo(repo)
        .map_err(|e| AppError::Workspace(format!("cannot prefix {id} by {repo}: {e}")))
}

/// A file path made unique across the repositories: `repo:<name>/<path>`
/// (see `NodeId::repo_file_path`).
fn prefixed_path(path: &str, repo: &str) -> String {
    format!("repo:{repo}/{path}")
}

fn prefixed_node(node: &Node, repo: &str, root: &NodeId) -> Result<Node, AppError> {
    let mut node = node.clone();
    node.parent = Some(match &node.parent {
        Some(p) => prefixed(p, repo)?,
        None => root.clone(),
    });
    node.id = prefixed(&node.id, repo)?;
    Ok(node)
}

fn prefixed_edge(edge: &Edge, repo: &str) -> Result<Edge, AppError> {
    Ok(Edge {
        from: prefixed(&edge.from, repo)?,
        to: prefixed(&edge.to, repo)?,
        ..edge.clone()
    })
}

/// The `repo:<name>` node of a repository read at `commit`.
fn repo_node(repo: &WorkspaceRepo, branch: String, commit: &str) -> Result<Node, AppError> {
    let id = NodeId::repo_root(&repo.name)
        .map_err(|e| AppError::Workspace(format!("invalid repository name: {e}")))?;
    Ok(Node {
        id,
        kind: NodeKind::Repo,
        subkind: "repo".to_owned(),
        parent: None,
        lang: None,
        span: None,
        visibility: Visibility::Public,
        content_hash: commit.to_owned(),
        signature_hash: None,
        metrics: None,
        path: None,
        route: None,
        entry: false,
        entry_type: None,
        child_count: None,
        is_test: false,
        branch: Some(branch),
        labels: Some(repo.labels.clone()),
    })
}

/// The graphs of the repositories under their `repo:<name>` nodes.
fn unite(parts: Vec<Part>) -> Result<GraphSnapshot, AppError> {
    let commit = parts
        .iter()
        .map(|p| p.graph.commit())
        .collect::<Vec<_>>()
        .join("+");
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    for part in parts {
        let root_id = part.root.id.clone();
        nodes.push(part.root);
        for node in part.graph.nodes() {
            nodes.push(prefixed_node(node, &part.name, &root_id)?);
        }
        for edge in part.graph.edges() {
            edges.push(prefixed_edge(edge, &part.name)?);
        }
    }
    Ok(GraphSnapshot::new(commit, nodes, edges))
}

fn prefixed_change(change: &NodeChange, repo: &str) -> Result<NodeChange, AppError> {
    let status = match &change.status {
        NodeStatus::Moved { from, body } => NodeStatus::Moved {
            from: prefixed(from, repo)?,
            body: *body,
        },
        other => other.clone(),
    };
    Ok(NodeChange {
        id: prefixed(&change.id, repo)?,
        status,
        ..change.clone()
    })
}

fn poisoned<T>(_: std::sync::PoisonError<T>) -> AppError {
    AppError::Workspace("the comparisons of the session are unavailable".to_owned())
}

impl Session {
    fn members(&self) -> Result<Vec<Member>, AppError> {
        let workspace = self
            .workspace
            .as_ref()
            .ok_or_else(|| AppError::Workspace("this operation needs a workspace".to_owned()))?;
        workspace
            .repos
            .iter()
            .map(|repo| {
                let mut repo = repo.clone();
                if let Some((source, destination)) = self.comparison_of(&repo.name)? {
                    repo.source = source;
                    repo.destination = destination;
                }
                Ok(Member {
                    source: GitSource::open(&workspace.path_of(&repo))?,
                    repo,
                })
            })
            .collect()
    }

    /// The comparison changed in session for a repository, when there is one.
    fn comparison_of(&self, name: &str) -> Result<Option<(String, String)>, AppError> {
        Ok(self
            .comparisons
            .lock()
            .map_err(poisoned)?
            .get(name)
            .cloned())
    }

    /// The comparison of each repository of the workspace (empty on a single repository).
    pub fn repo_comparisons(&self) -> Vec<RepoComparison> {
        let Some(workspace) = &self.workspace else {
            return Vec::new();
        };
        // A repository that cannot be read keeps its row, with the reason: the menu stays usable
        // for the others.
        workspace
            .repos
            .iter()
            .map(|repo| {
                let mut row = RepoComparison {
                    name: repo.name.clone(),
                    source: repo.source.clone(),
                    destination: repo.destination.clone(),
                    branches: Vec::new(),
                    error: None,
                };
                let read = (|| -> Result<(), AppError> {
                    if let Some((source, destination)) = self.comparison_of(&repo.name)? {
                        row.source = source;
                        row.destination = destination;
                    }
                    row.branches = GitSource::open(&workspace.path_of(repo))?.branches()?;
                    Ok(())
                })();
                row.error = read.err().map(|e| e.to_string());
                row
            })
            .collect()
    }

    /// Changes the comparison of one repository for the session; with `save`, in the workspace
    /// file too. The other repositories are not read again.
    pub fn set_repo_comparison(
        &self,
        repo: &str,
        source: &str,
        destination: &str,
        save: bool,
    ) -> Result<(), AppError> {
        let workspace = self
            .workspace
            .as_ref()
            .ok_or_else(|| AppError::Workspace("this operation needs a workspace".to_owned()))?;
        let member = workspace
            .repos
            .iter()
            .find(|r| r.name == repo)
            .ok_or_else(|| AppError::Workspace(format!("'{repo}' is not in the workspace")))?;
        let git = GitSource::open(&workspace.path_of(member))?;
        self.resolve(&git, source)?;
        self.resolve(&git, destination)?;
        if save {
            Workspace::open(workspace.file())?.set_comparison(repo, source, destination)?;
        }
        self.comparisons
            .lock()
            .map_err(poisoned)?
            .insert(repo.to_owned(), (source.to_owned(), destination.to_owned()));
        Ok(())
    }

    /// The commit a repository is read at (its `source`).
    fn member_head(&self, member: &Member) -> Result<CommitId, AppError> {
        self.resolve(&member.source, &member.repo.source)
    }

    /// The two commits of a repository's own range: its `destination` (at the merge base with its
    /// `source`) against its `source`.
    fn member_sides(&self, member: &Member) -> Result<ResolvedRange, AppError> {
        let new = self.member_head(member)?;
        let tip = if is_virtual(&new) {
            self.resolve(&member.source, "HEAD")?
        } else {
            new.clone()
        };
        let destination = self.resolve(&member.source, &member.repo.destination)?;
        let old = member.source.merge_base(&destination, &tip)?;
        Ok(ResolvedRange { old, new })
    }

    fn member_branch(member: &Member) -> String {
        if matches!(member.repo.source.as_str(), "WORKTREE" | "INDEX") {
            member
                .source
                .current_branch()
                .unwrap_or_else(|| "HEAD".to_owned())
        } else {
            member.repo.source.clone()
        }
    }

    /// The union of the repositories, each at its own source.
    pub(crate) fn workspace_snapshot(&self) -> Result<SnapshotResponse, AppError> {
        let mut parts = Vec::new();
        let mut metas: Vec<SnapshotMeta> = Vec::new();
        for member in self.members()? {
            let commit = self.member_head(&member)?;
            let indexed = self.indexed_snapshot(&member.source, &commit)?;
            let root = repo_node(
                &member.repo,
                Self::member_branch(&member),
                &commit.to_string(),
            )?;
            parts.push(Part {
                root,
                name: member.repo.name.clone(),
                graph: indexed.graph,
            });
            metas.push(indexed.meta);
        }
        let graph = unite(parts)?;
        let mut meta = SnapshotMeta {
            commit: graph.commit().to_owned(),
            date: String::new(),
            detector: String::new(),
            adapters: Vec::new(),
            ignored_files: 0,
            parsed_files: 0,
            cached_files: 0,
            warnings: Vec::new(),
        };
        for m in metas {
            if m.date > meta.date {
                meta.date = m.date;
            }
            if meta.detector.is_empty() {
                meta.detector = m.detector;
            }
            for adapter in m.adapters {
                if !meta.adapters.contains(&adapter) {
                    meta.adapters.push(adapter);
                }
            }
            meta.ignored_files += m.ignored_files;
            meta.parsed_files += m.parsed_files;
            meta.cached_files += m.cached_files;
            meta.warnings.extend(m.warnings);
        }
        Ok(SnapshotResponse { graph, meta })
    }

    /// The union of the diffs of the repositories, each on its own range.
    pub(crate) fn workspace_analysis(&self) -> Result<DiffAnalysis, AppError> {
        let (mut bases, mut heads) = (Vec::new(), Vec::new());
        let mut diff = GraphDiff {
            base: String::new(),
            head: String::new(),
            nodes: Vec::new(),
            files: Vec::new(),
            edges: Vec::new(),
        };
        let (mut renames, mut warnings, mut resolved) = (Vec::new(), Vec::new(), Vec::new());
        let (mut bases_text, mut heads_text) = (Vec::new(), Vec::new());
        for member in self.members()? {
            let sides = self.member_sides(&member)?;
            let analysed = self.analyse_sides(&member.source, &sides)?;
            let name = member.repo.name.as_str();
            let part = |root: Node, graph: &GraphSnapshot| Part {
                root,
                name: name.to_owned(),
                graph: graph.clone(),
            };
            let branch = Self::member_branch(&member);
            let root =
                |graph: &GraphSnapshot| repo_node(&member.repo, branch.clone(), graph.commit());
            bases.push(part(root(&analysed.base)?, &analysed.base));
            heads.push(part(root(&analysed.head)?, &analysed.head));
            bases_text.push(analysed.diff.base.clone());
            heads_text.push(analysed.diff.head.clone());
            for change in &analysed.diff.nodes {
                diff.nodes.push(prefixed_change(change, name)?);
            }
            diff.files
                .extend(analysed.diff.files.iter().map(|f| FileChange {
                    path: prefixed_path(&f.path, name),
                    ..f.clone()
                }));
            for c in &analysed.diff.edges {
                diff.edges.push(EdgeChange {
                    from: prefixed(&c.from, name)?,
                    to: prefixed(&c.to, name)?,
                    ..c.clone()
                });
            }
            renames.extend(analysed.renames.iter().map(|r| FileRename {
                from: prefixed_path(&r.from, name),
                to: prefixed_path(&r.to, name),
            }));
            warnings.extend(analysed.warnings);
            resolved.push(analysed.base_resolved);
        }
        diff.base = bases_text.join("+");
        diff.head = heads_text.join("+");
        Ok(DiffAnalysis {
            base: unite(bases)?,
            head: unite(heads)?,
            diff,
            renames,
            base_resolved: resolved.join("+"),
            warnings,
        })
    }
}
