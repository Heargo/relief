//! Diff between two graph snapshots: node statuses and line counts.

use std::collections::{HashMap, HashSet};

mod search;
mod subgraph;

pub use search::rank_search;
pub use subgraph::{budgeted, review_subgraph};

use relief_model::{
    EdgeChange, EdgeKind, EdgeStatus, FileChange, FileRef, FormatOnlyFile, GraphDiff,
    GraphSnapshot, ModuleCoupling, MovedFile, Node, NodeChange, NodeId, NodeKind, NodeStatus,
    OutOfDiffCaller, ReviewSummary, SignatureChange, SignatureReason, SignatureSummary,
    SignatureVerdict, Visibility,
};
pub use relief_model::{FileRename, FormatOnlySummary};

/// Text of each symbol's span, on both sides, supplied by the caller.
#[derive(Debug, Clone, Default)]
pub struct SymbolTexts {
    pub base: HashMap<NodeId, String>,
    pub head: HashMap<NodeId, String>,
}

/// Normalised signature text of each symbol, on both sides, supplied by the caller.
#[derive(Debug, Clone, Default)]
pub struct SignatureTexts {
    pub base: HashMap<NodeId, String>,
    pub head: HashMap<NodeId, String>,
}

/// Files of the diff with no changed node and no changed edge inside.
pub fn format_only_files(diff: &GraphDiff) -> Vec<FileChange> {
    let moved_from = diff.nodes.iter().filter_map(|n| match &n.status {
        NodeStatus::Moved { from, .. } => Some(from),
        _ => None,
    });
    let changed: HashSet<&str> = diff
        .nodes
        .iter()
        .map(|n| &n.id)
        .chain(moved_from)
        .chain(diff.edges.iter().map(|e| &e.from))
        .filter_map(|id| id.file_path())
        .collect();
    diff.files
        .iter()
        .filter(|f| !changed.contains(f.path.as_str()))
        .cloned()
        .collect()
}

/// Counts the [`format_only_files`] and their ignored text lines.
pub fn format_only_summary(diff: &GraphDiff) -> FormatOnlySummary {
    let files = format_only_files(diff);
    FormatOnlySummary {
        files: files.len(),
        lines_added: files.iter().map(|f| f.lines_added).sum(),
        lines_removed: files.iter().map(|f| f.lines_removed).sum(),
    }
}

/// Compares two snapshots by node id and `content_hash`.
///
/// Containers only get an entry when they are themselves added or removed;
/// otherwise their status is derived from their descendants at display time.
pub fn diff_graphs(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    files: &[FileChange],
    texts: &SymbolTexts,
) -> GraphDiff {
    diff_graphs_with_signatures(
        base,
        head,
        files,
        texts,
        &SignatureTexts::default(),
        &|_, _| SignatureVerdict {
            breaking: true,
            reason: SignatureReason::Unspecified,
            equivalent: false,
        },
    )
}

/// Like [`diff_graphs`], with the file renames detected by git: the symbols of
/// a renamed file are `moved` rather than removed and added.
pub fn diff_graphs_with_renames(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    files: &[FileChange],
    texts: &SymbolTexts,
    renames: &[FileRename],
) -> GraphDiff {
    diff_impl(
        base,
        head,
        files,
        texts,
        &SignatureTexts::default(),
        &|_, _| SignatureVerdict {
            breaking: true,
            reason: SignatureReason::Unspecified,
            equivalent: false,
        },
        renames,
    )
}

/// Like [`diff_graphs`], and a symbol whose `signature_hash` changed carries a
/// [`SignatureChange`] built from `signatures` and the adapter's `compare`.
pub fn diff_graphs_with_signatures(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    files: &[FileChange],
    texts: &SymbolTexts,
    signatures: &SignatureTexts,
    compare: &dyn Fn(&str, &str) -> SignatureVerdict,
) -> GraphDiff {
    diff_impl(base, head, files, texts, signatures, compare, &[])
}

/// Judges a change between two normalised signature texts.
pub type SignatureComparer<'a> = &'a dyn Fn(&str, &str) -> SignatureVerdict;

/// Everything optional the diff can take into account, for [`diff_graphs_with_options`].
#[derive(Default)]
pub struct DiffOptions<'a> {
    /// Symbol texts, for the line counts of changed symbols.
    pub texts: SymbolTexts,
    /// Normalised signature texts of both sides.
    pub signatures: SignatureTexts,
    /// File renames detected by git.
    pub renames: Vec<FileRename>,
    /// Judges a signature change; without it every change is breaking.
    pub compare: Option<SignatureComparer<'a>>,
}

