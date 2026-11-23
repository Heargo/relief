//! Seam 2 of ticket E08: `Session::review_summary` on the repeated-imports fixture
//! (`main...feat/migration`): four files add the same import, two others add another one.
//!
//! API expected: `ReviewSummary.repeated: Vec<RepeatedChange>` (serialised as `repeated`
//! with `representative`, `members` and `summary`; each summary item a tagged object).

use relief_app::{RangeSpec, ReviewSummaryRequest, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_fixtures::Fixture;
use relief_lang_ts::TsAdapter;
use tempfile::TempDir;

fn summary() -> relief_model::ReviewSummary {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("repeated-imports");
    Fixture::load("repeated-imports")
        .unwrap()
        .build(&path)
        .unwrap();
    let session = Session::open(
        &path,
        SessionOptions {
            data_dir: None,
            range: Some(RangeSpec::parse("main...feat/migration").unwrap()),
            detectors: default_detectors(),
            adapters: vec![Box::new(TsAdapter::new())],
        },
    )
    .unwrap();
    session
        .review_summary(&ReviewSummaryRequest { range: None })
        .unwrap()
}

#[test]
fn four_files_adding_the_same_import_are_one_repeated_change() {
    let summary = summary();
    assert_eq!(
        summary.repeated.len(),
        1,
        "the two other files make no group"
    );
    let group = &summary.repeated[0];

    let members: Vec<String> = group.members.iter().map(|m| m.to_string()).collect();
    assert_eq!(members.len(), 4);
    for (member, n) in members.iter().zip(1..=4) {
        assert!(
            member.ends_with(&format!("::file:src/features/f{n}.ts")),
            "{member}"
        );
    }
    assert_eq!(group.representative, group.members[0]);
}

#[test]
fn the_group_is_stable_from_one_run_to_the_next() {
    assert_eq!(summary().repeated, summary().repeated);
}

#[test]
fn the_repeated_change_is_exposed_in_the_json_contract() {
    let json = serde_json::to_value(summary()).unwrap();
    let group = &json["repeated"][0];
    assert_eq!(group["members"].as_array().unwrap().len(), 4);
    assert_eq!(group["representative"], group["members"][0]);
    let items = group["summary"].as_array().unwrap();
    assert!(!items.is_empty());
    assert!(
        items.iter().any(|i| i["target"]
            .as_str()
            .is_some_and(|t| t.ends_with("::file:src/util/helpers.ts"))),
        "{items:?}"
    );
}
