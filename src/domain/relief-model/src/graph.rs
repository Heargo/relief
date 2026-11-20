use std::collections::HashMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Edge, Node, NodeId};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ValidationError {
    #[error("node `{node}` has unknown parent `{parent}`")]
    UnknownParent { node: NodeId, parent: NodeId },
    #[error("edge has unknown source `{0}`")]
    UnknownEdgeSource(NodeId),
    #[error("edge has unknown target `{0}`")]
    UnknownEdgeTarget(NodeId),
}

#[derive(Serialize, Deserialize, Clone, JsonSchema)]
struct Raw {
    commit: String,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
}

/// The graph of a commit: nodes in insertion order and edges.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "Raw", into = "Raw")]
pub struct GraphSnapshot {
    commit: String,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    index: HashMap<NodeId, usize>,
}

impl JsonSchema for GraphSnapshot {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "GraphSnapshot".into()
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        Raw::json_schema(generator)
    }
}

impl From<Raw> for GraphSnapshot {
    fn from(raw: Raw) -> Self {
        Self::new(raw.commit, raw.nodes, raw.edges)
    }
}

impl From<GraphSnapshot> for Raw {
    fn from(s: GraphSnapshot) -> Self {
        Self {
            commit: s.commit,
            nodes: s.nodes,
            edges: s.edges,
        }
    }
}

impl GraphSnapshot {
    pub fn new(commit: String, nodes: Vec<Node>, edges: Vec<Edge>) -> Self {
        let index = nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.id.clone(), i))
            .collect();
        Self {
            commit,
            nodes,
            edges,
            index,
        }
    }

    pub fn commit(&self) -> &str {
        &self.commit
    }

    pub fn nodes(&self) -> &[Node] {
        &self.nodes
    }

    pub fn edges(&self) -> &[Edge] {
        &self.edges
    }

    pub fn node(&self, id: &NodeId) -> Option<&Node> {
        self.index.get(id).and_then(|&i| self.nodes.get(i))
    }

    /// Direct contained nodes, in insertion order.
    pub fn children<'a>(&'a self, id: &'a NodeId) -> impl Iterator<Item = &'a Node> {
        self.nodes
            .iter()
            .filter(move |n| n.parent.as_ref() == Some(id))
    }

    /// Ancestors of a node, parent first.
    pub fn ancestors<'a>(&'a self, id: &NodeId) -> impl Iterator<Item = &'a Node> {
        let mut current = self.node(id).and_then(|n| n.parent.as_ref());
        std::iter::from_fn(move || {
            let node = self.node(current?)?;
            current = node.parent.as_ref();
            Some(node)
        })
    }

    /// Nodes without children, in depth-first order (children in insertion order).
    pub fn leaves(&self) -> impl Iterator<Item = &Node> {
        let mut children: HashMap<&NodeId, Vec<&Node>> = HashMap::new();
        let mut roots: Vec<&Node> = Vec::new();
        for n in &self.nodes {
            match &n.parent {
                Some(p) if self.index.contains_key(p) => children.entry(p).or_default().push(n),
                _ => roots.push(n),
            }
        }
        let mut stack: Vec<&Node> = roots.into_iter().rev().collect();
        let mut leaves = Vec::new();
        while let Some(n) = stack.pop() {
            match children.get(&n.id) {
                Some(kids) => stack.extend(kids.iter().rev()),
                None => leaves.push(n),
            }
        }
        leaves.into_iter()
    }

    /// Checks that every parent and edge endpoint exists.
    pub fn validate(&self) -> Result<(), ValidationError> {
        for node in &self.nodes {
            if let Some(parent) = &node.parent
                && !self.index.contains_key(parent)
            {
                return Err(ValidationError::UnknownParent {
                    node: node.id.clone(),
                    parent: parent.clone(),
                });
            }
        }
        for edge in &self.edges {
            if !self.index.contains_key(&edge.from) {
                return Err(ValidationError::UnknownEdgeSource(edge.from.clone()));
            }
            if !self.index.contains_key(&edge.to) {
                return Err(ValidationError::UnknownEdgeTarget(edge.to.clone()));
            }
        }
        Ok(())
    }
}
