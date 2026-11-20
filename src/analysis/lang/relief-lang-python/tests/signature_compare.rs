//! Seam 1: the Python signature comparator (`LanguageAdapter::compare_signatures`) on
//! normalised signature texts as `index_file` produces them. A parameter with a default
//! value is optional.

use relief_adapter_api::LanguageAdapter;
use relief_lang_python::PythonAdapter;
use relief_model::SignatureReason;

fn verdict(before: &str, after: &str) -> (bool, SignatureReason) {
    let v = PythonAdapter::new().compare_signatures(before, after);
    (v.breaking, v.reason)
}

fn param(code: &str) -> String {
    code.to_owned()
}

#[test]
fn a_parameter_with_a_default_is_compatible() {
    assert_eq!(
        verdict(
            "def compute_total(lines: list[Line]) -> float",
            "def compute_total(lines: list[Line], tax: float = 0.2) -> float"
        ),
        (false, SignatureReason::ParamOptionalAdded)
    );
}

#[test]
fn a_required_parameter_is_breaking() {
    assert_eq!(
        verdict(
            "def compute_total(lines: list[Line]) -> float",
            "def compute_total(lines: list[Line], currency: str) -> float"
        ),
        (
            true,
            SignatureReason::ParamRequiredAdded {
                param: param("currency")
            }
        )
    );
}

#[test]
fn losing_a_default_makes_the_parameter_required() {
    assert_eq!(
        verdict("def f(a: int, b: int = 1)", "def f(a: int, b: int)"),
        (
            true,
            SignatureReason::ParamBecameRequired { param: param("b") }
        )
    );
}

#[test]
fn a_removed_parameter_is_breaking() {
    assert_eq!(
        verdict("def f(a: int, b: int)", "def f(a: int)"),
        (true, SignatureReason::ParamRemoved)
    );
}

#[test]
fn a_changed_parameter_annotation_is_breaking() {
    assert_eq!(
        verdict("def f(a: int)", "def f(a: str)"),
        (
            true,
            SignatureReason::ParamTypeChanged { param: param("a") }
        )
    );
}

#[test]
fn a_return_widened_to_none_is_breaking() {
    assert_eq!(
        verdict(
            "def find(id: int) -> User",
            "def find(id: int) -> User | None"
        ),
        (true, SignatureReason::ReturnWidenedNull)
    );
    assert_eq!(
        verdict(
            "def find(id: int) -> User",
            "def find(id: int) -> Optional[User]"
        ),
        (true, SignatureReason::ReturnWidenedNull)
    );
}

#[test]
fn a_changed_return_annotation_is_breaking() {
    assert_eq!(
        verdict("def f() -> int", "def f() -> str"),
        (true, SignatureReason::ReturnChanged)
    );
}

#[test]
fn identical_signatures_are_equivalent() {
    let v = PythonAdapter::new().compare_signatures("def f(a: int) -> int", "def f(a: int) -> int");
    assert!(!v.breaking);
    assert!(v.equivalent);
}

#[test]
fn the_adapter_handles_py_files_only() {
    let adapter = PythonAdapter::new();
    assert!(adapter.handles("py"));
    assert!(!adapter.handles("ts"));
    assert_eq!(adapter.name(), "python");
}
