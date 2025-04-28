use anyhow::{Result, anyhow};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::path::Path;
use serde_json::{Value, json};
use async_trait::async_trait;
use tower_lsp::{LanguageServer, Client};
use tower_lsp::jsonrpc::Result as LspResult;
use tower_lsp::lsp_types::*;
use url;

use crate::lsp::servers::rust::RustLanguageServer;
use crate::lsp::logger;

pub enum LanguageServerInstance {
    Rust(RustLanguageServer),
}

impl LanguageServerInstance {
    pub fn with_client(self, client: Client) -> Self {
        match self {
            LanguageServerInstance::Rust(server) => LanguageServerInstance::Rust(server.with_client(client)),
        }
    }
}

#[async_trait]
pub trait ManagedLanguageServer: Send + Sync {
    async fn handle_request(&self, request_text: &str) -> Result<String>;
    
    async fn shutdown(&self) -> Result<()>;
    
    fn get_capabilities(&self) -> Value;
}

pub struct ServerFactory {
    servers: Mutex<HashMap<String, Arc<dyn ManagedLanguageServer>>>,
    next_id: Mutex<u64>,
}

impl ServerFactory {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }
    
    fn generate_server_id(&self) -> String {
        let mut id = self.next_id.lock().unwrap();
        let server_id = format!("server_{}", *id);
        *id += 1;
        server_id
    }
    
    pub async fn create_server(&self, language: &str, file_path: &str) -> Result<String> {
        let server_id = self.generate_server_id();
        
        logger::info("ServerFactory", &format!("Creating LSP server for language: '{}', path: '{}'", language, file_path));
        
        let normalized_language = language.to_lowercase();
        
        let root_path = self.find_project_root(&normalized_language, file_path)?;
        logger::info("ServerFactory", &format!("Actual project root directory for {}: {}", normalized_language, root_path));
        
        let server: Arc<dyn ManagedLanguageServer> = match normalized_language.as_str() {
            "rust" => {
                logger::info("ServerFactory", &format!("Creating RUST adapter for language: '{}'", normalized_language));
                let rust_server = RustLspAdapter::new(normalized_language.to_string(), root_path)?;
                Arc::new(rust_server)
            },
            "typescript" | "javascript" => {
                logger::info("ServerFactory", &format!("Creating TS/JS adapter for language: '{}'", normalized_language));
                return Err(anyhow!("Adapter for language '{}' is not yet implemented", normalized_language));
            },
            "python" => {
                logger::info("ServerFactory", &format!("Creating Python adapter for language: '{}'", normalized_language));
                return Err(anyhow!("Adapter for language '{}' is not yet implemented", normalized_language));
            },
            _ => {
                return Err(anyhow!("Language '{}' is not supported. No LSP server for this language.", normalized_language));
            }
        };
        
        self.servers.lock().unwrap().insert(server_id.clone(), server);
        
        Ok(server_id)
    }
    
    pub async fn stop_server(&self, server_id: String) -> Result<()> {
        let server = {
            let mut servers = self.servers.lock().unwrap();
            servers.remove(&server_id)
        };
        
        if let Some(server) = server {
            server.shutdown().await?;
            Ok(())
        } else {
            Err(anyhow!("Server not found: {}", server_id))
        }
    }
    
    pub async fn forward_request(&self, server_id: &str, request_text: &str) -> Result<String> {
        let server = {
            let servers = self.servers.lock().unwrap();
            servers.get(server_id).cloned()
        };
        
        if let Some(server) = server {
            server.handle_request(request_text).await
        } else {
            Err(anyhow!("Server not found: {}", server_id))
        }
    }
    
    pub fn get_server_capabilities(&self, language: &str) -> Value {
        let normalized_language = language.to_lowercase();
        
        logger::info("ServerFactory", &format!("Getting capabilities for language: {}", normalized_language));
        
        let current_dir = std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .to_string_lossy()
            .to_string();
            
        match normalized_language.as_str() {
            "rust" => {
                match RustLspAdapter::new(normalized_language.to_string(), current_dir.clone()) {
                    Ok(adapter) => {
                        return adapter.get_capabilities();
                    },
                    Err(e) => {
                        let error_msg = format!("Cannot create Rust LSP adapter: {}", e);
                        logger::error("ServerFactory", &error_msg);
                        return json!({
                            "error": error_msg,
                            "_type": "capabilities_error",
                            "source": "rust_lsp_adapter_creation"
                        });
                    }
                }
            },
            "typescript" | "javascript" | "python" => {
                let error_msg = format!("Adapter for language '{}' is not yet implemented", normalized_language);
                logger::info("ServerFactory", &error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "server_factory_planned_language"
                });
            },
            _ => {
                let error_msg = format!("Language '{}' is not supported. No LSP server for this language.", normalized_language);
                logger::info("ServerFactory", &error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "server_factory_unsupported_language"
                });
            }
        }
    }

    pub fn create_language_server_instance(&self, language: &str, file_path: &str) -> Result<LanguageServerInstance> {
        let normalized_language = language.to_lowercase();
        
        logger::info("ServerFactory", &format!("Creating server instance for language: {}, path: {}", normalized_language, file_path));
        
        let final_language = if normalized_language == "unknown" || normalized_language.is_empty() {
            use std::path::Path;
            let path = Path::new(file_path);
            
            if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                match extension {
                    "rs" => "rust".to_string(),
                    "py" => "python".to_string(),
                    "js" => "javascript".to_string(),
                    "ts" => "typescript".to_string(),
                    _ => normalized_language.clone()
                }
            } else {
                if path.is_dir() || (path.parent().map_or(false, |p| p.exists())) {
                    let dir_to_check = if path.is_dir() { path } else { path.parent().unwrap() };
                    
                    if dir_to_check.join("Cargo.toml").exists() {
                        "rust".to_string()
                    } else if dir_to_check.join("package.json").exists() {
                        if dir_to_check.join("tsconfig.json").exists() {
                            "typescript".to_string()
                        } else {
                            "javascript".to_string()
                        }
                    } else {
                        normalized_language.clone()
                    }
                } else {
                    normalized_language.clone()
                }
            }
        } else {
            normalized_language.clone()
        };
        
        logger::info("ServerFactory", &format!("Using final language to create server: {}", final_language));
        
        let root_path = self.find_project_root(&final_language, file_path)?;
        logger::info("ServerFactory", &format!("Actual project root directory for {}: {}", final_language, root_path));
        
        match final_language.as_str() {
            "rust" => {
                let server = RustLanguageServer::new(root_path)?;
                Ok(LanguageServerInstance::Rust(server))
            },
            _ => {
                Err(anyhow!("Language '{}' is not supported. No LSP server for this language.", final_language))
            }
        }
    }

    pub fn find_project_root(&self, language: &str, file_path: &str) -> Result<String> {
        let path = Path::new(file_path);
        
        logger::info("ServerFactory", &format!("Looking for project root directory for language: {}, file path: {}", language, file_path));
        
        if !path.exists() {
            logger::info("ServerFactory", &format!("Path does not exist: {}", file_path));
            return Err(anyhow!("Specified path does not exist: {}", file_path));
        }
        
        let start_dir = if path.is_dir() {
            path.to_path_buf()
        } else {
            match path.parent() {
                Some(parent) => parent.to_path_buf(),
                None => {
                    logger::info("ServerFactory", &format!("Parent directory not found for: {}", file_path));
                    return Err(anyhow!("Cannot find parent directory for: {}", file_path));
                }
            }
        };
        
        logger::info("ServerFactory", &format!("Initial search directory: {}", start_dir.display()));
        
        let config_files = match language.to_lowercase().as_str() {
            "rust" => vec!["Cargo.toml"],
            "javascript" | "typescript" => vec!["package.json", "tsconfig.json"],
            "python" => vec!["pyproject.toml", "setup.py", "requirements.txt"],
            "go" => vec!["go.mod"],
            "c" | "cpp" => vec!["CMakeLists.txt", "Makefile", "configure"],
            "java" => vec!["pom.xml", "build.gradle", "settings.gradle"],
            _ => vec![
                "Cargo.toml", "package.json", "pyproject.toml", "go.mod", 
                "CMakeLists.txt", "Makefile", "pom.xml", "build.gradle"
            ],
        };
        
        logger::info("ServerFactory", &format!("Looking for configuration files: {:?}", config_files));
        
        let mut current_dir = start_dir.clone();
        
        logger::info("ServerFactory", &format!("Checking directory: {}", current_dir.display()));
        
        let max_iterations = 10;
        let mut iterations = 0;
        
        loop {
            for config_file in &config_files {
                let config_path = current_dir.join(config_file);
                if config_path.exists() {
                    logger::info("ServerFactory", &format!("Found configuration file: {} in directory: {}", 
                             config_file, current_dir.display()));
                    return Ok(current_dir.to_string_lossy().to_string());
                }
            }
            
            iterations += 1;
            if iterations >= max_iterations {
                logger::info("ServerFactory", &format!("Maximum number of iterations reached without finding configuration file. Using initial directory: {}",
                         start_dir.display()));
                return Ok(start_dir.to_string_lossy().to_string());
            }
            
            match current_dir.parent() {
                Some(parent) => {
                    if parent == current_dir {
                        logger::info("ServerFactory", &format!("Cannot go higher in the directory tree. Using initial directory: {}", 
                                 start_dir.display()));
                        return Ok(start_dir.to_string_lossy().to_string());
                    }
                    
                    current_dir = parent.to_path_buf();
                    logger::info("ServerFactory", &format!("Moving to parent directory: {}", current_dir.display()));
                },
                None => {
                    logger::info("ServerFactory", &format!("Root of filesystem reached without finding configuration file. Using initial directory: {}", 
                             start_dir.display()));
                    return Ok(start_dir.to_string_lossy().to_string());
                }
            }
        }
    }

    pub fn is_project_root(&self, language: &str, dir_path: &str) -> bool {
        let path = Path::new(dir_path);
        
        if !path.exists() || !path.is_dir() {
            logger::info("ServerFactory", &format!("Path does not exist or is not a directory: {}", dir_path));
            return false;
        }
        
        let config_files = match language.to_lowercase().as_str() {
            "rust" => vec!["Cargo.toml"],
            "javascript" | "typescript" => vec!["package.json", "tsconfig.json"],
            "python" => vec!["pyproject.toml", "setup.py", "requirements.txt"],
            "go" => vec!["go.mod"],
            "c" | "cpp" => vec!["CMakeLists.txt", "Makefile", "configure"],
            "java" => vec!["pom.xml", "build.gradle", "settings.gradle"],
            _ => vec![
                "Cargo.toml", "package.json", "pyproject.toml", "go.mod", 
                "CMakeLists.txt", "Makefile", "pom.xml", "build.gradle"
            ],
        };
        
        for config_file in &config_files {
            let config_path = path.join(config_file);
            if config_path.exists() {
                logger::info("ServerFactory", &format!("Directory is the main project directory for language {} - found file: {}", 
                         language, config_file));
                return true;
            }
        }
        
        logger::info("ServerFactory", &format!("Directory is not the main project directory for language {}: {}", language, dir_path));
        false
    }
}

