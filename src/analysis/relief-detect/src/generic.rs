//! Generic detector: one system, folders as modules, files with a language.

use std::collections::{BTreeMap, BTreeSet};

use relief_model::{Node, NodeId, NodeKind, Visibility};

use relief_adapter_api::{Detection, Detector};

use crate::workspaces::read_json;

const EXCLUDED_DIRS: &[&str] = &["node_modules", "vendor", "dist", "build", "target", ".git"];

const LOCKFILES: &[&str] = &[
    "yarn.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "go.sum",
    "Gemfile.lock",
    "poetry.lock",
    "composer.lock",
];

const BINARY_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "pdf", "zip", "gz", "tar", "jar", "woff",
    "woff2", "ttf", "eot", "mp3", "mp4", "wasm", "so", "dll", "exe",
];

const LANGUAGES: &[&str] = &[
    "ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "kt", "rb", "php", "cs", "c", "cpp", "h",
    "swift", "md", "json", "yaml", "toml", "sql", "css", "html",
];

/// Number of leading bytes inspected for a NUL byte.
const BINARY_SNIFF_LEN: usize = 8000;

#[derive(Debug, Default, Clone, Copy)]
pub struct GenericDetector;

impl GenericDetector {
    pub fn new() -> Self {
        Self
    }
}

fn extension(path: &str) -> Option<&str> {
    let name = path.rsplit('/').next()?;
    let (stem, ext) = name.rsplit_once('.')?;
    (!stem.is_empty()).then_some(ext)
}

pub(crate) fn is_excluded_path(path: &str) -> bool {
    let mut parts = path.split('/');
    let name = parts.next_back().unwrap_or(path);
    if parts.any(|dir| EXCLUDED_DIRS.contains(&dir)) || LOCKFILES.contains(&name) {
        return true;
    }
    extension(path).is_some_and(|ext| BINARY_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
}

const FIXTURE_DIRS: &[&str] = &["fixtures", "__fixtures__", "testdata", "test-fixtures"];

/// A manifest living under a fixture folder: it describes test data, not a system.
pub(crate) fn is_fixture_path(path: &str) -> bool {
    let mut parts = path.split('/');
    parts.next_back();
    parts.any(|dir| FIXTURE_DIRS.contains(&dir))
}

/// Files outside any system, filed like the generic detector does: folder modules
/// (`pkg:<repo>/<dir>`, `path` = the folder) under the repo, files in their folder's module.
pub(crate) fn outside_nodes(repo_name: &str, files: &BTreeMap<&str, String>) -> Vec<Node> {
    let folders = Folders::new(files.keys().copied());
    let repo = NodeId::package(repo_name);
    let module_id = |dir: &str| NodeId::package(&format!("{repo_name}/{dir}"));
    let owner = |dir: Option<&str>| {
        folders
            .module_of(dir)
            .map_or_else(|| repo.clone(), module_id)
    };
    let mut nodes = Vec::new();
    for dir in folders.dirs.iter().filter(|dir| folders.is_module(dir)) {
        let mut module = node(
            module_id(dir),
            NodeKind::Module,
            "module",
            Some(owner(parent_dir(dir))),
            None,
            String::new(),
        );
        module.path = Some((*dir).to_owned());
        nodes.push(module);
    }
    for (path, hash) in files {
        let parent = owner(parent_dir(path));
        nodes.push(node(
            parent.clone().file(path),
            NodeKind::File,
            "file",
            Some(parent),
            lang_of(path),
            hash.clone(),
        ));
    }
    nodes
}

pub(crate) fn lang_of(path: &str) -> Option<String> {
    let ext = extension(path)?;
    let ext = match ext {
        "yml" => "yaml",
        "cc" | "cxx" | "hpp" => "cpp",
        other => other,
    };
    LANGUAGES.contains(&ext).then(|| ext.to_owned())
}

/// FNV-1a, hex encoded: a cheap deterministic content hash.
pub(crate) fn content_hash(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    });
    format!("{hash:016x}")
}

