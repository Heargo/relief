//! Seam 2: `TsAdapter::index_file` on two sources, comparing the
//! `content_hash` of a symbol; and `LanguageAdapter::version()`.

use relief_adapter_api::LanguageAdapter;
use relief_lang_ts::TsAdapter;

fn hash(source: &str) -> String {
    TsAdapter::new()
        .index_file("src/a.ts", source.as_bytes())
        .symbols
        .iter()
        .find(|s| s.name == "run")
        .expect("symbol `run`")
        .content_hash
        .clone()
}

#[test]
fn a_comment_only_change_keeps_the_hash() {
    let before = "export function run(x: number) {\n  return x + 1;\n}\n";
    let after = "export function run(x: number) {\n  // add one\n  return x + 1; // done\n}\n";
    assert_eq!(hash(before), hash(after));
}

#[test]
fn an_indentation_only_change_keeps_the_hash() {
    let before = "export function run(x: number) {\n  return x + 1;\n}\n";
    let after = "export function run(x: number) {\n        return x + 1;\n}\n";
    assert_eq!(hash(before), hash(after));
}

#[test]
fn a_string_literal_is_not_an_identifier() {
    let before = "export function run() {\n  return f(\"x\");\n}\n";
    let after = "export function run() {\n  return f(x);\n}\n";
    assert_ne!(hash(before), hash(after));
}

#[test]
fn another_string_literal_changes_the_hash() {
    let before = "export function run() {\n  return \"a\";\n}\n";
    let after = "export function run() {\n  return \"b\";\n}\n";
    assert_ne!(hash(before), hash(after));
}

#[test]
fn the_quote_style_alone_keeps_the_hash() {
    let before = "export function run() {\n  return \"a\";\n}\n";
    let after = "export function run() {\n  return 'a';\n}\n";
    assert_eq!(hash(before), hash(after));
}

#[test]
fn the_adapter_version_is_bumped_to_invalidate_the_cache() {
    assert_eq!(TsAdapter::new().version(), 3);
}
