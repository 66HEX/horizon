use std::sync::{Arc, Mutex as StdMutex};
use std::process::{Command, Stdio, Child};
use anyhow::Result;
use tower_lsp::jsonrpc::Result as LspResult;
use tower_lsp::{LanguageServer, Client};
use tower_lsp::lsp_types::{
    InitializeParams, InitializeResult, ServerCapabilities, TextDocumentSyncCapability,
    TextDocumentSyncKind, CompletionOptions, HoverProviderCapability, SignatureHelpOptions,
    DeclarationCapability, OneOf, TypeDefinitionProviderCapability, ImplementationProviderCapability,
    CodeActionProviderCapability, CodeLensOptions, RenameOptions, FoldingRangeProviderCapability,
    CallHierarchyServerCapability, WorkspaceServerCapabilities, WorkspaceFoldersServerCapabilities,
    ServerInfo, InitializedParams, MessageType, DidOpenTextDocumentParams, DidChangeTextDocumentParams,
    DidSaveTextDocumentParams, DidCloseTextDocumentParams, CompletionParams, CompletionResponse,
    HoverParams, Hover, GotoDefinitionParams, GotoDefinitionResponse, ReferenceParams, Location,
    DocumentFormattingParams, TextEdit, Diagnostic, PublishDiagnosticsParams
};
use async_trait::async_trait;
use dashmap::DashMap;
use tokio::sync::mpsc::{self, UnboundedSender, UnboundedReceiver};
use tokio::sync::{RwLock, Mutex};

use crate::lsp::config::ServerConfig;
use crate::lsp::protocol::{LSPUtils, LspProcessConnection, JsonRpcNotification};
use crate::lsp::servers::BaseLanguageServer;

struct DocumentData {
    content: String,
    diagnostics: Vec<Diagnostic>,
}

#[derive(Clone)]
pub struct RustLanguageServer {
    client: Option<Client>,
    config: ServerConfig,
    rust_analyzer_process: Arc<StdMutex<Option<Child>>>,
    document_states: Arc<DashMap<String, String>>,
    is_initialized: Arc<StdMutex<bool>>,
    lsp_connection: Arc<Mutex<Option<LspProcessConnection>>>,
    document_data: Arc<RwLock<DashMap<String, DocumentData>>>,
    notification_tx: Arc<StdMutex<Option<UnboundedSender<JsonRpcNotification>>>>,
}

impl LSPUtils for RustLanguageServer {}

unsafe impl Send for RustLanguageServer {}
unsafe impl Sync for RustLanguageServer {}

impl BaseLanguageServer for RustLanguageServer {
    fn id(&self) -> &str {
        "rust-analyzer"
    }
    
    fn name(&self) -> &str {
        "Rust Analyzer"
    }
    
    fn config(&self) -> &ServerConfig {
        &self.config
    }
    
    fn initialize(&self) -> Result<()> {
        let exec_path = self.config.executable_path.clone()
            .unwrap_or_else(|| "rust-analyzer".into());
        
        let mut command = Command::new(exec_path);
        
        for arg in &self.config.additional_args {
            command.arg(arg);
        }
        
        for (key, value) in &self.config.env_vars {
            command.env(key, value);
        }
        
        println!("Starting rust-analyzer process in root directory: {:?}", self.config.root_path);
        
        command.current_dir(&self.config.root_path);
        
        let mut process = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        
        let connection = LspProcessConnection::new(&mut process)?;
        
        let (notification_tx, notification_rx) = mpsc::unbounded_channel();
        *self.notification_tx.lock().unwrap() = Some(notification_tx);
        
        self.start_notification_handling(notification_rx);
        
        tokio::task::block_in_place(|| {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                *self.lsp_connection.lock().await = Some(connection);
            });
        });
        *self.rust_analyzer_process.lock().unwrap() = Some(process);
        *self.is_initialized.lock().unwrap() = true;
        
        println!("Successfully started rust-analyzer process");
        
        Ok(())
    }
    
    fn shutdown(&self) -> Result<()> {
        if let Some(mut process) = self.rust_analyzer_process.lock().unwrap().take() {
            tokio::task::block_in_place(|| {
                let rt = tokio::runtime::Handle::current();
                rt.block_on(async {
                    if let Some(connection) = self.lsp_connection.lock().await.as_ref() {
                        let _ = connection.send_notification::<()>("shutdown", None);
                        let _ = connection.send_notification::<()>("exit", None);
                    }
                });
            });
            
            process.kill()?;
            *self.is_initialized.lock().unwrap() = false;
            
            tokio::task::block_in_place(|| {
                let rt = tokio::runtime::Handle::current();
                rt.block_on(async {
                    *self.lsp_connection.lock().await = None;
                });
            });
            
            *self.notification_tx.lock().unwrap() = None;
        }
        
        Ok(())
    }
    
    fn is_running(&self) -> bool {
        *self.is_initialized.lock().unwrap()
    }
}

