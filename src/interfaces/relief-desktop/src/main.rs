//! `relief [path] [range]`: opens the session, then the window.

use std::path::PathBuf;
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
    /// Repository to open.
    #[arg(default_value = ".")]
    path: PathBuf,
    /// Range shown by default (`A...B`); HEAD against the working tree when absent.
    range: Option<String>,
}

/// Composition root: the session with the default detectors and the TypeScript adapter.
fn open_session(cli: &Cli) -> Result<Session, relief_app::AppError> {
    let range = cli.range.as_deref().map(RangeSpec::parse).transpose()?;
    Session::open(
        &cli.path,
        SessionOptions {
            data_dir: Some(DataDirEnv::from_process()),
            range,
            detectors: default_detectors(),
            adapters: vec![Box::new(TsAdapter::new()), Box::new(PythonAdapter::new())],
        },
    )
}

fn main() -> ExitCode {
    let mut cli = Cli::parse();
    // Under an AppImage, `relief .` must mean the folder of the terminal, not `$APPDIR/usr`.
    cli.path = relief_desktop::repo_path(&cli.path, std::env::var_os("OWD"));
    // Before any window: a failure here starts nothing of Tauri.
    let session = match open_session(&cli) {
        Ok(session) => Arc::new(session),
        Err(err) => {
            eprintln!("relief: {err}");
            return ExitCode::from(2);
        }
    };
    let result = relief_desktop::register(tauri::Builder::<tauri::Wry>::default(), session)
        .run(tauri::generate_context!());
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("relief: {err}");
            ExitCode::from(1)
        }
    }
}
