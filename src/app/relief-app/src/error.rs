//! The single error of the application layer.

use relief_git::GitError;
use relief_index::IndexError;

/// Why a use case failed. `code()` is stable and is what the interfaces map.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A malformed range expression.
    #[error("{0}")]
    InvalidRange(String),
    /// A ref that names no commit.
    #[error("{0}")]
    UnknownRef(String),
    /// A short SHA that matches several objects.
    #[error("{0}")]
    AmbiguousRef(String),
    /// A node absent from the requested side, or with no code.
    #[error("{0}")]
    UnknownNode(String),
    /// The path is not inside a git repository.
    #[error("{0}")]
    NotARepository(String),
    /// The repository has no commit to start from.
    #[error("repository has no commits")]
    NoCommits,
    /// The data folder is unusable or written by a newer relief.
    #[error("{0}")]
    DataDir(String),
    /// `relief.json` has a format newer than this relief supports.
    #[error(
        "data folder format {found} is newer than the supported format {supported}: upgrade relief"
    )]
    DataDirFormat { found: u64, supported: u64 },
    /// The session has no data folder to keep the review state in.
    #[error("no data folder: the review state cannot be kept")]
    NoDataDir,
    /// `relief.config.yaml` is invalid.
    #[error("{0}")]
    Config(String),
    /// A workspace file or an operation on a workspace failed or is not available.
    #[error("{0}")]
    Workspace(String),
    /// Indexing, the cache or the git backend failed.
    #[error("{0}")]
    Index(String),
}

impl AppError {
    /// Stable code: `invalid_range`, `unknown_ref`, `unknown_node`,
    /// `not_a_repository`, `no_data_dir`, `data_dir`, `workspace` or `index`.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRange(_) | Self::AmbiguousRef(_) => "invalid_range",
            Self::UnknownRef(_) => "unknown_ref",
            Self::UnknownNode(_) => "unknown_node",
            Self::NotARepository(_) => "not_a_repository",
            Self::NoDataDir => "no_data_dir",
            Self::Workspace(_) => "workspace",
            Self::DataDir(_) | Self::DataDirFormat { .. } => "data_dir",
            Self::NoCommits | Self::Index(_) | Self::Config(_) => "index",
        }
    }
}

impl From<GitError> for AppError {
    fn from(err: GitError) -> Self {
        let message = err.to_string();
        match err {
            GitError::UnknownRev(_) => Self::UnknownRef(message),
            GitError::AmbiguousRev(_) => Self::AmbiguousRef(message),
            GitError::InvalidRevSpec(_) => Self::InvalidRange(message),
            GitError::NotARepository(_) => Self::NotARepository(message),
            GitError::NoCommits => Self::NoCommits,
            GitError::Backend(_) => Self::Index(message),
        }
    }
}

impl From<IndexError> for AppError {
    fn from(err: IndexError) -> Self {
        match err {
            IndexError::Git(err) => err.into(),
            other => Self::Index(format!("indexing failed: {other}")),
        }
    }
}