impl RustLanguageServer {
    pub fn new(root_path: String) -> Result<Self> {
        let config = ServerConfig::new(&root_path)?
            .with_executable("rust-analyzer")
            .with_env_var("RUST_BACKTRACE", "1");
        
        Ok(Self {
            client: None,
            config,
            rust_analyzer_process: Arc::new(StdMutex::new(None)),
            document_states: Arc::new(DashMap::new()),
            is_initialized: Arc::new(StdMutex::new(false)),
            lsp_connection: Arc::new(Mutex::new(None)),
            document_data: Arc::new(RwLock::new(DashMap::new())),
            notification_tx: Arc::new(StdMutex::new(None)),
        })
    }
    
    pub fn with_client(mut self, client: Client) -> Self {
        self.client = Some(client);
        self
    }
    
    fn start_notification_handling(&self, mut rx: UnboundedReceiver<JsonRpcNotification>) {
        let server = self.clone();
        
        tokio::spawn(async move {
            while let Some(notification) = rx.recv().await {
                server.process_notification(notification).await;
            }
        });
    }
    
    async fn process_notification(&self, notification: JsonRpcNotification) {
        match notification.method.as_str() {
            "textDocument/publishDiagnostics" => {
                if let Some(params) = notification.params {
                    if let Ok(diagnostics_params) = serde_json::from_value::<PublishDiagnosticsParams>(params) {
                        self.handle_diagnostics(diagnostics_params).await;
                    }
                }
            },
            _ => {
                println!("Received unhandled notification: {}", notification.method);
            }
        }
    }
    
    async fn handle_diagnostics(&self, params: PublishDiagnosticsParams) {
        let uri = params.uri.to_string();
        let diagnostics = params.diagnostics.clone();
        
        let document_data = self.document_data.write().await;
        
        if !document_data.contains_key(&uri) {
            document_data.insert(uri.clone(), DocumentData {
                content: String::new(),
                diagnostics: diagnostics.clone(),
            });
        } else {
            if let Some(mut data_ref) = document_data.get_mut(&uri) {
                data_ref.diagnostics = diagnostics.clone();
            }
        }
        
        if let Some(client) = &self.client {
            client.publish_diagnostics(params.uri, params.diagnostics, params.version).await;
        }
        
        println!("Received {} diagnostics for {}", diagnostics.len(), uri);
    }
    
    async fn send_request<T: serde::Serialize>(&self, method: &str, params: T) -> Result<serde_json::Value> {
        let connection = {
            let guard = self.lsp_connection.lock().await;
            guard.as_ref().cloned()
                .ok_or_else(|| anyhow::anyhow!("No connection to rust-analyzer"))?
        };
        
        let response = connection.send_request(method, Some(params)).await?;
        
        if let Some(error) = response.error {
            Err(anyhow::anyhow!("LSP error: {} (code: {})", error.message, error.code))
        } else if let Some(result) = response.result {
            Ok(result)
        } else {
            Err(anyhow::anyhow!("Empty response from LSP server"))
        }
    }
    
    async fn send_notification<T: serde::Serialize>(&self, method: &str, params: T) -> Result<()> {
        let connection = {
            let guard = self.lsp_connection.lock().await;
            guard.as_ref().cloned()
                .ok_or_else(|| anyhow::anyhow!("No connection to rust-analyzer"))?
        };
        
        connection.send_notification(method, Some(params))
    }
}

