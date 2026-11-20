//! Helpers to build snapshots in tests.

use crate::{Edge, EdgeKind, GraphSnapshot, Node, NodeId, NodeKind, Precision, Visibility};

/// Builds a snapshot in a few lines; `build()` does not validate.
pub struct GraphBuilder {
    commit: String,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
}

impl GraphBuilder {
    pub fn new(commit: &str) -> Self {
        Self {
            commit: commit.to_owned(),
            nodes: Vec::new(),
            edges: Vec::new(),
        }
    }

    fn add(
        &mut self,
        id: NodeId,
        kind: NodeKind,
        subkind: &str,
        parent: Option<&NodeId>,
    ) -> NodeId {
        self.nodes.push(Node {
            id: id.clone(),
            kind,
            subkind: subkind.to_owned(),
            parent: parent.cloned(),
            lang: None,
            span: None,
            visibility: Visibility::Public,
            content_hash: String::new(),
            signature_hash: None,
            metrics: None,
            path: None,
            route: None,
            entry: false,
            entry_type: None,
            child_count: None,
        });
        id
    }

    pub fn package(&mut self, name: &str) -> NodeId {
        self.add(NodeId::package(name), NodeKind::Package, "package", None)
    }

    pub fn file(&mut self, parent: &NodeId, path: &str) -> NodeId {
        self.add(
            parent.clone().file(path),
            NodeKind::File,
            "file",
            Some(parent),
        )
    }

    pub fn symbol(&mut self, parent: &NodeId, name: &str) -> NodeId {
        self.add(
            parent.clone().symbol(name),
            NodeKind::Symbol,
            "symbol",
            Some(parent),
        )
    }

    pub fn edge(&mut self, from: &NodeId, to: &NodeId, kind: EdgeKind) {
        self.edges.push(Edge {
            from: from.clone(),
            to: to.clone(),
            kind,
            precision: Precision::Syntactic,
            heuristic: false,
            count: None,
        });
    }

    pub fn build(self) -> GraphSnapshot {
        GraphSnapshot::new(self.commit, self.nodes, self.edges)
    }
}
