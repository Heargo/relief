//! Seam 1 of ticket K07: the workspace file `<name>.relief.json` and the multi-repository
//! session, on two fixture repositories (acme-shop and tiny) and a temporary workspace folder.
//!
//! API expected:
//! - `relief_app::Workspace { name: String, repos: Vec<WorkspaceRepo> }` (Debug, Clone,
//!   PartialEq) and `relief_app::WorkspaceRepo { name, path, labels: Vec<String>, source,
//!   destination }` (all `String`; `path` is relative to the workspace file, `/`-separated).
//! - `Workspace::create(dir: &Path, name: &str) -> Result<Workspace, AppError>`: writes
//!   `<dir>/<name>.relief.json` (no repository yet) and prepares `<dir>/.relief/`.
//! - `Workspace::open(path: &Path) -> Result<Workspace, AppError>`: `path` is the file or its
//!   folder.
//! - `Workspace::locate(path: &Path) -> Option<PathBuf>`: the `.relief.json` file of a file or
//!   folder, `None` when there is none.
//! - `Workspace::file(&self) -> &Path`, `Workspace::path_of(&self, &WorkspaceRepo) -> PathBuf`
//!   (absolute: the folder of the file joined with `path`).
//! - `Workspace::add_repo(&mut self, repo: &Path, labels: &[&str]) -> Result<(), AppError>`: the
//!   name is the folder name; source `WORKTREE` and destination `main` by default; saves the file.
//!   A folder that is not a repository, or a name already in the workspace, is an error.
//! - `Workspace::remove_repo(&mut self, name: &str) -> Result<(), AppError>`: saves the file;
//!   an unknown name is an error.
//! - `Workspace::from_repo(repo: &Path, dir: &Path) -> Result<Workspace, AppError>`: "open this
//!   repository as a workspace": a workspace named after the repository, in `dir`, with it.
//! - `Session::open_workspace(path: &Path, SessionOptions) -> Result<Session, AppError>`: the
//!   data folder is `<workspace folder>/.relief/` (the options' environment does not move it).
//!   `meta()` serialises with `"repo"` = the workspace name and
//!   `"workspace": { "repos": [{ "name", "labels" }] }`, in file order; a repository session
//!   has no `workspace`.
//! - File: `{ "repos": [{ "name", "path", "labels", "source", "destination" }] }`.

mod common;

use std::fs;
use std::path::{Path, PathBuf};

use common::options;
use relief_app::{DataDirEnv, Session, SessionOptions, Workspace, WorkspaceRepo};
use relief_fixtures::Fixture;
use serde_json::{Value, json};
use tempfile::TempDir;

struct Setup {
    dir: TempDir,
    acme: PathBuf,
    tiny: PathBuf,
    ws: PathBuf,
}

fn setup() -> Setup {
    let dir = TempDir::new().unwrap();
    let acme = dir.path().join("acme");
    let tiny = dir.path().join("tiny");
    let ws = dir.path().join("space");
    Fixture::load("acme-shop").unwrap().build(&acme).unwrap();
    Fixture::load("tiny").unwrap().build(&tiny).unwrap();
    fs::create_dir(&ws).unwrap();
    Setup {
        dir,
        acme,
        tiny,
        ws,
    }
}

fn read_file(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

/// Every path under `root` (relative), to compare a repository before and after.
fn listing(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.file_name().is_some_and(|n| n == ".git") {
                continue;
            }
            out.push(path.strip_prefix(root).unwrap().display().to_string());
            if path.is_dir() {
                stack.push(path);
            }
        }
    }
    out.sort();
    out
}

fn repo(name: &str, path: &str, labels: &[&str], source: &str, destination: &str) -> WorkspaceRepo {
    WorkspaceRepo {
        name: name.to_owned(),
        path: path.to_owned(),
        labels: labels.iter().map(|l| (*l).to_owned()).collect(),
        source: source.to_owned(),
        destination: destination.to_owned(),
    }
}

#[test]
fn create_writes_an_empty_workspace_file_and_its_data_folder() {
    let s = setup();
    let ws = Workspace::create(&s.ws, "shop").unwrap();
    assert_eq!(ws.name, "shop");
    assert!(ws.repos.is_empty());
    let file = s.ws.join("shop.relief.json");
    assert_eq!(read_file(&file), json!({ "repos": [] }));
    assert!(s.ws.join(".relief").is_dir());
}

#[test]
fn add_repo_stores_a_path_relative_to_the_file_and_the_default_comparison() {
    let s = setup();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    ws.add_repo(&s.acme, &["back"]).unwrap();
    ws.add_repo(&s.tiny, &[]).unwrap();
    assert_eq!(
        read_file(&s.ws.join("shop.relief.json")),
        json!({ "repos": [
            { "name": "acme", "path": "../acme", "labels": ["back"],
              "source": "WORKTREE", "destination": "main" },
            { "name": "tiny", "path": "../tiny", "labels": [],
              "source": "WORKTREE", "destination": "main" },
        ] })
    );
    assert_eq!(ws.path_of(&ws.repos[0]), s.ws.join("../acme"));
}

#[test]
fn the_workspace_reopens_by_its_file_and_by_its_folder_with_what_was_saved() {
    let s = setup();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    ws.add_repo(&s.acme, &["back", "ops"]).unwrap();
    ws.add_repo(&s.tiny, &["front"]).unwrap();
    let expected = vec![
        repo("acme", "../acme", &["back", "ops"], "WORKTREE", "main"),
        repo("tiny", "../tiny", &["front"], "WORKTREE", "main"),
    ];
    let by_file = Workspace::open(&s.ws.join("shop.relief.json")).unwrap();
    assert_eq!(by_file.name, "shop");
    assert_eq!(by_file.repos, expected);
    let by_folder = Workspace::open(&s.ws).unwrap();
    assert_eq!(by_folder, by_file);
}

