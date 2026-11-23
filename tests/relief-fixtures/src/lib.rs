//! Builds deterministic git repositories from `fixtures/<name>/fixture.yaml`.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Deserialize;

const AUTHOR_NAME: &str = "Fixture";
const AUTHOR_EMAIL: &str = "fixture@relief.invalid";
const DEFAULT_BRANCH: &str = "main";

/// Errors raised while loading or building a fixture.
#[derive(Debug, thiserror::Error)]
pub enum FixtureError {
    #[error("{}: {source}", path.display())]
    Io { path: PathBuf, source: io::Error },
    #[error("{}: {message}", path.display())]
    Invalid { path: PathBuf, message: String },
    #[error("git {args}: {message}")]
    Git { args: String, message: String },
}

#[derive(Debug, Deserialize)]
struct RawFixture {
    commits: Vec<Commit>,
}

#[derive(Debug, Clone, Deserialize)]
struct Commit {
    id: String,
    message: String,
    date: String,
    branch: Option<String>,
    /// Author and committer name; the email is `<name>@relief.invalid`.
    author: Option<String>,
    /// Files written into the working tree before the commit instead of being stored in the repo.
    generate: Option<Generate>,
}

/// `packages/<pkg-NN>/file-NNN.ts`, each file exporting one function.
#[derive(Debug, Clone, Deserialize)]
struct Generate {
    packages: usize,
    files_per_package: usize,
    /// Imports of files of the following packages (modulo the package count) written in each file.
    #[serde(default)]
    imports_per_file: usize,
    /// Files rewritten in the working tree after the last commit, spread over the packages.
    #[serde(default)]
    modified_files: usize,
}

/// A fixture description: its directory and its ordered commits.
#[derive(Debug)]
pub struct Fixture {
    dir: PathBuf,
    commits: Vec<Commit>,
}

/// A repository built from a fixture.
#[derive(Debug)]
pub struct BuiltRepo {
    path: PathBuf,
    shas: HashMap<String, String>,
}

impl BuiltRepo {
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn sha(&self, id: &str) -> Option<&str> {
        self.shas.get(id).map(String::as_str)
    }
}

fn workspace_fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../fixtures")
        .components()
        .collect()
}

fn valid_iso_utc(date: &str) -> bool {
    let b = date.as_bytes();
    let pattern = b"dddd-dd-ddTdd:dd:ddZ";
    b.len() == pattern.len()
        && b.iter().zip(pattern).all(|(c, p)| match p {
            b'd' => c.is_ascii_digit(),
            other => c == other,
        })
}

impl Fixture {
    /// Loads `tests/fixtures/<name>/fixture.yaml` of the repository.
    pub fn load(name: &str) -> Result<Self, FixtureError> {
        Self::load_from(&workspace_fixtures().join(name))
    }

    /// Loads `<dir>/fixture.yaml`.
    pub fn load_from(dir: &Path) -> Result<Self, FixtureError> {
        let file = dir.join("fixture.yaml");
        let text = fs::read_to_string(&file).map_err(|source| FixtureError::Io {
            path: file.clone(),
            source,
        })?;
        let raw: RawFixture = serde_yaml::from_str(&text).map_err(|e| FixtureError::Invalid {
            path: file.clone(),
            message: e.to_string(),
        })?;
        for commit in &raw.commits {
            if !valid_iso_utc(&commit.date) {
                return Err(FixtureError::Invalid {
                    path: file,
                    message: format!(
                        "field `date` of commit `{}` must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ), got `{}`",
                        commit.id, commit.date
                    ),
                });
            }
        }
        Ok(Self {
            dir: dir.to_path_buf(),
            commits: raw.commits,
        })
    }

    /// Builds the git repository in `dir`.
    pub fn build(&self, dir: &Path) -> Result<BuiltRepo, FixtureError> {
        self.build_with_worktree(dir, |_| {})
    }

    /// Builds the repository, then lets `f` alter the working tree.
    pub fn build_with_worktree(
        &self,
        dir: &Path,
        f: impl FnOnce(&Path),
    ) -> Result<BuiltRepo, FixtureError> {
        let io_err = |path: &Path| {
            let path = path.to_path_buf();
            move |source| FixtureError::Io { path, source }
        };
        fs::create_dir_all(dir).map_err(io_err(dir))?;
        git(dir, &["init", "-q", "-b", DEFAULT_BRANCH], None)?;
        git(dir, &["config", "commit.gpgsign", "false"], None)?;
        let mut shas = HashMap::new();
        let mut current = DEFAULT_BRANCH.to_string();
        for commit in &self.commits {
            if let Some(branch) = &commit.branch
                && *branch != current
            {
                git(dir, &["checkout", "-q", "-B", branch], None)?;
                current = branch.clone();
            }
            if let Some(generate) = &commit.generate {
                write_generated(generate, dir)?;
            }
            let overlay = self.dir.join(&commit.id);
            if overlay.is_dir() {
                apply_overlay(&overlay, dir)?;
            }
            git(dir, &["add", "-A"], None)?;
            git(
                dir,
                &["commit", "-q", "--allow-empty", "-m", &commit.message],
                Some((&commit.date, commit.author.as_deref())),
            )?;
            let sha = git(dir, &["rev-parse", "HEAD"], None)?;
            shas.insert(commit.id.clone(), sha.trim().to_string());
        }
        if let Some(generate) = self.commits.iter().rev().find_map(|c| c.generate.as_ref()) {
            modify_generated(generate, dir)?;
        }
        f(dir);
        Ok(BuiltRepo {
            path: dir.to_path_buf(),
            shas,
        })
    }
}