/// Single entry point: signatures, renames and moves computed together.
pub fn diff_graphs_with_options(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    files: &[FileChange],
    options: &DiffOptions<'_>,
) -> GraphDiff {
    let breaking = |_: &str, _: &str| SignatureVerdict {
        breaking: true,
        reason: SignatureReason::Unspecified,
        equivalent: false,
    };
    diff_impl(
        base,
        head,
        files,
        &options.texts,
        &options.signatures,
        options.compare.unwrap_or(&breaking),
        &options.renames,
    )
}

/// Moves as `head id -> (base id, body changed)`.
type Moves = HashMap<NodeId, (NodeId, bool)>;

fn symbols(g: &GraphSnapshot) -> impl Iterator<Item = &Node> {
    g.nodes().iter().filter(|n| n.kind == NodeKind::Symbol)
}

fn detect_moves(base: &GraphSnapshot, head: &GraphSnapshot, renames: &[FileRename]) -> Moves {
    let mut moves = Moves::new();
    let mut taken: HashSet<&NodeId> = HashSet::new();
    let gone: Vec<&Node> = symbols(base)
        .filter(|n| head.node(&n.id).is_none())
        .collect();
    let fresh: Vec<&Node> = symbols(head)
        .filter(|n| base.node(&n.id).is_none())
        .collect();

    for n in &fresh {
        let (Some(path), Some(key)) = (n.id.file_path(), n.id.symbol_key()) else {
            continue;
        };
        let from = gone.iter().find(|b| {
            !taken.contains(&b.id)
                && b.id.symbol_key().as_ref() == Some(&key)
                && b.id
                    .file_path()
                    .is_some_and(|bp| renames.iter().any(|r| r.from == bp && r.to == path))
        });
        if let Some(b) = from {
            taken.insert(&b.id);
            moves.insert(
                n.id.clone(),
                (b.id.clone(), b.content_hash != n.content_hash),
            );
        }
    }
    for n in &fresh {
        if moves.contains_key(&n.id) {
            continue;
        }
        let key = n.id.symbol_key();
        let from = gone.iter().find(|b| {
            !taken.contains(&b.id) && b.content_hash == n.content_hash && b.id.symbol_key() == key
        });
        if let Some(b) = from {
            taken.insert(&b.id);
            moves.insert(n.id.clone(), (b.id.clone(), false));
        }
    }
    moves
}

fn diff_impl(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    files: &[FileChange],
    texts: &SymbolTexts,
    signatures: &SignatureTexts,
    compare: &dyn Fn(&str, &str) -> SignatureVerdict,
    renames: &[FileRename],
) -> GraphDiff {
    let mut nodes = Vec::new();
    let moves = detect_moves(base, head, renames);
    let moved_from: HashSet<&NodeId> = moves.values().map(|(from, _)| from).collect();

    for n in head.nodes() {
        match base.node(&n.id) {
            None => {
                if let Some((from, body)) = moves.get(&n.id) {
                    let old = texts.base.get(from).map_or("", String::as_str);
                    let (old, new) = if *body {
                        (old, text(&texts.head, n))
                    } else {
                        ("", "")
                    };
                    let status = NodeStatus::Moved {
                        from: from.clone(),
                        body: *body,
                    };
                    nodes.push(change(n, status, old, new));
                } else {
                    nodes.push(change(n, NodeStatus::Added, "", text(&texts.head, n)));
                }
            }
            Some(b) if n.kind == NodeKind::Symbol => {
                let body = b.content_hash != n.content_hash;
                let texts_of = signatures.base.get(&n.id).zip(signatures.head.get(&n.id));
                let signature = texts_of
                    .filter(|_| b.signature_hash != n.signature_hash)
                    .and_then(|(before, after)| {
                        let v = compare(before, after);
                        (!v.equivalent).then(|| SignatureChange {
                            before: before.to_owned(),
                            after: after.to_owned(),
                            breaking: v.breaking,
                            reason: v.reason,
                            internal: n.visibility == Visibility::Internal,
                        })
                    });
                if body || signature.is_some() {
                    let (old, new) = if body {
                        (text(&texts.base, n), text(&texts.head, n))
                    } else {
                        ("", "")
                    };
                    nodes.push(change(
                        n,
                        NodeStatus::Modified { body, signature },
                        old,
                        new,
                    ));
                }
            }
            Some(_) => {}
        }
    }
    for n in base.nodes() {
        if head.node(&n.id).is_none() && !moved_from.contains(&n.id) {
            nodes.push(change(n, NodeStatus::Removed, text(&texts.base, n), ""));
        }
    }

    GraphDiff {
        base: base.commit().to_owned(),
        head: head.commit().to_owned(),
        nodes,
        files: files.to_vec(),
        edges: diff_edges(base, head, &moves),
    }
}

