//! Evaluation of the rules on the head graph of a range.

use std::collections::{HashMap, HashSet};

use globset::GlobMatcher;
use relief_model::{
    Edge, EdgeKind, EdgeStatus, GraphDiff, GraphSnapshot, NodeId, Violation, ViolationEdge,
};

use crate::{Config, Rule};

fn matcher(pattern: &str) -> Option<GlobMatcher> {
    globset::GlobBuilder::new(pattern)
        .literal_separator(true)
        .build()
        .ok()
        .map(|g| g.compile_matcher())
}

fn is_symbol(id: &NodeId) -> bool {
    id.symbol_key().is_some()
}

/// The edges of `head` that a rule denies, `introduced` when the range adds them.
///
/// One violation per (rule, source file, target node): a symbol-level edge is
/// preferred to the import of its file.
pub fn violations(config: &Config, head: &GraphSnapshot, diff: &GraphDiff) -> Vec<Violation> {
    let added: HashSet<(&NodeId, &NodeId, EdgeKind)> = diff
        .edges
        .iter()
        .filter(|c| c.status == EdgeStatus::Added)
        .map(|c| (&c.from, &c.to, c.kind))
        .collect();
    let mut out = Vec::new();
    for rule in &config.rules {
        let (Some(from), Some(deny)) = (matcher(&rule.from), matcher(&rule.deny)) else {
            continue;
        };
        out.extend(evaluate(rule, &from, &deny, head, &added));
    }
    out
}

fn evaluate(
    rule: &Rule,
    from: &GlobMatcher,
    deny: &GlobMatcher,
    head: &GraphSnapshot,
    added: &HashSet<(&NodeId, &NodeId, EdgeKind)>,
) -> Vec<Violation> {
    let mut chosen: HashMap<(String, &NodeId), &Edge> = HashMap::new();
    let mut order = Vec::new();
    for edge in head.edges() {
        if !rule.kinds.contains(&edge.kind) {
            continue;
        }
        let (Some(from_path), Some(to_path)) = (edge.from.file_path(), edge.to.file_path()) else {
            continue;
        };
        if !from.is_match(from_path) || !deny.is_match(to_path) {
            continue;
        }
        let key = (from_path.to_owned(), &edge.to);
        match chosen.get(&key) {
            None => {
                order.push(key.clone());
                chosen.insert(key, edge);
            }
            Some(kept) if !is_symbol(&kept.from) && is_symbol(&edge.from) => {
                chosen.insert(key, edge);
            }
            Some(_) => {}
        }
    }
    order
        .iter()
        .filter_map(|key| chosen.get(key))
        .map(|edge| Violation {
            rule: rule.id.clone(),
            edge: ViolationEdge {
                from: edge.from.clone(),
                to: edge.to.clone(),
                kind: edge.kind,
            },
            introduced: added.contains(&(&edge.from, &edge.to, edge.kind)),
        })
        .collect()
}
