//! Seam 3: a single entry point, `diff_graphs_with_options`, computes
//! signatures, renames/moves and format-only files in one `GraphDiff`.
//!
//! Expected shape (to be implemented by green):
//! - `relief_diff::DiffOptions<'a>` implementing `Default`, with public fields
//!   `texts: SymbolTexts`, `signatures: SignatureTexts`, `renames: Vec<FileRename>`
//!   and `compare: Option<&'a dyn Fn(&str, &str) -> SignatureVerdict>`;
//! - `diff_graphs_with_options(base, head, files, &DiffOptions) -> GraphDiff`.

use relief_diff::{
    DiffOptions, FileRename, SignatureTexts, SymbolTexts, diff_graphs_with_options,
    format_only_files,
};
use relief_model::{
    FileChange, GraphSnapshot, Node, NodeId, NodeStatus, SignatureReason, SignatureVerdict,
    testing::GraphBuilder,
};

const PKG: &str = "@acme/web";

fn sym(path: &str, name: &str) -> NodeId {
    NodeId::package(PKG).file(path).symbol(name)
}

/// `files` with `(symbol, content_hash, signature_hash)`.
fn snap(commit: &str, files: &[(&str, &[(&str, &str, &str)])]) -> GraphSnapshot {
    let mut b = GraphBuilder::new(commit);
    let p = b.package(PKG);
    for (path, syms) in files {
        let f = b.file(&p, path);
        for (name, _, _) in *syms {
            b.symbol(&f, name);
        }
    }
    let g = b.build();
    let mut nodes: Vec<Node> = g.nodes().to_vec();
    for n in &mut nodes {
        for (path, syms) in files {
            for (name, content, sig) in *syms {
                if n.id == sym(path, name) {
                    n.content_hash = (*content).to_owned();
                    n.signature_hash = Some((*sig).to_owned());
                }
            }
        }
    }
    GraphSnapshot::new(g.commit().to_owned(), nodes, g.edges().to_vec())
}

fn file_change(path: &str) -> FileChange {
    FileChange {
        path: path.to_owned(),
        lines_added: 2,
        lines_removed: 2,
    }
}

fn texts(pairs: &[(NodeId, &str)]) -> std::collections::HashMap<NodeId, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.clone(), (*v).to_owned()))
        .collect()
}

#[test]
fn one_call_reports_signature_change_move_and_format_only_together() {
    let base = snap(
        "base",
        &[
            ("src/price.ts", &[("price", "c1", "s1")]),
            ("src/utils/format.ts", &[("fmt", "c2", "s2")]),
            ("src/style.ts", &[("style", "c3", "s3")]),
        ],
    );
    let head = snap(
        "head",
        &[
            ("src/price.ts", &[("price", "c1b", "s1b")]),
            ("src/money/format.ts", &[("fmt", "c2", "s2")]),
            ("src/style.ts", &[("style", "c3", "s3")]),
        ],
    );
    let files = [
        file_change("src/price.ts"),
        file_change("src/money/format.ts"),
        file_change("src/style.ts"),
    ];
    let price = sym("src/price.ts", "price");
    let signatures = SignatureTexts {
        base: texts(&[(price.clone(), "price(a: number): number")]),
        head: texts(&[(price.clone(), "price(a: number, b: number): number")]),
    };
    let compare = |_: &str, _: &str| SignatureVerdict {
        breaking: true,
        reason: SignatureReason::ParamOptionalAdded,
        equivalent: false,
    };
    let options = DiffOptions {
        texts: SymbolTexts::default(),
        signatures,
        renames: vec![FileRename {
            from: "src/utils/format.ts".to_owned(),
            to: "src/money/format.ts".to_owned(),
        }],
        compare: Some(&compare),
    };

    let diff = diff_graphs_with_options(&base, &head, &files, &options);

    let price_change = diff.nodes.iter().find(|c| c.id == price).unwrap();
    match &price_change.status {
        NodeStatus::Modified {
            signature: Some(s), ..
        } => {
            assert!(s.breaking);
            assert_eq!(s.reason, SignatureReason::ParamOptionalAdded);
        }
        other => panic!("expected a signature change, got {other:?}"),
    }
    let fmt_new = sym("src/money/format.ts", "fmt");
    let fmt_change = diff.nodes.iter().find(|c| c.id == fmt_new).unwrap();
    assert_eq!(
        fmt_change.status,
        NodeStatus::Moved {
            from: sym("src/utils/format.ts", "fmt"),
            body: false
        }
    );
    assert!(
        !diff
            .nodes
            .iter()
            .any(|c| c.id == sym("src/utils/format.ts", "fmt"))
    );
    let format_only: Vec<String> = format_only_files(&diff)
        .into_iter()
        .map(|f| f.path)
        .collect();
    assert_eq!(format_only, vec!["src/style.ts".to_owned()]);
    assert_eq!(diff.files.len(), 3);
}

#[test]
fn default_options_behave_like_plain_diff() {
    let base = snap("base", &[("src/a.ts", &[("a", "c1", "s1")])]);
    let head = snap("head", &[("src/a.ts", &[("a", "c1b", "s1")])]);
    let diff = diff_graphs_with_options(&base, &head, &[], &DiffOptions::default());
    assert_eq!(diff.base, "base");
    assert_eq!(diff.head, "head");
    assert_eq!(diff.nodes.len(), 1);
    assert_eq!(
        diff.nodes[0].status,
        NodeStatus::Modified {
            body: true,
            signature: None
        }
    );
}
