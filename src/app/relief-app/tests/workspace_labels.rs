//! Seam 1 of ticket K09: the labels of the repositories of a workspace, on the workspace file of
//! `tests/fixtures/shop-space` (repositories `web` labelled `front` and `api` labelled `back`).
//!
//! API expected:
//! - `Workspace::available_labels(&self) -> Vec<String>`: `front`, `back`, `ops`, `tools`, then the
//!   ones declared in the top-level `"labels"` array of the file (without duplicates).
//! - `Workspace::set_labels(&mut self, repo: &str, labels: &[&str]) -> Result<(), AppError>`:
//!   replaces the labels of the repository and saves the file (the declared `"labels"` array is
//!   kept). An unknown label or an unknown repository is an error and changes nothing.

use std::fs;
use std::path::{Path, PathBuf};

use relief_app::Workspace;
use serde_json::{Value, json};
use tempfile::TempDir;

struct Space {
    _dir: TempDir,
    ws: PathBuf,
}

fn space() -> Space {
    let dir = TempDir::new().unwrap();
    let ws = dir.path().join("shop-space");
    fs::create_dir(&ws).unwrap();
    fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/fixtures/shop-space/shop.relief.json"),
        ws.join("shop.relief.json"),
    )
    .unwrap();
    Space { _dir: dir, ws }
}

fn file(s: &Space) -> Value {
    serde_json::from_str(&fs::read_to_string(s.ws.join("shop.relief.json")).unwrap()).unwrap()
}

fn labels_of(workspace: &Workspace, repo: &str) -> Vec<String> {
    workspace
        .repos
        .iter()
        .find(|r| r.name == repo)
        .unwrap()
        .labels
        .clone()
}

#[test]
fn the_available_labels_are_the_four_defaults_without_a_declaration() {
    let s = space();
    let workspace = Workspace::open(&s.ws).unwrap();
    assert_eq!(
        workspace.available_labels(),
        vec!["front", "back", "ops", "tools"]
    );
}

#[test]
fn the_labels_declared_in_the_file_extend_the_defaults() {
    let s = space();
    let mut value = file(&s);
    value["labels"] = json!(["qa", "back"]);
    fs::write(s.ws.join("shop.relief.json"), value.to_string()).unwrap();
    let workspace = Workspace::open(&s.ws).unwrap();
    assert_eq!(
        workspace.available_labels(),
        vec!["front", "back", "ops", "tools", "qa"]
    );
}

#[test]
fn set_labels_replaces_the_labels_of_a_repository_and_persists_them() {
    let s = space();
    let mut workspace = Workspace::open(&s.ws).unwrap();
    workspace.set_labels("web", &["front", "tools"]).unwrap();
    assert_eq!(labels_of(&workspace, "web"), vec!["front", "tools"]);
    assert_eq!(file(&s)["repos"][0]["labels"], json!(["front", "tools"]));
    assert_eq!(file(&s)["repos"][1]["labels"], json!(["back"]));
    let reopened = Workspace::open(&s.ws).unwrap();
    assert_eq!(labels_of(&reopened, "web"), vec!["front", "tools"]);
    assert_eq!(labels_of(&reopened, "api"), vec!["back"]);
}

#[test]
fn set_labels_can_clear_the_labels() {
    let s = space();
    let mut workspace = Workspace::open(&s.ws).unwrap();
    workspace.set_labels("api", &[]).unwrap();
    assert_eq!(file(&s)["repos"][1]["labels"], json!([]));
}

#[test]
fn set_labels_accepts_a_declared_label_and_keeps_the_declaration() {
    let s = space();
    let mut value = file(&s);
    value["labels"] = json!(["qa"]);
    fs::write(s.ws.join("shop.relief.json"), value.to_string()).unwrap();
    let mut workspace = Workspace::open(&s.ws).unwrap();
    workspace.set_labels("api", &["back", "qa"]).unwrap();
    assert_eq!(file(&s)["labels"], json!(["qa"]));
    assert_eq!(file(&s)["repos"][1]["labels"], json!(["back", "qa"]));
}

#[test]
fn set_labels_refuses_an_unknown_label_and_leaves_the_file_alone() {
    let s = space();
    let before = fs::read_to_string(s.ws.join("shop.relief.json")).unwrap();
    let mut workspace = Workspace::open(&s.ws).unwrap();
    let error = workspace.set_labels("web", &["front", "qa"]).unwrap_err();
    assert!(error.to_string().contains("qa"), "{error}");
    assert_eq!(labels_of(&workspace, "web"), vec!["front"]);
    assert_eq!(
        fs::read_to_string(s.ws.join("shop.relief.json")).unwrap(),
        before
    );
}

#[test]
fn set_labels_refuses_an_unknown_repository() {
    let s = space();
    let mut workspace = Workspace::open(&s.ws).unwrap();
    assert!(workspace.set_labels("nope", &["front"]).is_err());
}