#[test]
fn a_file_written_by_hand_keeps_its_comparison_defaults() {
    let s = setup();
    fs::write(
        s.ws.join("shop.relief.json"),
        json!({ "repos": [{ "name": "api", "path": "../acme", "labels": ["back"],
            "source": "feat/promo-codes", "destination": "develop" }] })
        .to_string(),
    )
    .unwrap();
    let ws = Workspace::open(&s.ws).unwrap();
    assert_eq!(
        ws.repos,
        vec![repo(
            "api",
            "../acme",
            &["back"],
            "feat/promo-codes",
            "develop"
        )]
    );
}

#[test]
fn remove_repo_drops_it_from_the_file() {
    let s = setup();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    ws.add_repo(&s.acme, &[]).unwrap();
    ws.add_repo(&s.tiny, &[]).unwrap();
    ws.remove_repo("acme").unwrap();
    let names: Vec<String> = Workspace::open(&s.ws)
        .unwrap()
        .repos
        .into_iter()
        .map(|r| r.name)
        .collect();
    assert_eq!(names, ["tiny"]);
    assert!(ws.remove_repo("acme").is_err(), "already removed");
}

#[test]
fn add_repo_refuses_a_folder_that_is_not_a_repository_and_a_name_already_taken() {
    let s = setup();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    let plain = s.dir.path().join("plain");
    fs::create_dir(&plain).unwrap();
    assert!(ws.add_repo(&plain, &[]).is_err());
    ws.add_repo(&s.acme, &[]).unwrap();
    assert!(ws.add_repo(&s.acme, &[]).is_err());
    assert_eq!(ws.repos.len(), 1);
    assert_eq!(Workspace::open(&s.ws).unwrap().repos.len(), 1);
}

#[test]
fn from_repo_makes_a_workspace_named_after_the_repository() {
    let s = setup();
    let ws = Workspace::from_repo(&s.acme, &s.ws).unwrap();
    assert_eq!(ws.name, "acme");
    assert_eq!(
        read_file(&s.ws.join("acme.relief.json")),
        json!({ "repos": [{ "name": "acme", "path": "../acme", "labels": [],
            "source": "WORKTREE", "destination": "main" }] })
    );
}

#[test]
fn locate_finds_the_file_from_the_file_or_its_folder() {
    let s = setup();
    Workspace::create(&s.ws, "shop").unwrap();
    let file = s.ws.join("shop.relief.json");
    assert_eq!(Workspace::locate(&file), Some(file.clone()));
    assert_eq!(Workspace::locate(&s.ws), Some(file));
    assert_eq!(Workspace::locate(&s.acme), None);
}

#[test]
fn opening_a_folder_without_a_workspace_file_is_an_error() {
    let s = setup();
    assert!(Workspace::open(&s.ws).is_err());
}

#[test]
fn the_session_meta_says_it_is_a_workspace_and_lists_its_repositories() {
    let s = setup();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    ws.add_repo(&s.acme, &["back"]).unwrap();
    ws.add_repo(&s.tiny, &["front"]).unwrap();
    let session = Session::open_workspace(&s.ws.join("shop.relief.json"), options(None)).unwrap();
    let meta = serde_json::to_value(session.meta()).unwrap();
    assert_eq!(meta["repo"], "shop", "{meta}");
    assert_eq!(
        meta["workspace"],
        json!({ "repos": [
            { "name": "acme", "labels": ["back"] },
            { "name": "tiny", "labels": ["front"] },
        ] })
    );
}

#[test]
fn a_repository_session_has_no_workspace_in_its_meta() {
    let s = setup();
    let session = Session::open(&s.acme, options(None)).unwrap();
    let meta = serde_json::to_value(session.meta()).unwrap();
    assert!(meta["workspace"].is_null(), "{meta}");
}

#[test]
fn the_workspace_session_keeps_its_data_in_the_workspace_folder_and_writes_nothing_in_the_repositories()
 {
    let s = setup();
    // A member's own `.relief/` is ignored: it must stay exactly as it is.
    let own = s.acme.join(".relief");
    fs::create_dir_all(own.join("state")).unwrap();
    fs::write(own.join("state").join("mine.json"), "{}").unwrap();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    ws.add_repo(&s.acme, &[]).unwrap();
    ws.add_repo(&s.tiny, &[]).unwrap();
    let (acme_before, tiny_before) = (listing(&s.acme), listing(&s.tiny));

    let mut opts: SessionOptions = options(None);
    opts.data_dir = Some(DataDirEnv::default());
    let session = Session::open_workspace(&s.ws, opts).unwrap();

    let data = session.data_dir().expect("a data folder");
    assert_eq!(data.root(), s.ws.join(".relief"));
    assert!(s.ws.join(".relief").join("relief.json").is_file());
    assert!(s.ws.join(".relief").join("cache").is_dir());
    assert!(s.ws.join(".relief").join("state").is_dir());
    assert_eq!(listing(&s.acme), acme_before);
    assert_eq!(listing(&s.tiny), tiny_before);
    assert_eq!(
        fs::read_to_string(own.join("state/mine.json")).unwrap(),
        "{}"
    );
    assert!(!own.join("relief.json").exists(), "member data untouched");
    assert!(!s.tiny.join(".relief").exists());
}

#[test]
fn opening_a_workspace_with_a_missing_repository_is_an_error() {
    let s = setup();
    let mut ws = Workspace::create(&s.ws, "shop").unwrap();
    ws.add_repo(&s.acme, &[]).unwrap();
    fs::remove_dir_all(&s.acme).unwrap();
    assert!(Session::open_workspace(&s.ws, options(None)).is_err());
}