fn text<'a>(map: &'a HashMap<NodeId, String>, n: &Node) -> &'a str {
    map.get(&n.id).map_or("", String::as_str)
}

fn change(n: &Node, status: NodeStatus, old: &str, new: &str) -> NodeChange {
    let (lines_added, lines_removed) = line_diff(old, new);
    NodeChange {
        id: n.id.clone(),
        status,
        lines_added,
        lines_removed,
    }
}

/// Returns `(added, removed)` line counts, from a longest-common-subsequence.
fn line_diff(old: &str, new: &str) -> (u32, u32) {
    let a: Vec<&str> = old.lines().collect();
    let b: Vec<&str> = new.lines().collect();
    let mut prev = vec![0usize; b.len() + 1];
    for x in &a {
        let mut cur = vec![0usize; b.len() + 1];
        for (j, y) in b.iter().enumerate() {
            cur[j + 1] = if x == y {
                prev[j] + 1
            } else {
                prev[j + 1].max(cur[j])
            };
        }
        prev = cur;
    }
    let common = prev[b.len()];
    let count = |n: usize| u32::try_from(n).unwrap_or(u32::MAX);
    (count(b.len() - common), count(a.len() - common))
}

type EdgeKey<'a> = (&'a NodeId, &'a NodeId, EdgeKind);

fn edge_keys(g: &GraphSnapshot) -> HashSet<EdgeKey<'_>> {
    g.edges().iter().map(|e| (&e.from, &e.to, e.kind)).collect()
}

fn diff_edges(base: &GraphSnapshot, head: &GraphSnapshot, moves: &Moves) -> Vec<EdgeChange> {
    let (before, after) = (edge_keys(base), edge_keys(head));
    let to_head: HashMap<&NodeId, &NodeId> = moves.iter().map(|(h, (b, _))| (b, h)).collect();
    fn arrive<'a>(to_head: &HashMap<&'a NodeId, &'a NodeId>, id: &'a NodeId) -> &'a NodeId {
        to_head.get(id).copied().unwrap_or(id)
    }
    // Removed base edges rewritten onto head ids that head really has.
    let moved: HashSet<EdgeKey<'_>> = base
        .edges()
        .iter()
        .filter(|e| !after.contains(&(&e.from, &e.to, e.kind)))
        .map(|e| (arrive(&to_head, &e.from), arrive(&to_head, &e.to), e.kind))
        .filter(|k| after.contains(k) && !before.contains(k))
        .collect();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (g, other, status) in [
        (head, &before, EdgeStatus::Added),
        (base, &after, EdgeStatus::Removed),
    ] {
        for e in g.edges() {
            let key = (&e.from, &e.to, e.kind);
            let rewritten = if status == EdgeStatus::Added {
                moved.contains(&key)
            } else {
                moved.contains(&(arrive(&to_head, &e.from), arrive(&to_head, &e.to), e.kind))
            };
            if !other.contains(&key)
                && !rewritten
                && seen.insert((key, status == EdgeStatus::Added))
            {
                out.push(EdgeChange {
                    from: e.from.clone(),
                    to: e.to.clone(),
                    kind: e.kind,
                    status,
                    commit: None,
                });
            }
        }
    }
    let mut done = HashSet::new();
    for e in base.edges() {
        let key = (arrive(&to_head, &e.from), arrive(&to_head, &e.to), e.kind);
        if moved.contains(&key) && done.insert(key) {
            out.push(EdgeChange {
                from: key.0.clone(),
                to: key.1.clone(),
                kind: e.kind,
                status: EdgeStatus::Moved,
                commit: None,
            });
        }
    }
    // Stable order: by position of the endpoints in their snapshot's node list.
    // One pass over each node list, for the endpoints of the changed edges only.
    let positions = |g: &GraphSnapshot, removed: bool| {
        let wanted: HashSet<&NodeId> = out
            .iter()
            .filter(|e| (e.status == EdgeStatus::Removed) == removed)
            .flat_map(|e| [&e.from, &e.to])
            .collect();
        let mut found: HashMap<&NodeId, usize> = HashMap::new();
        for (i, n) in g.nodes().iter().enumerate() {
            if let Some(id) = wanted.get(&n.id) {
                found.entry(id).or_insert(i);
            }
        }
        found
    };
    let (in_base, in_head) = (positions(base, true), positions(head, false));
    let keys: Vec<(bool, Option<usize>, Option<usize>)> = out
        .iter()
        .map(|e| {
            let found = if e.status == EdgeStatus::Removed {
                &in_base
            } else {
                &in_head
            };
            (
                e.status == EdgeStatus::Removed,
                found.get(&e.from).copied(),
                found.get(&e.to).copied(),
            )
        })
        .collect();
    let mut order: Vec<usize> = (0..out.len()).collect();
    order.sort_by_key(|&i| keys[i]);
    let mut slots: Vec<Option<EdgeChange>> = out.into_iter().map(Some).collect();
    let out: Vec<EdgeChange> = order.into_iter().filter_map(|i| slots[i].take()).collect();
    out
}

