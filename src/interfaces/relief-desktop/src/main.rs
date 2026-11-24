//! `relief [path] [range]`: opens the session, then the window.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;

use clap::Parser;
use relief_app::{DataDirEnv, RangeSpec, Session, SessionOptions};
use relief_detect::default_detectors;
use relief_lang_python::PythonAdapter;
use relief_lang_ts::TsAdapter;

/// Opens the map of a git repository.
#[derive(Parser)]
#[command(name = "relief", version)]
struct Cli {
    /// Repository to open; without it, relief starts on the welcome screen.
    path: Option<PathBuf>,
    /// Range shown by default (`A...B`); HEAD against the working tree when absent.
    range: Option<String>,
}

/// Composition root: the session with the default detectors and the TypeScript adapter.
fn open_session(path: &Path, range: Option<RangeSpec>) -> Result<Session, relief_app::AppError> {
    Session::open(
        path,
        SessionOptions {
            data_dir: Some(DataDirEnv::from_process()),
            range,
            detectors: default_detectors(),
            adapters: vec![Box::new(TsAdapter::new()), Box::new(PythonAdapter::new())],
        },
    )
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let builder = tauri::Builder::<tauri::Wry>::default().plugin(tauri_plugin_dialog::init());
    let config = relief_desktop::config_dir(
        std::env::var_os("RELIEF_CONFIG_DIR"),
        std::env::var_os("XDG_CONFIG_HOME"),
        std::env::var_os("HOME"),
    );
    let opener: relief_desktop::SessionOpener = Arc::new(|path: &Path| open_session(path, None));
    let builder = match &cli.path {
        // Under an AppImage, `relief .` must mean the folder of the terminal, not `$APPDIR/usr`.
        Some(path) => {
            let path = relief_desktop::repo_path(path, std::env::var_os("OWD"));
            let range = match cli.range.as_deref().map(RangeSpec::parse).transpose() {
                Ok(range) => range,
                Err(err) => {
                    eprintln!("relief: {err}");
                    return ExitCode::from(2);
                }
            };
            // Before any window: a failure here starts nothing of Tauri.
            match open_session(&path, range) {
                Ok(session) => {
                    relief_desktop::register_session(builder, Arc::new(session), config, opener)
                }
                Err(err) => {
                    eprintln!("relief: {err}");
                    return ExitCode::from(2);
                }
            }
        }
        None => relief_desktop::register_welcome(builder, config, opener),
    };
    match builder.run(tauri::generate_context!()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("relief: {err}");
            ExitCode::from(1)
        }
    }
}
