use relief_model::{GraphSnapshot, NodeId, NodeKind};

/// The ids of the nodes whose name matches `query`, best match first, at most `limit`.
///
/// The query is trimmed and lowercased; an empty one finds nothing. Rank 0: the name or the label
/// equals the query; 1: starts with it; 2: the label contains it; 3: the whole id contains it.
/// Ties keep the order of the snapshot.
pub fn rank_search(graph: &GraphSnapshot, query: &str, limit: usize) -> Vec<NodeId> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Vec::new();
    }
    let mut ranked: Vec<(u8, usize)> = Vec::new();
    for (order, node) in graph.nodes().iter().enumerate() {
        if matches!(node.kind, NodeKind::Repo | NodeKind::External) {
            continue;
        }
        let id = node.id.to_string().to_lowercase();
        let label = id.rsplit("::").next().unwrap_or(&id);
        let label = label.split_once(':').map_or(label, |(_, rest)| rest);
        let name = label.rsplit(['.', '/']).next().unwrap_or(label);
        let rank = if name == query || label == query {
            0
        } else if name.starts_with(&query) || label.starts_with(&query) {
            1
        } else if label.contains(&query) {
            2
        } else if id.contains(&query) {
            3
        } else {
            continue;
        };
        ranked.push((rank, order));
    }
    ranked.sort_unstable();
    ranked
        .into_iter()
        .take(limit)
        .map(|(_, order)| graph.nodes()[order].id.clone())
        .collect()
}
