//! Subgraphs under a node budget: the UI never shows more than a few thousand nodes, so the
//! core sends the levels of the tree that fit, the containers below them closed with the exact
//! number of their children and the edges between them aggregated.

use std::collections::{HashMap, HashSet};

use relief_model::{Edge, EdgeKind, GraphSnapshot, Node, NodeId, Precision};

/// The levels of the tree of `graph` (roots, then their children, ...) that fit in `budget`,
/// plus the direct children of each node of `expand`. A graph that fits is returned whole.
pub fn budgeted(graph: &GraphSnapshot, budget: usize, expand: &[NodeId]) -> GraphSnapshot {
    subgraph(graph, budget, &[], expand)
}

/// The review subgraph: the levels that fit in `budget`, the `focus` nodes (changed nodes), their
/// one-hop neighbours and all their ancestors, plus the children of each node of `expand`.
pub fn review_subgraph(
    graph: &GraphSnapshot,
    budget: usize,
    focus: &[NodeId],
    expand: &[NodeId],
) -> GraphSnapshot {
    subgraph(graph, budget, focus, expand)
}

/// Adds `id` and its ancestors to `kept`.
fn with_ancestors<'a>(graph: &'a GraphSnapshot, id: &NodeId, kept: &mut HashSet<&'a NodeId>) {
    if let Some(node) = graph.node(id) {
        kept.insert(&node.id);
        kept.extend(graph.ancestors(id).map(|a| &a.id));
    }
}

fn subgraph(
    graph: &GraphSnapshot,
    budget: usize,
    focus: &[NodeId],
    expand: &[NodeId],
) -> GraphSnapshot {
    if graph.nodes().len() <= budget {
        return graph.clone();
    }
    let mut children: HashMap<&NodeId, Vec<&NodeId>> = HashMap::new();
    let mut roots: Vec<&NodeId> = Vec::new();
    for node in graph.nodes() {
        match node.parent.as_ref().filter(|p| graph.node(p).is_some()) {
            Some(parent) => children.entry(parent).or_default().push(&node.id),
            None => roots.push(&node.id),
        }
    }
    let mut kept: HashSet<&NodeId> = roots.iter().copied().collect();
    let mut level = roots;
    loop {
        let next: Vec<&NodeId> = level
            .iter()
            .flat_map(|id| children.get(id).into_iter().flatten().copied())
            .collect();
        if next.is_empty() || kept.len() + next.len() > budget {
            break;
        }
        kept.extend(next.iter().copied());
        level = next;
    }
    if !focus.is_empty() {
        let wanted: HashSet<&NodeId> = focus.iter().collect();
        for edge in graph.edges() {
            for (inside, other) in [(&edge.from, &edge.to), (&edge.to, &edge.from)] {
                if wanted.contains(inside) {
                    with_ancestors(graph, other, &mut kept);
                }
            }
        }
        for id in focus {
            with_ancestors(graph, id, &mut kept);
        }
    }
    for id in expand {
        if let Some(node) = graph.node(id) {
            with_ancestors(graph, &node.id, &mut kept);
            kept.extend(children.get(&node.id).into_iter().flatten().copied());
        }
    }

    let nodes: Vec<Node> = graph
        .nodes()
        .iter()
        .filter(|n| kept.contains(&n.id))
        .map(|n| {
            let total = children.get(&n.id).map_or(0, Vec::len);
            let present = children
                .get(&n.id)
                .map_or(0, |c| c.iter().filter(|id| kept.contains(*id)).count());
            let mut node = n.clone();
            node.child_count = (present < total).then_some(total);
            node
        })
        .collect();

    let closed: HashSet<&NodeId> = nodes
        .iter()
        .filter(|n| n.child_count.is_some())
        .map(|n| &n.id)
        .collect();
    // An endpoint outside the subgraph stands for its nearest ancestor inside.
    let lift = |id: &NodeId| -> Option<NodeId> {
        if kept.contains(id) {
            return Some(id.clone());
        }
        graph
            .ancestors(id)
            .find(|a| kept.contains(&a.id))
            .map(|a| a.id.clone())
    };
    let mut edges: Vec<Edge> = Vec::new();
    let mut aggregated: HashMap<(NodeId, NodeId, EdgeKind), usize> = HashMap::new();
    for edge in graph.edges() {
        let (Some(from), Some(to)) = (lift(&edge.from), lift(&edge.to)) else {
            continue;
        };
        if from == to {
            continue;
        }
        let open = |id: &NodeId| !closed.contains(id);
        if from == edge.from && to == edge.to && open(&from) && open(&to) {
            edges.push(edge.clone());
            continue;
        }
        let key = (from, to, edge.kind);
        match aggregated.get(&key) {
            Some(&i) => {
                let count = edges[i].count.unwrap_or(1);
                edges[i].count = Some(count + 1);
            }
            None => {
                aggregated.insert(key.clone(), edges.len());
                edges.push(Edge {
                    from: key.0,
                    to: key.1,
                    kind: key.2,
                    precision: Precision::Syntactic,
                    heuristic: false,
                    count: Some(1),
                });
            }
        }
    }
    GraphSnapshot::new(graph.commit().to_owned(), nodes, edges)
}
