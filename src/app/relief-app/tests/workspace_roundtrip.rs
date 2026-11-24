//! A hand-written workspace file keeps the fields relief does not know when relief saves it.

use std::fs;

use relief_app::Workspace;
use serde_json::{Value, json};
use tempfile::TempDir;

#[test]
fn saving_keeps_the_unknown_fields_of_the_file_and_of_its_repositories() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("shop.relief.json");
    fs::write(
        &file,
        json!({
            "$schema": "https://example.test/relief.json",
            "note": { "owner": "team" },
            "repos": [
                { "name": "web", "path": "../web", "labels": ["front"], "color": "red" },
                { "name": "api", "path": "../api", "labels": ["back"] }
            ]
        })
        .to_string(),
    )
    .unwrap();
    let mut workspace = Workspace::open(dir.path()).unwrap();
    workspace.set_labels("web", &["front", "ops"]).unwrap();
    let saved: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(saved["$schema"], "https://example.test/relief.json");
    assert_eq!(saved["note"], json!({ "owner": "team" }));
    assert_eq!(saved["repos"][0]["color"], "red");
    assert_eq!(saved["repos"][0]["labels"], json!(["front", "ops"]));
    assert!(saved["repos"][1].get("color").is_none());
}
