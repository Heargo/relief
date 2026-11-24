//! The workspace file `<name>.relief.json` (ADR 0010): the repositories read together, their
//! labels and their default comparison. The data of the workspace live in the neighbouring
//! `.relief/`; the `.relief/` of the member repositories are never read nor written.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

use relief_git::GitSource;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::AppError;

/// Suffix of a workspace file name.
const SUFFIX: &str = ".relief.json";
const DEFAULT_SOURCE: &str = "WORKTREE";
const DEFAULT_DESTINATION: &str = "main";

/// A repository of a workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceRepo {
    /// Unique in the workspace, non empty, without `/`.
    pub name: String,
    /// Relative to the workspace file (`/`-separated), or absolute.
    pub path: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_destination")]
    pub destination: String,
}

fn default_source() -> String {
    DEFAULT_SOURCE.to_owned()
}

fn default_destination() -> String {
    DEFAULT_DESTINATION.to_owned()
}

/// A repository as written in the file: the known fields, and the ones relief keeps untouched.
#[derive(Serialize, Deserialize)]
struct StoredRepo {
    #[serde(flatten)]
    repo: WorkspaceRepo,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

/// What `<name>.relief.json` holds.
#[derive(Serialize, Deserialize)]
struct Stored {
    #[serde(default)]
    repos: Vec<StoredRepo>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    labels: Vec<String>,
    /// Fields relief does not know, kept as written when the file is saved.
    #[serde(flatten)]
    extra: Map<String, Value>,
}

/// The labels every workspace offers.
const DEFAULT_LABELS: [&str; 4] = ["front", "back", "ops", "tools"];

/// A set of repositories read on one map.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    pub name: String,
    pub repos: Vec<WorkspaceRepo>,
    /// The labels declared in the file, on top of the defaults.
    declared: Vec<String>,
    extra: Map<String, Value>,
    /// The unknown fields of each repository, by name.
    repo_extra: BTreeMap<String, Map<String, Value>>,
    file: PathBuf,
}

fn error(message: String) -> AppError {
    AppError::Workspace(message)
}

impl Workspace {
    /// Writes an empty `<dir>/<name>.relief.json` and prepares `<dir>/.relief/`.
    pub fn create(dir: &Path, name: &str) -> Result<Self, AppError> {
        if name.is_empty() || name.contains(['/', '\\']) {
            return Err(error(format!("invalid workspace name '{name}'")));
        }
        let file = dir.join(format!("{name}{SUFFIX}"));
        if file.exists() {
            return Err(error(format!("{} already exists", file.display())));
        }
        fs::create_dir_all(dir.join(".relief"))
            .map_err(|e| error(format!("cannot prepare {}: {e}", dir.display())))?;
        let workspace = Self {
            name: name.to_owned(),
            repos: Vec::new(),
            declared: Vec::new(),
            extra: Map::new(),
            repo_extra: BTreeMap::new(),
            file,
        };
        workspace.save()?;
        Ok(workspace)
    }

