//! Seam: the bench harness (`relief_bench::run`) on the acme-shop fixture.
//!
//! Expected API: `run(repo, &BenchPlan { range, budget }) -> Result<Vec<Measure>, _>`
//! returns, in this order, the measures `open_snapshot_cold` (cache folder of
//! the repo deleted first), `open_snapshot_warm`, `analyse` (on `plan.range`)
//! and `snapshot_budget` (snapshot capped at `plan.budget` nodes); each has
//! non-zero `nodes` and `files`.

use relief_bench::{BenchPlan, run};
use relief_fixtures::Fixture;
use tempfile::TempDir;

fn plan() -> BenchPlan {
    BenchPlan {
        range: "main..feat/promo-codes".to_string(),
        budget: 50,
    }
}

#[test]
fn reports_the_four_measures_in_order() {
    let tmp = TempDir::new().expect("tempdir");
    let repo = Fixture::load("acme-shop")
        .expect("fixture")
        .build(&tmp.path().join("repo"))
        .expect("build");

    let measures = run(repo.path(), &plan()).expect("bench run");

    let names: Vec<&str> = measures.iter().map(|m| m.name.as_str()).collect();
    assert_eq!(
        names,
        [
            "open_snapshot_cold",
            "open_snapshot_warm",
            "analyse",
            "snapshot_budget"
        ]
    );
}

#[test]
fn every_measure_has_nodes_and_files() {
    let tmp = TempDir::new().expect("tempdir");
    let repo = Fixture::load("acme-shop")
        .expect("fixture")
        .build(&tmp.path().join("repo"))
        .expect("build");

    let measures = run(repo.path(), &plan()).expect("bench run");

    assert_eq!(measures.len(), 4);
    for m in &measures {
        assert!(m.nodes > 0, "{}: no nodes", m.name);
        assert!(m.files > 0, "{}: no files", m.name);
    }
}
