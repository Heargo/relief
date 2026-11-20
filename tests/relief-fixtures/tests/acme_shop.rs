use std::path::Path;
use std::process::Command;

use relief_fixtures::{BuiltRepo, Fixture};
use tempfile::TempDir;

fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).expect("utf8")
}

fn build(dir: &TempDir) -> BuiltRepo {
    Fixture::load("acme-shop")
        .expect("load acme-shop")
        .build(dir.path())
        .expect("build acme-shop")
}

#[test]
fn feature_branch_has_the_five_commits_of_the_mockup() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    let log = git(
        built.path(),
        &["log", "--reverse", "--format=%s", "main..feat/promo-codes"],
    );
    assert_eq!(
        log,
        "feat(db): table discounts et repo\n\
         feat(billing): remise dans computeTotal\n\
         refactor(auth): refresh() renvoie null au lieu de lever\n\
         refactor: formatPrice déplacé dans shared (+ prettier)\n\
         feat(checkout): champ code promo et route /promo/validate\n"
    );
}

#[test]
fn main_holds_only_the_base_commit() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    let count = git(built.path(), &["rev-list", "--count", "main"]);
    assert_eq!(count.trim(), "1");
    let main = git(built.path(), &["rev-parse", "main"]);
    assert_eq!(main.trim(), built.sha("base").expect("base sha"));
}

#[test]
fn pull_request_touches_exactly_the_fifteen_files_of_the_mockup() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    let out = git(
        built.path(),
        &["diff", "--name-status", "-M", "main...feat/promo-codes"],
    );
    let mut lines: Vec<&str> = out.lines().collect();
    lines.sort_unstable();
    let expected = [
        "A\tapps/api/billing/discount.ts",
        "A\tapps/web/components/PromoCodeInput.tsx",
        "A\tpackages/db/repos/discountRepo.ts",
        "A\tpackages/db/schema/discounts.ts",
        "D\tapps/api/billing/legacyCoupon.ts",
        "M\tapps/api/auth/session.ts",
        "M\tapps/api/billing/invoice.ts",
        "M\tapps/api/billing/payment.ts",
        "M\tapps/api/routes/checkout.ts",
        "M\tapps/api/routes/invoices.ts",
        "M\tapps/web/components/CartSummary.tsx",
        "M\tapps/web/pages/Checkout.tsx",
        "M\tapps/web/pages/Invoices.tsx",
        "M\tpackages/shared/http/client.ts",
    ];
    assert_eq!(lines.len(), 15, "{out}");
    let (renames, others): (Vec<&str>, Vec<&str>) =
        lines.into_iter().partition(|l| l.starts_with('R'));
    assert_eq!(others, expected);
    assert_eq!(renames.len(), 1, "{renames:?}");
    assert!(
        renames[0].ends_with("\tapps/web/utils/format.ts\tpackages/shared/money/format.ts"),
        "{renames:?}"
    );
}

#[test]
fn prettier_commit_only_reformats_the_http_client() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    let sha = git(
        built.path(),
        &[
            "log",
            "--format=%H",
            "--grep=formatPrice déplacé dans shared",
            "main..feat/promo-codes",
        ],
    );
    let sha = sha.trim();
    assert_eq!(sha.len(), 40);
    let path = "packages/shared/http/client.ts";
    let plain = git(built.path(), &["diff", &format!("{sha}^"), sha, "--", path]);
    assert!(!plain.is_empty(), "client.ts must change in this commit");
    let ignoring_whitespace = git(
        built.path(),
        &["diff", "-w", &format!("{sha}^"), sha, "--", path],
    );
    assert_eq!(ignoring_whitespace, "", "only whitespace may change");
}

#[test]
fn list_invoices_violation_is_already_on_main() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    for rev in ["main", "feat/promo-codes"] {
        let routes = git(
            built.path(),
            &["show", &format!("{rev}:apps/api/routes/invoices.ts")],
        );
        assert!(routes.contains("listInvoices"), "{rev}");
        assert!(routes.contains("invoicesTable"), "{rev}");
        assert!(routes.contains("@acme/db/schema/invoices"), "{rev}");
    }
}

