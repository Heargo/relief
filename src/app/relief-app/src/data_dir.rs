//! The folder where relief keeps its data for one repository.

use std::fs;
use std::path::{Path, PathBuf};

use relief_git::GitSource;

use crate::AppError;

/// Current format of the data folder (`relief.json`).
const FORMAT: u64 = 1;

/// The environment variables that place the data folder.
#[derive(Debug, Clone, Default)]
pub struct DataDirEnv {
    /// `RELIEF_CACHE_DIR`: the folder itself is the root of the data.
    pub relief_cache_dir: Option<PathBuf>,
    /// `XDG_CACHE_HOME`.
    pub xdg_cache_home: Option<PathBuf>,
    /// `HOME`.
    pub home: Option<PathBuf>,
}

impl DataDirEnv {
    /// Reads the variables from the process environment.
    pub fn from_process() -> Self {
        let var = |name: &str| std::env::var_os(name).map(PathBuf::from);
        Self {
            relief_cache_dir: var("RELIEF_CACHE_DIR"),
            xdg_cache_home: var("XDG_CACHE_HOME"),
            home: var("HOME"),
        }
    }
}

/// An opened data folder: `cache/` (disposable), `state/` (to keep),
/// `.gitignore` and `relief.json`.
#[derive(Debug, Clone)]
pub struct DataDir {
    root: PathBuf,
    fallback: bool,
}

impl DataDir {
    /// Resolves and prepares the data folder of the repository at `repo`:
    /// `$RELIEF_CACHE_DIR`, else `<worktree>/.relief/`, else (bare or
    /// read-only repository) `<user cache>/relief/<repo-id>/`.
    pub fn open(repo: &Path, env: &DataDirEnv) -> Result<Self, AppError> {
        let source = GitSource::open(repo)?;
        let repo_id = source.repo_id()?.to_string();
        if let Some(root) = &env.relief_cache_dir {
            Self::prepare(root, &repo_id)?;
            return Ok(Self {
                root: root.clone(),
                fallback: false,
            });
        }
        if let Some(workdir) = source.workdir() {
            let root = workdir.join(".relief");
            match Self::prepare(&root, &repo_id) {
                Ok(()) => {
                    return Ok(Self {
                        root,
                        fallback: false,
                    });
                }
                Err(err @ AppError::DataDirFormat { .. }) => return Err(err),
                Err(_) => {}
            }
        }
        let base = env
            .xdg_cache_home
            .clone()
            .or_else(|| env.home.as_ref().map(|h| h.join(".cache")))
            .ok_or_else(|| AppError::DataDir("no data folder: set RELIEF_CACHE_DIR".to_owned()))?;
        let root = base.join("relief").join(&repo_id);
        Self::prepare(&root, &repo_id)?;
        Ok(Self {
            root,
            fallback: true,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("cache")
    }

    pub fn state_dir(&self) -> PathBuf {
        self.root.join("state")
    }

    /// Whether the data lives in the user cache instead of the repository.
    pub fn is_fallback(&self) -> bool {
        self.fallback
    }

    /// Checks the format, then creates what is missing and (re)writes `relief.json`.
    fn prepare(root: &Path, repo_id: &str) -> Result<(), AppError> {
        let info = root.join("relief.json");
        let found = fs::read_to_string(&info)
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .and_then(|json| json.get("format")?.as_u64());
        if let Some(found) = found
            && found > FORMAT
        {
            return Err(AppError::DataDirFormat {
                found,
                supported: FORMAT,
            });
        }
        let io = |err: std::io::Error| {
            AppError::DataDir(format!("cannot prepare {}: {err}", root.display()))
        };
        fs::create_dir_all(root.join("cache")).map_err(io)?;
        fs::create_dir_all(root.join("state")).map_err(io)?;
        let ignore = root.join(".gitignore");
        if !ignore.exists() {
            fs::write(ignore, "*\n").map_err(io)?;
        }
        if found != Some(FORMAT) {
            let json = serde_json::json!({
                "format": FORMAT,
                "repoId": repo_id,
                "reliefVersion": env!("CARGO_PKG_VERSION"),
            });
            fs::write(info, format!("{json:#}\n")).map_err(io)?;
        }
        Ok(())
    }
}
