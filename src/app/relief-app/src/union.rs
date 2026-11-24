//! The snapshot and the analysis of a workspace (ADR 0010): the union of the repositories, each
//! under its `repo:<name>` node, with prefixed ids, each read at its own source and diffed on its
//! own range (the workspace file's `source` into `destination`).

use std::collections::{BTreeMap, HashMap, HashSet};

use relief_adapter_api::{HttpCallSite, PublishedPackage, http_edge, path_matches, verb_matches};
use relief_git::{CommitId, GitSource, ResolvedRange};
use relief_model::{
    CoChangePair, CoChangeResponse, CommitReadingResponse, Edge, EdgeChange, EdgeKind, EdgeStatus,
    EdgeUsagesResponse, FileChange, FileRename, GraphDiff, GraphSnapshot, MetricsResponse, Node,
    NodeChange, NodeId, NodeKind, NodeStatus, RepoComparison, SnapshotMeta, SnapshotResponse,
    Visibility,
};

use crate::{
    AppError, CodeRequest, DiffAnalysis, EdgeUsagesRequest, LogEntry, Session, Side, Wanted,
    Workspace, WorkspaceRepo, import_wanted, is_virtual,
};

/// One repository of the workspace, open.
struct Member {
    repo: WorkspaceRepo,
    source: GitSource,
}

/// A node of a repository of the workspace: the repository, its range, the id without prefix.
struct Located {
    member: Member,
    sides: ResolvedRange,
    local: NodeId,
}

/// A repository of the workspace, its `repo:<name>` node and its graph.
struct Part {
    root: Node,
    name: String,
    graph: GraphSnapshot,
    /// The packages this repository publishes.
    published: Vec<PublishedPackage>,
    /// The HTTP calls found in this repository (ids not prefixed).
    calls: Vec<HttpCallSite>,
}

/// `http` edges from the calls of a repository to the routes declared in another one, by the
/// rule inside a repository: same verb (when the call has one), matching path.
fn cross_http(parts: &[Part]) -> Result<Vec<Edge>, AppError> {
    let routes: Vec<(&str, &Node, &str, &str)> = parts
        .iter()
        .flat_map(|part| {
            part.graph.nodes().iter().filter_map(move |n| {
                let (verb, path) = n.route.as_deref()?.split_once(' ')?;
                Some((part.name.as_str(), n, verb, path))
            })
        })
        .collect();
    let mut edges: Vec<Edge> = Vec::new();
    for part in parts {
        for call in &part.calls {
            for (repo, node, verb, path) in &routes {
                if *repo == part.name
                    || !verb_matches(call.verb.as_deref(), verb)
                    || !path_matches(path, &call.path)
                {
                    continue;
                }
                let edge = http_edge(
                    prefixed(&call.from, &part.name)?,
                    prefixed(&node.id, repo)?,
                    call.verb.as_deref(),
                );
                if !edges.contains(&edge) {
                    edges.push(edge);
                }
            }
        }
    }
    edges.sort_by_key(|e| (e.from.to_string(), e.to.to_string()));
    Ok(edges)
}

const EXTERNAL_PREFIX: &str = "pkg:external/";

/// For each external node of a repository naming (by `import_name`) a package another
/// repository publishes (prefixed ids), the file that package enters by.
fn redirects(parts: &[Part]) -> HashMap<NodeId, NodeId> {
    // File node by repository and repository path.
    let files: HashMap<(&str, String), &NodeId> = parts
        .iter()
        .flat_map(|part| {
            part.graph
                .nodes()
                .iter()
                .filter(|n| n.kind == NodeKind::File)
                .filter_map(move |n| {
                    let id = n.id.to_string();
                    let (_, path) = id.split_once("::file:")?;
                    Some(((part.name.as_str(), path.to_owned()), &n.id))
                })
        })
        .collect();
    // Entry file by import name; the first repository publishing a name wins.
    let mut entries: HashMap<&str, (&str, &NodeId)> = HashMap::new();
    for part in parts {
        for p in &part.published {
            if let Some(file) = files.get(&(part.name.as_str(), p.entry.clone())) {
                entries
                    .entry(p.import_name.as_str())
                    .or_insert((part.name.as_str(), file));
            }
        }
    }
    let mut map = HashMap::new();
    for part in parts {
        for node in part.graph.nodes() {
            if node.kind != NodeKind::External {
                continue;
            }
            let id = node.id.to_string();
            let Some(name) = id.strip_prefix(EXTERNAL_PREFIX) else {
                continue;
            };
            let Some((repo, file)) = entries.get(name) else {
                continue;
            };
            if *repo == part.name {
                continue;
            }
            if let (Ok(from), Ok(to)) = (prefixed(&node.id, &part.name), prefixed(file, repo)) {
                map.insert(from, to);
            }
        }
    }
    map
}

