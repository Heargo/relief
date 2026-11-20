//! Seam 1: `PythonAdapter::index_file` on two sources, comparing the hashes of `run`.

use relief_lang_python::PythonAdapter;

fn symbol(source: &str) -> relief_lang_python::Symbol {
    PythonAdapter::new()
        .index_file("shop/a.py", source.as_bytes())
        .symbols
        .into_iter()
        .find(|s| s.name == "run")
        .expect("symbol `run`")
}

const BASE: &str = "def run(x: int) -> int:\n    return add(x, 1)\n";

#[test]
fn a_comment_only_change_keeps_the_hash() {
    let after = "def run(x: int) -> int:\n    # add one\n    return add(x, 1)  # done\n";
    assert_eq!(symbol(BASE).content_hash, symbol(after).content_hash);
}

#[test]
fn spacing_inside_a_line_keeps_the_hash() {
    let after = "def run(x:int)->int:\n    return add( x,1 )\n";
    let (a, b) = (symbol(BASE), symbol(after));
    assert_eq!(a.content_hash, b.content_hash);
    assert_eq!(a.signature_hash, b.signature_hash);
}

#[test]
fn a_body_change_changes_content_hash_but_not_signature_hash() {
    let after = "def run(x: int) -> int:\n    return add(x, 2)\n";
    let (a, b) = (symbol(BASE), symbol(after));
    assert_ne!(a.content_hash, b.content_hash);
    assert_eq!(a.signature_hash, b.signature_hash);
    assert!(a.signature_hash.is_some());
}

#[test]
fn a_new_parameter_changes_the_signature_hash() {
    let after = "def run(x: int, y: int = 0) -> int:\n    return add(x, 1)\n";
    assert_ne!(symbol(BASE).signature_hash, symbol(after).signature_hash);
}

#[test]
fn a_new_return_annotation_changes_the_signature_hash() {
    let after = "def run(x: int) -> str:\n    return add(x, 1)\n";
    assert_ne!(symbol(BASE).signature_hash, symbol(after).signature_hash);
}
