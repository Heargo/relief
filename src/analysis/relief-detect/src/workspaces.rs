//! Workspaces detector: npm, pnpm and yarn workspaces, one system per package.

use std::collections::{BTreeMap, BTreeSet};

use relief_model::{Edge, EdgeKind, Node, NodeId, NodeKind, Precision, Visibility};
use serde_json::Value;

use crate::generic::{
    Folders, content_hash, is_excluded_path, is_fixture_path, lang_of, outside_nodes, parent_dir,
};
use relief_adapter_api::{Detection, Detector, EntryPoint};

const DEPENDENCY_FIELDS: &[&str] = &["dependencies", "devDependencies", "peerDependencies"];
const EXTERNAL_GROUP: &str = "external";

/// Detector for npm, pnpm and yarn workspaces; declines without a workspace.
#[derive(Debug, Default, Clone, Copy)]
pub struct WorkspacesDetector;

impl WorkspacesDetector {
    pub fn new() -> Self {
        Self
    }
}

impl Detector for WorkspacesDetector {
    fn detect(
        &self,
        repo_name: &str,
        paths: &[&str],
        read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Option<Detection> {
        detect_workspaces(repo_name, paths, read_blob, &|_| None, &mut Vec::new())
    }

    fn detect_with(
        &self,
        repo_name: &str,
        paths: &[&str],
        read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
        known: &dyn Fn(&str) -> Option<String>,
    ) -> Option<Detection> {
        detect_workspaces(repo_name, paths, read_blob, known, &mut Vec::new())
    }
}

struct Package {
    name: String,
    dir: String,
    json: Value,
}

pub(crate) fn read_json(
    path: &str,
    read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    warnings: &mut Vec<String>,
) -> Option<Value> {
    let bytes = read_blob(path)?;
    match serde_json::from_slice(&bytes) {
        Ok(value) => Some(value),
        Err(err) => {
            warnings.push(format!("invalid {path}: {err}"));
            None
        }
    }
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

/// Globs of the `packages:` list of a `pnpm-workspace.yaml`.
fn pnpm_globs(yaml: &str) -> Vec<String> {
    let mut globs = Vec::new();
    let mut in_packages = false;
    for line in yaml.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if !line.starts_with(char::is_whitespace) && !trimmed.starts_with('-') {
            in_packages = trimmed.starts_with("packages:");
            continue;
        }
        if in_packages && let Some(item) = trimmed.strip_prefix('-') {
            let glob = item.trim().trim_matches(|c| c == '"' || c == '\'');
            if !glob.is_empty() {
                globs.push(glob.to_owned());
            }
        }
    }
    globs
}

fn workspace_globs(
    paths: &[&str],
    read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    root: Option<&Value>,
) -> Vec<String> {
    if paths.contains(&"pnpm-workspace.yaml") {
        let yaml = read_blob("pnpm-workspace.yaml").unwrap_or_default();
        return pnpm_globs(&String::from_utf8_lossy(&yaml));
    }
    let workspaces = root.and_then(|r| r.get("workspaces"));
    match workspaces {
        Some(Value::Array(_)) => string_list(workspaces),
        Some(Value::Object(map)) => string_list(map.get("packages")),
        _ => Vec::new(),
    }
}

fn segments_match(pattern: &[&str], dir: &[&str]) -> bool {
    match pattern.split_first() {
        None => dir.is_empty(),
        Some((&"**", rest)) => (0..=dir.len()).any(|skip| segments_match(rest, &dir[skip..])),
        Some((seg, rest)) => dir
            .split_first()
            .is_some_and(|(d, tail)| segment_match(seg, d) && segments_match(rest, tail)),
    }
}

/// One path segment against a pattern where `*` matches any run of characters.
fn segment_match(pattern: &str, text: &str) -> bool {
    match pattern.split_once('*') {
        None => pattern == text,
        Some((head, tail)) => text.strip_prefix(head).is_some_and(|rest| {
            (0..=rest.len())
                .filter(|i| rest.is_char_boundary(*i))
                .any(|i| segment_match(tail, &rest[i..]))
        }),
    }
}

pub(crate) fn glob_matches(glob: &str, dir: &str) -> bool {
    let glob = glob.trim_start_matches("./").trim_end_matches('/');
    let pattern: Vec<&str> = glob.split('/').collect();
    let dir: Vec<&str> = dir.split('/').collect();
    segments_match(&pattern, &dir)
}

pub(crate) fn node(
    id: NodeId,
    kind: NodeKind,
    subkind: &str,
    parent: Option<NodeId>,
    lang: Option<String>,
    content_hash: String,
) -> Node {
    Node {
        id,
        kind,
        subkind: subkind.to_owned(),
        parent,
        lang,
        span: None,
        visibility: Visibility::Public,
        content_hash,
        signature_hash: None,
        metrics: None,
        path: None,
        route: None,
        entry: false,
        entry_type: None,
        child_count: None,
    }
}

fn dependency_names(json: &Value) -> BTreeSet<String> {
    DEPENDENCY_FIELDS
        .iter()
        .filter_map(|field| json.get(field).and_then(Value::as_object))
        .flat_map(|map| map.keys().cloned())
        .collect()
}

fn has_dependency(json: &Value, names: &[&str]) -> bool {
    dependency_names(json)
        .iter()
        .any(|dep| names.contains(&dep.as_str()))
}

fn classify(package: &Package) -> (NodeKind, &'static str) {
    let has_script = |name: &str| {
        package
            .json
            .get("scripts")
            .and_then(|s| s.get(name))
            .is_some()
    };
    let is_service = package.dir.starts_with("apps/") || has_script("start") || has_script("dev");
    let kind = if is_service {
        NodeKind::Service
    } else {
        NodeKind::Package
    };
    let subkind = if has_dependency(&package.json, &["react"]) {
        "react-app"
    } else if has_dependency(&package.json, &["fastify", "express"]) {
        "http-server"
    } else {
        "library"
    };
    (kind, subkind)
}

fn detect_workspaces(
    repo_name: &str,
    paths: &[&str],
    read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    known: &dyn Fn(&str) -> Option<String>,
    warnings: &mut Vec<String>,
) -> Option<Detection> {
    let root = if paths.contains(&"package.json") {
        read_json("package.json", read_blob, warnings)
    } else {
        None
    };
    let globs: Vec<String> = workspace_globs(paths, read_blob, root.as_ref())
        .into_iter()
        .filter(|g| !g.starts_with('!'))
        .collect();
    if globs.is_empty() {
        return None;
    }

    let mut packages: BTreeMap<String, Package> = BTreeMap::new();
    let mut manifests: Vec<&str> = paths
        .iter()
        .copied()
        .filter(|p| p.ends_with("/package.json") && !is_excluded_path(p) && !is_fixture_path(p))
        .collect();
    manifests.sort_unstable();
    for manifest in manifests {
        let dir = parent_dir(manifest).unwrap_or_default();
        if !globs.iter().any(|g| glob_matches(g, dir)) {
            continue;
        }
        let Some(json) = read_json(manifest, read_blob, warnings) else {
            continue;
        };
        let name = json
            .get("name")
            .and_then(Value::as_str)
            .map_or_else(|| dir.to_owned(), str::to_owned);
        packages.entry(name.clone()).or_insert(Package {
            name,
            dir: dir.to_owned(),
            json,
        });
    }
    if packages.is_empty() {
        return None;
    }

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
    let mut externals: BTreeSet<String> = BTreeSet::new();
    let mut package_dirs = BTreeMap::new();
    let mut entries = Vec::new();
    for package in packages.values() {
        let (kind, subkind) = classify(package);
        let mut system = node(
            NodeId::package(&package.name),
            kind,
            subkind,
            Some(repo.clone()),
            None,
            String::new(),
        );
        system.path = Some(package.dir.clone());
        let script_count = package
            .json
            .get("scripts")
            .and_then(Value::as_object)
            .map_or(0, |scripts| scripts.len());
        for _ in 0..script_count {
            entries.push(EntryPoint {
                node: system.id.clone(),
                entry_type: "script".to_owned(),
            });
        }
        nodes.push(system);
        package_dirs.insert(package.name.clone(), package.dir.clone());
        for dep in dependency_names(&package.json) {
            let to = if packages.contains_key(&dep) {
                NodeId::package(&dep)
            } else {
                externals.insert(dep.clone());
                NodeId::package(&format!("{EXTERNAL_GROUP}/{dep}"))
            };
            edges.push(Edge {
                from: NodeId::package(&package.name),
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
        for name in &externals {
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

    // Files belong to the deepest package containing them, else to the repo.
    let mut files: BTreeMap<&str, String> = BTreeMap::new();
    for path in paths {
        if is_excluded_path(path) {
            continue;
        }
        if let Some(hash) = known(path) {
            files.insert(path, hash);
            continue;
        }
        let blob = read_blob(path);
        if blob
            .as_ref()
            .is_some_and(|b| b.iter().take(8000).any(|x| *x == 0))
        {
            continue;
        }
        files.insert(path, content_hash(&blob.unwrap_or_default()));
    }
    // Files of each package (relative to its directory), `None` for the repo.
    let mut by_owner: BTreeMap<Option<&str>, Vec<(&str, String)>> = BTreeMap::new();
    for (path, hash) in files {
        let owner = packages
            .values()
            .filter(|p| path.starts_with(&format!("{}/", p.dir)))
            .max_by_key(|p| p.dir.len());
        by_owner
            .entry(owner.map(|p| p.name.as_str()))
            .or_default()
            .push((path, hash));
    }
    if let Some(outside) = by_owner.remove(&None) {
        let outside: BTreeMap<&str, String> = outside.into_iter().collect();
        nodes.extend(outside_nodes(repo_name, &outside));
    }
    for (owner, owned) in by_owner {
        let Some(package) = owner.and_then(|name| packages.get(name)) else {
            continue;
        };
        let system = NodeId::package(&package.name);
        let relative = |path: &str| path[package.dir.len() + 1..].to_owned();
        let rels: Vec<String> = owned.iter().map(|(p, _)| relative(p)).collect();
        let folders = Folders::new(rels.iter().map(String::as_str));
        let module_id = |dir: &str| NodeId::package(&format!("{}/{dir}", package.name));
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
            module.path = Some(format!("{}/{dir}", package.dir));
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

    Some(Detection {
        detector: "workspaces".to_owned(),
        nodes,
        edges,
        warnings: std::mem::take(warnings),
        package_dirs,
        entries,
    })
}