/// Removes the external nodes replaced by a file, and the external groups left empty.
fn prune_externals(nodes: &mut Vec<Node>, redirect: &HashMap<NodeId, NodeId>) {
    nodes.retain(|n| !redirect.contains_key(&n.id));
    let parents: HashSet<NodeId> = nodes.iter().filter_map(|n| n.parent.clone()).collect();
    nodes.retain(|n| n.subkind != "external-group" || parents.contains(&n.id));
}

/// Whether `id` is the group of the external packages of a repository.
fn is_external_group(id: &NodeId) -> bool {
    id.to_string().ends_with("/pkg:external")
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
    let redirect = redirects(&parts);
    unite_with(parts, &redirect)
}

/// Like `unite`, with the redirections to apply (see `redirects`).
fn unite_with(
    parts: Vec<Part>,
    redirect: &HashMap<NodeId, NodeId>,
) -> Result<GraphSnapshot, AppError> {
    let commit = parts
        .iter()
        .map(|p| p.graph.commit())
        .collect::<Vec<_>>()
        .join("+");
    let mut nodes = Vec::new();
    let mut edges = cross_http(&parts)?;
    for part in parts {
        let root_id = part.root.id.clone();
        nodes.push(part.root);
        for node in part.graph.nodes() {
            nodes.push(prefixed_node(node, &part.name, &root_id)?);
        }
        for edge in part.graph.edges() {
            let mut edge = prefixed_edge(edge, &part.name)?;
            if let Some(to) = redirect.get(&edge.to) {
                edge.to = to.clone();
            }
            edges.push(edge);
        }
    }
    prune_externals(&mut nodes, redirect);
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
                let source = GitSource::open(&workspace.path_of(&repo))?;
                repo.destination = file_destination(&repo, &source)?;
                if let Some((from, destination)) = self.comparison_of(&repo.name)? {
                    repo.source = from;
                    repo.destination = destination;
                }
                Ok(Member { source, repo })
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
                    let git = GitSource::open(&workspace.path_of(repo))?;
                    row.destination = file_destination(repo, &git)?;
                    if let Some((source, destination)) = self.comparison_of(&repo.name)? {
                        row.source = source;
                        row.destination = destination;
                    }
                    row.branches = git.branches()?;
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

    /// The commit the history of a repository is read from: its `source`, or `HEAD` when that is
    /// the working tree or the index.
    fn member_tip(&self, member: &Member) -> Result<CommitId, AppError> {
        let head = self.member_head(member)?;
        if is_virtual(&head) {
            self.resolve(&member.source, "HEAD")
        } else {
            Ok(head)
        }
    }

    /// The commit a repository is read at (its `source`).
    fn member_head(&self, member: &Member) -> Result<CommitId, AppError> {
        self.resolve(&member.source, &member.repo.source)
    }

    /// The two commits of a repository's own range: its `destination` (at the merge base with its
    /// `source`) against its `source`.
    fn member_sides(&self, member: &Member) -> Result<ResolvedRange, AppError> {
        let new = self.member_head(member)?;
        let tip = self.member_tip(member)?;
        // The repository names the error: several repositories share the review.
        let destination = self
            .resolve(&member.source, &member.repo.destination)
            .map_err(|e| match e {
                AppError::UnknownRef(message) => {
                    AppError::UnknownRef(format!("{}: {message}", member.repo.name))
                }
                other => other,
            })?;
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

    /// The member repository serving a prefixed id, with its range and the id without prefix.
    fn locate(&self, id: &NodeId) -> Result<Located, AppError> {
        let unknown = || AppError::UnknownNode(format!("unknown node '{id}'"));
        let name = id.repo().ok_or_else(unknown)?;
        let member = self
            .members()?
            .into_iter()
            .find(|m| m.repo.name == name)
            .ok_or_else(unknown)?;
        let sides = self.member_sides(&member)?;
        Ok(Located {
            member,
            sides,
            local: id.without_repo(),
        })
    }

    pub(crate) fn workspace_code(&self, request: &CodeRequest) -> Result<String, AppError> {
        let at = self.locate(&request.node)?;
        self.code_in(&at.member.source, &at.sides, &at.local, request.side)
    }

    /// What the files of `from` use of `to`, a node of another repository: the import edges of
    /// `from` that a package published by the other repository redirects to a file under `to`.
    /// The edge does not name what is imported, so the names are the symbols that file declares.
    fn cross_repo_wanted(
        &self,
        from: &Located,
        graph: &GraphSnapshot,
        commit: &CommitId,
        to: &Located,
        side: Side,
    ) -> Result<BTreeMap<String, Wanted>, AppError> {
        let to_commit = if side == Side::Head {
            to.sides.new.clone()
        } else {
            to.sides.old.clone()
        };
        let to_graph = self.indexed_snapshot(&to.member.source, &to_commit)?.graph;
        let part = |at: &Located, graph: &GraphSnapshot, commit: &CommitId| {
            Ok::<_, AppError>(Part {
                root: repo_node(
                    &at.member.repo,
                    Self::member_branch(&at.member),
                    &commit.to_string(),
                )?,
                name: at.member.repo.name.clone(),
                graph: graph.clone(),
                published: self.indexer.published_packages(&at.member.source, commit)?,
                calls: Vec::new(),
            })
        };
        let redirect = redirects(&[part(from, graph, commit)?, part(to, &to_graph, &to_commit)?]);
        let within = |g: &GraphSnapshot, id: &NodeId, root: &NodeId| {
            id == root || g.ancestors(id).any(|a| &a.id == root)
        };
        let mut wanted = std::collections::BTreeMap::new();
        for edge in graph.edges().iter().filter(|e| e.kind == EdgeKind::Imports) {
            let Some(path) = edge.from.file_path() else {
                continue;
            };
            let Some(entry) = redirect.get(&prefixed(&edge.to, &from.member.repo.name)?) else {
                continue;
            };
            let entry = entry.without_repo();
            if !within(graph, &edge.from, &from.local) || !within(&to_graph, &entry, &to.local) {
                continue;
            }
            // The names the entry file declares: the edge itself does not name what is imported.
            let bindings = to_graph
                .nodes()
                .iter()
                .filter(|n| n.kind == NodeKind::Symbol && within(&to_graph, &n.id, &entry))
                .filter(|n| {
                    within(&to_graph, &n.id, &to.local) || within(&to_graph, &to.local, &n.id)
                })
                .filter_map(|n| n.id.symbol_key())
                .collect::<Vec<_>>();
            let wanted: &mut Wanted = wanted
                .entry(path.to_owned())
                .or_insert_with(|| Wanted::new(edge.from.file_id()));
            for binding in bindings {
                if !wanted.bindings.contains(&binding) {
                    wanted.bindings.push(binding);
                }
            }
        }
        Ok(wanted)
    }

    pub(crate) fn workspace_edge_usages(
        &self,
        request: &EdgeUsagesRequest,
    ) -> Result<EdgeUsagesResponse, AppError> {
        let from = self.locate(&request.from)?;
        let head = request.side == Side::Head;
        let commit_of = |sides: &ResolvedRange| {
            if head {
                sides.new.clone()
            } else {
                sides.old.clone()
            }
        };
        let source = &from.member.source;
        let commit = commit_of(&from.sides);
        let graph = self.indexed_snapshot(source, &commit)?.graph;
        let wanted = if request.to.repo() == request.from.repo() {
            import_wanted(&graph, &from.local, &request.to.without_repo())
        } else {
            let to = self.locate(&request.to)?;
            self.cross_repo_wanted(&from, &graph, &commit, &to, request.side)?
        };
        let mut response = self.usages_in(source, &commit, wanted)?;
        for file in &mut response.files {
            file.file = prefixed(&file.file, &from.member.repo.name)?;
        }
        Ok(response)
    }

    pub(crate) fn workspace_log(
        &self,
        limit: usize,
        query: Option<&str>,
    ) -> Result<Vec<LogEntry>, AppError> {
        let mut entries = Vec::new();
        for member in self.members()? {
            let tip = self.member_tip(&member)?;
            entries.extend(
                Self::log_of(&member.source, &tip, limit, query)?
                    .into_iter()
                    .map(|entry| LogEntry {
                        repo: Some(member.repo.name.clone()),
                        ..entry
                    }),
            );
        }
        Ok(entries)
    }

    pub(crate) fn workspace_commit_reading(&self) -> Result<CommitReadingResponse, AppError> {
        let mut commits = Vec::new();
        for member in self.members()? {
            let sides = self.member_sides(&member)?;
            for mut commit in self.commit_reading_in(&member.source, &sides)? {
                commit.repo = Some(member.repo.name.clone());
                for file in &mut commit.files {
                    file.id = prefixed(&file.id, &member.repo.name)?;
                }
                commits.push(commit);
            }
        }
        Ok(CommitReadingResponse { commits })
    }

    pub(crate) fn workspace_metrics(&self, since_days: u32) -> Result<MetricsResponse, AppError> {
        let mut nodes = std::collections::BTreeMap::new();
        for member in self.members()? {
            let commit = self.member_head(&member)?;
            for (id, metrics) in self.metrics_of(&member.source, &commit, since_days)?.nodes {
                let id: NodeId = id
                    .parse()
                    .map_err(|e| AppError::Workspace(format!("invalid node id '{id}': {e}")))?;
                nodes.insert(prefixed(&id, &member.repo.name)?.to_string(), metrics);
            }
        }
        Ok(MetricsResponse { since_days, nodes })
    }

    pub(crate) fn workspace_co_change(
        &self,
        since_days: u32,
        min_commits: Option<u32>,
    ) -> Result<CoChangeResponse, AppError> {
        let mut pairs: Vec<CoChangePair> = Vec::new();
        for member in self.members()? {
            let commit = self.member_head(&member)?;
            let name = &member.repo.name;
            let found = self.co_change_of(&member.source, &commit, since_days, min_commits)?;
            pairs.extend(found.pairs.into_iter().map(|p| CoChangePair {
                a: prefixed_path(&p.a, name),
                b: prefixed_path(&p.b, name),
                ..p
            }));
        }
        pairs.sort_by(|x, y| {
            y.commits
                .cmp(&x.commits)
                .then_with(|| x.a.cmp(&y.a))
                .then_with(|| x.b.cmp(&y.b))
        });
        Ok(CoChangeResponse { pairs })
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
                graph: indexed.graph.clone(),
                published: self.indexer.published_packages(&member.source, &commit)?,
                calls: self.indexer.http_calls(&indexed),
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
            let published_base = self
                .indexer
                .published_packages(&member.source, &sides.old)?;
            let published_head = self
                .indexer
                .published_packages(&member.source, &sides.new)?;
            let part = |root: Node,
                        graph: &GraphSnapshot,
                        published: Vec<PublishedPackage>,
                        calls: Vec<HttpCallSite>| Part {
                root,
                name: name.to_owned(),
                graph: graph.clone(),
                published,
                calls,
            };
            let branch = Self::member_branch(&member);
            let root =
                |graph: &GraphSnapshot| repo_node(&member.repo, branch.clone(), graph.commit());
            bases.push(part(
                root(&analysed.base)?,
                &analysed.base,
                published_base,
                analysed.base_calls.clone(),
            ));
            heads.push(part(
                root(&analysed.head)?,
                &analysed.head,
                published_head,
                analysed.head_calls.clone(),
            ));
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
        // Edges to a package another repository publishes now go to its entry file.
        // The heads win over the bases: a removed edge keeps the target it had.
        let mut redirect = redirects(&bases);
        redirect.extend(redirects(&heads));
        for edge in &mut diff.edges {
            if let Some(to) = redirect.get(&edge.to) {
                edge.to = to.clone();
            }
        }
        // The HTTP edges between repositories are not in any repository's own diff.
        let (before, after) = (cross_http(&bases)?, cross_http(&heads)?);
        let key = |e: &Edge| (e.from.clone(), e.to.clone());
        for (edges, other, status) in [
            (&after, &before, EdgeStatus::Added),
            (&before, &after, EdgeStatus::Removed),
        ] {
            let other: HashSet<_> = other.iter().map(key).collect();
            for e in edges.iter().filter(|e| !other.contains(&key(e))) {
                diff.edges.push(EdgeChange {
                    from: e.from.clone(),
                    to: e.to.clone(),
                    kind: EdgeKind::Http,
                    status,
                    commit: None,
                });
            }
        }
        let (base, head) = (unite_with(bases, &redirect)?, unite_with(heads, &redirect)?);
        // The external nodes replaced by a file, and the groups left empty, have no change.
        let kept: HashSet<&NodeId> = base
            .nodes()
            .iter()
            .chain(head.nodes())
            .map(|n| &n.id)
            .collect();
        diff.nodes.retain(|c| {
            !redirect.contains_key(&c.id) && (kept.contains(&c.id) || !is_external_group(&c.id))
        });
        diff.base = bases_text.join("+");
        diff.head = heads_text.join("+");
        Ok(DiffAnalysis {
            base,
            head,
            diff,
            renames,
            base_resolved: resolved.join("+"),
            base_calls: Vec::new(),
            head_calls: Vec::new(),
            warnings,
        })
    }
}

/// The destination the workspace file gives a repository. Before the default followed the
/// repository, relief wrote `main` for every one: on a repository without `main`, that `main`
/// is read as the repository's default destination.
fn file_destination(repo: &WorkspaceRepo, git: &GitSource) -> Result<String, AppError> {
    if repo.destination == "main" && git.resolve("main").is_err() {
        return crate::default_destination(git);
    }
    Ok(repo.destination.clone())
}
