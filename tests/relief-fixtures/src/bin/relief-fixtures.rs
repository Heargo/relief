//! `relief-fixtures build <name> <dir>`: builds a fixture repository.

use std::path::PathBuf;
use std::process::ExitCode;

use relief_fixtures::Fixture;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [cmd, name, dir] = args.as_slice() else {
        eprintln!("usage: relief-fixtures build <name> <dir>");
        return ExitCode::from(2);
    };
    if cmd != "build" {
        eprintln!("usage: relief-fixtures build <name> <dir>");
        return ExitCode::from(2);
    }
    match Fixture::load(name).and_then(|f| f.build(&PathBuf::from(dir))) {
        Ok(built) => {
            println!("{}", built.path().display());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}
