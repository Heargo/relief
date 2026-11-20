//! Seam 1: `format_only_files(&GraphDiff) -> Vec<FileChange>` and
//! `format_only_summary(&GraphDiff) -> FormatOnlySummary { files, lines_added,
//! lines_removed }` (all in `relief_diff`), on `GraphBuilder` snapshots with
//! text-diff line counts passed as `FileChange`s. `GraphDiff` itself does not change.

use relief_diff::{
    FormatOnlySummary, SignatureTexts, SymbolTexts, diff_graphs, diff_graphs_with_signatures,
    format_only_files, format_only_summary,
};
use relief_model::testing::GraphBuilder;
use relief_model::{
    EdgeKind, FileChange, GraphSnapshot, NodeId, SignatureReason, SignatureVerdict,
};

const PKG: &str = "@acme/api";

fn file_change(path: &str, added: u32, removed: u32) -> FileChange {
    FileChange {
        path: path.to_owned(),
        lines_added: added,
        lines_removed: removed,
    }
}

/// Files: `same.ts` and `style.ts` (a symbol each), `body.ts`, `sig.ts`,
/// `grow.ts`, `shrink.ts`, `edge.ts`. Only the listed variations differ.
struct Variation {
    body: &'static str,
    sig: &'static str,
    grow: bool,
    shrink: bool,
    edge: bool,
}

fn graph(commit: &str, v: &Variation) -> GraphSnapshot {
    let mut b = GraphBuilder::new(commit);
    let p = b.package(PKG);
    let target = {
        let f = b.file(&p, "src/target.ts");
        b.symbol(&f, "target")
    };
    for path in [
        "same.ts",
        "style.ts",
        "body.ts",
        "sig.ts",
        "grow.ts",
        "shrink.ts",
        "edge.ts",
    ] {
        let f = b.file(&p, &format!("src/{path}"));
        let s = b.symbol(&f, "main");
        if path == "edge.ts" && v.edge {
            b.edge(&s, &target, EdgeKind::Calls);
        }
        if path == "grow.ts" && v.grow {
            b.symbol(&f, "extra");
        }
        if path == "shrink.ts" && !v.shrink {
            b.symbol(&f, "extra");
        }
    }
    let snap = b.build();
    let mut nodes = snap.nodes().to_vec();
    for n in &mut nodes {
        let id = n.id.to_string();
        if id.ends_with("::file:src/body.ts::sym:main") {
            n.content_hash = v.body.to_owned();
        } else if id.ends_with("::file:src/sig.ts::sym:main") {
            n.signature_hash = Some(v.sig.to_owned());
        }
    }
    GraphSnapshot::new(snap.commit().to_owned(), nodes, snap.edges().to_vec())
}

fn base() -> GraphSnapshot {
    graph(
        "base",
        &Variation {
            body: "h1",
            sig: "s1",
            grow: false,
            shrink: false,
            edge: false,
        },
    )
}

fn head() -> GraphSnapshot {
    graph(
        "head",
        &Variation {
            body: "h2",
            sig: "s2",
            grow: true,
            shrink: true,
            edge: true,
        },
    )
}

fn files() -> Vec<FileChange> {
    vec![
        file_change("src/same.ts", 10, 8),
        file_change("src/style.ts", 3, 3),
        file_change("src/body.ts", 2, 2),
        file_change("src/sig.ts", 1, 1),
        file_change("src/grow.ts", 4, 0),
        file_change("src/shrink.ts", 0, 4),
        file_change("src/edge.ts", 1, 0),
    ]
}

fn diff() -> relief_model::GraphDiff {
    diff_graphs_with_signatures(
        &base(),
        &head(),
        &files(),
        &SymbolTexts::default(),
        &SignatureTexts {
            base: [(
                NodeId::package(PKG).file("src/sig.ts").symbol("main"),
                "f(a: string)".to_owned(),
            )]
            .into(),
            head: [(
                NodeId::package(PKG).file("src/sig.ts").symbol("main"),
                "f(a: number)".to_owned(),
            )]
            .into(),
        },
        &|_, _| SignatureVerdict {
            breaking: true,
            reason: SignatureReason::ReturnChanged,
            equivalent: false,
        },
    )
}

#[test]
fn files_with_no_changed_node_are_format_only_with_their_text_lines() {
    let only = format_only_files(&diff());
    assert_eq!(
        only,
        vec![
            file_change("src/same.ts", 10, 8),
            file_change("src/style.ts", 3, 3)
        ]
    );
}

#[test]
fn a_changed_body_signature_added_removed_symbol_or_edge_is_not_format_only() {
    let only: Vec<String> = format_only_files(&diff())
        .into_iter()
        .map(|f| f.path)
        .collect();
    for path in [
        "src/body.ts",
        "src/sig.ts",
        "src/grow.ts",
        "src/shrink.ts",
        "src/edge.ts",
    ] {
        assert!(!only.contains(&path.to_owned()), "{path} in {only:?}");
    }
}

#[test]
fn the_summary_counts_format_only_files_and_their_ignored_lines_apart() {
    assert_eq!(
        format_only_summary(&diff()),
        FormatOnlySummary {
            files: 2,
            lines_added: 13,
            lines_removed: 11,
        }
    );
}

#[test]
fn a_range_without_format_only_file_has_an_empty_summary() {
    let d = diff_graphs(
        &base(),
        &head(),
        &[file_change("src/body.ts", 2, 2)],
        &SymbolTexts::default(),
    );
    assert!(format_only_files(&d).is_empty());
    assert_eq!(
        format_only_summary(&d),
        FormatOnlySummary {
            files: 0,
            lines_added: 0,
            lines_removed: 0,
        }
    );
}
