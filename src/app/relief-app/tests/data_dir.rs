//! Seam 1 of ticket 04: `DataDir` and `Session` on a fixture repository.
//!
//! API expected: `DataDirEnv { relief_cache_dir, xdg_cache_home, home }`,
//! `DataDir::open(&Path, &DataDirEnv) -> Result<DataDir, AppError>` with
//! `root()`, `cache_dir()`, `state_dir()`, `is_fallback()`, the error code
//! `data_dir`, `SessionOptions.data_dir: Option<DataDirEnv>` and
//! `Session::data_dir() -> Option<&DataDir>`.

mod common;

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;
use std::sync::Barrier;

use common::*;
use relief_app::{
    DataDir, DataDirEnv, DiffRequest, RangeSpec, Session, SessionOptions, SnapshotRequest,
};
use tempfile::TempDir;

fn env_none() -> DataDirEnv {
    DataDirEnv {
        relief_cache_dir: None,
        xdg_cache_home: None,
        home: None,
    }
}

fn git(repo: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@relief.invalid")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_COMMITTER_EMAIL", "fixture@relief.invalid")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap().trim().to_owned()
}

fn root_commit(repo: &Path) -> String {
    git(repo, &["rev-list", "--max-parents=0", "main"])
}

fn compact(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}

fn is_root() -> bool {
    git(Path::new("."), &["--version"]); // git available
    let out = Command::new("id").arg("-u").output().unwrap();
    String::from_utf8_lossy(&out.stdout).trim() == "0"
}

#[test]
fn opening_a_session_creates_the_four_entries_and_leaves_git_clean() {
    let acme = build(|_| {});
    let session = Session::open(
        &acme.path,
        SessionOptions {
            data_dir: Some(env_none()),
            ..options(None)
        },
    )
    .unwrap();
    let data = session.data_dir().expect("a data dir");
    let root = acme.path.join(".relief");
    assert_eq!(data.root(), root);
    assert!(!data.is_fallback());
    assert!(root.join("cache").is_dir());
    assert!(root.join("state").is_dir());
    assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(), "*\n");
    let info = compact(&fs::read_to_string(root.join("relief.json")).unwrap());
    assert!(info.contains("\"format\":1"), "{info}");
    assert!(
        info.contains(&format!("\"repoId\":\"{}\"", root_commit(&acme.path))),
        "{info}"
    );
    assert!(
        info.contains(&format!(
            "\"reliefVersion\":\"{}\"",
            env!("CARGO_PKG_VERSION")
        )),
        "{info}"
    );
    assert_eq!(git(&acme.path, &["status", "--porcelain"]), "");
}

#[test]
fn a_session_without_data_dir_writes_nothing() {
    let acme = build(|_| {});
    let session = Session::open(&acme.path, options(None)).unwrap();
    assert!(session.data_dir().is_none());
    assert!(!acme.path.join(".relief").exists());
}

#[test]
fn a_session_writes_the_index_cache_in_cache_index_sqlite() {
    let acme = build(|_| {});
    let _session = Session::open(
        &acme.path,
        SessionOptions {
            data_dir: Some(env_none()),
            ..options(None)
        },
    )
    .unwrap();
    assert!(acme.path.join(".relief/cache/index.sqlite").is_file());
}

#[test]
fn relief_cache_dir_forces_the_root_of_the_data() {
    let acme = build(|_| {});
    let forced = TempDir::new().unwrap();
    let data = DataDir::open(
        &acme.path,
        &DataDirEnv {
            relief_cache_dir: Some(forced.path().to_path_buf()),
            ..env_none()
        },
    )
    .unwrap();
    assert_eq!(data.root(), forced.path());
    assert_eq!(data.cache_dir(), forced.path().join("cache"));
    assert_eq!(data.state_dir(), forced.path().join("state"));
    assert!(forced.path().join("relief.json").is_file());
    assert!(!acme.path.join(".relief").exists());
}

#[test]
fn a_bare_repository_falls_back_to_the_user_cache() {
    let acme = build(|_| {});
    let tmp = TempDir::new().unwrap();
    let bare = tmp.path().join("acme.git");
    git(
        tmp.path(),
        &[
            "clone",
            "-q",
            "--bare",
            acme.path.to_str().unwrap(),
            "acme.git",
        ],
    );
    let xdg = TempDir::new().unwrap();
    let data = DataDir::open(
        &bare,
        &DataDirEnv {
            xdg_cache_home: Some(xdg.path().to_path_buf()),
            ..env_none()
        },
    )
    .unwrap();
    let expected = xdg.path().join("relief").join(root_commit(&bare));
    assert!(data.is_fallback());
    assert_eq!(data.root(), expected);
    assert!(expected.join("cache").is_dir());
    assert!(!bare.join(".relief").exists());
}

