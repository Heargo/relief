use std::collections::HashMap;

use relief_diff::{SymbolTexts, diff_graphs};
use relief_model::testing::GraphBuilder;
use relief_model::{FileChange, GraphDiff, GraphSnapshot, NodeChange, NodeId, NodeStatus, Span};

/// Sets the content hash and span of a node (GraphBuilder leaves them empty).
fn with_node(
    snap: GraphSnapshot,
    id: &NodeId,
    hash: &str,
    span: Option<(u32, u32)>,
) -> GraphSnapshot {
    let mut nodes = snap.nodes().to_vec();
    for n in &mut nodes {
        if &n.id == id {
            n.content_hash = hash.to_owned();
            n.span = span.map(|(s, e)| Span {
                start_line: s,
                end_line: e,
            });
        }
    }
    GraphSnapshot::new(snap.commit().to_owned(), nodes, snap.edges().to_vec())
}

fn status_of<'a>(diff: &'a GraphDiff, id: &NodeId) -> Option<&'a NodeChange> {
    diff.nodes.iter().find(|c| &c.id == id)
}

fn pkg() -> NodeId {
    NodeId::package("@acme/api")
}

fn file(path: &str) -> NodeId {
    pkg().file(path)
}

fn sym(path: &str, name: &str) -> NodeId {
    file(path).symbol(name)
}

/// base: a.ts { kept, gone, body }. head: a.ts { kept, body (other hash), fresh }.
fn base_and_head() -> (GraphSnapshot, GraphSnapshot) {
    let mut b = GraphBuilder::new("base");
    let p = b.package("@acme/api");
    let f = b.file(&p, "src/a.ts");
    b.symbol(&f, "kept");
    b.symbol(&f, "gone");
    b.symbol(&f, "body");
    let mut base = b.build();
    for (n, h) in [("kept", "h-kept"), ("gone", "h-gone"), ("body", "h-body-1")] {
        base = with_node(base, &sym("src/a.ts", n), h, None);
    }

    let mut b = GraphBuilder::new("head");
    let p = b.package("@acme/api");
    let f = b.file(&p, "src/a.ts");
    b.symbol(&f, "kept");
    b.symbol(&f, "body");
    b.symbol(&f, "fresh");
    let mut head = b.build();
    for (n, h) in [
        ("kept", "h-kept"),
        ("body", "h-body-2"),
        ("fresh", "h-fresh"),
    ] {
        head = with_node(head, &sym("src/a.ts", n), h, None);
    }
    (base, head)
}

fn modified_file() -> Vec<FileChange> {
    vec![FileChange {
        path: "src/a.ts".to_owned(),
        lines_added: 7,
        lines_removed: 3,
    }]
}

#[test]
fn added_symbol_is_added() {
    let (base, head) = base_and_head();
    let diff = diff_graphs(&base, &head, &modified_file(), &SymbolTexts::default());
    let c = status_of(&diff, &sym("src/a.ts", "fresh")).unwrap();
    assert_eq!(c.status, NodeStatus::Added);
}

#[test]
fn removed_symbol_is_removed() {
    let (base, head) = base_and_head();
    let diff = diff_graphs(&base, &head, &modified_file(), &SymbolTexts::default());
    let c = status_of(&diff, &sym("src/a.ts", "gone")).unwrap();
    assert_eq!(c.status, NodeStatus::Removed);
}

#[test]
fn symbol_with_new_content_hash_is_modified_body() {
    let (base, head) = base_and_head();
    let diff = diff_graphs(&base, &head, &modified_file(), &SymbolTexts::default());
    let c = status_of(&diff, &sym("src/a.ts", "body")).unwrap();
    assert_eq!(
        c.status,
        NodeStatus::Modified {
            body: true,
            signature: None
        }
    );
}

#[test]
fn unchanged_symbol_and_untouched_containers_have_no_entry() {
    let (base, head) = base_and_head();
    let diff = diff_graphs(&base, &head, &modified_file(), &SymbolTexts::default());
    assert!(status_of(&diff, &sym("src/a.ts", "kept")).is_none());
    assert!(status_of(&diff, &file("src/a.ts")).is_none());
    assert!(status_of(&diff, &pkg()).is_none());
    assert_eq!(diff.nodes.len(), 3);
}

#[test]
fn identical_snapshots_give_an_empty_diff() {
    let (base, _) = base_and_head();
    let diff = diff_graphs(&base, &base, &[], &SymbolTexts::default());
    assert!(diff.nodes.is_empty());
    assert_eq!(diff.base, "base");
    assert_eq!(diff.head, "base");
}

#[test]
fn added_file_and_all_its_symbols_are_added() {
    let mut b = GraphBuilder::new("base");
    b.package("@acme/api");
    let base = b.build();

    let mut b = GraphBuilder::new("head");
    let p = b.package("@acme/api");
    let f = b.file(&p, "src/new.ts");
    b.symbol(&f, "one");
    b.symbol(&f, "two");
    let head = b.build();

    let files = vec![FileChange {
        path: "src/new.ts".to_owned(),
        lines_added: 12,
        lines_removed: 0,
    }];
    let diff = diff_graphs(&base, &head, &files, &SymbolTexts::default());

    for id in [
        file("src/new.ts"),
        sym("src/new.ts", "one"),
        sym("src/new.ts", "two"),
    ] {
        assert_eq!(status_of(&diff, &id).unwrap().status, NodeStatus::Added);
    }
    assert!(status_of(&diff, &pkg()).is_none());
    assert_eq!(diff.nodes.len(), 3);
}