struct RustLspAdapter {
    language: String,
    root_path: String,
    server: Arc<RustLanguageServer>,
}

impl RustLspAdapter {
    fn new(language: String, root_path: String) -> Result<Self> {
        let server = RustLanguageServer::new(root_path.clone())?;
        Ok(Self {
            language,
            root_path,
            server: Arc::new(server),
        })
    }
}

#[async_trait]
impl ManagedLanguageServer for RustLspAdapter {
    async fn handle_request(&self, request_text: &str) -> Result<String> {
        match serde_json::from_str::<serde_json::Value>(request_text) {
            Ok(json_rpc) => {
                let id = json_rpc.get("id").cloned().unwrap_or(Value::Null);
                let method = json_rpc.get("method").and_then(|m| m.as_str()).unwrap_or("");
                let params = json_rpc.get("params").cloned().unwrap_or(Value::Null);
                
                match method {
                    "initialize" => {
                        logger::info("ServerFactory", &format!("Received initialize request"));
                        
                        if let Ok(mut params_value) = serde_json::from_value::<InitializeParams>(params) {
                            let root_path_str = self.root_path.clone();
                            let root_uri = url::Url::from_file_path(&root_path_str).unwrap_or_else(|_| {
                                url::Url::parse(&format!("file://{}", root_path_str)).unwrap()
                            });
                            
                            params_value.root_uri = Some(root_uri.clone());
                            
                            match self.server.initialize(params_value).await {
                                Ok(result) => {
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "result": result
                                    });
                                    
                                    return Ok(response.to_string());
                                },
                                Err(e) => {
                                    let error = format!("Initialize error: {}", e);
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": {
                                            "code": -32603,
                                            "message": error
                                        }
                                    });
                                    
                                    return Ok(response.to_string());
                                }
                            }
                        } else {
                            let response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": {
                                    "code": -32602,
                                    "message": "Invalid params"
                                }
                            });
                            
                            return Ok(response.to_string());
                        }
                    },
                    "initialized" => {
                        logger::info("ServerFactory", &format!("Received 'initialized' notification for Rust server"));
                        
                        let initialized_params = InitializedParams {};
                        self.server.initialized(initialized_params).await;
                        
                        return Ok("".to_string());
                    },
                    "textDocument/didOpen" => {
                        logger::info("ServerFactory", &format!("Opening document in Rust server"));
                        
                        if let Ok(open_params) = serde_json::from_value::<DidOpenTextDocumentParams>(params.clone()) {
                            self.server.did_open(open_params).await;
                            
                            return Ok("".to_string());
                        } else {
                            logger::info("ServerFactory", &format!("Failed to parse didOpen parameters"));
                            return Ok("".to_string());
                        }
                    },
                    "textDocument/completion" => {
                        if let Ok(completion_params) = serde_json::from_value::<CompletionParams>(params) {
                            logger::info("ServerFactory", &format!("Completion request for Rust server: {}", self.language));
                            
                            let runtime = match tokio::runtime::Runtime::new() {
                                Ok(rt) => rt,
                                Err(e) => {
                                    let error_msg = format!("Failed to create tokio runtime: {}", e);
                                    logger::error("ServerFactory", &error_msg);
                                    
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": {
                                            "code": -32603,
                                            "message": error_msg
                                        }
                                    });
                                    
                                    return Ok(response.to_string());
                                }
                            };
                            
                            let server_clone = self.server.clone();
                            
                            let completion_result = runtime.block_on(async move {
                                match server_clone.completion(completion_params).await {
                                    Ok(result) => result,
                                    Err(e) => {
                                        logger::error("ServerFactory", &format!("Error during completion execution: {:?}", e));
                                        None
                                    }
                                }
                            });
                            
                            let result = match completion_result {
                                Some(completion) => {
                                    match serde_json::to_value(completion) {
                                        Ok(completion_json) => completion_json,
                                        Err(e) => {
                                            logger::error("ServerFactory", &format!("Error serializing completion result: {}", e));
                                            json!({
                                                "isIncomplete": true,
                                                "items": []
                                            })
                                        }
                                    }
                                },
                                None => {
                                    json!({
                                        "isIncomplete": false,
                                        "items": []
                                    })
                                }
                            };
                            
                            let response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "result": result
                            });
                            
                            return Ok(response.to_string());
                        } else {
                            let error_response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": {
                                    "code": -32602,
                                    "message": "Invalid parameters for completion method"
                                }
                            });
                            
                            return Ok(error_response.to_string());
                        }
                    },
                    "textDocument/hover" => {
                        logger::info("ServerFactory", &format!("Hover request in {} project at {}", self.language, self.root_path));
                        
                        if let Ok(hover_params) = serde_json::from_value::<HoverParams>(params.clone()) {
                            match self.server.hover(hover_params).await {
                                Ok(hover_result) => {
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "result": hover_result
                                    });
                                    
                                    return Ok(response.to_string());
                                },
                                Err(e) => {
                                    let error_msg = format!("Error while processing hover: {}", e);
                                    logger::error("ServerFactory", &error_msg);
                                    
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": {
                                            "code": -32603,
                                            "message": error_msg
                                        }
                                    });
                                    
                                    return Ok(response.to_string());
                                }
                            }
                        } else {
                            let response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": {
                                    "code": -32602,
                                    "message": "Invalid params for hover method"
                                }
                            });
                            
                            return Ok(response.to_string());
                        }
                    },
                    _ => {
                        logger::info("ServerFactory", &format!("Unsupported LSP method: {}", method));
                        let result = json!({});
                        
                        let response = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": result
                        });
                        
                        Ok(response.to_string())
                    }
                }
            },
            Err(e) => Err(anyhow!("Failed to parse JSON-RPC request: {}", e))
        }
    }
    
    async fn shutdown(&self) -> Result<()> {
        logger::info("ServerFactory", &format!("Shutting down {} server for {}", self.language, self.root_path));
        if let Err(e) = self.server.shutdown().await {
            logger::error("ServerFactory", &format!("Error shutting down server: {:?}", e));
        }
        Ok(())
    }
    
    fn get_capabilities(&self) -> Value {
        logger::info("ServerFactory", &format!("Getting capabilities for Rust server in project: {}", self.root_path));
        
        let root_uri = match url::Url::from_file_path(&self.root_path) {
            Ok(uri) => uri,
            Err(e) => {
                let error_msg = format!("Cannot create URI from path: {} - error: {:?}", self.root_path, e);
                logger::error("ServerFactory", &error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "rust_lsp_adapter_uri_creation"
                });
            }
        };
        
        let mut params = InitializeParams::default();
        params.root_uri = Some(root_uri);
        params.capabilities = ClientCapabilities::default();
        
        let rt = match tokio::runtime::Runtime::new() {
            Ok(runtime) => runtime,
            Err(e) => {
                let error_msg = format!("Cannot create tokio runtime: {}", e);
                logger::error("ServerFactory", &error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "rust_lsp_adapter_runtime_creation"
                });
            }
        };
        
        let server_clone = self.server.clone();
        
        let init_result = rt.block_on(async move {
            match server_clone.initialize(params).await {
                Ok(result) => Ok(result),
                Err(e) => {
                    let error_msg = format!("Error initializing Rust server: {:?}", e);
                    logger::error("ServerFactory", &error_msg);
                    Err(error_msg)
                }
            }
        });
        
        match init_result {
            Ok(result) => {
                match serde_json::to_value(result.capabilities) {
                    Ok(json_value) => json_value,
                    Err(e) => {
                        let error_msg = format!("Cannot serialize capabilities to JSON: {}", e);
                        logger::error("ServerFactory", &error_msg);
                        json!({
                            "error": error_msg,
                            "_type": "capabilities_error",
                            "source": "rust_lsp_adapter_serialization"
                        })
                    }
                }
            },
            Err(e) => {
                json!({
                    "error": e,
                    "_type": "capabilities_error",
                    "source": "rust_lsp_adapter_initialization"
                })
            }
        }
    }
}