#[test]
fn base_state_matches_the_state_before_the_pull_request() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    let tree = git(built.path(), &["ls-tree", "-r", "--name-only", "main"]);
    let files: Vec<&str> = tree.lines().collect();
    for f in [
        "apps/web/utils/format.ts",
        "apps/api/billing/legacyCoupon.ts",
        "pnpm-workspace.yaml",
        "tsconfig.json",
        "relief.config.yaml",
    ] {
        assert!(files.contains(&f), "missing {f} on main");
    }
    assert!(!files.contains(&"packages/shared/money/format.ts"));
    let session = git(built.path(), &["show", "main:apps/api/auth/session.ts"]);
    assert!(session.contains("throw new SessionExpiredError"));
}

#[test]
fn relief_config_declares_the_three_rules_of_the_mockup() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    let text = git(built.path(), &["show", "main:relief.config.yaml"]);
    let doc: serde_yaml::Value = serde_yaml::from_str(&text).expect("valid yaml");
    let rules = doc["rules"].as_sequence().expect("rules list");
    let got: Vec<(&str, &str, &str)> = rules
        .iter()
        .map(|r| {
            (
                r["id"].as_str().expect("id"),
                r["from"].as_str().expect("from"),
                r["deny"].as_str().expect("deny"),
            )
        })
        .collect();
    assert_eq!(
        got,
        vec![
            ("web-sans-db", "apps/web/**", "packages/db/**"),
            ("packages-sans-apps", "packages/**", "apps/**"),
            (
                "routes-via-repos",
                "apps/api/routes/**",
                "packages/db/schema/**"
            ),
        ]
    );
}

#[test]
fn workspace_has_one_package_json_per_package_and_alias_paths() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    let tree = git(built.path(), &["ls-tree", "-r", "--name-only", "main"]);
    let files: Vec<&str> = tree.lines().collect();
    for f in [
        "apps/web/package.json",
        "apps/api/package.json",
        "packages/shared/package.json",
        "packages/db/package.json",
    ] {
        assert!(files.contains(&f), "missing {f}");
    }
    let tsconfig = git(built.path(), &["show", "main:tsconfig.json"]);
    assert!(tsconfig.contains("@acme/*"), "{tsconfig}");
}

#[test]
fn spec_files_cover_the_listed_symbols() {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    for symbol in [
        "computeTotal",
        "applyDiscount",
        "requireAuth",
        "chargeCustomer",
        "postCheckout",
        "getInvoice",
        "CheckoutPage",
        "CartSummary",
    ] {
        let out = Command::new("git")
            .arg("-C")
            .arg(built.path())
            .args(["grep", "-l", symbol, "feat/promo-codes", "--"])
            .args(["*.spec.ts", "*.spec.tsx"])
            .output()
            .expect("git");
        assert!(
            !out.stdout.is_empty(),
            "no *.spec.ts mentions {symbol} on feat/promo-codes"
        );
    }
    let tree = git(built.path(), &["ls-tree", "-r", "--name-only", "main"]);
    assert!(
        tree.lines()
            .any(|f| f.ends_with(".spec.ts") || f.ends_with(".spec.tsx")),
        "main has no spec file"
    );
}

#[test]
fn building_twice_gives_identical_shas() {
    let a = TempDir::new().expect("tmp");
    let b = TempDir::new().expect("tmp");
    let first = build(&a);
    let second = build(&b);
    assert_eq!(first.sha("base").map(str::len), Some(40));
    for branch in ["main", "feat/promo-codes"] {
        let x = git(first.path(), &["rev-list", branch]);
        let y = git(second.path(), &["rev-list", branch]);
        assert_eq!(x, y, "{branch}");
    }
    assert_eq!(
        git(first.path(), &["rev-list", "feat/promo-codes"])
            .lines()
            .count(),
        6
    );
}

fn tsc_passes_on(rev: &str) {
    let dir = TempDir::new().expect("tmp");
    let built = build(&dir);
    git(built.path(), &["checkout", "--quiet", rev]);
    let tsc = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/ui/node_modules/.bin/tsc");
    let out = Command::new(&tsc)
        .args(["--noEmit", "-p"])
        .arg(built.path())
        .output()
        .expect("tsc runs");
    assert!(
        out.status.success(),
        "tsc failed on {rev}:\n{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn typescript_compiles_on_main() {
    tsc_passes_on("main");
}

#[test]
fn typescript_compiles_on_feat_promo_codes() {
    tsc_passes_on("feat/promo-codes");
}
