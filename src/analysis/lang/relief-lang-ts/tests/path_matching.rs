//! Seam 2 of ticket K12: the matching rule of T04 (`path_matches`), exported by the crate, on
//! routes and calls coming from two repositories. No rule of its own for a workspace.
//!
//! API expected: `relief_lang_ts::path_matches(route: &str, client: &str) -> bool`. A `${…}`
//! substitution of a client path is `\0`.

use relief_lang_ts::path_matches;

#[test]
fn a_literal_call_reaches_the_same_route() {
    assert!(path_matches("/orders", "/orders"));
    assert!(path_matches("/promo/validate", "/promo/validate"));
}

#[test]
fn a_route_parameter_matches_any_single_segment_of_the_call() {
    assert!(path_matches("/orders/:id", "/orders/42"));
    assert!(path_matches("/orders/:id/lines", "/orders/\u{0}/lines"));
}

#[test]
fn a_substitution_of_the_call_matches_any_single_segment_of_the_route() {
    assert!(path_matches("/orders/new", "/orders/\u{0}"));
}

#[test]
fn surrounding_slashes_do_not_matter() {
    assert!(path_matches("/orders/", "/orders"));
}

#[test]
fn another_path_or_another_depth_does_not_match() {
    assert!(!path_matches("/orders", "/invoices"));
    assert!(!path_matches("/orders/:id", "/orders"));
    assert!(!path_matches("/orders", "/orders/42"));
}
