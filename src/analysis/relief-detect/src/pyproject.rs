//! Python projects detector: one system per `pyproject.toml` project (uv workspace
//! members when the root declares a workspace), with its external dependencies.

use std::collections::{BTreeMap, BTreeSet};

use relief_adapter_api::{Detection, Detector};
use relief_model::{Edge, EdgeKind, NodeId, NodeKind, Precision};
use toml::Value;

use crate::generic::{
    Folders, GenericDetector, content_hash, is_excluded_path, is_fixture_path, lang_of,
    outside_nodes, parent_dir,
};
use crate::workspaces::{glob_matches, node};

const EXTERNAL_GROUP: &str = "external";
const SERVER_FRAMEWORKS: &[&str] = &["flask", "fastapi", "django", "starlette"];

/// Detector for `pyproject.toml` projects; declines without one.
#[derive(Debug, Default, Clone, Copy)]
pub struct PyprojectDetector;

impl PyprojectDetector {
    pub fn new() -> Self {
        Self
    }
}

struct Project {
    name: String,
    dir: String,
    dependencies: BTreeSet<String>,
}

/// Distribution name of a PEP 508 requirement (extras, versions and markers stripped).
fn requirement_name(requirement: &str) -> Option<String> {
    let name: String = requirement
        .trim()
        .chars()
        .take_while(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect();
    (!name.is_empty() && !name.eq_ignore_ascii_case("python")).then_some(name)
}

fn requirement_list(value: Option<&Value>, out: &mut BTreeSet<String>) {
    for item in value.and_then(Value::as_array).into_iter().flatten() {
        out.extend(item.as_str().and_then(requirement_name));
    }
}

fn table_keys(value: Option<&Value>, out: &mut BTreeSet<String>) {
    for key in value
        .and_then(Value::as_table)
        .into_iter()
        .flat_map(|t| t.keys())
    {
        out.extend(requirement_name(key));
    }
}

fn dependencies(doc: &Value) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let project = doc.get("project");
    requirement_list(project.and_then(|p| p.get("dependencies")), &mut out);
    for group in project
        .and_then(|p| p.get("optional-dependencies"))
        .and_then(Value::as_table)
        .into_iter()
        .flat_map(|t| t.values())
    {
        requirement_list(Some(group), &mut out);
    }
    for group in doc
        .get("dependency-groups")
        .and_then(Value::as_table)
        .into_iter()
        .flat_map(|t| t.values())
    {
        requirement_list(Some(group), &mut out);
    }
    let poetry = doc.get("tool").and_then(|t| t.get("poetry"));
    table_keys(poetry.and_then(|p| p.get("dependencies")), &mut out);
    table_keys(poetry.and_then(|p| p.get("dev-dependencies")), &mut out);
    for group in poetry
        .and_then(|p| p.get("group"))
        .and_then(Value::as_table)
        .into_iter()
        .flat_map(|t| t.values())
    {
        table_keys(group.get("dependencies"), &mut out);
    }
    out
}

