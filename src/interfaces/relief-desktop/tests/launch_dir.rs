//! Under an AppImage (run as one file or extracted, as `install.sh` does), `AppRun` moves to
//! `$APPDIR/usr` before starting relief (the bundled webkit finds its helper processes from
//! there, so relief must stay) and the folder the user started from is in `OWD`: a relative
//! repository path is read from `OWD`, so that `relief .` opens the folder of the terminal.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use relief_desktop::repo_path;

#[test]
fn under_an_appimage_a_relative_path_is_read_from_the_original_folder() {
    assert_eq!(
        repo_path(Path::new("."), Some(OsString::from("/home/me/repo"))),
        PathBuf::from("/home/me/repo/.")
    );
    assert_eq!(
        repo_path(Path::new("sub/dir"), Some(OsString::from("/home/me"))),
        PathBuf::from("/home/me/sub/dir")
    );
}

#[test]
fn an_absolute_path_is_kept() {
    assert_eq!(
        repo_path(Path::new("/srv/repo"), Some(OsString::from("/home/me"))),
        PathBuf::from("/srv/repo")
    );
}

#[test]
fn without_owd_the_path_is_kept() {
    assert_eq!(repo_path(Path::new("."), None), PathBuf::from("."));
    assert_eq!(
        repo_path(Path::new("."), Some(OsString::new())),
        PathBuf::from(".")
    );
}
