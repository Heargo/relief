//! Seam 2: signature changes in the node diff, on acme-shop
//! (`main...feat/promo-codes`) with the real signature texts of the adapter.
//!
//! Expected shape (to be implemented by green):
//! - `relief_model::SignatureChange { before, after, breaking, reason, internal }`;
//! - `NodeStatus::Modified { body: bool, signature: Option<SignatureChange> }`;
//! - `relief_diff::SignatureTexts { base, head }` (normalised signature text by node id);
//! - `diff_graphs_with_signatures(base, head, files, texts, signatures, compare)`
//!   where `compare: &dyn Fn(&str, &str) -> SignatureVerdict`.

use std::collections::HashMap;
use std::path::Path;

use relief_adapter_api::LanguageAdapter;
use relief_diff::{SignatureTexts, SymbolTexts, diff_graphs_with_signatures};
use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_index::Indexer;
use relief_lang_ts::TsAdapter;
use relief_model::testing::GraphBuilder;
use relief_model::{
    GraphDiff, GraphSnapshot, NodeId, NodeKind, NodeStatus, SignatureChange, SignatureReason,
};
use tempfile::TempDir;

/// Snapshot of `rev` and the normalised signature text of each of its symbols.
fn index(source: &GitSource, rev: &str) -> (GraphSnapshot, HashMap<NodeId, String>) {
    let commit = source.resolve(rev).unwrap();
    let graph = Indexer::new("acme-shop")
        .with_detectors(relief_detect::default_detectors())
        .with_adapter(Box::new(TsAdapter::new()))
        .snapshot(source, &commit)
        .unwrap()
        .graph;
    let mut texts = HashMap::new();
    for entry in source.list_tree(&commit).unwrap() {
        if !(entry.path.ends_with(".ts") || entry.path.ends_with(".tsx")) {
            continue;
        }
        let Some(file) = graph
            .nodes()
            .iter()
            .find(|n| n.kind == NodeKind::File && n.id.file_path() == Some(entry.path.as_str()))
        else {
            continue;
        };
        let bytes = source.read_blob(&entry.blob).unwrap();
        for s in TsAdapter::new().index_file(&entry.path, &bytes).symbols {
            if let Some(sig) = s.signature {
                texts.insert(file.id.clone().symbol(&s.name), sig);
            }
        }
    }
    (graph, texts)
}

fn acme_diff() -> GraphDiff {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(Path::new(dir.path()))
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let (base, base_sigs) = index(&source, "main");
    let (head, head_sigs) = index(&source, "feat/promo-codes");
    let signatures = SignatureTexts {
        base: base_sigs,
        head: head_sigs,
    };
    let adapter = TsAdapter::new();
    diff_graphs_with_signatures(
        &base,
        &head,
        &[],
        &SymbolTexts::default(),
        &signatures,
        &|a, b| adapter.compare_signatures(a, b),
    )
}

fn signature_changes(diff: &GraphDiff) -> Vec<(String, SignatureChange)> {
    diff.nodes
        .iter()
        .filter_map(|c| match &c.status {
            NodeStatus::Modified {
                signature: Some(s), ..
            } => Some((c.id.to_string(), s.clone())),
            _ => None,
        })
        .collect()
}

fn find<'a>(changes: &'a [(String, SignatureChange)], suffix: &str) -> &'a SignatureChange {
    &changes
        .iter()
        .find(|(id, _)| id.ends_with(suffix))
        .unwrap_or_else(|| panic!("no signature change for {suffix}: {changes:?}"))
        .1
}

#[test]
fn acme_promo_codes_changes_exactly_three_signatures() {
    let changes = signature_changes(&acme_diff());
    assert_eq!(changes.len(), 3, "{changes:?}");
}

#[test]
fn session_store_refresh_is_breaking() {
    let changes = signature_changes(&acme_diff());
    let c = find(&changes, "::sym:SessionStore.refresh");
    assert!(c.breaking);
    assert_eq!(c.reason, SignatureReason::ReturnWidenedNull);
    assert_eq!(c.before, "async refresh(token: string): Promise<Session>");
    assert_eq!(
        c.after,
        "async refresh(token: string): Promise<Session | null>"
    );
    assert!(!c.internal);
}

#[test]
fn compute_total_is_compatible() {
    let changes = signature_changes(&acme_diff());
    let c = find(&changes, "::sym:computeTotal");
    assert!(!c.breaking);
    assert_eq!(c.reason, SignatureReason::ParamOptionalAdded);
    assert!(!c.internal);
}

#[test]
fn use_checkout_totals_is_compatible_and_internal() {
    let changes = signature_changes(&acme_diff());
    let c = find(&changes, "::sym:useCheckoutTotals");
    assert!(!c.breaking);
    assert!(c.internal);
}

#[test]
fn signature_only_change_is_modified_without_body() {
    let build = |commit: &str, sig_hash: &str| {
        let mut b = GraphBuilder::new(commit);
        let p = b.package("@acme/api");
        let f = b.file(&p, "src/a.ts");
        b.symbol(&f, "total");
        let snap = b.build();
        let mut nodes = snap.nodes().to_vec();
        for n in &mut nodes {
            if n.kind == NodeKind::Symbol {
                n.content_hash = "same-body".to_owned();
                n.signature_hash = Some(sig_hash.to_owned());
            }
        }
        GraphSnapshot::new(commit.to_owned(), nodes, vec![])
    };
    let id = NodeId::package("@acme/api")
        .file("src/a.ts")
        .symbol("total");
    let signatures = SignatureTexts {
        base: HashMap::from([(
            id.clone(),
            "export function total(a: number): number".to_owned(),
        )]),
        head: HashMap::from([(
            id.clone(),
            "export function total(a: number, b?: number): number".to_owned(),
        )]),
    };
    let adapter = TsAdapter::new();
    let diff = diff_graphs_with_signatures(
        &build("base", "h1"),
        &build("head", "h2"),
        &[],
        &SymbolTexts::default(),
        &signatures,
        &|a, b| adapter.compare_signatures(a, b),
    );
    assert_eq!(diff.nodes.len(), 1);
    match &diff.nodes[0].status {
        NodeStatus::Modified { body, signature } => {
            assert!(!body);
            assert_eq!(
                signature.as_ref().unwrap().reason,
                SignatureReason::ParamOptionalAdded
            );
        }
        other => panic!("unexpected status {other:?}"),
    }
}