#[async_trait]
impl LanguageServer for LanguageServerInstance {
    async fn initialize(&self, params: InitializeParams) -> LspResult<InitializeResult> {
        match self {
            LanguageServerInstance::Rust(server) => server.initialize(params).await,
        }
    }
    
    async fn initialized(&self, params: InitializedParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.initialized(params).await,
        }
    }
    
    async fn shutdown(&self) -> LspResult<()> {
        match self {
            LanguageServerInstance::Rust(server) => server.shutdown().await,
        }
    }
    
    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_open(params).await,
        }
    }
    
    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_change(params).await,
        }
    }
    
    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_save(params).await,
        }
    }
    
    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_close(params).await,
        }
    }
    
    
    async fn completion(&self, params: CompletionParams) -> LspResult<Option<CompletionResponse>> {
        match self {
            LanguageServerInstance::Rust(server) => server.completion(params).await,
        }
    }
    
    async fn hover(&self, params: HoverParams) -> LspResult<Option<Hover>> {
        match self {
            LanguageServerInstance::Rust(server) => server.hover(params).await,
        }
    }
    
    async fn goto_definition(&self, params: GotoDefinitionParams) -> LspResult<Option<GotoDefinitionResponse>> {
        match self {
            LanguageServerInstance::Rust(server) => server.goto_definition(params).await,
        }
    }
    
    async fn references(&self, params: ReferenceParams) -> LspResult<Option<Vec<Location>>> {
        match self {
            LanguageServerInstance::Rust(server) => server.references(params).await,
        }
    }
    
    async fn formatting(&self, params: DocumentFormattingParams) -> LspResult<Option<Vec<TextEdit>>> {
        match self {
            LanguageServerInstance::Rust(server) => server.formatting(params).await,
        }
    }
} 