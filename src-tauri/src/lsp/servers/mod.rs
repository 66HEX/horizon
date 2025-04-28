pub mod rust;

use anyhow::Result;
use tower_lsp::LanguageServer;
use crate::lsp::config::ServerConfig;
use crate::lsp::protocol::LSPUtils;

pub trait BaseLanguageServer: LanguageServer + LSPUtils + Send + Sync {
    fn id(&self) -> &str;
    
    fn name(&self) -> &str;
    
    fn config(&self) -> &ServerConfig;
    
    fn initialize(&self) -> Result<()>;
    
    fn shutdown(&self) -> Result<()>;
    
    fn is_running(&self) -> bool;
} 