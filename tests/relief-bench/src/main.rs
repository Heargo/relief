//! `relief-bench <repo> <range> [budget]`: one tab-separated line per measure.

use std::path::PathBuf;
use std::process::ExitCode;

use relief_bench::{BenchPlan, run};

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let (Some(repo), Some(range)) = (args.next(), args.next()) else {
        eprintln!("usage: relief-bench <repo> <range> [budget]");
        return ExitCode::from(2);
    };
    let budget = args.next().and_then(|b| b.parse().ok()).unwrap_or(2000);
    match run(&PathBuf::from(repo), &BenchPlan { range, budget }) {
        Ok(measures) => {
            println!("name\tmillis\tnodes\tfiles");
            for m in measures {
                println!("{}\t{}\t{}\t{}", m.name, m.millis, m.nodes, m.files);
            }
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("relief-bench: {err}");
            ExitCode::from(1)
        }
    }
}