fn write_generated(generate: &Generate, repo: &Path) -> Result<(), FixtureError> {
    for p in 0..generate.packages {
        let pkg = repo.join("packages").join(format!("pkg-{p:02}"));
        fs::create_dir_all(&pkg).map_err(|source| FixtureError::Io {
            path: pkg.clone(),
            source,
        })?;
        for f in 0..generate.files_per_package {
            let file = pkg.join(format!("file-{f:03}.ts"));
            let body = generated_body(generate, p, f, false);
            fs::write(&file, body).map_err(|source| FixtureError::Io { path: file, source })?;
        }
    }
    Ok(())
}

fn generated_body(generate: &Generate, p: usize, f: usize, modified: bool) -> String {
    let mut imports = String::new();
    let mut sum = String::new();
    for k in 1..=generate.imports_per_file {
        let tp = (p + k) % generate.packages;
        let tf = (f * 7 + k) % generate.files_per_package;
        imports.push_str(&format!(
            "import {{ f{tp}x{tf} }} from \"../pkg-{tp:02}/file-{tf:03}\";\n"
        ));
        sum.push_str(&format!(" + f{tp}x{tf}()"));
    }
    let value = if modified { f + 1 } else { f };
    format!("{imports}export function f{p}x{f}(): number {{\n  return {value}{sum};\n}}\n")
}

/// Rewrites `modified_files` generated files, one after the other across the packages.
fn modify_generated(generate: &Generate, repo: &Path) -> Result<(), FixtureError> {
    for n in 0..generate.modified_files {
        let p = n % generate.packages;
        let f = n / generate.packages;
        if f >= generate.files_per_package {
            break;
        }
        let file = repo
            .join("packages")
            .join(format!("pkg-{p:02}"))
            .join(format!("file-{f:03}.ts"));
        fs::write(&file, generated_body(generate, p, f, true))
            .map_err(|source| FixtureError::Io { path: file, source })?;
    }
    Ok(())
}

fn apply_overlay(overlay: &Path, repo: &Path) -> Result<(), FixtureError> {
    let delete = overlay.join("_delete.txt");
    if delete.is_file() {
        let text = fs::read_to_string(&delete).map_err(|source| FixtureError::Io {
            path: delete.clone(),
            source,
        })?;
        for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
            let target = repo.join(line);
            fs::remove_file(&target).map_err(|source| FixtureError::Io {
                path: target,
                source,
            })?;
        }
    }
    copy_tree(overlay, repo, true)
}

fn copy_tree(from: &Path, to: &Path, top: bool) -> Result<(), FixtureError> {
    let io_err = |path: &Path| {
        let path = path.to_path_buf();
        move |source| FixtureError::Io { path, source }
    };
    fs::create_dir_all(to).map_err(io_err(to))?;
    for entry in fs::read_dir(from).map_err(io_err(from))? {
        let entry = entry.map_err(io_err(from))?;
        let name = entry.file_name();
        if top && name == "_delete.txt" {
            continue;
        }
        let src = entry.path();
        let dst = to.join(&name);
        if src.is_dir() {
            copy_tree(&src, &dst, false)?;
        } else {
            fs::copy(&src, &dst).map_err(io_err(&src))?;
        }
    }
    Ok(())
}

fn git(
    dir: &Path,
    args: &[&str],
    stamp: Option<(&str, Option<&str>)>,
) -> Result<String, FixtureError> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(dir).args(args);
    let author = stamp.and_then(|(_, author)| author);
    let (name, email) = match author {
        Some(name) => (name.to_owned(), format!("{name}@relief.invalid")),
        None => (AUTHOR_NAME.to_owned(), AUTHOR_EMAIL.to_owned()),
    };
    cmd.env("GIT_AUTHOR_NAME", &name)
        .env("GIT_AUTHOR_EMAIL", &email)
        .env("GIT_COMMITTER_NAME", &name)
        .env("GIT_COMMITTER_EMAIL", &email);
    if let Some((date, _)) = stamp {
        let stamp = format!("{} +0000", date.trim_end_matches('Z'));
        cmd.env("GIT_AUTHOR_DATE", &stamp)
            .env("GIT_COMMITTER_DATE", &stamp);
    }
    let git_err = |message: String| FixtureError::Git {
        args: args.join(" "),
        message,
    };
    let out = cmd.output().map_err(|e| git_err(e.to_string()))?;
    if !out.status.success() {
        return Err(git_err(String::from_utf8_lossy(&out.stderr).into_owned()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
