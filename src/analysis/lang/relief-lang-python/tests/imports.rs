//! Seam 1: `PythonAdapter::index_file(path, bytes).imports`.
//!
//! `Import { specifier, names }` in source order. The specifier is the module as written
//! (`.billing`, `..util.format`, `.` for `from . import x`, `flask`, `shop.models`);
//! `names` holds the names as exported by the module (original name for an alias),
//! `"*"` for `import m`, `import m as n` and `from m import *`.

use relief_lang_python::PythonAdapter;

fn imports(source: &str) -> Vec<(String, Vec<String>)> {
    PythonAdapter::new()
        .index_file("shop/app.py", source.as_bytes())
        .imports
        .iter()
        .map(|i| (i.specifier.clone(), i.names.clone()))
        .collect()
}

fn entry(specifier: &str, names: &[&str]) -> (String, Vec<String>) {
    (
        specifier.to_owned(),
        names.iter().map(|n| (*n).to_owned()).collect(),
    )
}

#[test]
fn a_from_import_lists_its_names() {
    assert_eq!(
        imports("from shop.models import Line, Invoice\n"),
        vec![entry("shop.models", &["Line", "Invoice"])]
    );
}

#[test]
fn an_aliased_name_keeps_the_exported_name() {
    assert_eq!(
        imports("from shop.models import Line as L\n"),
        vec![entry("shop.models", &["Line"])]
    );
}

#[test]
fn a_plain_import_is_a_whole_module_import() {
    assert_eq!(
        imports("import os\nimport shop.billing as billing\n"),
        vec![entry("os", &["*"]), entry("shop.billing", &["*"])]
    );
}

#[test]
fn relative_imports_keep_their_dots() {
    assert_eq!(
        imports(
            "from .billing import compute_total\nfrom ..util.format import format_price\nfrom . import models\n"
        ),
        vec![
            entry(".billing", &["compute_total"]),
            entry("..util.format", &["format_price"]),
            entry(".", &["models"]),
        ]
    );
}

#[test]
fn a_star_import_is_a_whole_module_import() {
    assert_eq!(
        imports("from shop.models import *\n"),
        vec![entry("shop.models", &["*"])]
    );
}

#[test]
fn external_imports_are_listed_like_the_others() {
    assert_eq!(
        imports("from flask import Flask, jsonify\nimport requests\n"),
        vec![
            entry("flask", &["Flask", "jsonify"]),
            entry("requests", &["*"])
        ]
    );
}
