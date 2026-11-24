//! The task bar shows relief's icon only when it can tie the window to `relief.desktop` and find
//! the `relief` icon in the size it wants (N10). On Linux the window's Wayland `app_id` and X11
//! `WM_CLASS` are the program name, `relief`, as long as Tauri does not replace it with the
//! identifier (`enableGTKAppId`); the bundle installs one hicolor icon per listed PNG.

use std::path::{Path, PathBuf};

use serde_json::Value;

fn crate_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn config() -> Value {
    let text =
        std::fs::read_to_string(crate_dir().join("tauri.conf.json")).expect("tauri.conf.json");
    serde_json::from_str(&text).expect("valid tauri.conf.json")
}

/// Width and height from the IHDR chunk of a PNG file.
fn png_size(path: &Path) -> (u32, u32) {
    let bytes = std::fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    assert_eq!(
        &bytes[..8],
        b"\x89PNG\r\n\x1a\n",
        "{} is not a PNG",
        path.display()
    );
    let be =
        |at: usize| u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    (be(16), be(20))
}

#[test]
fn the_bundle_lists_a_square_png_for_each_task_bar_size() {
    let icons: Vec<String> = config()["bundle"]["icon"]
        .as_array()
        .expect("bundle.icon")
        .iter()
        .map(|v| v.as_str().expect("icon path").to_owned())
        .collect();
    for size in [32, 48, 128, 256] {
        let name = format!("icons/{size}x{size}.png");
        assert!(icons.contains(&name), "bundle.icon lacks {name}");
    }
    for icon in &icons {
        let (w, h) = png_size(&crate_dir().join(icon));
        assert_eq!(w, h, "{icon} is not square");
        if let Some(stem) = Path::new(icon).file_stem().and_then(|s| s.to_str()) {
            if let Some((sw, _)) = stem.split_once('x') {
                assert_eq!(sw.parse::<u32>().ok(), Some(w), "{icon} is {w}x{h}");
            }
        }
    }
}

#[test]
fn the_window_keeps_the_program_name_as_its_app_id() {
    let config = config();
    assert_eq!(
        config["mainBinaryName"].as_str().unwrap_or("relief"),
        "relief",
        "the desktop file is relief.desktop"
    );
    assert_ne!(
        config["app"]["enableGTKAppId"].as_bool(),
        Some(true),
        "enableGTKAppId would make the app_id dev.relief.app, which no desktop file matches"
    );
}
