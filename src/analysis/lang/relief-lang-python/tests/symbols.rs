//! Seam 1: `PythonAdapter::index_file(path, bytes) -> FileIndex`, symbols.
//!
//! Same contract as `relief-lang-ts`: `FileIndex.symbols` in source order, methods
//! right after their class and named `Class.method`; `subkind` is `function`, `class` or
//! `method`; a name starting with `_` is internal (dunder names such as `__init__` are
//! public); nested functions are not symbols. `Symbol.signature` is the header from
//! `def` (or `async def`) to the end of the return annotation, on one line, without the colon.

use relief_lang_python::{FileIndex, PythonAdapter};
use relief_model::Visibility;

fn index(source: &str) -> FileIndex {
    PythonAdapter::new().index_file("shop/billing.py", source.as_bytes())
}

fn summary(index: &FileIndex) -> Vec<(String, String, Visibility)> {
    index
        .symbols
        .iter()
        .map(|s| (s.name.clone(), s.subkind.clone(), s.visibility))
        .collect()
}

fn t(name: &str, subkind: &str, visibility: Visibility) -> (String, String, Visibility) {
    (name.to_owned(), subkind.to_owned(), visibility)
}

#[test]
fn functions_classes_and_methods_are_symbols_with_their_visibility() {
    let index = index(
        "def compute_total(lines):\n    return 0\n\n\
         def _helper():\n    pass\n\n\
         class Invoice:\n    def __init__(self):\n        pass\n\n    def total(self):\n        return 1\n\n    def _round(self):\n        return 2\n\n\
         class _Hidden:\n    pass\n",
    );
    assert_eq!(
        summary(&index),
        vec![
            t("compute_total", "function", Visibility::Public),
            t("_helper", "function", Visibility::Internal),
            t("Invoice", "class", Visibility::Public),
            t("Invoice.__init__", "method", Visibility::Public),
            t("Invoice.total", "method", Visibility::Public),
            t("Invoice._round", "method", Visibility::Internal),
            t("_Hidden", "class", Visibility::Internal),
        ]
    );
}

#[test]
fn async_and_decorated_functions_are_symbols() {
    let index = index("@app.get(\"/invoices\")\nasync def list_invoices():\n    return []\n");
    assert_eq!(
        summary(&index),
        vec![t("list_invoices", "function", Visibility::Public)]
    );
}

#[test]
fn nested_functions_and_local_variables_are_not_symbols() {
    let index = index(
        "def outer():\n    value = 1\n    def inner():\n        return value\n    return inner\n",
    );
    assert_eq!(
        summary(&index),
        vec![t("outer", "function", Visibility::Public)]
    );
}

#[test]
fn span_is_one_based_and_covers_the_declaration() {
    let index = index("import os\n\ndef run():\n    a = 1\n    return a\n");
    let span = index.symbols[0].span;
    assert_eq!((span.start_line, span.end_line), (3, 5));
}

#[test]
fn signature_text_is_normalised_on_one_line() {
    let index = index(
        "async def refresh(\n    token: str,\n    ttl: int = 60,\n) -> Session:\n    return None\n",
    );
    assert_eq!(
        index.symbols[0].signature.as_deref(),
        Some("async def refresh(token: str, ttl: int = 60) -> Session")
    );
}

#[test]
fn a_method_signature_keeps_self() {
    let index = index("class Store:\n    def get(self, key: str) -> int:\n        return 1\n");
    let method = index
        .symbols
        .iter()
        .find(|s| s.name == "Store.get")
        .unwrap();
    assert_eq!(
        method.signature.as_deref(),
        Some("def get(self, key: str) -> int")
    );
}

#[test]
fn a_syntax_error_keeps_the_valid_symbols_and_warns() {
    let index = index("def ok():\n    return 1\n\ndef broken(:\n    pass\n");
    assert!(index.symbols.iter().any(|s| s.name == "ok"));
    assert_eq!(index.warnings.len(), 1);
}

#[test]
fn a_clean_file_has_no_warning() {
    assert!(index("def ok():\n    return 1\n").warnings.is_empty());
}
