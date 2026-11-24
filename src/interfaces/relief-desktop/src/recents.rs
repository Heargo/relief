//! The recent repositories and workspaces: `recents.json` in the user's configuration folder.

use std::path::Path;

use serde::{Deserialize, Serialize};

const FILE: &str = "recents.json";
const MAX: usize = 20;

#[derive(Serialize, Deserialize)]
struct Entry {
    kind: String,
    path: String,
}

#[derive(Serialize, Deserialize, Default)]
struct File {
    entries: Vec<Entry>,
}

/// An entry as the UI shows it.
#[derive(Serialize)]
pub struct Recent {
    kind: String,
    path: String,
    name: String,
}

fn read(dir: &Path) -> File {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn name(kind: &str, path: &str) -> String {
    let file = Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_owned());
    if kind == "workspace" {
        file.strip_suffix(".relief.json")
            .unwrap_or(&file)
            .to_owned()
    } else {
        file
    }
}

/// The entries, most recent first.
pub fn list(dir: &Path) -> Vec<Recent> {
    read(dir)
        .entries
        .into_iter()
        .map(|e| Recent {
            name: name(&e.kind, &e.path),
            kind: e.kind,
            path: e.path,
        })
        .collect()
}

/// Puts an entry first, without duplicate. Best effort: a read-only configuration folder only
/// means the recents are not kept.
pub fn remember(dir: &Path, kind: &str, path: &Path) {
    let path = path.to_string_lossy().into_owned();
    let mut file = read(dir);
    file.entries.retain(|e| !(e.kind == kind && e.path == path));
    file.entries.insert(
        0,
        Entry {
            kind: kind.to_owned(),
            path,
        },
    );
    file.entries.truncate(MAX);
    if std::fs::create_dir_all(dir).is_ok()
        && let Ok(text) = serde_json::to_string_pretty(&file)
    {
        let _ = std::fs::write(dir.join(FILE), text);
    }
}