pub(crate) fn parent_dir(path: &str) -> Option<&str> {
    path.rsplit_once('/').map(|(dir, _)| dir)
}

/// Folders of a set of file paths, and which of them are modules.
pub(crate) struct Folders<'a> {
    /// Every directory holding a file, and its ancestors.
    pub dirs: BTreeSet<&'a str>,
    dirs_with_files: BTreeSet<&'a str>,
    child_dirs: BTreeMap<&'a str, BTreeSet<&'a str>>,
}

impl<'a> Folders<'a> {
    pub fn new(files: impl Iterator<Item = &'a str>) -> Self {
        let mut dirs = BTreeSet::new();
        let mut dirs_with_files = BTreeSet::new();
        let mut child_dirs: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
        for path in files {
            let mut current = parent_dir(path);
            if let Some(dir) = current {
                dirs_with_files.insert(dir);
            }
            while let Some(dir) = current {
                dirs.insert(dir);
                let up = parent_dir(dir);
                if let Some(up) = up {
                    child_dirs.entry(up).or_default().insert(dir);
                }
                current = up;
            }
        }
        Self {
            dirs,
            dirs_with_files,
            child_dirs,
        }
    }

    /// A directory with no file and a single child directory is merged into that child.
    pub fn is_module(&self, dir: &str) -> bool {
        self.dirs_with_files.contains(dir) || self.child_dirs.get(dir).map_or(0, BTreeSet::len) != 1
    }

    /// Nearest module at or above `dir`.
    pub fn module_of(&self, dir: Option<&'a str>) -> Option<&'a str> {
        let mut current = dir;
        while let Some(d) = current {
            if self.is_module(d) {
                return Some(d);
            }
            current = parent_dir(d);
        }
        None
    }
}

fn node(
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

impl Detector for GenericDetector {
    fn detect(
        &self,
        repo_name: &str,
        paths: &[&str],
        read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Option<Detection> {
        // The workspaces detector declined: an unreadable root manifest is
        // the one thing worth reporting.
        let mut warnings = Vec::new();
        if paths.contains(&"package.json") {
            read_json("package.json", read_blob, &mut warnings);
        }
        Some(Detection {
            detector: "generic".to_owned(),
            nodes: self.nodes(repo_name, paths, read_blob),
            edges: Vec::new(),
            warnings,
            package_dirs: BTreeMap::new(),
            entries: Vec::new(),
        })
    }
}

impl GenericDetector {
    fn nodes(
        &self,
        repo_name: &str,
        paths: &[&str],
        read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
    ) -> Vec<Node> {
        // Kept files with their content hash, sorted by path.
        let mut files: BTreeMap<&str, String> = BTreeMap::new();
        for path in paths {
            if is_excluded_path(path) {
                continue;
            }
            let blob = read_blob(path);
            if let Some(bytes) = &blob
                && bytes.iter().take(BINARY_SNIFF_LEN).any(|b| *b == 0)
            {
                continue;
            }
            files.insert(path, content_hash(&blob.unwrap_or_default()));
        }

        let folders = Folders::new(files.keys().copied());
        let dirs = &folders.dirs;

        let system = NodeId::package(repo_name);
        let module_id = |dir: &str| NodeId::package(&format!("{repo_name}/{dir}"));
        let owner = |dir: Option<&str>| {
            folders
                .module_of(dir)
                .map_or_else(|| system.clone(), module_id)
        };

        let mut nodes = vec![node(
            system.clone(),
            NodeKind::Repo,
            "system",
            None,
            None,
            String::new(),
        )];
        for dir in dirs.iter().filter(|dir| folders.is_module(dir)) {
            nodes.push(node(
                module_id(dir),
                NodeKind::Module,
                "module",
                Some(owner(parent_dir(dir))),
                None,
                String::new(),
            ));
        }
        for (path, hash) in &files {
            let parent = owner(parent_dir(path));
            nodes.push(node(
                parent.clone().file(path),
                NodeKind::File,
                "file",
                Some(parent),
                lang_of(path),
                hash.clone(),
            ));
        }
        nodes
    }
}