#[async_trait]
impl LanguageServer for RustLanguageServer {
    async fn initialize(&self, params: InitializeParams) -> LspResult<InitializeResult> {
        if let Err(e) = <Self as BaseLanguageServer>::initialize(self) {
            if let Some(client) = &self.client {
                let message = format!("Failed to initialize Rust Analyzer process: {}", e);
                client.log_message(MessageType::ERROR, message).await;
            }
            return Err(tower_lsp::jsonrpc::Error::internal_error());
        }
        
        match self.send_request("initialize", params).await {
            Ok(result) => {
                match serde_json::from_value::<InitializeResult>(result) {
                    Ok(initialize_result) => Ok(initialize_result),
                    Err(e) => {
                        println!("Failed to parse initialize response: {}", e);
                        
                        Ok(InitializeResult {
                            capabilities: ServerCapabilities {
                                position_encoding: None,
                                text_document_sync: Some(TextDocumentSyncCapability::Kind(TextDocumentSyncKind::INCREMENTAL)),
                                selection_range_provider: None,
                                hover_provider: Some(HoverProviderCapability::Simple(true)),
                                completion_provider: Some(CompletionOptions {
                                    resolve_provider: Some(true),
                                    trigger_characters: Some(vec![".".to_string(), "::".to_string()]),
                                    all_commit_characters: None,
                                    work_done_progress_options: Default::default(),
                                    completion_item: None,
                                }),
                                signature_help_provider: Some(SignatureHelpOptions {
                                    trigger_characters: Some(vec!["(".to_string(), ",".to_string()]),
                                    retrigger_characters: None,
                                    work_done_progress_options: Default::default(),
                                }),
                                definition_provider: Some(OneOf::Left(true)),
                                type_definition_provider: Some(TypeDefinitionProviderCapability::Simple(true)),
                                implementation_provider: Some(ImplementationProviderCapability::Simple(true)),
                                references_provider: Some(OneOf::Left(true)),
                                document_highlight_provider: Some(OneOf::Left(true)),
                                document_symbol_provider: Some(OneOf::Left(true)),
                                workspace_symbol_provider: Some(OneOf::Left(true)),
                                code_action_provider: Some(CodeActionProviderCapability::Simple(true)),
                                code_lens_provider: Some(CodeLensOptions {
                                    resolve_provider: Some(true),
                                }),
                                document_formatting_provider: Some(OneOf::Left(true)),
                                document_range_formatting_provider: None,
                                document_on_type_formatting_provider: None,
                                rename_provider: Some(OneOf::Right(RenameOptions {
                                    prepare_provider: Some(true),
                                    work_done_progress_options: Default::default(),
                                })),
                                folding_range_provider: Some(FoldingRangeProviderCapability::Simple(true)),
                                color_provider: None,
                                declaration_provider: Some(DeclarationCapability::Simple(true)),
                                execute_command_provider: None,
                                workspace: Some(WorkspaceServerCapabilities {
                                    workspace_folders: Some(WorkspaceFoldersServerCapabilities {
                                        supported: Some(true),
                                        change_notifications: Some(OneOf::Left(true)),
                                    }),
                                    file_operations: None,
                                }),
                                call_hierarchy_provider: Some(CallHierarchyServerCapability::Simple(true)),
                                semantic_tokens_provider: None,
                                moniker_provider: None,
                                linked_editing_range_provider: None,
                                inline_value_provider: None,
                                inlay_hint_provider: None,
                                diagnostic_provider: None,
                                document_link_provider: None,
                                experimental: None,
                            },
                            server_info: Some(ServerInfo {
                                name: "rust-analyzer".to_string(),
                                version: Some("1.0.0".to_string()),
                            }),
                        })
                    }
                }
            },
            Err(e) => {
                println!("Failed to send initialize request: {}", e);
                Err(tower_lsp::jsonrpc::Error::internal_error())
            }
        }
    }

    async fn initialized(&self, params: InitializedParams) {
        if let Err(e) = self.send_notification("initialized", params).await {
            println!("Failed to send initialized notification: {}", e);
        }
    }

