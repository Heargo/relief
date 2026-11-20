//! The `relief.config.yaml` file: types and analysis from bytes.

use std::collections::HashSet;

use globset::{Glob, GlobBuilder, GlobSet, GlobSetBuilder};
use relief_model::EdgeKind;
use schemars::{JsonSchema, schema_for};
use serde::{Deserialize, Serialize};

fn default_kinds() -> Vec<EdgeKind> {
    vec![
        EdgeKind::Imports,
        EdgeKind::Calls,
        EdgeKind::References,
        EdgeKind::Renders,
    ]
}

/// One architecture rule: files matching `from` must not reach `deny`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Rule {
    /// Unique identifier of the rule.
    pub id: String,
    /// Why the rule exists.
    #[serde(default)]
    pub description: String,
    /// Glob of the files the rule applies to.
    pub from: String,
    /// Glob of the files `from` must not depend on.
    pub deny: String,
    /// Kinds of edges the rule looks at (imports, calls, references, renders by default).
    #[serde(default = "default_kinds")]
    pub kinds: Vec<EdgeKind>,
}

/// The content of `relief.config.yaml`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[schemars(rename = "Config")]
struct RawConfig {
    /// Globs of the files left out of the graph.
    #[serde(default)]
    exclude: Vec<String>,
    /// The architecture rules.
    #[serde(default)]
    rules: Vec<Rule>,
    /// Settings of the co-change layer.
    #[serde(default)]
    co_change: CoChangeConfig,
}

/// The `co_change:` section of `relief.config.yaml`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
pub struct CoChangeConfig {
    /// Fewest common commits for two files to be linked (2 by default).
    #[serde(default)]
    pub min_commits: Option<u32>,
}

/// A parsed configuration, with its globs compiled.
#[derive(Debug, Clone)]
pub struct Config {
    pub rules: Vec<Rule>,
    pub exclude: Vec<String>,
    pub co_change: CoChangeConfig,
    excluded: GlobSet,
}

impl Config {
    fn empty() -> Self {
        Self {
            rules: Vec::new(),
            exclude: Vec::new(),
            co_change: CoChangeConfig::default(),
            excluded: GlobSet::empty(),
        }
    }

    /// Whether `path` (relative to the repository root) is excluded.
    pub fn is_excluded(&self, path: &str) -> bool {
        self.excluded.is_match(path)
    }
}

/// Why `relief.config.yaml` could not be read.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// Malformed YAML or unexpected structure.
    #[error("invalid relief.config.yaml: {message}")]
    Yaml {
        message: String,
        line: Option<usize>,
        column: Option<usize>,
    },
    /// Two rules share an id.
    #[error("invalid relief.config.yaml at line {line}: duplicate rule id `{id}`")]
    DuplicateId { id: String, line: usize },
    /// A glob does not compile.
    #[error("invalid relief.config.yaml at line {line}: invalid glob `{glob}`: {message}")]
    InvalidGlob {
        glob: String,
        message: String,
        line: usize,
    },
}

impl ConfigError {
    /// 1-based line of the error, when known.
    pub fn line(&self) -> Option<usize> {
        match self {
            Self::Yaml { line, .. } => *line,
            Self::DuplicateId { line, .. } | Self::InvalidGlob { line, .. } => Some(*line),
        }
    }

    /// 1-based column of the error, when known.
    pub fn column(&self) -> Option<usize> {
        match self {
            Self::Yaml { column, .. } => *column,
            _ => None,
        }
    }
}

fn yaml_error(error: &serde_yaml::Error) -> ConfigError {
    let location = error.location();
    ConfigError::Yaml {
        message: error.to_string(),
        line: location.as_ref().map(|l| l.line()),
        column: location.as_ref().map(|l| l.column()),
    }
}

fn glob(pattern: &str) -> Result<Glob, globset::Error> {
    GlobBuilder::new(pattern).literal_separator(true).build()
}

/// 1-based line where `key` of rule number `index` is written, falling back to the rule's own line.
fn rule_line(text: &str, index: usize, key: &str) -> usize {
    let lines: Vec<&str> = text.lines().collect();
    let mut seen_rules = false;
    let mut indent = None;
    let mut starts = Vec::new();
    for (n, line) in lines.iter().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("rules:") {
            seen_rules = true;
        } else if seen_rules && trimmed.starts_with("- ") {
            let depth = line.len() - trimmed.len();
            if *indent.get_or_insert(depth) == depth {
                starts.push(n);
            }
        }
    }
    let Some(&start) = starts.get(index) else {
        return 1;
    };
    let end = starts.get(index + 1).copied().unwrap_or(lines.len());
    let prefix = format!("{key}:");
    (start..end)
        .find(|&n| {
            let trimmed = lines[n].trim_start();
            trimmed
                .strip_prefix("- ")
                .unwrap_or(trimmed)
                .starts_with(&prefix)
        })
        .map_or(start + 1, |n| n + 1)
}

/// Parses the bytes of `relief.config.yaml`; an empty file has no rules.
pub fn parse_config(bytes: &[u8]) -> Result<Config, ConfigError> {
    let value: serde_yaml::Value = serde_yaml::from_slice(bytes).map_err(|e| yaml_error(&e))?;
    if value.is_null() {
        return Ok(Config::empty());
    }
    let raw: RawConfig = serde_yaml::from_slice(bytes).map_err(|e| yaml_error(&e))?;
    let text = String::from_utf8_lossy(bytes);

    let mut ids = HashSet::new();
    for (index, rule) in raw.rules.iter().enumerate() {
        if !ids.insert(rule.id.as_str()) {
            return Err(ConfigError::DuplicateId {
                id: rule.id.clone(),
                line: rule_line(&text, index, "id"),
            });
        }
        for (key, pattern) in [("from", &rule.from), ("deny", &rule.deny)] {
            if let Err(error) = glob(pattern) {
                return Err(ConfigError::InvalidGlob {
                    glob: pattern.clone(),
                    message: error.kind().to_string(),
                    line: rule_line(&text, index, key),
                });
            }
        }
    }
    let mut builder = GlobSetBuilder::new();
    for pattern in &raw.exclude {
        let compiled = glob(pattern).map_err(|error| ConfigError::InvalidGlob {
            glob: pattern.clone(),
            message: error.kind().to_string(),
            line: text
                .lines()
                .position(|l| l.contains(pattern.as_str()))
                .map_or(1, |n| n + 1),
        })?;
        builder.add(compiled);
    }
    let excluded = builder.build().map_err(|error| ConfigError::InvalidGlob {
        glob: String::new(),
        message: error.to_string(),
        line: 1,
    })?;
    Ok(Config {
        rules: raw.rules,
        exclude: raw.exclude,
        co_change: raw.co_change,
        excluded,
    })
}

/// JSON Schema of `relief.config.yaml`, pretty-printed, ending with a newline.
pub fn config_schema() -> String {
    let mut json = serde_json::to_string_pretty(&schema_for!(RawConfig)).unwrap_or_default();
    json.push('\n');
    json
}
