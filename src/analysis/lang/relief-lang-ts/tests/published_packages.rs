//! Seam 1 of ticket K11: `LanguageAdapter::published_packages(paths, read)` of the TS adapter.
//!
//! Expected contract (to be implemented by green): the adapter returns the packages a
//! repository publishes, as `PublishedPackage { name, import_name, entry }` (in `relief_adapter_api`):
//! `name` is the `name` of a `package.json`, `entry` the repository path of its entry point
//! (the package's `main`, relative to the directory of the `package.json`). A `package.json`
//! without a name, without an entry or that does not parse publishes nothing.

use std::collections::BTreeMap;

use relief_adapter_api::{LanguageAdapter, PublishedPackage};
use relief_lang_ts::TsAdapter;

fn published(files: &[(&str, &str)]) -> Vec<PublishedPackage> {
    let tree: BTreeMap<&str, &str> = files.iter().copied().collect();
    let paths: Vec<&str> = tree.keys().copied().collect();
    let read = |p: &str| tree.get(p).map(|c| c.as_bytes().to_vec());
    TsAdapter::new().published_packages(&paths, &read)
}

fn package(name: &str, entry: &str) -> PublishedPackage {
    PublishedPackage {
        name: name.to_owned(),
        // What an import names: the package name itself.
        import_name: name.to_owned(),
        entry: entry.to_owned(),
    }
}

#[test]
fn a_package_json_publishes_its_name_and_its_main() {
    let got = published(&[
        (
            "package.json",
            r#"{ "name": "@shop/api", "main": "src/types.ts" }"#,
        ),
        ("src/types.ts", "export type Order = { id: string };\n"),
    ]);
    assert_eq!(got, vec![package("@shop/api", "src/types.ts")]);
}

#[test]
fn the_entry_is_relative_to_the_directory_of_the_package_json() {
    let got = published(&[
        (
            "packages/ui/package.json",
            r#"{ "name": "@acme/ui", "main": "src/index.ts" }"#,
        ),
        ("packages/ui/src/index.ts", "export const x = 1;\n"),
    ]);
    assert_eq!(got, vec![package("@acme/ui", "packages/ui/src/index.ts")]);
}

#[test]
fn every_package_of_the_repository_is_published() {
    let mut got = published(&[
        ("package.json", r#"{ "name": "root", "main": "index.ts" }"#),
        ("index.ts", ""),
        (
            "packages/ui/package.json",
            r#"{ "name": "@acme/ui", "main": "src/index.ts" }"#,
        ),
        ("packages/ui/src/index.ts", ""),
    ]);
    got.sort_by(|a, b| a.name.cmp(&b.name));
    assert_eq!(
        got,
        vec![
            package("@acme/ui", "packages/ui/src/index.ts"),
            package("root", "index.ts")
        ]
    );
}

#[test]
fn a_package_json_without_a_name_publishes_nothing() {
    let got = published(&[
        ("package.json", r#"{ "main": "index.ts" }"#),
        ("index.ts", ""),
    ]);
    assert_eq!(got, vec![]);
}

#[test]
fn a_package_json_that_does_not_parse_publishes_nothing() {
    let got = published(&[("package.json", "{ not json"), ("index.ts", "")]);
    assert_eq!(got, vec![]);
}
