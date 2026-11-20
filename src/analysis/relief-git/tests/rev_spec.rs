use relief_git::RevSpec;

fn s(text: &str) -> String {
    text.to_string()
}

#[test]
fn two_dots_split_into_a_plain_range() {
    assert_eq!(
        RevSpec::parse("main..feat/promo-codes").unwrap(),
        RevSpec::Range {
            from: s("main"),
            to: s("feat/promo-codes")
        }
    );
}

#[test]
fn three_dots_split_into_a_merge_base_range() {
    assert_eq!(
        RevSpec::parse("main...feat/promo-codes").unwrap(),
        RevSpec::MergeBase {
            from: s("main"),
            to: s("feat/promo-codes")
        }
    );
}

#[test]
fn a_lone_ref_is_a_single_rev() {
    assert_eq!(RevSpec::parse("HEAD").unwrap(), RevSpec::Single(s("HEAD")));
    assert_eq!(
        RevSpec::parse("1b58cca").unwrap(),
        RevSpec::Single(s("1b58cca"))
    );
    assert_eq!(
        RevSpec::parse("v1.0").unwrap(),
        RevSpec::Single(s("v1.0")),
        "a single dot is part of the ref name"
    );
}

#[test]
fn worktree_and_index_are_virtual_revs() {
    assert_eq!(RevSpec::parse("WORKTREE").unwrap(), RevSpec::Worktree);
    assert_eq!(RevSpec::parse("INDEX").unwrap(), RevSpec::Index);
}

#[test]
fn ranges_accept_shas_on_both_sides() {
    assert_eq!(
        RevSpec::parse("d0cf48d...HEAD").unwrap(),
        RevSpec::MergeBase {
            from: s("d0cf48d"),
            to: s("HEAD")
        }
    );
}

#[test]
fn malformed_specs_are_rejected() {
    for bad in ["", "..", "...", "a..", "..b", "a...", "...b", "a....b"] {
        assert!(RevSpec::parse(bad).is_err(), "'{bad}' should be rejected");
    }
}
