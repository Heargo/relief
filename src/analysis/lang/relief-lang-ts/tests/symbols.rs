//! Seam 1: `TsAdapter::index_file(path, bytes) -> FileIndex`.
//!
//! Expected shape of the contract (to be implemented by green):
//! `FileIndex { symbols: Vec<Symbol>, warnings: Vec<String>, .. }` with
//! `Symbol { name, subkind: String, visibility: relief_model::Visibility,
//! span: relief_model::Span, content_hash: String,
//! signature_hash: Option<String>, signature: Option<String> }`.
//! A method is named `Class.method`.

use relief_fixtures::Fixture;
use relief_git::GitSource;
use relief_lang_ts::{FileIndex, Symbol, TsAdapter};
use relief_model::Visibility;
use tempfile::TempDir;

fn index(path: &str, source: &str) -> FileIndex {
    TsAdapter::new().index_file(path, source.as_bytes())
}

fn symbol<'a>(index: &'a FileIndex, name: &str) -> &'a Symbol {
    index
        .symbols
        .iter()
        .find(|s| s.name == name)
        .unwrap_or_else(|| panic!("no symbol `{name}`"))
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

/// Indexes a file of acme-shop, read from git at `rev`.
fn index_acme(rev: &str, path: &str) -> FileIndex {
    let dir = TempDir::new().unwrap();
    Fixture::load("acme-shop")
        .unwrap()
        .build(dir.path())
        .unwrap();
    let source = GitSource::open(dir.path()).unwrap();
    let commit = source.resolve(rev).unwrap();
    let entry = source
        .list_tree(&commit)
        .unwrap()
        .into_iter()
        .find(|e| e.path == path)
        .unwrap_or_else(|| panic!("{path} missing at {rev}"));
    let bytes = source.read_blob(&entry.blob).unwrap();
    TsAdapter::new().index_file(path, &bytes)
}

fn spans_json(index: &FileIndex) -> serde_json::Value {
    index
        .symbols
        .iter()
        .map(|s| {
            serde_json::json!({
                "name": s.name,
                "subkind": s.subkind,
                "visibility": s.visibility,
                "startLine": s.span.start_line,
                "endLine": s.span.end_line,
            })
        })
        .collect()
}

#[test]
fn acme_invoice_symbols() {
    let index = index_acme("main", "apps/api/billing/invoice.ts");
    assert!(index.warnings.is_empty());
    assert_eq!(
        summary(&index),
        vec![
            t("InvoiceLine", "type", Visibility::Public),
            t("Invoice", "type", Visibility::Public),
            t("computeTotal", "function", Visibility::Public),
            t("renderInvoice", "function", Visibility::Public),
        ]
    );
    insta::assert_json_snapshot!("acme_invoice_symbols", spans_json(&index));
}

#[test]
fn acme_session_symbols() {
    let index = index_acme("main", "apps/api/auth/session.ts");
    assert!(index.warnings.is_empty());
    assert_eq!(
        summary(&index),
        vec![
            t("SessionExpiredError", "class", Visibility::Public),
            t("Session", "type", Visibility::Public),
            t("SessionStore", "class", Visibility::Public),
            t("SessionStore.login", "method", Visibility::Public),
            t("SessionStore.refresh", "method", Visibility::Public),
            t("SessionStore.load", "method", Visibility::Internal),
            t("sessions", "const", Visibility::Public),
        ]
    );
    insta::assert_json_snapshot!("acme_session_symbols", spans_json(&index));
}

#[test]
fn acme_promo_code_input_symbols() {
    let index = index_acme("feat/promo-codes", "apps/web/components/PromoCodeInput.tsx");
    assert!(index.warnings.is_empty());
    assert_eq!(
        summary(&index),
        vec![
            t("Props", "type", Visibility::Internal),
            t("validateCodeLocally", "function", Visibility::Internal),
            t("PromoCodeInput", "component", Visibility::Public),
        ]
    );
    insta::assert_json_snapshot!("acme_promo_code_input_symbols", spans_json(&index));
}

#[test]
fn every_declaration_kind_gets_its_subkind() {
    let index = index(
        "src/kinds.ts",
        "export interface Shape { area(): number }\n\
         export enum Color { Red, Green }\n\
         export const LIMIT = 10;\n\
         const hidden = 1;\n\
         export function useCart() { return 1; }\n\
         export class Box { open() {} }\n",
    );
    assert_eq!(
        summary(&index),
        vec![
            t("Shape", "type", Visibility::Public),
            t("Color", "enum", Visibility::Public),
            t("LIMIT", "const", Visibility::Public),
            t("hidden", "const", Visibility::Internal),
            t("useCart", "hook", Visibility::Public),
            t("Box", "class", Visibility::Public),
            t("Box.open", "method", Visibility::Public),
        ]
    );
}

#[test]
fn private_and_hash_methods_are_internal() {
    let index = index(
        "src/box.ts",
        "export class Box {\n  private a() {}\n  #b() {}\n  c() {}\n}\n",
    );
    assert_eq!(
        summary(&index),
        vec![
            t("Box", "class", Visibility::Public),
            t("Box.a", "method", Visibility::Internal),
            t("Box.b", "method", Visibility::Internal),
            t("Box.c", "method", Visibility::Public),
        ]
    );
}

