//! Seam 1: `TsAdapter::index_file(path, bytes)` and its `refs`.
//!
//! Expected shape of the contract (to be implemented by green):
//! `FileIndex.refs: Vec<Ref>` with
//! `Ref { from: String, name: String, kind: relief_model::EdgeKind, weight: u32 }`.
//!
//! - `from` is the name of the enclosing symbol (`Class.method` for a method).
//! - `name` is the target as written: `helper` for `helper()`, `Card` for
//!   `<Card />`, `A` for a type `A`. For a member call, `Class.method` when
//!   the receiver is a local `const x = new Class()`, and `recv.method` when
//!   the receiver is an imported identifier; any other receiver (parameter,
//!   member chain) is ignored.
//! - `weight` is the number of occurrences: duplicates are merged.
//! - Refs are in source order of their first occurrence.

use relief_lang_ts::{FileIndex, TsAdapter};
use relief_model::EdgeKind;

fn index(path: &str, source: &str) -> FileIndex {
    TsAdapter::new().index_file(path, source.as_bytes())
}

fn refs(index: &FileIndex, kind: EdgeKind) -> Vec<(String, String, u32)> {
    index
        .refs
        .iter()
        .filter(|r| r.kind == kind)
        .map(|r| (r.from.clone(), r.name.clone(), r.weight))
        .collect()
}

fn r(from: &str, name: &str, weight: u32) -> (String, String, u32) {
    (from.to_owned(), name.to_owned(), weight)
}

#[test]
fn a_simple_call_is_a_calls_ref_from_the_enclosing_symbol() {
    let index = index(
        "src/a.ts",
        "function b() {}\nexport function a() {\n  return b();\n}\n",
    );
    assert_eq!(refs(&index, EdgeKind::Calls), vec![r("a", "b", 1)]);
}

#[test]
fn a_call_in_a_method_comes_from_class_dot_method() {
    let index = index(
        "src/a.ts",
        "function helper() {}\nexport class C {\n  run() {\n    helper();\n  }\n}\n",
    );
    assert_eq!(refs(&index, EdgeKind::Calls), vec![r("C.run", "helper", 1)]);
}

#[test]
fn duplicate_calls_are_merged_into_a_weight() {
    let index = index(
        "src/a.ts",
        "function b() {}\nfunction c() {}\nexport function a() {\n  b();\n  c();\n  b();\n  b();\n}\n",
    );
    assert_eq!(
        refs(&index, EdgeKind::Calls),
        vec![r("a", "b", 3), r("a", "c", 1)]
    );
}

#[test]
fn a_method_call_on_a_local_instance_of_a_known_class_targets_the_method() {
    let index = index(
        "src/a.ts",
        "class Store {\n  run() {}\n}\nconst store = new Store();\nexport function go() {\n  store.run();\n}\n",
    );
    assert_eq!(refs(&index, EdgeKind::Calls), vec![r("go", "Store.run", 1)]);
}

#[test]
fn a_method_call_on_an_imported_instance_keeps_the_receiver_name() {
    let index = index(
        "src/a.ts",
        "import { sessions } from \"./session\";\nexport async function go(t: string) {\n  return sessions.refresh(t);\n}\n",
    );
    assert_eq!(
        refs(&index, EdgeKind::Calls),
        vec![r("go", "sessions.refresh", 1)]
    );
}

#[test]
fn a_method_call_on_an_unknown_receiver_is_ignored() {
    let index = index(
        "src/a.ts",
        "export function go(p: { run(): void }, req: any) {\n  p.run();\n  req.headers.authorization.replace(\"a\", \"b\");\n  [1].map((x) => x);\n}\n",
    );
    assert_eq!(refs(&index, EdgeKind::Calls), vec![]);
}

#[test]
fn a_jsx_element_with_a_capital_letter_is_a_renders_ref() {
    let index = index(
        "src/Page.tsx",
        "import { Card } from \"./Card\";\nfunction Layout({ children }: any) {\n  return <main>{children}</main>;\n}\nexport function Page() {\n  return (\n    <Layout>\n      <Card title=\"a\" />\n      <Card title=\"b\" />\n      <div />\n    </Layout>\n  );\n}\n",
    );
    assert_eq!(
        refs(&index, EdgeKind::Renders),
        vec![r("Page", "Layout", 1), r("Page", "Card", 2)]
    );
    assert_eq!(refs(&index, EdgeKind::Calls), vec![]);
}

#[test]
fn types_in_signatures_and_bodies_are_references() {
    let index = index(
        "src/a.ts",
        "import type { A, B, C, D } from \"./types\";\nexport function f(a: A[], b: Promise<B>): C | null {\n  const d = {} as D;\n  return null;\n}\n",
    );
    let found = refs(&index, EdgeKind::References);
    for name in ["A", "B", "C", "D"] {
        assert!(
            found.contains(&r("f", name, 1)),
            "missing reference to {name}: {found:?}"
        );
    }
}

#[test]
fn a_type_used_twice_is_one_reference_with_weight_two() {
    let index = index(
        "src/a.ts",
        "import type { Line } from \"./types\";\nexport function total(lines: Line[]): number {\n  const first: Line = lines[0];\n  return first ? 1 : 0;\n}\n",
    );
    let found = refs(&index, EdgeKind::References);
    assert_eq!(
        found
            .iter()
            .filter(|(_, n, _)| n == "Line")
            .collect::<Vec<_>>(),
        vec![&r("total", "Line", 2)]
    );
}

#[test]
fn a_type_in_a_method_signature_comes_from_the_method() {
    let index = index(
        "src/a.ts",
        "import type { Session } from \"./types\";\nexport class Store {\n  async load(id: string): Promise<Session> {\n    return {} as Session;\n  }\n}\n",
    );
    let found = refs(&index, EdgeKind::References);
    assert!(found.contains(&r("Store.load", "Session", 2)), "{found:?}");
}
