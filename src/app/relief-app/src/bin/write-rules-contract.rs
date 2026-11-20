//! Writes the JSON Schema of the `rules` command into the directory given as argument.

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let Some(dir) = std::env::args_os().nth(1).map(PathBuf::from) else {
        eprintln!("usage: write-rules-contract <dir>");
        return ExitCode::FAILURE;
    };
    if let Err(error) = std::fs::write(
        dir.join("rules-response.schema.json"),
        relief_app::rules_response_schema(),
    ) {
        eprintln!("cannot write rules-response.schema.json: {error}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