/// Sets `commit` of each added edge to the first snapshot of `commits`
/// (oldest first) that contains it.
pub fn attribute_edge_commits(diff: &mut GraphDiff, commits: &[GraphSnapshot]) {
    let keys: Vec<HashSet<EdgeKey>> = commits.iter().map(edge_keys).collect();
    for e in &mut diff.edges {
        if e.status != EdgeStatus::Added {
            continue;
        }
        let key = (&e.from, &e.to, e.kind);
        e.commit = keys
            .iter()
            .position(|k| k.contains(&key))
            .and_then(|i| commits.get(i))
            .map(|g| g.commit().to_owned());
    }
}

/// Granularity at which edges are aggregated into couplings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    System,
    Module,
    File,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CouplingStatus {
    New,
    Gone,
}

/// A pair of systems, modules or files that became (or stopped being) coupled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CouplingChange {
    pub from: String,
    pub to: String,
    pub status: CouplingStatus,
}

/// Label of a node at `level`; `None` for nodes without a file (externals)
/// at the module and file levels.
fn label(g: &GraphSnapshot, id: &NodeId, level: Level) -> Option<String> {
    match level {
        Level::File => id.file_path().map(str::to_owned),
        Level::Module => id.file_path().map(|p| match p.rsplit_once('/') {
            Some((dir, _)) => dir.to_owned(),
            None => String::new(),
        }),
        Level::System => {
            let node = g.node(id)?;
            let mut top = node;
            for n in std::iter::once(node).chain(g.ancestors(id)) {
                if matches!(n.kind, NodeKind::Service | NodeKind::Package) {
                    return Some(n.id.to_string());
                }
                top = n;
            }
            Some(top.id.to_string())
        }
    }
}

fn pair(g: &GraphSnapshot, from: &NodeId, to: &NodeId, level: Level) -> Option<(String, String)> {
    let (a, b) = (label(g, from, level)?, label(g, to, level)?);
    (a != b).then_some((a, b))
}

fn pairs(g: &GraphSnapshot, level: Level) -> HashSet<(String, String)> {
    g.edges()
        .iter()
        .filter_map(|e| pair(g, &e.from, &e.to, level))
        .collect()
}

/// New and gone couplings at `level`. A pair is new when an added edge
/// carries it and no base edge did; gone when a removed edge carried it and
/// no head edge does.
pub fn coupling_changes(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    diff: &GraphDiff,
    level: Level,
) -> Vec<CouplingChange> {
    let (before, after) = (pairs(base, level), pairs(head, level));
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (status, wanted, g, other) in [
        (EdgeStatus::Added, CouplingStatus::New, head, &before),
        (EdgeStatus::Removed, CouplingStatus::Gone, base, &after),
    ] {
        for e in diff.edges.iter().filter(|e| e.status == status) {
            let Some(p) = pair(g, &e.from, &e.to, level) else {
                continue;
            };
            if !other.contains(&p) && seen.insert((p.clone(), wanted == CouplingStatus::New)) {
                out.push(CouplingChange {
                    from: p.0,
                    to: p.1,
                    status: wanted,
                });
            }
        }
    }
    out
}

/// Which way [`impact`] walks the edges.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Who reaches the seeds (reverse edges).
    Callers,
    /// What the seeds reach (forward edges).
    Dependencies,
}

