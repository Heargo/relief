use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum SegmentKind {
    Package,
    File,
    Symbol,
}

impl SegmentKind {
    fn prefix(self) -> &'static str {
        match self {
            Self::Package => "pkg",
            Self::File => "file",
            Self::Symbol => "sym",
        }
    }

    fn from_prefix(prefix: &str) -> Option<Self> {
        match prefix {
            "pkg" => Some(Self::Package),
            "file" => Some(Self::File),
            "sym" => Some(Self::Symbol),
            _ => None,
        }
    }
}

/// Stable, human-readable node id: typed segments joined by `::`.
///
/// Inside a name, `\` and `:` are escaped with a backslash so that a name
/// never produces a spurious separator.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct NodeId {
    repo: Option<String>,
    segments: Vec<(SegmentKind, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid node id `{input}`: {reason}")]
pub struct NodeIdParseError {
    input: String,
    reason: &'static str,
}

impl NodeId {
    fn push(mut self, kind: SegmentKind, name: &str) -> Self {
        self.segments.push((kind, name.to_owned()));
        self
    }

    pub fn package(name: &str) -> Self {
        Self {
            repo: None,
            segments: vec![(SegmentKind::Package, name.to_owned())],
        }
    }

    /// Id of the repo node itself in a workspace: `repo:<name>`.
    pub fn repo_root(name: &str) -> Result<Self, NodeIdParseError> {
        Self::empty().in_repo(name)
    }

    /// Prefixes the id with its repo (`repo:<name>/`), for workspaces.
    pub fn in_repo(mut self, name: &str) -> Result<Self, NodeIdParseError> {
        let reason = if self.repo.is_some() {
            Some("id already has a repo")
        } else if name.is_empty() || name.contains('/') {
            Some("invalid repo name")
        } else {
            None
        };
        if let Some(reason) = reason {
            return Err(NodeIdParseError {
                input: name.to_owned(),
                reason,
            });
        }
        self.repo = Some(name.to_owned());
        Ok(self)
    }

    /// Repo this id belongs to; `None` for an unprefixed (single-repo) id.
    pub fn repo(&self) -> Option<&str> {
        self.repo.as_deref()
    }

    /// The same id without its repo prefix.
    #[must_use]
    pub fn without_repo(&self) -> Self {
        Self {
            repo: None,
            segments: self.segments.clone(),
        }
    }

    #[must_use]
    pub fn file(self, path: &str) -> Self {
        self.push(SegmentKind::File, path)
    }

    /// Path of the file segment, if the id has one.
    pub fn file_path(&self) -> Option<&str> {
        self.segments
            .iter()
            .find(|(k, _)| *k == SegmentKind::File)
            .map(|(_, name)| name.as_str())
    }

    /// The id cut after its file segment (the id itself when it has no symbol).
    #[must_use]
    pub fn file_id(&self) -> Self {
        let end = self
            .segments
            .iter()
            .position(|(k, _)| *k == SegmentKind::File)
            .map_or(self.segments.len(), |i| i + 1);
        Self {
            repo: self.repo.clone(),
            segments: self.segments[..end].to_vec(),
        }
    }

    /// Names of the symbol segments, joined by `::`, if the id has any.
    pub fn symbol_key(&self) -> Option<String> {
        let names: Vec<&str> = self
            .segments
            .iter()
            .filter(|(k, _)| *k == SegmentKind::Symbol)
            .map(|(_, n)| n.as_str())
            .collect();
        (!names.is_empty()).then(|| names.join("::"))
    }

    #[must_use]
    pub fn symbol(self, name: &str) -> Self {
        self.push(SegmentKind::Symbol, name)
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(repo) = &self.repo {
            write!(f, "repo:{repo}")?;
            if !self.segments.is_empty() {
                f.write_str("/")?;
            }
        }
        for (i, (kind, name)) in self.segments.iter().enumerate() {
            if i > 0 {
                f.write_str("::")?;
            }
            write!(f, "{}:", kind.prefix())?;
            for c in name.chars() {
                if c == '\\' || c == ':' {
                    f.write_str("\\")?;
                }
                write!(f, "{c}")?;
            }
        }
        Ok(())
    }
}

impl FromStr for NodeId {
    type Err = NodeIdParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let Some(rest) = s.strip_prefix("repo:") else {
            return Self::parse_local(s);
        };
        let err = |reason| NodeIdParseError {
            input: s.to_owned(),
            reason,
        };
        let Some((name, local)) = rest.split_once('/') else {
            return Self::repo_root(rest);
        };
        if local.is_empty() {
            return Err(err("empty id after repo prefix"));
        }
        Self::parse_local(local)
            .map_err(|_| err("invalid id after repo prefix"))?
            .in_repo(name)
    }
}

impl NodeId {
    fn empty() -> Self {
        Self {
            repo: None,
            segments: Vec::new(),
        }
    }

    /// Parses an id without repo prefix.
    fn parse_local(s: &str) -> Result<Self, NodeIdParseError> {
        let err = |reason| NodeIdParseError {
            input: s.to_owned(),
            reason,
        };
        if s.is_empty() {
            return Err(err("empty id"));
        }
        // Split on unescaped `::`, keeping escapes for the unescape pass.
        let mut raw: Vec<String> = vec![String::new()];
        let mut chars = s.chars().peekable();
        while let Some(c) = chars.next() {
            let cur = raw.last_mut().ok_or_else(|| err("empty id"))?;
            match c {
                '\\' => {
                    let next = chars.next().ok_or_else(|| err("dangling escape"))?;
                    cur.push('\\');
                    cur.push(next);
                }
                ':' if chars.peek() == Some(&':') => {
                    chars.next();
                    raw.push(String::new());
                }
                _ => cur.push(c),
            }
        }
        let mut segments = Vec::with_capacity(raw.len());
        for part in raw {
            let (prefix, rest) = part
                .split_once(':')
                .ok_or_else(|| err("missing segment kind"))?;
            let kind =
                SegmentKind::from_prefix(prefix).ok_or_else(|| err("unknown segment kind"))?;
            let mut name = String::new();
            let mut it = rest.chars();
            while let Some(c) = it.next() {
                if c == '\\' {
                    name.extend(it.next());
                } else {
                    name.push(c);
                }
            }
            segments.push((kind, name));
        }
        Ok(Self {
            repo: None,
            segments,
        })
    }
}

impl Serialize for NodeId {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for NodeId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

impl schemars::JsonSchema for NodeId {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "NodeId".into()
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({ "type": "string" })
    }
}