#[test]
fn the_user_cache_defaults_to_home_dot_cache() {
    let acme = build(|_| {});
    let tmp = TempDir::new().unwrap();
    let bare = tmp.path().join("acme.git");
    git(
        tmp.path(),
        &[
            "clone",
            "-q",
            "--bare",
            acme.path.to_str().unwrap(),
            "acme.git",
        ],
    );
    let home = TempDir::new().unwrap();
    let data = DataDir::open(
        &bare,
        &DataDirEnv {
            home: Some(home.path().to_path_buf()),
            ..env_none()
        },
    )
    .unwrap();
    assert_eq!(
        data.root(),
        home.path().join(".cache/relief").join(root_commit(&bare))
    );
}

#[test]
fn a_read_only_worktree_falls_back_to_the_user_cache() {
    if is_root() {
        eprintln!("skipped: permissions do not apply to root");
        return;
    }
    let acme = build(|_| {});
    let xdg = TempDir::new().unwrap();
    fs::set_permissions(&acme.path, fs::Permissions::from_mode(0o555)).unwrap();
    let result = DataDir::open(
        &acme.path,
        &DataDirEnv {
            xdg_cache_home: Some(xdg.path().to_path_buf()),
            ..env_none()
        },
    );
    fs::set_permissions(&acme.path, fs::Permissions::from_mode(0o755)).unwrap();
    let data = result.unwrap();
    assert!(data.is_fallback());
    assert_eq!(
        data.root(),
        xdg.path().join("relief").join(root_commit(&acme.path))
    );
    assert!(!acme.path.join(".relief").exists());
}

#[test]
fn a_future_format_is_a_data_dir_error_and_the_file_is_left_intact() {
    let acme = build(|_| {});
    let root = acme.path.join(".relief");
    fs::create_dir_all(root.join("cache")).unwrap();
    let future = "{\"format\": 99, \"repoId\": \"abc\", \"reliefVersion\": \"9.9.9\"}";
    fs::write(root.join("relief.json"), future).unwrap();

    let error = DataDir::open(&acme.path, &env_none()).expect_err("a future format");
    assert_eq!(error.code(), "data_dir");
    assert_eq!(
        fs::read_to_string(root.join("relief.json")).unwrap(),
        future
    );
    assert!(!root.join("state").exists());
    assert!(!root.join(".gitignore").exists());

    let session = Session::open(
        &acme.path,
        SessionOptions {
            data_dir: Some(env_none()),
            ..options(None)
        },
    );
    assert_eq!(session.expect_err("a future format").code(), "data_dir");
    assert_eq!(
        fs::read_to_string(root.join("relief.json")).unwrap(),
        future
    );
}

#[test]
fn an_older_or_missing_format_is_rewritten_and_the_data_is_kept() {
    for old in [
        Some("{\"format\": 0, \"repoId\": \"abc\"}"),
        Some("{\"repoId\": \"abc\"}"),
        None,
    ] {
        let acme = build(|_| {});
        let root = acme.path.join(".relief");
        fs::create_dir_all(root.join("cache")).unwrap();
        fs::create_dir_all(root.join("state")).unwrap();
        fs::write(root.join("cache/keep.bin"), "kept").unwrap();
        fs::write(root.join("state/seen.json"), "seen").unwrap();
        if let Some(old) = old {
            fs::write(root.join("relief.json"), old).unwrap();
        }

        DataDir::open(&acme.path, &env_none()).unwrap();

        let info = compact(&fs::read_to_string(root.join("relief.json")).unwrap());
        assert!(info.contains("\"format\":1"), "{old:?}: {info}");
        assert!(
            info.contains(&format!("\"repoId\":\"{}\"", root_commit(&acme.path))),
            "{old:?}: {info}"
        );
        assert_eq!(
            fs::read_to_string(root.join("cache/keep.bin")).unwrap(),
            "kept"
        );
        assert_eq!(
            fs::read_to_string(root.join("state/seen.json")).unwrap(),
            "seen"
        );
    }
}

#[test]
fn two_sessions_in_parallel_share_the_cache_without_lock_errors() {
    for round in 0..4 {
        let acme = build(|_| {});
        let barrier = Barrier::new(2);
        let results: Vec<(Vec<String>, Vec<String>)> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..2)
                .map(|_| {
                    scope.spawn(|| {
                        barrier.wait();
                        let session = Session::open(
                            &acme.path,
                            SessionOptions {
                                data_dir: Some(env_none()),
                                ..options(Some(RangeSpec::parse(RANGE).unwrap()))
                            },
                        )
                        .expect("open");
                        let snapshot = session
                            .snapshot(&SnapshotRequest {
                                rev: "main".to_owned(),
                                budget: None,
                                expand: vec![],
                            })
                            .expect("snapshot");
                        let diff = session
                            .analyse(&DiffRequest {
                                range: None,
                                budget: None,
                                expand: vec![],
                            })
                            .expect("analyse");
                        (snapshot.meta.warnings, diff.warnings)
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });
        for (snapshot, diff) in results {
            assert!(snapshot.is_empty(), "round {round}: {snapshot:?}");
            assert!(diff.is_empty(), "round {round}: {diff:?}");
        }
    }
}