/// Bounds of an [`impact`] walk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImpactOptions {
    pub max_depth: usize,
    pub follow_http: bool,
}

impl Default for ImpactOptions {
    fn default() -> Self {
        Self {
            max_depth: 8,
            follow_http: true,
        }
    }
}

/// A symbol reached by [`impact`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reached {
    pub node: NodeId,
    pub depth: usize,
    /// Shortest path from the seed to the node's neighbour (seed included, node excluded).
    pub via: Vec<NodeId>,
    /// Kind of the last edge.
    pub kind: EdgeKind,
    /// A test symbol (or test file) has a direct edge to the node.
    pub tested: bool,
}

/// Edge kinds that carry an execution link, in addition to `http` when enabled.
const FOLLOWED: [EdgeKind; 4] = [
    EdgeKind::Calls,
    EdgeKind::Imports,
    EdgeKind::Renders,
    EdgeKind::References,
];

fn is_followed(kind: EdgeKind, options: &ImpactOptions) -> bool {
    FOLLOWED.contains(&kind) || (kind == EdgeKind::Http && options.follow_http)
}

fn is_test_path(path: &str) -> bool {
    path.contains(".spec.") || path.contains(".test.")
}

fn is_test_node(node: &Node) -> bool {
    node.subkind == "test" || node.id.file_path().is_some_and(is_test_path)
}

/// The nodes a test symbol or test file has a direct edge to.
pub fn tested_nodes(snapshot: &GraphSnapshot) -> HashSet<&NodeId> {
    snapshot
        .edges()
        .iter()
        .filter(|edge| snapshot.node(&edge.from).is_some_and(is_test_node))
        .map(|edge| &edge.to)
        .collect()
}

/// Breadth-first closure of the seeds over the followed edges.
///
/// Only non-test symbols are reported (and walked through); the seeds are excluded.
pub fn impact(
    snapshot: &GraphSnapshot,
    seeds: &[NodeId],
    direction: Direction,
    options: &ImpactOptions,
) -> Vec<Reached> {
    let mut adjacency: HashMap<&NodeId, Vec<(&NodeId, EdgeKind)>> = HashMap::new();
    let tested = tested_nodes(snapshot);
    for edge in snapshot.edges() {
        if !is_followed(edge.kind, options) {
            continue;
        }
        let (from, to) = match direction {
            Direction::Callers => (&edge.to, &edge.from),
            Direction::Dependencies => (&edge.from, &edge.to),
        };
        adjacency.entry(from).or_default().push((to, edge.kind));
    }

    // Externals imported by the file of each symbol (`file -> pkg:external/x`).
    let mut file_imports: HashMap<&NodeId, Vec<(&NodeId, EdgeKind)>> = HashMap::new();
    if direction == Direction::Dependencies {
        let mut by_file: HashMap<&NodeId, Vec<(&NodeId, EdgeKind)>> = HashMap::new();
        for edge in snapshot.edges() {
            if edge.kind == EdgeKind::Imports
                && snapshot
                    .node(&edge.to)
                    .is_some_and(|n| n.kind == NodeKind::External)
            {
                by_file
                    .entry(&edge.from)
                    .or_default()
                    .push((&edge.to, edge.kind));
            }
        }
        for node in snapshot.nodes() {
            if node.kind != NodeKind::Symbol {
                continue;
            }
            let mut parent = node.parent.as_ref();
            while let Some(p) = parent {
                let Some(pn) = snapshot.node(p) else { break };
                if pn.kind == NodeKind::File {
                    if let Some(v) = by_file.get(p) {
                        file_imports.insert(&node.id, v.clone());
                    }
                    break;
                }
                parent = pn.parent.as_ref();
            }
        }
    }

    let mut visited: HashSet<&NodeId> = seeds.iter().collect();
    let mut queue: std::collections::VecDeque<(&NodeId, Vec<NodeId>)> =
        seeds.iter().map(|s| (s, vec![s.clone()])).collect();
    let mut reached = Vec::new();
    while let Some((current, path)) = queue.pop_front() {
        if path.len() > options.max_depth {
            continue;
        }
        for &(next, kind) in adjacency.get(current).into_iter().flatten() {
            let Some(node) = snapshot.node(next) else {
                continue;
            };
            if node.kind != NodeKind::Symbol || is_test_node(node) || !visited.insert(next) {
                continue;
            }
            reached.push(Reached {
                node: next.clone(),
                depth: path.len(),
                via: path.clone(),
                kind,
                tested: tested.contains(next),
            });
            let mut next_path = path.clone();
            next_path.push(next.clone());
            queue.push_back((next, next_path));
        }
        if direction == Direction::Dependencies {
            for &(ext, kind) in file_imports.get(&current).into_iter().flatten() {
                if visited.insert(ext) {
                    reached.push(Reached {
                        node: ext.clone(),
                        depth: path.len(),
                        via: path.clone(),
                        kind,
                        tested: tested.contains(ext),
                    });
                }
            }
        }
    }
    reached
}

