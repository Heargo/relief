//! Seam 1 of ticket R04: the `Session::impact` use case on the acme-shop fixture
//! (`main...feat/promo-codes`), by the public API only.
//!
//! API expected: `relief_app::ImpactRequest { range: Option<RangeSpec>, seeds: Vec<NodeId>,
//! direction: ImpactDirection, max_depth: usize, follow_http: bool }` and
//! `Session::impact(&ImpactRequest) -> Result<ImpactResponse, AppError>` where
//! `ImpactResponse { reached: Vec<ImpactedNode> }` and
//! `ImpactedNode { node, depth, via, kind, tested, out_of_diff }`;
//! `relief_model::ImpactDirection { Callers, Dependencies }`.

mod common;

use common::*;
use relief_app::{ImpactRequest, RangeSpec};
use relief_model::{ImpactDirection, NodeId};

fn request(follow_http: bool) -> ImpactRequest {
    ImpactRequest {
        range: Some(RangeSpec::parse(RANGE).unwrap()),
        seeds: vec![REFRESH.parse::<NodeId>().unwrap()],
        direction: ImpactDirection::Callers,
        max_depth: 8,
        follow_http,
    }
}

#[test]
fn refresh_has_eight_transitive_callers_through_http() {
    let (_acme, session) = acme();
    let impact = session.impact(&request(true)).unwrap();
    assert_eq!(impact.reached.len(), 8);
    assert!(impact.reached.iter().all(|r| r.node.to_string() != REFRESH));
}

#[test]
fn refresh_has_six_transitive_callers_without_http() {
    let (_acme, session) = acme();
    let impact = session.impact(&request(false)).unwrap();
    assert_eq!(impact.reached.len(), 6);
    assert_eq!(impact.reached.iter().filter(|r| r.depth == 1).count(), 3);
}

#[test]
fn every_reached_node_comes_with_its_path_from_the_seed() {
    let (_acme, session) = acme();
    let impact = session.impact(&request(true)).unwrap();
    for r in &impact.reached {
        assert_eq!(r.via.len(), r.depth);
        assert_eq!(r.via[0].to_string(), REFRESH);
    }
}

#[test]
fn a_reached_node_touched_by_the_range_is_not_out_of_diff() {
    let (_acme, session) = acme();
    let impact = session.impact(&request(true)).unwrap();
    let diff = session
        .diff(&relief_app::DiffRequest {
            range: Some(RangeSpec::parse(RANGE).unwrap()),
            budget: None,
            expand: vec![],
        })
        .unwrap();
    for r in &impact.reached {
        let touched = diff.diff.nodes.iter().any(|n| n.id == r.node);
        assert_eq!(r.out_of_diff, !touched, "{}", r.node);
    }
}

#[test]
fn without_a_range_the_opening_range_is_used() {
    let (_acme, session) = acme();
    let mut no_range = request(true);
    no_range.range = None;
    assert_eq!(
        session.impact(&no_range).unwrap(),
        session.impact(&request(true)).unwrap()
    );
}

#[test]
fn max_depth_one_keeps_only_the_direct_callers() {
    let (_acme, session) = acme();
    let mut shallow = request(false);
    shallow.max_depth = 1;
    let impact = session.impact(&shallow).unwrap();
    assert_eq!(impact.reached.len(), 3);
    assert!(impact.reached.iter().all(|r| r.depth == 1));
}

#[test]
fn the_dependencies_of_refresh_are_what_it_calls() {
    let (_acme, session) = acme();
    let mut deps = request(true);
    deps.direction = ImpactDirection::Dependencies;
    let impact = session.impact(&deps).unwrap();
    let at = |depth: usize| {
        let mut names: Vec<String> = impact
            .reached
            .iter()
            .filter(|r| r.depth == depth)
            .map(|r| {
                r.node
                    .to_string()
                    .rsplit("::sym:")
                    .next()
                    .unwrap()
                    .to_owned()
            })
            .collect();
        names.sort();
        names
    };
    assert_eq!(at(1), ["Session", "verifyToken"]);
    assert_eq!(at(2), ["Claims"]);
    assert!(impact.reached.iter().all(|r| r.node.to_string() != REFRESH));
}