fn project_name(doc: &Value) -> Option<String> {
    doc.get("project")
        .and_then(|p| p.get("name"))
        .or_else(|| {
            doc.get("tool")
                .and_then(|t| t.get("poetry"))
                .and_then(|p| p.get("name"))
        })
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn workspace_members(doc: &Value) -> Vec<String> {
    doc.get("tool")
        .and_then(|t| t.get("uv"))
        .and_then(|u| u.get("workspace"))
        .and_then(|w| w.get("members"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|m| m.as_str().map(str::to_owned))
        .collect()
}

impl Detector for PyprojectDetector {
    fn detect(
        &self,
        repo_name: &str,
        paths: &[&str],
        read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Option<Detection> {
        let mut manifests: Vec<&str> = paths
            .iter()
            .copied()
            .filter(|p| {
                (*p == "pyproject.toml" || p.ends_with("/pyproject.toml"))
                    && !is_excluded_path(p)
                    && !is_fixture_path(p)
            })
            .collect();
        if manifests.is_empty() {
            return None;
        }
        manifests.sort_unstable();
        let mut warnings = Vec::new();
        let mut docs: Vec<(&str, Value)> = Vec::new();
        for manifest in manifests {
            let text =
                String::from_utf8_lossy(&read_blob(manifest).unwrap_or_default()).into_owned();
            match toml::from_str::<Value>(&text) {
                Ok(doc) => docs.push((manifest, doc)),
                Err(err) => warnings.push(format!("invalid {manifest}: {err}")),
            }
        }
        let globs: Vec<String> = docs
            .iter()
            .filter(|(m, _)| *m == "pyproject.toml")
            .flat_map(|(_, doc)| workspace_members(doc))
            .collect();
        let mut projects: BTreeMap<String, Project> = BTreeMap::new();
        for (manifest, doc) in &docs {
            let dir = parent_dir(manifest).unwrap_or_default();
            if !globs.is_empty() && !globs.iter().any(|g| glob_matches(g, dir)) {
                continue;
            }
            let name = project_name(doc)
                .unwrap_or_else(|| if dir.is_empty() { repo_name } else { dir }.to_owned());
            projects.entry(name.clone()).or_insert(Project {
                name,
                dir: dir.to_owned(),
                dependencies: dependencies(doc),
            });
        }
        if projects.is_empty() {
            let mut detection = GenericDetector::new().detect(repo_name, paths, read_blob)?;
            "pyproject".clone_into(&mut detection.detector);
            detection.warnings = warnings;
            return Some(detection);
        }
        Some(build(repo_name, paths, read_blob, &projects, warnings))
    }
}

fn build(
    repo_name: &str,
    paths: &[&str],
    read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    projects: &BTreeMap<String, Project>,
    warnings: Vec<String>,
) -> Detection {
    let repo = NodeId::package(repo_name);
    let mut nodes = vec![node(
        repo.clone(),
        NodeKind::Repo,
        "system",
        None,
        None,
        String::new(),
    )];
    let mut edges = Vec::new();
    let mut externals: BTreeSet<&str> = BTreeSet::new();
    let mut package_dirs = BTreeMap::new();
    for project in projects.values() {
        let server = project
            .dependencies
            .iter()
            .any(|d| SERVER_FRAMEWORKS.contains(&d.to_lowercase().as_str()));
        let (kind, subkind) = if server {
            (NodeKind::Service, "http-server")
        } else {
            (NodeKind::Package, "library")
        };
        let mut system = node(
            NodeId::package(&project.name),
            kind,
            subkind,
            Some(repo.clone()),
            None,
            String::new(),
        );
        system.path = Some(project.dir.clone());
        nodes.push(system);
        package_dirs.insert(project.name.clone(), project.dir.clone());
        for dep in &project.dependencies {
            let to = if projects.contains_key(dep) {
                NodeId::package(dep)
            } else {
                externals.insert(dep);
                NodeId::package(&format!("{EXTERNAL_GROUP}/{dep}"))
            };
            edges.push(Edge {
                from: NodeId::package(&project.name),
                to,
                kind: EdgeKind::DependsOn,
                precision: Precision::Resolved,
                heuristic: false,
                count: None,
            });
        }
    }
    if !externals.is_empty() {
        let group = NodeId::package(EXTERNAL_GROUP);
        nodes.push(node(
            group.clone(),
            NodeKind::Module,
            "external-group",
            Some(repo.clone()),
            None,
            String::new(),
        ));
        for name in externals {
            nodes.push(node(
                NodeId::package(&format!("{EXTERNAL_GROUP}/{name}")),
                NodeKind::External,
                "external",
                Some(group.clone()),
                None,
                String::new(),
            ));
        }
    }

    // Files belong to the deepest project containing them, else to the repo.
    let mut by_owner: BTreeMap<Option<&str>, Vec<(&str, String)>> = BTreeMap::new();
    for path in paths {
        if is_excluded_path(path) {
            continue;
        }
        let blob = read_blob(path);
        if blob
            .as_ref()
            .is_some_and(|b| b.iter().take(8000).any(|x| *x == 0))
        {
            continue;
        }
        let owner = projects
            .values()
            .filter(|p| p.dir.is_empty() || path.starts_with(&format!("{}/", p.dir)))
            .max_by_key(|p| p.dir.len());
        by_owner
            .entry(owner.map(|p| p.name.as_str()))
            .or_default()
            .push((path, content_hash(&blob.unwrap_or_default())));
    }
    if let Some(outside) = by_owner.remove(&None) {
        let outside: BTreeMap<&str, String> = outside.into_iter().collect();
        nodes.extend(outside_nodes(repo_name, &outside));
    }
    for (owner, mut owned) in by_owner {
        owned.sort_unstable();
        let Some(project) = owner.and_then(|name| projects.get(name)) else {
            continue;
        };
        let system = NodeId::package(&project.name);
        let prefix = if project.dir.is_empty() {
            0
        } else {
            project.dir.len() + 1
        };
        let rels: Vec<&str> = owned.iter().map(|(p, _)| &p[prefix..]).collect();
        let folders = Folders::new(rels.iter().copied());
        let module_id = |dir: &str| NodeId::package(&format!("{}/{dir}", project.name));
        let owner_of = |dir: Option<&str>| {
            folders
                .module_of(dir)
                .map_or_else(|| system.clone(), module_id)
        };
        for dir in folders.dirs.iter().filter(|d| folders.is_module(d)) {
            let mut module = node(
                module_id(dir),
                NodeKind::Module,
                "module",
                Some(owner_of(parent_dir(dir))),
                None,
                String::new(),
            );
            module.path = Some(if project.dir.is_empty() {
                (*dir).to_owned()
            } else {
                format!("{}/{dir}", project.dir)
            });
            nodes.push(module);
        }
        for ((path, hash), rel) in owned.into_iter().zip(&rels) {
            let parent = owner_of(parent_dir(rel));
            nodes.push(node(
                parent.clone().file(path),
                NodeKind::File,
                "file",
                Some(parent),
                lang_of(path),
                hash,
            ));
        }
    }

    Detection {
        detector: "pyproject".to_owned(),
        nodes,
        edges,
        warnings,
        package_dirs,
        entries: Vec::new(),
    }
}