/// The reached nodes that the range did not touch.
pub fn out_of_diff(diff: &GraphDiff, reached: &[Reached]) -> Vec<Reached> {
    let changed: HashSet<&NodeId> = diff.nodes.iter().map(|n| &n.id).collect();
    reached
        .iter()
        .filter(|r| !changed.contains(&r.node))
        .cloned()
        .collect()
}

/// The structural overview of a range: modified signatures with their callers,
/// callers out of the diff, files by status and module couplings.
pub fn review_summary(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    diff: &GraphDiff,
    renames: &[FileRename],
) -> ReviewSummary {
    let options = ImpactOptions {
        follow_http: false,
        ..ImpactOptions::default()
    };
    let mut signatures = Vec::new();
    let mut out_of_diff_callers: Vec<OutOfDiffCaller> = Vec::new();
    for change in &diff.nodes {
        let NodeStatus::Modified {
            signature: Some(sig),
            ..
        } = &change.status
        else {
            continue;
        };
        let reached = impact(
            head,
            std::slice::from_ref(&change.id),
            Direction::Callers,
            &options,
        );
        signatures.push(SignatureSummary {
            node: change.id.clone(),
            breaking: sig.breaking,
            internal: sig.internal,
            direct_callers: reached.iter().filter(|r| r.depth == 1).count(),
            transitive_callers: reached.len(),
            untested_callers: reached.iter().filter(|r| !r.tested).count(),
        });
        if sig.breaking {
            for r in out_of_diff(diff, &reached)
                .into_iter()
                .filter(|r| r.depth == 1)
            {
                if !out_of_diff_callers.iter().any(|c| c.node == r.node) {
                    out_of_diff_callers.push(OutOfDiffCaller {
                        node: r.node,
                        calls: change.id.clone(),
                        tested: r.tested,
                    });
                }
            }
        }
    }
    signatures.sort_by(|a, b| {
        b.breaking
            .cmp(&a.breaking)
            .then_with(|| a.node.to_string().cmp(&b.node.to_string()))
    });
    out_of_diff_callers.sort_by_key(|c| c.node.to_string());

    let (added_files, removed_files, moved_files, format_only_files) =
        file_groups(base, head, diff, renames);
    let couplings = coupling_changes(base, head, diff, Level::Module);
    let of = |status: CouplingStatus| -> Vec<ModuleCoupling> {
        couplings
            .iter()
            .filter(|c| c.status == status)
            .map(|c| ModuleCoupling {
                from: c.from.clone(),
                to: c.to.clone(),
            })
            .collect()
    };
    ReviewSummary {
        signatures,
        violations: Vec::new(),
        added_files,
        removed_files,
        moved_files,
        format_only_files,
        out_of_diff: out_of_diff_callers,
        couplings_added: of(CouplingStatus::New),
        couplings_removed: of(CouplingStatus::Gone),
    }
}

/// Id of the file node of `path` in `graph`.
fn file_node(graph: &GraphSnapshot, path: &str) -> Option<NodeId> {
    graph
        .nodes()
        .iter()
        .find(|n| n.kind == NodeKind::File && n.id.file_path() == Some(path))
        .map(|n| n.id.clone())
}

type FileGroups = (
    Vec<FileRef>,
    Vec<FileRef>,
    Vec<MovedFile>,
    Vec<FormatOnlyFile>,
);