    /// Reads the workspace of a `.relief.json` file or of the folder that contains it.
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let found = Self::candidates(path);
        if found.len() > 1 {
            let names: Vec<String> = found.iter().map(|f| file_name(f)).collect();
            return Err(error(format!(
                "several workspace files in {}: {}",
                path.display(),
                names.join(", ")
            )));
        }
        let file = found
            .into_iter()
            .next()
            .ok_or_else(|| error(format!("no workspace file in {}", path.display())))?;
        let text = fs::read_to_string(&file)
            .map_err(|e| error(format!("cannot read {}: {e}", file.display())))?;
        let stored: Stored = serde_json::from_str(&text)
            .map_err(|e| error(format!("invalid workspace file {}: {e}", file.display())))?;
        let name = file_name(&file)
            .strip_suffix(SUFFIX)
            .unwrap_or_default()
            .to_owned();
        let mut seen: Vec<&str> = Vec::new();
        for StoredRepo { repo, .. } in &stored.repos {
            check_name(&repo.name)?;
            if seen.contains(&repo.name.as_str()) {
                return Err(error(format!(
                    "'{}' is twice in {}",
                    repo.name,
                    file.display()
                )));
            }
            seen.push(&repo.name);
        }
        Ok(Self {
            name,
            repo_extra: stored
                .repos
                .iter()
                .map(|r| (r.repo.name.clone(), r.extra.clone()))
                .collect(),
            repos: stored.repos.into_iter().map(|r| r.repo).collect(),
            declared: stored.labels,
            extra: stored.extra,
            file,
        })
    }

    /// The `.relief.json` file of a file or folder; `None` when there is none. With several in a
    /// folder, the first by name: [`Workspace::open`] refuses that case with an error.
    pub fn locate(path: &Path) -> Option<PathBuf> {
        Self::candidates(path).into_iter().next()
    }

    /// Every `.relief.json` file of a file or folder, sorted.
    fn candidates(path: &Path) -> Vec<PathBuf> {
        if path.is_file() {
            return if file_name(path).ends_with(SUFFIX) {
                vec![path.to_path_buf()]
            } else {
                Vec::new()
            };
        }
        let Ok(entries) = fs::read_dir(path) else {
            return Vec::new();
        };
        let mut found: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_file() && file_name(p).ends_with(SUFFIX))
            .collect();
        found.sort();
        found
    }

    /// A workspace named after the repository, in `dir`, with that repository.
    pub fn from_repo(repo: &Path, dir: &Path) -> Result<Self, AppError> {
        let name = folder_name(repo)?;
        Self::check_outside(dir, repo)?;
        let mut workspace = Self::create(dir, &name)?;
        workspace.add_repo(repo, &[])?;
        Ok(workspace)
    }

    /// The workspace file.
    pub fn file(&self) -> &Path {
        &self.file
    }

    /// The folder of the workspace file, where its `.relief/` lives.
    pub fn dir(&self) -> &Path {
        self.file.parent().unwrap_or(Path::new(""))
    }

    /// Absolute path of a member (the folder of the file joined with `path`).
    pub fn path_of(&self, repo: &WorkspaceRepo) -> PathBuf {
        self.dir().join(&repo.path)
    }

    /// Adds the repository at `repo`, named after its folder, and saves the file.
    pub fn add_repo(&mut self, repo: &Path, labels: &[&str]) -> Result<(), AppError> {
        let git = GitSource::open(repo)?;
        let name = folder_name(repo)?;
        check_name(&name)?;
        Self::check_outside(self.dir(), repo)?;
        if self.repos.iter().any(|r| r.name == name) {
            return Err(error(format!("'{name}' is already in the workspace")));
        }
        let target = repo
            .canonicalize()
            .map_err(|e| error(format!("cannot read {}: {e}", repo.display())))?;
        let base = self
            .dir()
            .canonicalize()
            .map_err(|e| error(format!("cannot read {}: {e}", self.dir().display())))?;
        self.repos.push(WorkspaceRepo {
            name,
            path: relative(&base, &target),
            labels: labels.iter().map(|l| (*l).to_owned()).collect(),
            source: default_source(),
            destination: crate::default_destination(&git)?,
        });
        self.save()
    }

    /// Refuses a workspace folder that is `repo` or inside it: relief would write its data there.
    pub(crate) fn check_outside(dir: &Path, repo: &Path) -> Result<(), AppError> {
        let (Ok(dir), Ok(repo)) = (dir.canonicalize(), repo.canonicalize()) else {
            return Ok(());
        };
        if dir.starts_with(&repo) {
            return Err(error(format!(
                "the workspace folder {} is inside the repository {}: choose another folder",
                dir.display(),
                repo.display()
            )));
        }
        Ok(())
    }

    /// Removes a repository by name and saves the file.
    pub fn remove_repo(&mut self, name: &str) -> Result<(), AppError> {
        let before = self.repos.len();
        self.repos.retain(|r| r.name != name);
        if self.repos.len() == before {
            return Err(error(format!("'{name}' is not in the workspace")));
        }
        self.save()
    }

    /// The labels a repository can carry: the defaults, then the declared ones.
    pub fn available_labels(&self) -> Vec<String> {
        let mut labels: Vec<String> = DEFAULT_LABELS.iter().map(|l| (*l).to_owned()).collect();
        for label in &self.declared {
            if !labels.contains(label) {
                labels.push(label.clone());
            }
        }
        labels
    }

    /// Replaces the labels of a repository and saves the file.
    pub fn set_labels(&mut self, repo: &str, labels: &[&str]) -> Result<(), AppError> {
        let available = self.available_labels();
        if let Some(unknown) = labels.iter().find(|l| !available.iter().any(|a| a == *l)) {
            return Err(error(format!("unknown label '{unknown}'")));
        }
        let target = self
            .repos
            .iter_mut()
            .find(|r| r.name == repo)
            .ok_or_else(|| error(format!("'{repo}' is not in the workspace")))?;
        target.labels = labels.iter().map(|l| (*l).to_owned()).collect();
        self.save()
    }

    /// Replaces the comparison of a repository and saves the file (the rest is kept as is).
    pub fn set_comparison(
        &mut self,
        repo: &str,
        source: &str,
        destination: &str,
    ) -> Result<(), AppError> {
        let target = self
            .repos
            .iter_mut()
            .find(|r| r.name == repo)
            .ok_or_else(|| error(format!("'{repo}' is not in the workspace")))?;
        target.source = source.to_owned();
        target.destination = destination.to_owned();
        self.save()
    }

    fn save(&self) -> Result<(), AppError> {
        let stored = Stored {
            labels: self.declared.clone(),
            repos: self
                .repos
                .iter()
                .map(|repo| StoredRepo {
                    repo: repo.clone(),
                    extra: self.repo_extra.get(&repo.name).cloned().unwrap_or_default(),
                })
                .collect(),
            extra: self.extra.clone(),
        };
        let text = serde_json::to_string_pretty(&stored)
            .map_err(|e| error(format!("cannot write {}: {e}", self.file.display())))?;
        fs::write(&self.file, format!("{text}\n"))
            .map_err(|e| error(format!("cannot write {}: {e}", self.file.display())))
    }
}

/// A repository name: non empty and without `/` (ADR 0010).
fn check_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.contains('/') {
        return Err(error(format!("invalid repository name '{name}'")));
    }
    Ok(())
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn folder_name(repo: &Path) -> Result<String, AppError> {
    let name = repo
        .canonicalize()
        .map(|p| file_name(&p))
        .map_err(|e| error(format!("cannot read {}: {e}", repo.display())))?;
    if name.is_empty() {
        return Err(error(format!("no folder name in {}", repo.display())));
    }
    Ok(name)
}

/// `target` seen from the folder `base` (both absolute), `/`-separated; `target` itself when the
/// two share no root.
fn relative(base: &Path, target: &Path) -> String {
    let a: Vec<Component> = base.components().collect();
    let b: Vec<Component> = target.components().collect();
    let common = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    if common == 0 {
        return target.to_string_lossy().replace('\\', "/");
    }
    let mut parts: Vec<String> = vec!["..".to_owned(); a.len() - common];
    parts.extend(
        b[common..]
            .iter()
            .map(|c| c.as_os_str().to_string_lossy().into_owned()),
    );
    parts.join("/")
}
