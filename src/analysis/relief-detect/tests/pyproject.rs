//! Seam 2: the `pyproject.toml` detector on an in-memory tree (`(path, content)`); it never
//! sees git. Expected contract (to be implemented by green): `relief_detect::PyprojectDetector`
//! implementing `Detector`, answering `None` without any `pyproject.toml`, named `"pyproject"`
//! in `Detection.detector`, one system per project (`pkg:<project name>`), a
//! `DependsOn` edge to each dependency: `pkg:external/<name>` for external ones (version
//! specifiers, extras and markers stripped, `python` ignored), the sibling project for a
//! workspace one. `default_detectors()` includes it.

use relief_adapter_api::Detector;
use relief_detect::{Detection, PyprojectDetector, default_detectors};
use relief_model::{EdgeKind, NodeKind};

fn run(tree: &[(&str, &str)]) -> Option<Detection> {
    let paths: Vec<&str> = tree.iter().map(|(p, _)| *p).collect();
    let read = |path: &str| {
        tree.iter()
            .find(|(c, _)| *c == path)
            .map(|(_, content)| content.as_bytes().to_vec())
    };
    PyprojectDetector::new().detect("shop", &paths, &read)
}

fn ids(d: &Detection, keep: impl Fn(NodeKind) -> bool) -> Vec<String> {
    let mut ids: Vec<String> = d
        .nodes
        .iter()
        .filter(|n| keep(n.kind))
        .map(|n| n.id.to_string())
        .collect();
    ids.sort();
    ids
}

fn systems(d: &Detection) -> Vec<String> {
    ids(d, |k| matches!(k, NodeKind::Service | NodeKind::Package))
}

fn externals(d: &Detection) -> Vec<String> {
    ids(d, |k| k == NodeKind::External)
}

fn depends_on(d: &Detection) -> Vec<(String, String)> {
    let mut found: Vec<_> = d
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::DependsOn)
        .map(|e| (e.from.to_string(), e.to.to_string()))
        .collect();
    found.sort();
    found
}

fn pair(a: &str, b: &str) -> (String, String) {
    (a.to_owned(), b.to_owned())
}

#[test]
fn a_tree_without_pyproject_is_not_for_this_detector() {
    assert!(run(&[("main.py", "print(1)\n"), ("package.json", "{}")]).is_none());
}

#[test]
fn a_setuptools_project_is_one_system_with_its_external_dependencies() {
    let d = run(&[
        (
            "pyproject.toml",
            "[project]\nname = \"py-shop\"\ndependencies = [\"flask>=3.0\", \"requests[security]>=2.31; python_version >= '3.8'\"]\n\n[build-system]\nrequires = [\"setuptools>=68\"]\nbuild-backend = \"setuptools.build_meta\"\n",
        ),
        ("shop/app.py", "x = 1\n"),
    ])
    .expect("detected");
    assert_eq!(d.detector, "pyproject");
    assert_eq!(systems(&d), vec!["pkg:py-shop"]);
    assert_eq!(
        externals(&d),
        vec!["pkg:external/flask", "pkg:external/requests"]
    );
    assert_eq!(
        depends_on(&d),
        vec![
            pair("pkg:py-shop", "pkg:external/flask"),
            pair("pkg:py-shop", "pkg:external/requests")
        ]
    );
    assert!(d.warnings.is_empty());
}

#[test]
fn a_poetry_project_reads_its_dependency_tables_and_skips_python() {
    let d = run(&[(
        "pyproject.toml",
        "[tool.poetry]\nname = \"billing\"\n\n[tool.poetry.dependencies]\npython = \"^3.11\"\nfastapi = \"^0.110\"\n\n[tool.poetry.group.dev.dependencies]\npytest = \"^8\"\n",
    )])
    .expect("detected");
    assert_eq!(systems(&d), vec!["pkg:billing"]);
    assert_eq!(
        externals(&d),
        vec!["pkg:external/fastapi", "pkg:external/pytest"]
    );
}

#[test]
fn a_uv_workspace_yields_one_system_per_member_linked_by_workspace_sources() {
    let d = run(&[
        (
            "pyproject.toml",
            "[project]\nname = \"root\"\nversion = \"0\"\n\n[tool.uv.workspace]\nmembers = [\"packages/*\"]\n",
        ),
        (
            "packages/api/pyproject.toml",
            "[project]\nname = \"api\"\ndependencies = [\"core\", \"fastapi\"]\n\n[tool.uv.sources]\ncore = { workspace = true }\n",
        ),
        (
            "packages/core/pyproject.toml",
            "[project]\nname = \"core\"\ndependencies = [\"pydantic>=2\"]\n",
        ),
        ("packages/api/api/main.py", "x = 1\n"),
        ("packages/core/core/models.py", "x = 1\n"),
    ])
    .expect("detected");
    assert_eq!(systems(&d), vec!["pkg:api", "pkg:core"]);
    assert_eq!(
        externals(&d),
        vec!["pkg:external/fastapi", "pkg:external/pydantic"]
    );
    assert_eq!(
        depends_on(&d),
        vec![
            pair("pkg:api", "pkg:core"),
            pair("pkg:api", "pkg:external/fastapi"),
            pair("pkg:core", "pkg:external/pydantic"),
        ]
    );
}

#[test]
fn an_invalid_pyproject_warns_instead_of_failing() {
    let d = run(&[("pyproject.toml", "[project\nname = ")]).expect("detected");
    assert_eq!(d.warnings.len(), 1);
}

#[test]
fn the_default_chain_includes_the_pyproject_detector() {
    let tree = [(
        "pyproject.toml",
        "[project]\nname = \"py-shop\"\ndependencies = [\"flask\"]\n",
    )];
    let paths: Vec<&str> = tree.iter().map(|(p, _)| *p).collect();
    let read = |path: &str| {
        tree.iter()
            .find(|(c, _)| *c == path)
            .map(|(_, c)| c.as_bytes().to_vec())
    };
    let d = default_detectors()
        .iter()
        .find_map(|d| d.detect("shop", &paths, &read))
        .unwrap();
    assert_eq!(d.detector, "pyproject");
}