/// Added, removed, moved and format-only files of the diff, with their node ids.
fn file_groups(
    base: &GraphSnapshot,
    head: &GraphSnapshot,
    diff: &GraphDiff,
    renames: &[FileRename],
) -> FileGroups {
    let moved_to: HashSet<&str> = renames.iter().map(|r| r.to.as_str()).collect();
    let moved_from: HashSet<&str> = renames.iter().map(|r| r.from.as_str()).collect();
    let files = |added: bool, graph: &GraphSnapshot, skip: &HashSet<&str>| {
        let mut files: Vec<FileRef> = diff
            .nodes
            .iter()
            .filter(|c| match c.status {
                NodeStatus::Added => added,
                NodeStatus::Removed => !added,
                _ => false,
            })
            .filter(|c| graph.node(&c.id).is_some_and(|n| n.kind == NodeKind::File))
            .filter_map(|c| {
                let path = c.id.file_path()?;
                (!skip.contains(path)).then(|| FileRef {
                    path: path.to_owned(),
                    node: c.id.clone(),
                })
            })
            .collect();
        files.sort_by(|a, b| a.path.cmp(&b.path));
        files.dedup_by(|a, b| a.path == b.path);
        files
    };
    let moved = renames
        .iter()
        .filter_map(|r| {
            Some(MovedFile {
                from: r.from.clone(),
                to: r.to.clone(),
                node: file_node(head, &r.to)?,
            })
        })
        .collect();
    let format_only = format_only_files(diff)
        .into_iter()
        .filter_map(|f| {
            Some(FormatOnlyFile {
                node: file_node(head, &f.path).or_else(|| file_node(base, &f.path))?,
                path: f.path,
                lines_added: f.lines_added,
                lines_removed: f.lines_removed,
            })
        })
        .collect();
    (
        files(true, head, &moved_to),
        files(false, base, &moved_from),
        moved,
        format_only,
    )
}

/// What a reading order lists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Granularity {
    File,
    Symbol,
}

/// A fact about a changed file or symbol, for its line in the reading list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadingReason {
    BreakingSignature,
    ModifiedSignature,
    Violation,
    New,
    Removed,
    MovedIdentical,
    Lines { added: u32, removed: u32 },
}

/// A file or symbol to read, with the reasons to read it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadingItem {
    pub id: NodeId,
    pub reasons: Vec<ReadingReason>,
}

/// The reading list of one commit of a range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitReading {
    pub commit: String,
    pub files: Vec<ReadingItem>,
    pub other_files: usize,
}

/// Paths of the old locations of moved files: gone from `head`.
fn moved_old_paths<'a>(diff: &'a GraphDiff, head: &GraphSnapshot) -> HashSet<&'a str> {
    diff.nodes
        .iter()
        .filter_map(|n| match &n.status {
            NodeStatus::Moved { from, .. } => from.file_path(),
            _ => None,
        })
        .filter(|p| file_node(head, p).is_none())
        .collect()
}

fn signature_reasons<'a>(
    changes: impl Iterator<Item = &'a NodeChange>,
    out: &mut Vec<ReadingReason>,
) {
    let mut modified = false;
    let mut breaking = false;
    for c in changes {
        if let NodeStatus::Modified {
            signature: Some(s), ..
        } = &c.status
        {
            modified = true;
            breaking |= s.breaking;
        }
    }
    if breaking {
        out.push(ReadingReason::BreakingSignature);
    } else if modified {
        out.push(ReadingReason::ModifiedSignature);
    }
}

fn lines_reason(added: u32, removed: u32, out: &mut Vec<ReadingReason>) {
    if added > 0 || removed > 0 {
        out.push(ReadingReason::Lines { added, removed });
    }
}

