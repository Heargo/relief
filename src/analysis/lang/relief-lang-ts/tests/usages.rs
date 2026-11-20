//! Ticket U20, seam 1: `TsAdapter::usages(path, bytes, bindings)` (trait `LanguageAdapter`).
//!
//! Contract: `bindings` are names as exported by the target module (as in `Import.names`); the
//! adapter finds their local name (alias included) in the file's import declarations and returns
//! the identifiers that resolve to them, in source order, outside the import declaration itself
//! and outside any scope that shadows the local name. `Usage.binding` is the exported name,
//! `line` is 1-based, `column` the 0-based char offset of the identifier in `snippet`, `snippet`
//! the source line without its terminator, `enclosing` the enclosing function or method
//! (`Class.method`), `None` at top level.

use relief_adapter_api::{LanguageAdapter, Usage};
use relief_lang_ts::TsAdapter;

fn usages(source: &str, bindings: &[&str]) -> Vec<Usage> {
    let bindings: Vec<String> = bindings.iter().map(|b| (*b).to_owned()).collect();
    TsAdapter::new()
        .usages("src/a.ts", source.as_bytes(), &bindings)
        .expect("the TS adapter supports usages")
}

fn u(binding: &str, line: u32, column: u32, snippet: &str, enclosing: Option<&str>) -> Usage {
    Usage {
        binding: binding.to_owned(),
        line,
        column,
        snippet: snippet.to_owned(),
        enclosing: enclosing.map(str::to_owned),
    }
}

#[test]
fn a_call_is_a_usage_with_its_line_column_snippet_and_enclosing_function() {
    let got = usages(
        "import { a } from \"./m\";\nexport function f() {\n  return a(1);\n}\n",
        &["a"],
    );
    assert_eq!(got, vec![u("a", 3, 9, "  return a(1);", Some("f"))]);
}

#[test]
fn an_aliased_import_is_found_under_its_local_name_and_reported_by_its_exported_name() {
    let got = usages(
        "import { a as local } from \"./m\";\nexport function f() {\n  return local();\n}\n",
        &["a"],
    );
    assert_eq!(got, vec![u("a", 3, 9, "  return local();", Some("f"))]);
}

#[test]
fn a_type_position_is_a_usage() {
    let got = usages(
        "import type { T } from \"./m\";\nexport function f(p: T): void {}\n",
        &["T"],
    );
    assert_eq!(
        got,
        vec![u("T", 2, 21, "export function f(p: T): void {}", Some("f"))]
    );
}

#[test]
fn a_reexport_of_the_binding_is_a_usage_at_top_level() {
    let got = usages("import { a } from \"./m\";\nexport { a };\n", &["a"]);
    assert_eq!(got, vec![u("a", 2, 9, "export { a };", None)]);
}

#[test]
fn a_method_reports_class_dot_method_as_enclosing() {
    let got = usages(
        "import { a } from \"./m\";\nexport class C {\n  run() {\n    a();\n  }\n}\n",
        &["a"],
    );
    assert_eq!(got, vec![u("a", 4, 4, "    a();", Some("C.run"))]);
}

#[test]
fn several_usages_come_in_source_order_across_bindings() {
    let got = usages(
        "import { a, b } from \"./m\";\nexport function f() {\n  b(a());\n}\n",
        &["a", "b"],
    );
    assert_eq!(
        got,
        vec![
            u("b", 3, 2, "  b(a());", Some("f")),
            u("a", 3, 4, "  b(a());", Some("f")),
        ]
    );
}

#[test]
fn a_binding_shadowed_by_a_local_variable_is_not_a_usage() {
    let got = usages(
        "import { a } from \"./m\";\nexport function f() {\n  const a = 1;\n  return a;\n}\n",
        &["a"],
    );
    assert_eq!(got, vec![]);
}

#[test]
fn a_binding_shadowed_by_a_parameter_is_not_a_usage_but_other_functions_still_are() {
    let got = usages(
        "import { a } from \"./m\";\nfunction g(a: number) {\n  return a;\n}\nexport function f() {\n  return a();\n}\n",
        &["a"],
    );
    assert_eq!(got, vec![u("a", 6, 9, "  return a();", Some("f"))]);
}

#[test]
fn an_imported_but_unused_binding_has_no_usage() {
    let got = usages("import { a } from \"./m\";\nexport const x = 1;\n", &["a"]);
    assert_eq!(got, vec![]);
}

#[test]
fn only_the_requested_bindings_are_reported() {
    let got = usages(
        "import { a, b } from \"./m\";\nexport function f() {\n  a();\n  b();\n}\n",
        &["b"],
    );
    assert_eq!(got, vec![u("b", 4, 2, "  b();", Some("f"))]);
}

#[test]
fn a_property_with_the_same_name_is_not_a_usage() {
    let got = usages(
        "import { a } from \"./m\";\nexport function f(o: { a: number }) {\n  return o.a;\n}\n",
        &["a"],
    );
    assert_eq!(got, vec![]);
}

// Ticket U21, seam 1: default and namespace imports.
//
// Contract expected from green: a new `LanguageAdapter` method
// `module_usages(&self, path, bytes, target: &str, paths: &[&str]) -> Option<Vec<Usage>>`
// (`None` = not supported). `target` is the repository path of the imported file, `paths` every
// path of the commit tree (to resolve specifiers). It reports the uses of the local bindings of
// the default (`import Foo from`) and namespace (`import * as ns from`) imports whose specifier
// resolves to `target`, with the same rules as `usages` (source order, outside the import,
// shadowing excluded). `Usage.binding` is the LOCAL name (`Foo`, `ns`); a use of `ns.f()` is the
// identifier `ns`.

const TREE: [&str; 3] = ["src/a.ts", "src/m.ts", "src/other.ts"];

fn module_usages(source: &str) -> Vec<Usage> {
    TsAdapter::new()
        .module_usages(
            "src/a.ts",
            source.as_bytes(),
            "src/m.ts",
            &relief_adapter_api::ResolveEnv {
                paths: &TREE,
                read: &|_| None,
                package_dirs: &Default::default(),
            },
        )
        .expect("the TS adapter supports module usages")
}

#[test]
fn a_default_import_is_found_under_its_local_name() {
    let got =
        module_usages("import Foo from \"./m\";\nexport function f() {\n  return Foo(1);\n}\n");
    assert_eq!(got, vec![u("Foo", 3, 9, "  return Foo(1);", Some("f"))]);
}

#[test]
fn a_namespace_member_call_is_counted_on_the_namespace_identifier() {
    let got =
        module_usages("import * as ns from \"./m\";\nexport function f() {\n  return ns.f();\n}\n");
    assert_eq!(got, vec![u("ns", 3, 9, "  return ns.f();", Some("f"))]);
}

#[test]
fn a_default_import_shadowed_by_a_parameter_is_not_a_usage() {
    let got = module_usages(
        "import Foo from \"./m\";\nexport function f(Foo: number) {\n  return Foo;\n}\n",
    );
    assert_eq!(got, vec![]);
}

#[test]
fn default_and_namespace_imports_of_another_module_are_not_usages() {
    let got = module_usages(
        "import Foo from \"./m\";\nimport Bar from \"./other\";\nimport * as ns from \"./other\";\nexport function f() {\n  Foo();\n  Bar();\n  ns.g();\n}\n",
    );
    assert_eq!(got, vec![u("Foo", 5, 2, "  Foo();", Some("f"))]);
}
