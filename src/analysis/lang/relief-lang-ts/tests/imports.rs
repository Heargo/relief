//! Seam 1: `TsAdapter::index_file(path, bytes).imports`.
//!
//! Expected contract (to be implemented by green): `FileIndex.imports` is a
//! `Vec<Import>` in source order, `Import { specifier: String, names:
//! Vec<String> }` where `names` holds the name as exported by the target
//! module (the original name for an alias), `"default"` for a default
//! import, `"*"` for a namespace import, an `export *`, a literal
//! `import()` or a literal `require()`, and nothing for a side-effect import.

use relief_lang_ts::TsAdapter;

fn imports(path: &str, source: &str) -> Vec<(String, Vec<String>)> {
    TsAdapter::new()
        .index_file(path, source.as_bytes())
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
fn named_imports_list_their_names() {
    let got = imports("a.ts", "import { a, b } from \"./m\";\n");
    assert_eq!(got, vec![entry("./m", &["a", "b"])]);
}

#[test]
fn an_aliased_import_keeps_the_exported_name() {
    let got = imports("a.ts", "import { a as local } from \"./m\";\n");
    assert_eq!(got, vec![entry("./m", &["a"])]);
}

#[test]
fn a_default_import_is_named_default() {
    let got = imports("a.ts", "import React from \"react\";\n");
    assert_eq!(got, vec![entry("react", &["default"])]);
}

#[test]
fn a_default_plus_named_import_lists_both() {
    let got = imports("a.ts", "import React, { useState } from \"react\";\n");
    assert_eq!(got, vec![entry("react", &["default", "useState"])]);
}

#[test]
fn a_namespace_import_is_a_star() {
    let got = imports("a.ts", "import * as m from \"./m\";\n");
    assert_eq!(got, vec![entry("./m", &["*"])]);
}

#[test]
fn a_side_effect_import_has_no_names() {
    let got = imports("a.ts", "import \"./polyfill\";\n");
    assert_eq!(got, vec![entry("./polyfill", &[])]);
}

#[test]
fn a_type_only_import_lists_its_names() {
    let got = imports("a.ts", "import type { Money } from \"./money\";\n");
    assert_eq!(got, vec![entry("./money", &["Money"])]);
}

#[test]
fn a_re_export_with_names_is_an_import() {
    let got = imports("a.ts", "export { a, b as c } from \"./m\";\n");
    assert_eq!(got, vec![entry("./m", &["a", "b"])]);
}

#[test]
fn a_star_re_export_is_an_import_of_everything() {
    let got = imports("a.ts", "export * from \"./m\";\n");
    assert_eq!(got, vec![entry("./m", &["*"])]);
}

#[test]
fn a_literal_dynamic_import_is_an_import() {
    let got = imports(
        "a.ts",
        "export async function f() { return import(\"./lazy\"); }\n",
    );
    assert_eq!(got, vec![entry("./lazy", &["*"])]);
}

#[test]
fn a_literal_require_is_an_import() {
    let got = imports("a.js", "const fs = require(\"node:fs\");\n");
    assert_eq!(got, vec![entry("node:fs", &["*"])]);
}

#[test]
fn non_literal_dynamic_import_and_require_are_ignored() {
    let source = "export function f(name: string) {\n  import(name);\n  require(`./x/${name}`);\n  return require(name);\n}\n";
    assert_eq!(imports("a.ts", source), vec![]);
}

#[test]
fn imports_come_in_source_order_across_forms() {
    let source = "import { a } from \"./a\";\nexport * from \"./b\";\nconst c = require(\"./c\");\nimport \"./d\";\n";
    let specifiers: Vec<String> = imports("a.ts", source)
        .into_iter()
        .map(|(s, _)| s)
        .collect();
    assert_eq!(specifiers, vec!["./a", "./b", "./c", "./d"]);
}

#[test]
fn imports_work_in_tsx_files() {
    let got = imports(
        "a.tsx",
        "import { useState } from \"react\";\nexport const A = () => <div />;\n",
    );
    assert_eq!(got, vec![entry("react", &["useState"])]);
}