/// Changed files or symbols in reading order: dependencies first (edges of
/// `head` between changed items), ties and cycles broken by the smallest path
/// (symbols: file path, then name). Format-only files and the old locations of
/// moved files are left out.
pub fn reading_order(
    diff: &GraphDiff,
    head: &GraphSnapshot,
    granularity: Granularity,
) -> Vec<ReadingItem> {
    let format_only: HashSet<String> = format_only_files(diff)
        .into_iter()
        .map(|f| f.path)
        .collect();
    let old_paths = moved_old_paths(diff, head);
    let paths: Vec<&str> = diff
        .files
        .iter()
        .map(|f| f.path.as_str())
        .filter(|p| !format_only.contains(*p) && !old_paths.contains(p))
        .collect();

    // (sort key, item) of every entry to read.
    let mut entries: Vec<((String, String), ReadingItem)> = Vec::new();
    match granularity {
        Granularity::File => {
            for path in &paths {
                let in_file: Vec<&NodeChange> = diff
                    .nodes
                    .iter()
                    .filter(|n| n.id.file_path() == Some(path))
                    .collect();
                let Some(id) = file_node(head, path).or_else(|| {
                    in_file
                        .iter()
                        .find(|n| n.id.symbol_key().is_none())
                        .map(|n| n.id.clone())
                }) else {
                    continue;
                };
                let symbols: Vec<&NodeChange> = in_file
                    .iter()
                    .copied()
                    .filter(|n| n.id.symbol_key().is_some())
                    .collect();
                let moved_identical = !symbols.is_empty()
                    && symbols
                        .iter()
                        .all(|n| matches!(n.status, NodeStatus::Moved { body: false, .. }));
                let file_status = in_file
                    .iter()
                    .find(|n| n.id.symbol_key().is_none())
                    .map(|n| &n.status);
                let mut reasons = Vec::new();
                signature_reasons(symbols.iter().copied(), &mut reasons);
                if moved_identical {
                    reasons.push(ReadingReason::MovedIdentical);
                } else if matches!(file_status, Some(NodeStatus::Added)) {
                    reasons.push(ReadingReason::New);
                } else if matches!(file_status, Some(NodeStatus::Removed)) {
                    reasons.push(ReadingReason::Removed);
                } else if let Some(f) = diff.files.iter().find(|f| f.path == *path) {
                    lines_reason(f.lines_added, f.lines_removed, &mut reasons);
                }
                entries.push((
                    ((*path).to_owned(), String::new()),
                    ReadingItem { id, reasons },
                ));
            }
        }
        Granularity::Symbol => {
            for c in &diff.nodes {
                let (Some(path), Some(name)) = (c.id.file_path(), c.id.symbol_key()) else {
                    continue;
                };
                if !paths.contains(&path) {
                    continue;
                }
                let mut reasons = Vec::new();
                signature_reasons(std::iter::once(c), &mut reasons);
                match &c.status {
                    NodeStatus::Added => {
                        reasons.push(ReadingReason::New);
                        lines_reason(c.lines_added, c.lines_removed, &mut reasons);
                    }
                    NodeStatus::Removed => {
                        reasons.push(ReadingReason::Removed);
                        lines_reason(c.lines_added, c.lines_removed, &mut reasons);
                    }
                    NodeStatus::Moved { body: false, .. } => {
                        reasons.push(ReadingReason::MovedIdentical);
                    }
                    _ => lines_reason(c.lines_added, c.lines_removed, &mut reasons),
                }
                entries.push((
                    (path.to_owned(), name),
                    ReadingItem {
                        id: c.id.clone(),
                        reasons,
                    },
                ));
            }
        }
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    entries.dedup_by(|a, b| a.0 == b.0);

    // deps[i]: indices that must be read before entry i.
    let index_of: HashMap<&(String, String), usize> =
        entries.iter().enumerate().map(|(i, e)| (&e.0, i)).collect();
    let key_of = |id: &NodeId| -> Option<(String, String)> {
        let path = id.file_path()?.to_owned();
        match granularity {
            Granularity::File => Some((path, String::new())),
            Granularity::Symbol => Some((path, id.symbol_key()?)),
        }
    };
    let mut deps: Vec<HashSet<usize>> = vec![HashSet::new(); entries.len()];
    for e in head.edges() {
        let (Some(from), Some(to)) = (key_of(&e.from), key_of(&e.to)) else {
            continue;
        };
        if let (Some(&f), Some(&t)) = (index_of.get(&from), index_of.get(&to))
            && f != t
        {
            deps[f].insert(t);
        }
    }

    // Entries are sorted by key, so the smallest index is the smallest key.
    let mut done = vec![false; entries.len()];
    let mut order = Vec::with_capacity(entries.len());
    while order.len() < entries.len() {
        let next = (0..entries.len())
            .find(|&i| !done[i] && deps[i].iter().all(|&d| done[d]))
            .or_else(|| (0..entries.len()).find(|&i| !done[i]));
        let Some(i) = next else { break };
        done[i] = true;
        order.push(i);
    }
    let mut items: Vec<Option<ReadingItem>> = entries.into_iter().map(|e| Some(e.1)).collect();
    order.into_iter().filter_map(|i| items[i].take()).collect()
}

/// The reading list of each commit, given `(diff, head snapshot)` per commit,
/// oldest first: the files with a structural change in reading order, and the
/// count of the other files of the commit.
pub fn reading_by_commit(steps: &[(GraphDiff, GraphSnapshot)]) -> Vec<CommitReading> {
    steps
        .iter()
        .map(|(diff, head)| CommitReading {
            commit: diff.head.clone(),
            files: reading_order(diff, head, Granularity::File),
            other_files: format_only_files(diff).len(),
        })
        .collect()
}