#[test]
fn added_package_is_added_with_its_content() {
    let base = GraphBuilder::new("base").build();
    let mut b = GraphBuilder::new("head");
    let p = b.package("@acme/api");
    let f = b.file(&p, "src/a.ts");
    b.symbol(&f, "s");
    let head = b.build();
    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());
    assert_eq!(status_of(&diff, &pkg()).unwrap().status, NodeStatus::Added);
    assert_eq!(diff.nodes.len(), 3);
}

#[test]
fn removed_file_and_its_symbols_are_removed() {
    let mut b = GraphBuilder::new("base");
    let p = b.package("@acme/api");
    let f = b.file(&p, "src/old.ts");
    b.symbol(&f, "s");
    let base = b.build();
    let mut b = GraphBuilder::new("head");
    b.package("@acme/api");
    let head = b.build();

    let diff = diff_graphs(&base, &head, &[], &SymbolTexts::default());
    assert_eq!(
        status_of(&diff, &file("src/old.ts")).unwrap().status,
        NodeStatus::Removed
    );
    assert_eq!(
        status_of(&diff, &sym("src/old.ts", "s")).unwrap().status,
        NodeStatus::Removed
    );
    assert_eq!(diff.nodes.len(), 2);
}

#[test]
fn file_line_counts_come_from_the_given_file_changes() {
    let (base, head) = base_and_head();
    let diff = diff_graphs(&base, &head, &modified_file(), &SymbolTexts::default());
    assert_eq!(diff.files.len(), 1);
    assert_eq!(diff.files[0].path, "src/a.ts");
    assert_eq!(diff.files[0].lines_added, 7);
    assert_eq!(diff.files[0].lines_removed, 3);
}

#[test]
fn symbol_line_counts_come_from_the_span_texts() {
    let (base, head) = base_and_head();
    let base = with_node(base, &sym("src/a.ts", "body"), "h-body-1", Some((1, 3)));
    let head = with_node(head, &sym("src/a.ts", "body"), "h-body-2", Some((1, 4)));
    let head = with_node(head, &sym("src/a.ts", "fresh"), "h-fresh", Some((6, 8)));
    let base = with_node(base, &sym("src/a.ts", "gone"), "h-gone", Some((5, 6)));

    let mut texts = SymbolTexts {
        base: HashMap::new(),
        head: HashMap::new(),
    };
    texts
        .base
        .insert(sym("src/a.ts", "body"), "a\nb\nc\n".to_owned());
    texts
        .head
        .insert(sym("src/a.ts", "body"), "a\nB\nc\nd\n".to_owned());
    texts
        .head
        .insert(sym("src/a.ts", "fresh"), "x\ny\nz\n".to_owned());
    texts
        .base
        .insert(sym("src/a.ts", "gone"), "p\nq\n".to_owned());

    let diff = diff_graphs(&base, &head, &modified_file(), &texts);

    let m = status_of(&diff, &sym("src/a.ts", "body")).unwrap();
    assert_eq!((m.lines_added, m.lines_removed), (2, 1));
    let a = status_of(&diff, &sym("src/a.ts", "fresh")).unwrap();
    assert_eq!((a.lines_added, a.lines_removed), (3, 0));
    let r = status_of(&diff, &sym("src/a.ts", "gone")).unwrap();
    assert_eq!((r.lines_added, r.lines_removed), (0, 2));
}

#[test]
fn node_change_json_shape() {
    let added = NodeChange {
        id: sym("src/a.ts", "fresh"),
        status: NodeStatus::Added,
        lines_added: 3,
        lines_removed: 0,
    };
    let modified = NodeChange {
        id: sym("src/a.ts", "body"),
        status: NodeStatus::Modified {
            body: true,
            signature: None,
        },
        lines_added: 2,
        lines_removed: 1,
    };
    assert_eq!(
        serde_json::to_value(&added).unwrap(),
        serde_json::json!({
            "id": "pkg:@acme/api::file:src/a.ts::sym:fresh",
            "status": "added",
            "linesAdded": 3,
            "linesRemoved": 0
        })
    );
    assert_eq!(
        serde_json::to_value(&modified).unwrap(),
        serde_json::json!({
            "id": "pkg:@acme/api::file:src/a.ts::sym:body",
            "status": "modified",
            "body": true,
            "linesAdded": 2,
            "linesRemoved": 1
        })
    );
}

#[test]
fn graph_diff_json_round_trips_and_has_a_schema() {
    let (base, head) = base_and_head();
    let diff = diff_graphs(&base, &head, &modified_file(), &SymbolTexts::default());
    let json = serde_json::to_string(&diff).unwrap();
    let back: GraphDiff = serde_json::from_str(&json).unwrap();
    assert_eq!(back, diff);

    let v = serde_json::to_value(&diff).unwrap();
    assert_eq!(v["base"], "base");
    assert_eq!(v["head"], "head");
    assert_eq!(v["files"][0]["linesAdded"], 7);
    assert_eq!(v["files"][0]["linesRemoved"], 3);

    let schema = schemars::schema_for!(GraphDiff);
    assert!(
        serde_json::to_string(&schema)
            .unwrap()
            .contains("NodeChange")
    );
}
