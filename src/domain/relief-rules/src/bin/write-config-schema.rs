//! Writes the JSON Schema of `relief.config.yaml` into the directory given as argument.

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let Some(dir) = std::env::args_os().nth(1).map(PathBuf::from) else {
        eprintln!("usage: write-config-schema <dir>");
        return ExitCode::FAILURE;
    };
    if let Err(error) = std::fs::write(
        dir.join("config.schema.json"),
        relief_rules::config_schema(),
    ) {
        eprintln!("cannot write config.schema.json: {error}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
