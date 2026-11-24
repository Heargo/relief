//! K11: an import of a package published by another repository, removed by a range, is a removed
//! edge between the repositories (not toward an external node of the base).

use std::fs;
use std::process::Command;

use relief_app::{DiffRequest, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_ts::TsAdapter;
use tempfile::TempDir;

fn git(dir: &std::path::Path, args: &[&str]) {
    let status = Command::new("git")
        .current_dir(dir)
        .args(["-c", "user.name=t", "-c", "user.email=t@t"])
        .args(args)
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?}");
}

#[test]
fn a_removed_import_of_a_published_package_is_redirected() {
    let dir = TempDir::new().unwrap();
    for repo in ["shop-api", "shop-web"] {
        Fixture::load(repo)
            .unwrap()
            .build(&dir.path().join(repo))
            .unwrap();
    }
    let web = dir.path().join("shop-web");
    git(&web, &["checkout", "-q", "-b", "drop-import", "main"]);
    let file = web.join("src/OrderList.ts");
    let text = fs::read_to_string(&file).unwrap();
    let text = text.replace(
        "import type { Order } from \"@shop/api\";\n",
        "type Order = { id: string };\n",
    );
    fs::write(&file, text).unwrap();
    git(&web, &["commit", "-q", "-am", "drop the import"]);
    let ws = dir.path().join("space");
    fs::create_dir(&ws).unwrap();
    fs::write(
        ws.join("s.relief.json"),
        r#"{ "repos": [
            { "name": "web", "path": "../shop-web", "source": "drop-import", "destination": "main" },
            { "name": "api", "path": "../shop-api", "source": "main", "destination": "main" }
        ] }"#,
    )
    .unwrap();
    let session = Session::open_workspace(
        &ws,
        SessionOptions {
            data_dir: None,
            range: None,
            detectors: default_detectors(),
            adapters: vec![Box::new(TsAdapter::new())],
        },
    )
    .unwrap();
    let analysed = session
        .analyse(&DiffRequest {
            range: None,
            budget: None,
            expand: vec![],
        })
        .unwrap();
    let edges: Vec<String> = analysed
        .diff
        .edges
        .iter()
        .map(|e| format!("{} -> {}", e.from, e.to))
        .collect();
    assert!(
        edges.iter().any(|e| e.contains("repo:web/")
            && e.contains("::file:src/OrderList.ts")
            && e.contains("-> repo:api/")
            && e.contains("::file:src/types.ts")),
        "{edges:#?}"
    );
    assert!(
        edges.iter().all(|e| !e.contains("external/@shop/api")),
        "{edges:#?}"
    );
}