#[test]
fn local_variables_are_not_symbols() {
    let index = index(
        "src/local.ts",
        "export function f() {\n  const inner = 1;\n  function nested() {}\n  return inner;\n}\n",
    );
    assert_eq!(
        summary(&index),
        vec![t("f", "function", Visibility::Public)]
    );
}

#[test]
fn react_component_is_a_capitalised_function_or_const_returning_jsx() {
    let index = index(
        "src/ui.tsx",
        "export function Card() { return <div />; }\n\
         export const Badge = () => <span />;\n\
         export function helper() { return 1; }\n",
    );
    assert_eq!(
        summary(&index),
        vec![
            t("Card", "component", Visibility::Public),
            t("Badge", "component", Visibility::Public),
            t("helper", "function", Visibility::Public),
        ]
    );
}

#[test]
fn every_supported_extension_is_indexed() {
    for ext in ["ts", "tsx", "js", "jsx", "mts", "cts"] {
        let index = index(
            &format!("src/a.{ext}"),
            "export function f() { return 1; }\n",
        );
        assert_eq!(
            summary(&index),
            vec![t("f", "function", Visibility::Public)],
            "extension {ext}"
        );
    }
}

#[test]
fn span_is_one_based_and_covers_the_declaration() {
    let index = index(
        "src/span.ts",
        "// header\n\nexport function f() {\n  return 1;\n}\n",
    );
    let span = symbol(&index, "f").span;
    assert_eq!((span.start_line, span.end_line), (3, 5));
}

const BASE: &str = "export function total(a: number, b: number): number {\n  return a + b;\n}\n";

#[test]
fn reformatting_changes_no_hash_nor_signature_text() {
    let reformatted = "// adds two numbers\nexport function total(\n  a: number,\n  b: number\n): number {\n  /* sum */\n  return a\n    + b;\n}\n";
    let before = index("src/m.ts", BASE);
    let after = index("src/m.ts", reformatted);
    let (b, a) = (symbol(&before, "total"), symbol(&after, "total"));
    assert_eq!(b.content_hash, a.content_hash);
    assert_eq!(b.signature_hash, a.signature_hash);
    assert_eq!(b.signature, a.signature);
    assert!(b.signature_hash.is_some());
    assert!(b.signature.as_deref().unwrap().contains("number"));
}

#[test]
fn adding_an_optional_parameter_changes_the_signature_hash() {
    let changed =
        "export function total(a: number, b: number, c?: number): number {\n  return a + b;\n}\n";
    let before = index("src/m.ts", BASE);
    let after = index("src/m.ts", changed);
    let (b, a) = (symbol(&before, "total"), symbol(&after, "total"));
    assert_ne!(b.signature_hash, a.signature_hash);
    assert_ne!(b.signature, a.signature);
    assert!(a.signature.as_deref().unwrap().contains("c?"));
}

#[test]
fn changing_only_the_body_changes_content_hash_but_not_signature_hash() {
    let changed = "export function total(a: number, b: number): number {\n  return a - b;\n}\n";
    let before = index("src/m.ts", BASE);
    let after = index("src/m.ts", changed);
    let (b, a) = (symbol(&before, "total"), symbol(&after, "total"));
    assert_ne!(b.content_hash, a.content_hash);
    assert_eq!(b.signature_hash, a.signature_hash);
    assert_eq!(b.signature, a.signature);
    assert!(!b.signature.as_deref().unwrap().contains("return"));
}

#[test]
fn changing_the_return_type_changes_the_signature_hash() {
    let changed = "export function total(a: number, b: number): bigint {\n  return a + b;\n}\n";
    let before = index("src/m.ts", BASE);
    let after = index("src/m.ts", changed);
    assert_ne!(
        symbol(&before, "total").signature_hash,
        symbol(&after, "total").signature_hash
    );
}

#[test]
fn dropping_the_export_changes_the_signature_hash() {
    let changed = "function total(a: number, b: number): number {\n  return a + b;\n}\n";
    let before = index("src/m.ts", BASE);
    let after = index("src/m.ts", changed);
    assert_ne!(
        symbol(&before, "total").signature_hash,
        symbol(&after, "total").signature_hash
    );
}

#[test]
fn a_method_body_change_only_touches_that_method() {
    let before = index(
        "src/c.ts",
        "export class C {\n  a() { return 1; }\n  b() { return 2; }\n}\n",
    );
    let after = index(
        "src/c.ts",
        "export class C {\n  a() { return 1; }\n  b() { return 3; }\n}\n",
    );
    assert_eq!(
        symbol(&before, "C.a").content_hash,
        symbol(&after, "C.a").content_hash
    );
    assert_ne!(
        symbol(&before, "C.b").content_hash,
        symbol(&after, "C.b").content_hash
    );
    assert_eq!(
        symbol(&before, "C.b").signature_hash,
        symbol(&after, "C.b").signature_hash
    );
}

#[test]
fn a_syntax_error_keeps_the_valid_symbols_and_warns() {
    let index = index(
        "src/broken.ts",
        "export function ok() { return 1; }\n\nexport function broken( {\n",
    );
    assert!(index.symbols.iter().any(|s| s.name == "ok"));
    assert!(!index.warnings.is_empty());
    assert!(
        index.warnings.iter().any(|w| w.contains("src/broken.ts")),
        "warnings should name the file: {:?}",
        index.warnings
    );
}

#[test]
fn a_clean_file_has_no_warning() {
    assert!(index("src/m.ts", BASE).warnings.is_empty());
}
