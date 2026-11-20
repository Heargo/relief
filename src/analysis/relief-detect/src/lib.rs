//! Project detectors: turn a tree of paths into high-level graph nodes.
//!
//! Detectors are pure: they receive paths and a blob reader supplied by the
//! caller and never read git themselves.

mod generic;
mod pyproject;
mod workspaces;

pub use relief_adapter_api::Detection;
use relief_adapter_api::Detector;

pub use generic::GenericDetector;
pub use pyproject::PyprojectDetector;
pub use workspaces::WorkspacesDetector;

/// The default detector chain: workspaces, then Python projects, generic as a fallback.
pub fn default_detectors() -> Vec<Box<dyn Detector>> {
    vec![
        Box::new(WorkspacesDetector::new()),
        Box::new(PyprojectDetector::new()),
        Box::new(GenericDetector::new()),
    ]
}

/// Runs the default chain: the first detector that answers wins.
pub fn detect(
    repo_name: &str,
    paths: &[&str],
    read_blob: &dyn Fn(&str) -> Option<Vec<u8>>,
) -> Detection {
    default_detectors()
        .iter()
        .find_map(|d| d.detect(repo_name, paths, read_blob))
        // The generic detector always answers: the default is never reached.
        .unwrap_or_default()
}