    async fn shutdown(&self) -> LspResult<()> {
        if let Err(e) = <Self as BaseLanguageServer>::shutdown(self) {
            if let Some(client) = &self.client {
                let message = format!("Failed to shut down Rust Analyzer: {}", e);
                client.log_message(MessageType::ERROR, message).await;
            } else {
                eprintln!("Failed to shut down Rust Analyzer: {}", e);
            }
        }
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri.to_string();
        let text = params.text_document.text.clone();
        
        {
            let document_data = self.document_data.write().await;
            document_data.insert(uri.clone(), DocumentData {
                content: text.clone(),
                diagnostics: Vec::new(),
            });
        }
        
        self.document_states.insert(uri, text);
        
        if let Err(e) = self.send_notification("textDocument/didOpen", params).await {
            println!("Failed to send didOpen notification: {}", e);
        }
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri.to_string();
        
        if !params.content_changes.is_empty() {
            let last_change = &params.content_changes[params.content_changes.len() - 1];
            let new_text = last_change.text.clone();
            
            {
                let document_data = self.document_data.write().await;
                
                let new_content = new_text.clone();
                
                if document_data.contains_key(&uri) {
                    if let Some(mut data) = document_data.get_mut(&uri) {
                        data.content = new_content;
                    }
                } else {
                    document_data.insert(uri.clone(), DocumentData {
                        content: new_content,
                        diagnostics: Vec::new(),
                    });
                }
            }
            
            if let Some(mut content) = self.document_states.get_mut(&uri) {
                *content = new_text.clone();
            } else {
                self.document_states.insert(uri.clone(), new_text);
            }
        }
        
        if let Err(e) = self.send_notification("textDocument/didChange", params).await {
            println!("Failed to send didChange notification: {}", e);
        }
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        if let Err(e) = self.send_notification("textDocument/didSave", params).await {
            println!("Failed to send didSave notification: {}", e);
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        let uri = params.text_document.uri.to_string();
        
        {
            let document_data = self.document_data.write().await;
            document_data.remove(&uri);
        }
        
        self.document_states.remove(&uri);
        
        if let Err(e) = self.send_notification("textDocument/didClose", params).await {
            println!("Failed to send didClose notification: {}", e);
        }
    }

    async fn completion(&self, params: CompletionParams) -> LspResult<Option<CompletionResponse>> {
        match self.send_request("textDocument/completion", params).await {
            Ok(result) => {
                match serde_json::from_value::<CompletionResponse>(result) {
                    Ok(completion_response) => Ok(Some(completion_response)),
                    Err(e) => {
                        println!("Failed to parse completion response: {}", e);
                        Ok(None)
                    }
                }
            },
            Err(e) => {
                println!("Failed to send completion request: {}", e);
                Ok(None)
            }
        }
    }

    async fn hover(&self, params: HoverParams) -> LspResult<Option<Hover>> {
        match self.send_request("textDocument/hover", params).await {
            Ok(result) => {
                if result.is_null() {
                    return Ok(None);
                }
                
                match serde_json::from_value::<Hover>(result) {
                    Ok(hover) => Ok(Some(hover)),
                    Err(e) => {
                        println!("Failed to parse hover response: {}", e);
                        Ok(None)
                    }
                }
            },
            Err(e) => {
                println!("Failed to send hover request: {}", e);
                Ok(None)
            }
        }
    }

    async fn goto_definition(&self, params: GotoDefinitionParams) -> LspResult<Option<GotoDefinitionResponse>> {
        match self.send_request("textDocument/definition", params).await {
            Ok(result) => {
                if result.is_null() {
                    return Ok(None);
                }
                
                match serde_json::from_value::<GotoDefinitionResponse>(result) {
                    Ok(definition) => Ok(Some(definition)),
                    Err(e) => {
                        println!("Failed to parse definition response: {}", e);
                        Ok(None)
                    }
                }
            },
            Err(e) => {
                println!("Failed to send definition request: {}", e);
                Ok(None)
            }
        }
    }

    async fn references(&self, params: ReferenceParams) -> LspResult<Option<Vec<Location>>> {
        match self.send_request("textDocument/references", params).await {
            Ok(result) => {
                if result.is_null() {
                    return Ok(None);
                }
                
                match serde_json::from_value::<Vec<Location>>(result) {
                    Ok(locations) => Ok(Some(locations)),
                    Err(e) => {
                        println!("Failed to parse references response: {}", e);
                        Ok(None)
                    }
                }
            },
            Err(e) => {
                println!("Failed to send references request: {}", e);
                Ok(None)
            }
        }
    }

    async fn formatting(&self, params: DocumentFormattingParams) -> LspResult<Option<Vec<TextEdit>>> {
        match self.send_request("textDocument/formatting", params).await {
            Ok(result) => {
                if result.is_null() {
                    return Ok(None);
                }
                
                match serde_json::from_value::<Vec<TextEdit>>(result) {
                    Ok(edits) => Ok(Some(edits)),
                    Err(e) => {
                        println!("Failed to parse formatting response: {}", e);
                        Ok(None)
                    }
                }
            },
            Err(e) => {
                println!("Failed to send formatting request: {}", e);
                Ok(None)
            }
        }
    }
} 