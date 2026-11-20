//! Architecture rules read from `relief.config.yaml`: pure, no I/O.

mod config;
mod violations;

pub use config::{CoChangeConfig, Config, ConfigError, Rule, config_schema, parse_config};
pub use violations::violations;
