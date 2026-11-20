//! Seam 1: `PythonAdapter::index_file(path, bytes).refs`.
//!
//! `Ref { from, name, kind, weight }` as in `relief-lang-ts`:
//! - `from` is the enclosing top-level symbol (`Class.method` for a method);
//! - a call `helper()` is a `Calls` ref named `helper`; `self.other()` in a method of
//!   `Store` is `Store.other`; `m.f()` where `m` is bound by `import m` is `m.f`;
//!   other receivers are ignored;
//! - names in parameter and return annotations are `References` refs (`list[Line]`
//!   gives `Line`); built-in types (`int`, `str`, `float`, `bool`, `bytes`, `list`, `dict`,
//!   `None`...) give none;
//! - duplicates are merged into `weight`, in order of first occurrence.

use relief_lang_python::{FileIndex, PythonAdapter};
use relief_model::EdgeKind;

fn index(source: &str) -> FileIndex {
    PythonAdapter::new().index_file("shop/app.py", source.as_bytes())
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
fn a_call_is_a_calls_ref_from_the_enclosing_symbol() {
    let index = index("def b():\n    pass\n\ndef a():\n    return b()\n");
    assert_eq!(refs(&index, EdgeKind::Calls), vec![r("a", "b", 1)]);
}

#[test]
fn repeated_calls_are_merged_into_a_weight() {
    let index = index("def a():\n    b()\n    b()\n    c()\n    b()\n");
    assert_eq!(
        refs(&index, EdgeKind::Calls),
        vec![r("a", "b", 3), r("a", "c", 1)]
    );
}

#[test]
fn self_calls_in_a_method_target_the_class() {
    let index = index(
        "class Store:\n    def get(self):\n        return self.load()\n\n    def load(self):\n        return 1\n",
    );
    assert_eq!(
        refs(&index, EdgeKind::Calls),
        vec![r("Store.get", "Store.load", 1)]
    );
}

#[test]
fn a_call_on_an_imported_module_keeps_the_receiver() {
    let index = index("import billing\n\ndef run():\n    return billing.compute_total([])\n");
    assert_eq!(
        refs(&index, EdgeKind::Calls),
        vec![r("run", "billing.compute_total", 1)]
    );
}

#[test]
fn a_call_on_any_other_receiver_is_ignored() {
    let index = index("def run(session):\n    return session.commit()\n");
    assert!(refs(&index, EdgeKind::Calls).is_empty());
}

#[test]
fn annotations_are_references_to_their_types() {
    let index = index("def compute_total(lines: list[Line], tax: float) -> Money:\n    return 0\n");
    assert_eq!(
        refs(&index, EdgeKind::References),
        vec![
            r("compute_total", "Line", 1),
            r("compute_total", "Money", 1)
        ]
    );
}

#[test]
fn optional_and_union_annotations_reference_each_type() {
    let index = index("def find(id: int) -> Optional[User] | Admin:\n    return None\n");
    assert_eq!(
        refs(&index, EdgeKind::References),
        vec![
            r("find", "Optional", 1),
            r("find", "User", 1),
            r("find", "Admin", 1)
        ]
    );
}

#[test]
fn builtin_types_are_not_references() {
    let index = index("def f(a: int, b: str) -> dict:\n    return {}\n");
    assert!(refs(&index, EdgeKind::References).is_empty());
}
