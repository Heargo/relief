use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{EdgeKind, NodeId};

/// Line counts of a changed file, as reported by git.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub lines_added: u32,
    pub lines_removed: u32,
}

/// How a node differs between base and head.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum NodeStatus {
    Added,
    Removed,
    Modified {
        body: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        signature: Option<SignatureChange>,
    },
    /// Same symbol, different file: `from` is its id in the base snapshot.
    /// `body` is true when its content changed as well.
    Moved {
        from: NodeId,
        body: bool,
    },
}

/// Why a signature change is breaking or compatible: a stable code that the
/// UI translates (`param` is the parameter name when there is one).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum SignatureReason {
    ExportRemoved,
    VisibilityReduced,
    ParamRequiredAdded {
        param: String,
    },
    ParamTypeChanged {
        param: String,
    },
    ParamBecameRequired {
        param: String,
    },
    ParamRemoved,
    ParamOptionalAdded,
    ReturnWidenedNull,
    ReturnWidenedUndefined,
    ReturnWidened,
    ReturnNarrowed,
    ReturnChanged,
    /// The adapter has no finer reason (default adapter, no verdict).
    Unspecified,
}

impl std::fmt::Display for SignatureReason {
    /// Human wording of the CLI (English).
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ExportRemoved => write!(f, "export removed"),
            Self::VisibilityReduced => write!(f, "visibility reduced"),
            Self::ParamRequiredAdded { param } => write!(f, "required parameter added ({param})"),
            Self::ParamTypeChanged { param } => write!(f, "type of parameter {param} changed"),
            Self::ParamBecameRequired { param } => write!(f, "parameter {param} became required"),
            Self::ParamRemoved => write!(f, "parameter removed"),
            Self::ParamOptionalAdded => write!(f, "optional parameter added"),
            Self::ReturnWidenedNull => write!(f, "return type widened (null possible)"),
            Self::ReturnWidenedUndefined => write!(f, "return type widened (undefined possible)"),
            Self::ReturnWidened => write!(f, "return type widened"),
            Self::ReturnNarrowed => write!(f, "return type narrowed"),
            Self::ReturnChanged => write!(f, "return type changed"),
            Self::Unspecified => write!(f, "signature changed"),
        }
    }
}

/// Verdict of a language adapter on a signature change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignatureVerdict {
    pub breaking: bool,
    pub reason: SignatureReason,
    /// The texts differ but not as signatures (formatting, destructuring
    /// pattern, non-callable declaration): no signature change is reported.
    pub equivalent: bool,
}

/// A symbol whose signature changed, with the adapter's verdict.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignatureChange {
    pub before: String,
    pub after: String,
    pub breaking: bool,
    pub reason: SignatureReason,
    /// The symbol is not exported (less serious for callers).
    pub internal: bool,
}

/// A node that was added, removed or modified, with its line counts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeChange {
    pub id: NodeId,
    #[serde(flatten)]
    pub status: NodeStatus,
    pub lines_added: u32,
    pub lines_removed: u32,
}

/// Difference between two graph snapshots.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GraphDiff {
    pub base: String,
    pub head: String,
    pub nodes: Vec<NodeChange>,
    pub files: Vec<FileChange>,
    pub edges: Vec<EdgeChange>,
}

/// Whether an edge appeared or disappeared.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum EdgeStatus {
    Added,
    Removed,
    /// Rewritten because an endpoint moved; the change carries head ids.
    Moved,
}

/// An edge that was added or removed, keyed by (from, to, kind).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeChange {
    pub from: NodeId,
    pub to: NodeId,
    pub kind: EdgeKind,
    #[serde(flatten)]
    pub status: EdgeStatus,
    /// First commit of the range where an added edge appears.
    pub commit: Option<String>,
}

// Written by hand: the derive inlines the flattened status, which would hide
// `NodeStatus` and `EdgeStatus` from the schema definitions.
impl JsonSchema for NodeChange {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "NodeChange".into()
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        let id = generator.subschema_for::<NodeId>();
        let count = generator.subschema_for::<u32>();
        let status = generator.subschema_for::<NodeStatus>();
        schemars::json_schema!({
            "description": "A node that was added, removed or modified, with its line counts.",
            "type": "object",
            "properties": { "id": id, "linesAdded": count, "linesRemoved": count },
            "required": ["id", "linesAdded", "linesRemoved"],
            "allOf": [status]
        })
    }
}

impl JsonSchema for EdgeChange {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "EdgeChange".into()
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        let node = generator.subschema_for::<NodeId>();
        let kind = generator.subschema_for::<EdgeKind>();
        let status = generator.subschema_for::<EdgeStatus>();
        schemars::json_schema!({
            "description": "An edge that was added or removed, keyed by (from, to, kind).",
            "type": "object",
            "properties": {
                "from": node,
                "to": node,
                "kind": kind,
                "commit": {
                    "description": "First commit of the range where an added edge appears.",
                    "type": ["string", "null"]
                }
            },
            "required": ["from", "to", "kind", "commit"],
            "allOf": [status]
        })
    }
}
