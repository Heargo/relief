//! K08 review: two repositories of a workspace that both have `src/index.ts` stay two files in
//! the diff (`repo:<name>/<path>` paths) and in the reading order.

mod common;

use std::fs;
use std::path::Path;

use common::options;
use relief_app::{DiffRequest, ReadingOrderRequest, ReviewSummaryRequest, Session};
use relief_diff::Granularity;
use relief_fixtures::Fixture;
use tempfile::TempDir;

fn space() -> (TempDir, Session) {
    let dir = TempDir::new().unwrap();
    let root = dir.path();
    // The same repository twice under two names: both have `src/orders.ts` changed.
    for name in ["shop-api", "shop-api-copy"] {
        Fixture::load("shop-api")
            .unwrap()
            .build(&root.join(name))
            .unwrap();
    }
    let ws = root.join("space");
    fs::create_dir(&ws).unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tests/fixtures/shop-space/shop.relief.json");
    let text = fs::read_to_string(source)
        .unwrap()
        .replace("../shop-web", "../shop-api-copy")
        .replace("feat/order-badge", "feat/order-total")
        .replace("\"web\"", "\"copy\"");
    fs::write(ws.join("shop.relief.json"), text).unwrap();
    let session = Session::open_workspace(&ws, options(None)).unwrap();
    (dir, session)
}

#[test]
fn a_path_common_to_two_repositories_is_two_files() {
    let (_dir, session) = space();
    let diff = session.diff(&DiffRequest::default()).unwrap();
    let paths: Vec<&str> = diff.diff.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(paths, ["repo:copy/src/orders.ts", "repo:api/src/orders.ts"]);
    let order = session
        .reading_order(&ReadingOrderRequest {
            range: None,
            granularity: Granularity::Symbol,
        })
        .unwrap();
    assert_eq!(order.items.len(), 2, "{:?}", order.items);
    let summary = session
        .review_summary(&ReviewSummaryRequest { range: None })
        .unwrap();
    assert!(summary.format_only_files.is_empty(), "{summary:?}");
}
