//! Seam 1 of ticket 01: the public function parsing `relief.config.yaml` from bytes.

use relief_model::EdgeKind;
use relief_rules::parse_config;

const ACME: &[u8] = b"rules:
  - id: web-sans-db
    description: \"le front ne parle jamais directement a la base\"
    from: apps/web/**
    deny: packages/db/**
  - id: routes-via-repos
    description: \"les routes passent par les repos\"
    from: apps/api/routes/**
    deny: packages/db/schema/**
    kinds: [imports, http]
";

#[test]
fn parses_rules_with_their_fields() {
    let config = parse_config(ACME).unwrap();
    assert_eq!(config.rules.len(), 2);
    let first = &config.rules[0];
    assert_eq!(first.id, "web-sans-db");
    assert_eq!(
        first.description,
        "le front ne parle jamais directement a la base"
    );
    assert_eq!(first.from, "apps/web/**");
    assert_eq!(first.deny, "packages/db/**");
}

#[test]
fn kinds_default_to_imports_calls_references_renders() {
    let config = parse_config(ACME).unwrap();
    assert_eq!(
        config.rules[0].kinds,
        vec![
            EdgeKind::Imports,
            EdgeKind::Calls,
            EdgeKind::References,
            EdgeKind::Renders
        ]
    );
}

#[test]
fn explicit_kinds_replace_the_default() {
    let config = parse_config(ACME).unwrap();
    assert_eq!(
        config.rules[1].kinds,
        vec![EdgeKind::Imports, EdgeKind::Http]
    );
}

#[test]
fn an_empty_file_has_no_rules() {
    let config = parse_config(b"").unwrap();
    assert!(config.rules.is_empty());
}

#[test]
fn exclude_is_compiled_with_double_star_across_folders_and_star_in_one_segment() {
    let config =
        parse_config(b"exclude:\n  - \"docs/**\"\n  - \"scripts/*.sh\"\nrules: []\n").unwrap();
    assert!(config.is_excluded("docs/a/b/c.md"));
    assert!(config.is_excluded("scripts/run.sh"));
    assert!(!config.is_excluded("scripts/sub/run.sh"));
    assert!(!config.is_excluded("apps/api/index.ts"));
}

#[test]
fn a_duplicate_id_is_an_error_citing_its_line() {
    let yaml = b"rules:
  - id: a
    from: x/**
    deny: y/**
  - id: a
    from: z/**
    deny: y/**
";
    let err = parse_config(yaml).unwrap_err();
    assert_eq!(err.line(), Some(5));
    assert!(err.to_string().contains("line 5"), "{err}");
    assert!(err.to_string().contains('a'), "{err}");
}

#[test]
fn an_invalid_glob_is_an_error_citing_its_line() {
    let yaml = b"rules:
  - id: a
    from: x/**
    deny: \"[abc\"
";
    let err = parse_config(yaml).unwrap_err();
    assert_eq!(err.line(), Some(4));
    assert!(err.to_string().contains("line 4"), "{err}");
}

#[test]
fn malformed_yaml_reports_line_and_column() {
    let err = parse_config(b"rules:\n  - id: a\n    from: [unclosed\n").unwrap_err();
    assert!(err.line().is_some(), "{err}");
    assert!(err.column().is_some(), "{err}");
}
