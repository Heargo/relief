//! Seam 1 of ticket K11: `LanguageAdapter::published_packages(paths, read)` of the Python
//! adapter.
//!
//! Expected contract (to be implemented by green): `PublishedPackage { name, import_name, entry }` (in
//! `relief_adapter_api`): `name` is the `[project].name` of a `pyproject.toml` as declared,
//! `entry` the repository path of the `__init__.py` of the importable module of that project
//! (the name with `-` as `_`), at the root of the project or under its `src/`. A project
//! without a `[project].name`, or without such a module, publishes nothing.

use std::collections::BTreeMap;

use relief_adapter_api::{LanguageAdapter, PublishedPackage};
use relief_lang_python::PythonAdapter;

fn published(files: &[(&str, &str)]) -> Vec<PublishedPackage> {
    let tree: BTreeMap<&str, &str> = files.iter().copied().collect();
    let paths: Vec<&str> = tree.keys().copied().collect();
    let read = |p: &str| tree.get(p).map(|c| c.as_bytes().to_vec());
    PythonAdapter::new().published_packages(&paths, &read)
}

fn package(name: &str, entry: &str) -> PublishedPackage {
    PublishedPackage {
        name: name.to_owned(),
        // What an import names: the module, `-` and `.` as `_`, lower case.
        import_name: name.replace(['-', '.'], "_").to_lowercase(),
        entry: entry.to_owned(),
    }
}

const PYPROJECT: &str = "[project]\nname = \"shop-core\"\nversion = \"0.1.0\"\n";

#[test]
fn a_pyproject_publishes_its_name_and_its_module() {
    let got = published(&[
        ("pyproject.toml", PYPROJECT),
        ("shop_core/__init__.py", "def total(prices): ...\n"),
    ]);
    assert_eq!(got, vec![package("shop-core", "shop_core/__init__.py")]);
}

#[test]
fn a_src_layout_is_found() {
    let got = published(&[
        ("pyproject.toml", PYPROJECT),
        ("src/shop_core/__init__.py", ""),
    ]);
    assert_eq!(got, vec![package("shop-core", "src/shop_core/__init__.py")]);
}

#[test]
fn the_entry_is_relative_to_the_directory_of_the_pyproject() {
    let got = published(&[
        ("libs/core/pyproject.toml", PYPROJECT),
        ("libs/core/shop_core/__init__.py", ""),
    ]);
    assert_eq!(
        got,
        vec![package("shop-core", "libs/core/shop_core/__init__.py")]
    );
}

#[test]
fn a_pyproject_without_a_project_name_publishes_nothing() {
    let got = published(&[
        ("pyproject.toml", "[tool.black]\nline-length = 100\n"),
        ("shop_core/__init__.py", ""),
    ]);
    assert_eq!(got, vec![]);
}

#[test]
fn a_project_without_its_module_publishes_nothing() {
    let got = published(&[("pyproject.toml", PYPROJECT), ("other/__init__.py", "")]);
    assert_eq!(got, vec![]);
}
