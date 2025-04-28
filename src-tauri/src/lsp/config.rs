use std::path::PathBuf;
use anyhow::Result;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerCapabilities {
    pub hover: bool,
    pub completion: bool,
    pub definition: bool,
    pub references: bool,
    pub implementation: bool,
    pub formatting: bool,
    pub rename: bool,
    pub diagnostics: bool,
}

impl Default for ServerCapabilities {
    fn default() -> Self {
        Self {
            hover: true,
            completion: true,
            definition: true,
            references: true,
            implementation: true,
            formatting: true,
            rename: true,
            diagnostics: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub root_path: PathBuf,
    pub capabilities: ServerCapabilities,
    pub executable_path: Option<PathBuf>,
    pub additional_args: Vec<String>,
    pub env_vars: HashMap<String, String>,
}

impl ServerConfig {
    pub fn new(root_path: &str) -> Result<Self> {
        Ok(Self {
            root_path: PathBuf::from(root_path),
            capabilities: ServerCapabilities::default(),
            executable_path: None,
            additional_args: Vec::new(),
            env_vars: HashMap::new(),
        })
    }
    
    pub fn with_executable(mut self, path: &str) -> Self {
        self.executable_path = Some(PathBuf::from(path));
        self
    }
    
    pub fn with_arg(mut self, arg: &str) -> Self {
        self.additional_args.push(arg.to_string());
        self
    }
    
    pub fn with_env_var(mut self, key: &str, value: &str) -> Self {
        self.env_vars.insert(key.to_string(), value.to_string());
        self
    }
    
    pub fn with_capabilities(mut self, capabilities: ServerCapabilities) -> Self {
        self.capabilities = capabilities;
        self
    }
} 