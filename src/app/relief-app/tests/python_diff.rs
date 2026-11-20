//! Seam 3 of ticket 01-python-adapter: `Session::diff` on the py-shop fixture
//! (`main...feat/currency`), with the Python adapter declared as the composition root does.
//! Neither `relief-diff` nor `relief-app` knows Python: the breaking signature and the
//! move must come out of the contract alone.

use relief_app::{DiffRequest, RangeSpec, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_python::PythonAdapter;
use serde_json::Value;
use tempfile::TempDir;

fn diff() -> Value {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("py-shop");
    Fixture::load("py-shop").unwrap().build(&path).unwrap();
    let session = Session::open(
        &path,
        SessionOptions {
            data_dir: None,
            range: Some(RangeSpec::parse("main...feat/currency").unwrap()),
            detectors: default_detectors(),
            adapters: vec![Box::new(PythonAdapter::new())],
        },
    )
    .unwrap();
    let response = session
        .diff(&DiffRequest {
            range: None,
            budget: None,
            expand: vec![],
        })
        .unwrap();
    serde_json::to_value(&response).unwrap()
}

fn node<'a>(diff: &'a Value, suffix: &str) -> &'a Value {
    diff["diff"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"].as_str().is_some_and(|id| id.ends_with(suffix)))
        .unwrap_or_else(|| panic!("no changed node ending with `{suffix}`"))
}

#[test]
fn the_new_required_parameter_is_a_breaking_signature() {
    let diff = diff();
    let change = node(&diff, "::file:shop/billing/invoice.py::sym:compute_total");
    assert_eq!(change["status"], "modified");
    let signature = &change["signature"];
    assert_eq!(signature["breaking"], true);
    assert_eq!(
        signature["before"],
        "def compute_total(lines: list[Line], tax: float = 0.2) -> float"
    );
    assert_eq!(
        signature["after"],
        "def compute_total(lines: list[Line], currency: str, tax: float = 0.2) -> float"
    );
    assert_eq!(signature["reason"]["code"], "paramRequiredAdded");
    assert_eq!(signature["reason"]["param"], "currency");
}

#[test]
fn the_moved_file_keeps_its_symbol_as_moved() {
    let diff = diff();
    let change = node(&diff, "::file:shop/money/format.py::sym:format_price");
    assert_eq!(change["status"], "moved");
    assert!(
        change["from"]
            .as_str()
            .unwrap()
            .ends_with("::file:shop/util/format.py::sym:format_price")
    );
}

#[test]
fn the_diff_of_py_shop() {
    insta::assert_json_snapshot!("py_shop_diff", diff());
}
