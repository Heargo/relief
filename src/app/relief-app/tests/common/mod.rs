//! Shared setup: the acme-shop fixture opened as a `Session`.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use relief_app::{RangeSpec, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_fixtures::{BuiltRepo, Fixture};
use relief_lang_ts::TsAdapter;
use tempfile::TempDir;

pub const RANGE: &str = "main...feat/promo-codes";
pub const COMPUTE_TOTAL: &str =
    "pkg:@acme/api/billing::file:apps/api/billing/invoice.ts::sym:computeTotal";
pub const INVOICE_FILE: &str = "pkg:@acme/api/billing::file:apps/api/billing/invoice.ts";
pub const DISCOUNT_FILE: &str = "pkg:@acme/api/billing::file:apps/api/billing/discount.ts";
pub const REFRESH: &str =
    "pkg:@acme/api/auth::file:apps/api/auth/session.ts::sym:SessionStore.refresh";
pub const FORMAT_PRICE: &str =
    "pkg:@acme/shared/money::file:packages/shared/money/format.ts::sym:formatPrice";

pub struct Acme {
    pub dir: TempDir,
    pub path: PathBuf,
    pub repo: BuiltRepo,
}

/// Builds acme-shop in `<tmp>/acme`; `worktree` may alter the working tree.
pub fn build(worktree: impl FnOnce(&Path)) -> Acme {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("acme");
    let repo = Fixture::load("acme-shop")
        .unwrap()
        .build_with_worktree(&path, worktree)
        .unwrap();
    Acme { dir, path, repo }
}

pub fn options(range: Option<RangeSpec>) -> SessionOptions {
    SessionOptions {
        data_dir: None,
        range,
        detectors: default_detectors(),
        adapters: vec![Box::new(TsAdapter::new())],
    }
}

/// acme-shop opened on `main...feat/promo-codes`.
pub fn acme() -> (Acme, Session) {
    let acme = build(|_| {});
    let session =
        Session::open(&acme.path, options(Some(RangeSpec::parse(RANGE).unwrap()))).unwrap();
    (acme, session)
}
