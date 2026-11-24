//! SQLite cache of per-file extractions, keyed by (blob oid, adapter name, adapter version).

use std::fs;
use std::path::Path;

use relief_model::{Edge, Node, NodeId};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use relief_adapter_api::Extraction;

const SCHEMA_VERSION: i64 = 5;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Payload {
    /// File node the extraction was made for; ids embed its path.
    file: NodeId,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    warnings: Vec<String>,
    /// Adapter-private file index, kept so linking does not parse the file again.
    #[serde(default)]
    index: Option<String>,
}

impl Payload {
    pub(crate) fn parse(json: &str) -> Option<Self> {
        serde_json::from_str(json).ok()
    }

    pub(crate) fn new(file: &NodeId, extraction: &Extraction, index: Option<String>) -> Self {
        Self {
            file: file.clone(),
            nodes: extraction.nodes.clone(),
            edges: extraction.edges.clone(),
            warnings: extraction.warnings.clone(),
            index,
        }
    }

    /// The extraction and index, rebased under `file` when made for another path.
    pub(crate) fn into_parts(mut self, file: &NodeId) -> (Extraction, Option<String>) {
        if &self.file != file {
            // Same content at another path (a rename): rebase the ids.
            rebase(&mut self, file);
        }
        (
            Extraction {
                nodes: self.nodes,
                edges: self.edges,
                warnings: self.warnings,
                entries: Vec::new(),
            },
            self.index,
        )
    }
}

/// Rewrites the ids equal to the payload's file id, or below it (followed by
/// the symbol separator), to live under `file`.
fn rebase(p: &mut Payload, file: &NodeId) {
    let old = p.file.to_string();
    let new = file.to_string();
    let map = |id: &NodeId| -> NodeId {
        let s = id.to_string();
        let rest = if s == old {
            Some("")
        } else {
            s.strip_prefix(&old).filter(|r| r.starts_with("::sym:"))
        };
        rest.and_then(|r| format!("{new}{r}").parse().ok())
            .unwrap_or_else(|| id.clone())
    };
    for node in &mut p.nodes {
        node.id = map(&node.id);
        node.parent = node.parent.as_ref().map(&map);
    }
    for edge in &mut p.edges {
        edge.from = map(&edge.from);
        edge.to = map(&edge.to);
    }
    p.file = file.clone();
}

pub(crate) struct Cache {
    conn: Connection,
}

impl Cache {
    /// Opens (or recreates) `<dir>/index.sqlite`. The warning says why a
    /// cache was recreated or given up.
    pub(crate) fn open(dir: &Path) -> (Option<Self>, Option<String>) {
        let file = dir.join("index.sqlite");
        let first = fs::create_dir_all(dir)
            .map_err(|e| e.to_string())
            .and_then(|()| Self::init(&file).map_err(|e| e.to_string()));
        match first {
            Ok(cache) => (Some(cache), None),
            Err(reason) => {
                for suffix in ["", "-wal", "-shm", "-journal"] {
                    let mut name = file.clone().into_os_string();
                    name.push(suffix);
                    let _ = fs::remove_file(name);
                }
                match Self::init(&file) {
                    Ok(cache) => (
                        Some(cache),
                        Some(format!("cache unreadable ({reason}), recreated")),
                    ),
                    Err(err) => (
                        None,
                        Some(format!("cache unusable ({reason}; {err}), not used")),
                    ),
                }
            }
        }
    }

    fn init(file: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(file)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get::<_, String>(0))?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version != SCHEMA_VERSION {
            if version != 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "schema version {version}"
                )));
            }
            conn.execute_batch(&format!(
                "CREATE TABLE IF NOT EXISTS file_index (
                    blob TEXT NOT NULL,
                    adapter TEXT NOT NULL,
                    adapter_version INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (blob, adapter, adapter_version)
                );
                PRAGMA user_version = {SCHEMA_VERSION};"
            ))?;
        }
        conn.execute_batch("PRAGMA synchronous = OFF; BEGIN;")?;
        // Fails on a corrupted table.
        conn.query_row("SELECT count(*) FROM file_index", [], |r| {
            r.get::<_, i64>(0)
        })?;
        Ok(Self { conn })
    }

    /// The stored JSON of an extraction, to be parsed with [`Payload::parse`] outside any lock.
    pub(crate) fn get(&self, blob: &str, adapter: &str, version: u32) -> Option<String> {
        self
            .conn
            .query_row(
                "SELECT payload FROM file_index WHERE blob = ?1 AND adapter = ?2 AND adapter_version = ?3",
                params![blob, adapter, version],
                |r| r.get(0),
            )
            .optional()
            .ok()?
    }

    pub(crate) fn put(&self, blob: &str, adapter: &str, version: u32, payload: &Payload) {
        let Ok(json) = serde_json::to_string(payload) else {
            return;
        };
        let _ = self.conn.execute(
            "INSERT OR REPLACE INTO file_index (blob, adapter, adapter_version, payload) VALUES (?1, ?2, ?3, ?4)",
            params![blob, adapter, version, json],
        );
    }

    pub(crate) fn commit(&self) {
        let _ = self.conn.execute_batch("COMMIT;");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use relief_model::{EdgeKind, NodeKind, Precision, Visibility};

    fn id(s: &str) -> NodeId {
        s.parse().unwrap()
    }

    fn node(id: NodeId, parent: Option<NodeId>) -> Node {
        Node {
            id,
            kind: NodeKind::Symbol,
            subkind: "function".to_owned(),
            parent,
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
            is_test: false,
            branch: None,
            labels: None,
        }
    }

    #[test]
    fn rebase_only_touches_ids_under_the_file_not_mere_substrings() {
        let old = id("pkg:p::file:src/a.ts");
        let sibling = id("pkg:p::file:src/a.tsx");
        let sym = id("pkg:p::file:src/a.ts::sym:f");
        let mut payload = Payload {
            file: old.clone(),
            nodes: vec![node(sym.clone(), Some(old.clone()))],
            edges: vec![Edge {
                from: sym,
                to: sibling.clone(),
                kind: EdgeKind::Imports,
                precision: Precision::Resolved,
                heuristic: false,
                count: None,
            }],
            warnings: Vec::new(),
            index: None,
        };
        rebase(&mut payload, &id("pkg:p::file:lib/b.ts"));
        assert_eq!(payload.nodes[0].id, id("pkg:p::file:lib/b.ts::sym:f"));
        assert_eq!(payload.nodes[0].parent, Some(id("pkg:p::file:lib/b.ts")));
        assert_eq!(payload.edges[0].from, id("pkg:p::file:lib/b.ts::sym:f"));
        assert_eq!(payload.edges[0].to, sibling);
    }
}
