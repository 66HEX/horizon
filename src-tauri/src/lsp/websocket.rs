use std::sync::Arc;
use std::net::SocketAddr;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, Mutex};
use warp::ws::{Message, WebSocket};
use warp::Filter;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_stream::wrappers::TcpListenerStream;

use crate::lsp::server_factory::ServerFactory;
use crate::lsp::get_supported_languages;
use crate::lsp::logger;
use serde::{Deserialize, Serialize};
use anyhow::Result;

pub struct WebSocketManager {
    server_factory: ServerFactory,
    clients: Arc<Mutex<Vec<mpsc::UnboundedSender<Message>>>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum LspRequest {
    Initialize { language: String, root_path: String },
    Completion { file_path: String, position: Position },
    Hover { file_path: String, position: Position },
    Definition { file_path: String, position: Position },
    References { file_path: String, position: Position },
    Diagnostics { file_path: String },
    Formatting { file_path: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum LspResponse {
    Initialized { success: bool, message: String },
    Completion { items: Vec<CompletionItem> },
    Hover { contents: Option<String> },
    Definition { location: Option<Location> },
    References { locations: Vec<Location> },
    Diagnostics { items: Vec<DiagnosticItem> },
    Formatting { edits: Vec<TextEdit> },
    Error { message: String },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Location {
    pub file_path: String,
    pub range: Range,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionItem {
    pub label: String,
    pub kind: String,
    pub detail: Option<String>,
    pub documentation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiagnosticItem {
    pub message: String,
    pub severity: String,
    pub range: Range,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextEdit {
    pub range: Range,
    pub new_text: String,
}

impl WebSocketManager {
    pub fn new() -> Self {
        Self {
            server_factory: ServerFactory::new(),
            clients: Arc::new(Mutex::new(Vec::new())),
        }
    }
    
    pub async fn start_server(&self, port: u16) -> Result<()> {
        let socket_addr: SocketAddr = ([127, 0, 0, 1], port).into();
        
        logger::info("WebSocketManager", &format!("Attempting to start WebSocket LSP server on port {}", port));
        
        match tokio::net::TcpListener::bind(socket_addr).await {
            Ok(listener) => {
                let clients = self.clients.clone();
                let server_factory = self.server_factory.clone();
                
                let ws_route = warp::path("lsp")
                    .and(warp::ws())
                    .map(move |ws: warp::ws::Ws| {
                        let clients = clients.clone();
                        let server_factory = server_factory.clone();
                        
                        ws.on_upgrade(move |socket| {
                            Self::handle_connection(socket, clients, server_factory)
                        })
                    });
                
                logger::info("WebSocketManager", &format!("WebSocket LSP server started on port {}", port));
                
                let incoming = TcpListenerStream::new(listener);
                warp::serve(ws_route).run_incoming(incoming).await;
                
                Ok(())
            },
            Err(e) => {
                logger::error("WebSocketManager", &format!("Cannot start WebSocket server on port {}: {}", port, e));
                Err(anyhow::anyhow!("Cannot start WebSocket server: {}", e))
            }
        }
    }
    
    pub async fn stop_server(&self) -> Result<()> {
        let mut clients = self.clients.lock().await;
        
        for client in clients.iter_mut() {
            let close_message = Message::close_with(CloseCode::Normal, "Server shutting down");
            
            if let Err(e) = client.send(close_message) {
                logger::error("WebSocketManager", &format!("Error when closing WebSocket connection: {}", e));
            }
        }
        
        clients.clear();
        
        logger::info("WebSocketManager", "WebSocket LSP server stopped");
        Ok(())
    }
    
    async fn handle_connection(
        ws: WebSocket,
        clients: Arc<Mutex<Vec<mpsc::UnboundedSender<Message>>>>,
        server_factory: ServerFactory,
    ) {
        logger::info("WebSocketManager", "New WebSocket LSP connection");
        
        let (mut ws_tx, mut ws_rx) = ws.split();
        
        let (tx, mut rx) = mpsc::unbounded_channel();
        
        clients.lock().await.push(tx.clone());
        
        let forward_task = tokio::task::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(e) = ws_tx.send(msg).await {
                    logger::error("WebSocketManager", &format!("Error forwarding message to WebSocket: {}", e));
                    break;
                }
            }
        });
        
        let server_factory_clone = server_factory.clone();
        let backward_task = tokio::task::spawn(async move {
            let mut active_server = None;
            
            while let Some(result) = ws_rx.next().await {
                match result {
                    Ok(msg) => {
                        if msg.is_text() || msg.is_binary() {
                            let response = Self::handle_message(msg, &server_factory_clone, &mut active_server).await;
                            if let Ok(response_msg) = response {
                                if !response_msg.as_bytes().is_empty() {
                                    if let Err(e) = tx.send(response_msg) {
                                        logger::error("WebSocketManager", &format!("Error sending response: {}", e));
                                        break;
                                    }
                                }
                            }
                        } else if msg.is_close() {
                            if let Some(server_id) = active_server.take() {
                                if let Err(e) = server_factory_clone.stop_server(server_id).await {
                                    logger::error("WebSocketManager", &format!("Error stopping LSP server: {}", e));
                                }
                            }
                            break;
                        }
                    }
                    Err(e) => {
                        logger::error("WebSocketManager", &format!("WebSocket error: {}", e));
                        break;
                    }
                }
            }
            
            if let Some(server_id) = active_server {
                if let Err(e) = server_factory_clone.stop_server(server_id).await {
                    logger::error("WebSocketManager", &format!("Error stopping LSP server: {}", e));
                }
            }
            
            logger::info("WebSocketManager", "WebSocket LSP client disconnected");
        });
        
        tokio::select! {
            _ = forward_task => {},
            _ = backward_task => {},
        }
    }
    
    async fn handle_message(
        msg: Message, 
        server_factory: &ServerFactory, 
        active_server: &mut Option<String>
    ) -> Result<Message> {
        if let Ok(text) = msg.to_str() {
            logger::info("WebSocketManager", &format!("Received message: {}", text));
            
            match serde_json::from_str::<serde_json::Value>(text) {
                Ok(json_rpc) => {
                    let id_value = json_rpc.get("id").cloned().unwrap_or(serde_json::Value::Null);
                    
                    if json_rpc.is_object() {
                        let jsonrpc = json_rpc.get("jsonrpc");
                        let method = json_rpc.get("method");
                        let id = json_rpc.get("id");
                        let params = json_rpc.get("params");
                        
                        if let Some(jsonrpc_value) = jsonrpc {
                            if jsonrpc_value.as_str() != Some("2.0") {
                                let error_response = serde_json::json!({
                                    "jsonrpc": "2.0",
                                    "id": id.cloned().unwrap_or(serde_json::Value::Null),
                                    "error": {
                                        "code": -32600,
                                        "message": "Invalid JSON-RPC version. Expected 2.0"
                                    }
                                });
                                return Ok(Message::text(error_response.to_string()));
                            }
                        } else {
                            let error_response = serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": id.cloned().unwrap_or(serde_json::Value::Null),
                                "error": {
                                    "code": -32600,
                                    "message": "Missing JSON-RPC version"
                                }
                            });
                            return Ok(Message::text(error_response.to_string()));
                        }
                        
                        if let Some(method_value) = method {
                            let method_name = method_value.as_str().unwrap_or("");
                            
                            match method_name {
                                "initialize" if id.is_some() => {
                                    logger::info("WebSocketManager", "Received initialize request");
                                    
                                    let params_value = match params {
                                        Some(value) => value.clone(),
                                        None => {
                                            logger::info("WebSocketManager", "No parameters in initialize request");
                                            let error_response = serde_json::json!({
                                                "jsonrpc": "2.0",
                                                "id": id.unwrap_or(&serde_json::Value::Null).clone(),
                                                "error": {
                                                    "code": -32602,
                                                    "message": "Invalid params: params is required for initialize"
                                                }
                                            });
                                            return Ok(Message::text(error_response.to_string()));
                                        }
                                    };
                                    
                                    let file_path = params_value.get("rootUri")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .trim_start_matches("file://")
                                        .to_string();
                                    
                                    let language = params_value.get("initializationOptions")
                                        .and_then(|v| v.get("language"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("unknown")
                                        .to_string();
                                    
                                    logger::info("WebSocketManager", &format!("Initialization for language: {}, file path: {}", language, file_path));
                                    
                                    let mut final_language = language.clone();
                                    
                                    if final_language == "unknown" || final_language.is_empty() {
                                        if let Some(detected_language) = Self::detect_language_from_file_extension(&file_path) {
                                            logger::info("WebSocketManager", &format!("Automatically detected language: {} based on file extension or directory contents", detected_language));
                                            final_language = detected_language;
                                        } else {
                                            logger::info("WebSocketManager", &format!("Failed to detect language automatically, trying to use language from parameters: {}", language));
                                        }
                                    }
                                    
                                    let supported_languages = get_supported_languages();
                                    if !supported_languages.contains(&final_language.as_str()) {
                                        logger::info("WebSocketManager", &format!("Language {} is not supported by LSP server", final_language));
                                        
                                        let error_response = serde_json::json!({
                                            "jsonrpc": "2.0",
                                            "id": id.unwrap_or(&serde_json::Value::Null).clone(),
                                            "error": {
                                                "code": -32601,
                                                "message": format!("Language '{}' is not supported. Currently supported languages are: {}", 
                                                                  final_language, supported_languages.join(", "))
                                            }
                                        });
                                        
                                        return Ok(Message::text(error_response.to_string()));
                                    }
                                    
                                    logger::info("WebSocketManager", &format!("Using language for initialization: {}", final_language));
                                    
                                    match server_factory.find_project_root(&final_language, &file_path) {
                                        Ok(correct_root_path) => {
                                            logger::info("WebSocketManager", &format!("Found correct project root directory: {}", correct_root_path));
                                            
                                            let mut updated_params = params_value.clone();
                                            
                                            let correct_root_uri = format!("file://{}", correct_root_path);
                                            
                                            if let Some(obj) = updated_params.as_object_mut() {
                                                obj.insert("rootUri".to_string(), serde_json::Value::String(correct_root_uri.clone()));
                                                obj.insert("rootPath".to_string(), serde_json::Value::String(correct_root_path.clone()));
                                                
                                                if !obj.contains_key("initializationOptions") {
                                                    obj.insert("initializationOptions".to_string(), 
                                                             serde_json::json!({ "language": final_language }));
                                                } else if let Some(init_options) = obj.get_mut("initializationOptions") {
                                                    if let Some(obj) = init_options.as_object_mut() {
                                                        obj.insert("language".to_string(), 
                                                                 serde_json::Value::String(final_language.clone()));
                                                    }
                                                }
                                            }
                                            
                                            logger::info("WebSocketManager", &format!("Updated rootUri: {}", correct_root_uri));
                                            
                                            let server_path = if std::path::Path::new(&file_path).is_dir() {
                                                correct_root_path.clone()
                                            } else {
                                                file_path.clone()
                                            };
                                            
                                            let server_result = server_factory.create_server(&final_language, &server_path).await;
                                            
                                            match server_result {
                                                Ok(server_id) => {
                                                    *active_server = Some(server_id.clone());
                                                    
                                                    logger::info("WebSocketManager", &format!("Created LSP server. ID: {}", server_id));
                                                    
                                                    let mut updated_json_rpc = json_rpc.clone();
                                                    if let Some(obj) = updated_json_rpc.as_object_mut() {
                                                        obj.insert("params".to_string(), updated_params);
                                                    }
                                                    
                                                    let request_text = serde_json::to_string(&updated_json_rpc)?;
                                                    
                                                    let forward_result = server_factory.forward_request(&server_id, &request_text).await;
                                                    
                                                    match forward_result {
                                                        Ok(response_text) => {
                                                            logger::info("WebSocketManager", &format!("Sending initialize response from server: {}", response_text));
                                                            return Ok(Message::text(response_text));
                                                        },
                                                        Err(e) => {
                                                            logger::error("WebSocketManager", &format!("Error during server initialization: {}", e));
                                                            let id_value = id.unwrap().clone();
                                                            let error_response = serde_json::json!({
                                                                "jsonrpc": "2.0",
                                                                "id": id_value,
                                                                "error": {
                                                                    "code": -32603,
                                                                    "message": format!("LSP server initialization error: {}", e)
                                                                }
                                                            });
                                                            
                                                            return Ok(Message::text(error_response.to_string()));
                                                        }
                                                    }
                                                },
                                                Err(e) => {
                                                    let id_value = id.unwrap().clone();
                                                    let error_response = serde_json::json!({
                                                        "jsonrpc": "2.0",
                                                        "id": id_value,
                                                        "error": {
                                                            "code": -32603,
                                                            "message": format!("LSP server creation error: {}", e)
                                                        }
                                                    });
                                                    
                                                    return Ok(Message::text(error_response.to_string()));
                                                }
                                            }
                                        },
                                        Err(e) => {
                                            logger::error("WebSocketManager", &format!("Error finding project root directory: {}", e));
                                            
                                            logger::info("WebSocketManager", &format!("Using original path as fallback: {}", file_path));
                                            
                                            let server_result = server_factory.create_server(&final_language, &file_path).await;
                                            
                                            match server_result {
                                                Ok(server_id) => {
                                                    *active_server = Some(server_id.clone());
                                                    
                                                    let forward_result = server_factory.forward_request(&server_id, text).await;
                                                    
                                                    match forward_result {
                                                        Ok(response_text) => {
                                                            logger::info("WebSocketManager", &format!("Sending initialize response from server: {}", response_text));
                                                            return Ok(Message::text(response_text));
                                                        },
                                                        Err(e) => {
                                                            logger::error("WebSocketManager", &format!("Error during server initialization: {}", e));
                                                            let id_value = id.unwrap().clone();
                                                            let error_response = serde_json::json!({
                                                                "jsonrpc": "2.0",
                                                                "id": id_value,
                                                                "error": {
                                                                    "code": -32603,
                                                                    "message": format!("LSP server initialization error: {}", e)
                                                                }
                                                            });
                                                            
                                                            return Ok(Message::text(error_response.to_string()));
                                                        }
                                                    }
                                                },
                                                Err(e) => {
                                                    let id_value = id.unwrap().clone();
                                                    let error_response = serde_json::json!({
                                                        "jsonrpc": "2.0",
                                                        "id": id_value,
                                                        "error": {
                                                            "code": -32603,
                                                            "message": format!("LSP server creation error: {}", e)
                                                        }
                                                    });
                                                    
                                                    return Ok(Message::text(error_response.to_string()));
                                                }
                                            }
                                        }
                                    }
                                },
                                
                                "initialized" => {
                                    logger::info("WebSocketManager", "Received initialized notification");
                                    
                                    if let Some(server_id) = active_server {
                                        let forward_result = server_factory.forward_request(server_id, text).await;
                                        
                                        match forward_result {
                                            Ok(_) => {
                                                return Ok(Message::text(""));
                                            },
                                            Err(e) => {
                                                logger::error("WebSocketManager", &format!("Error forwarding initialized notification: {}", e));
                                                return Ok(Message::text(""));
                                            }
                                        }
                                    } else {
                                        logger::error("WebSocketManager", "Received initialized notification, but server is not initialized");
                                        return Ok(Message::text(""));
                                    }
                                },
                                
                                "textDocument/didOpen" => {
                                    logger::info("WebSocketManager", "Received didOpen notification");
                                    
                                    let mut language_id = "generic".to_string();
                                    let mut file_uri = "".to_string();
                                    
                                    if let Some(params) = json_rpc.get("params") {
                                        if let Some(text_doc) = params.get("textDocument") {
                                            if let Some(lang_id) = text_doc.get("languageId") {
                                                if let Some(lang_str) = lang_id.as_str() {
                                                    logger::info("WebSocketManager", &format!("Declared document language in didOpen: {}", lang_str));
                                                    language_id = lang_str.to_string();
                                                }
                                            }
                                            if let Some(uri) = text_doc.get("uri") {
                                                if let Some(uri_str) = uri.as_str() {
                                                    logger::info("WebSocketManager", &format!("Document URI in didOpen: {}", uri_str));
                                                    file_uri = uri_str.to_string();
                                                }
                                            }
                                        }
                                    }
                                    
                                    if language_id == "generic" || language_id == "plaintext" || language_id.is_empty() {
                                        let file_path = if file_uri.starts_with("file://") {
                                            file_uri[7..].to_string()
                                        } else {
                                            file_uri.clone()
                                        };
                                        
                                        logger::info("WebSocketManager", &format!("Analyzing file: '{}' with declared language: '{}'", file_path, language_id));
                                        
                                        let detected_language_option = Self::detect_language_from_file_extension(&file_path);
                                        
                                        match detected_language_option {
                                            Some(detected_language) => {
                                                logger::info("WebSocketManager", &format!("Detected language based on file extension: {} instead of {}", 
                                                         detected_language, language_id));
                                                
                                                language_id = detected_language;
                                                
                                                let supported_languages = get_supported_languages();
                                                if !supported_languages.contains(&language_id.as_str()) {
                                                    logger::info("WebSocketManager", &format!("Language {} is not supported by LSP server", language_id));
                                                    return Ok(Message::text(""));
                                                }
                                                
                                                if let Some(_server_id) = active_server {
                                                    logger::info("WebSocketManager", &format!("Checking if we are currently using the right server for language: {}", language_id));
                                                    
                                                    if language_id == "rust" {
                                                        logger::info("WebSocketManager", "Detected Rust file - making sure we have the appropriate server");
                                                    }
                                                }
                                                
                                                let mut modified_json_rpc = json_rpc.clone();
                                                
                                                if let Some(params) = modified_json_rpc.get_mut("params") {
                                                    if let Some(text_doc) = params.get_mut("textDocument") {
                                                        if let Some(lang_obj) = text_doc.get_mut("languageId") {
                                                            *lang_obj = serde_json::Value::String(language_id.clone());
                                                            logger::info("WebSocketManager", &format!("Updated didOpen with detected language: {}", language_id));
                                                        }
                                                    }
                                                }
                                                
                                                if let Some(server_id) = active_server {
                                                    let modified_text = serde_json::to_string(&modified_json_rpc)
                                                        .unwrap_or_else(|_| text.to_string());
                                                    
                                                    let forward_result = server_factory.forward_request(server_id, &modified_text).await;
                                                    
                                                    if let Err(e) = forward_result {
                                                        logger::error("WebSocketManager", &format!("Error forwarding didOpen: {}", e));
                                                    }
                                                    
                                                    return Ok(Message::text(""));
                                                } else {
                                                    logger::info("WebSocketManager", &format!("No active LSP server, trying to create new one for: {}", language_id));
                                                    
                                                    let file_path = if file_uri.starts_with("file://") {
                                                        file_uri[7..].to_string()
                                                    } else {
                                                        file_uri.clone()
                                                    };
                                                    
                                                    match server_factory.create_server(&language_id, &file_path).await {
                                                        Ok(server_id) => {
                                                            *active_server = Some(server_id.clone());
                                                            logger::info("WebSocketManager", &format!("Created new LSP server for: {}. ID: {}", language_id, server_id));
                                                            
                                                            let modified_text = serde_json::to_string(&modified_json_rpc)
                                                                .unwrap_or_else(|_| text.to_string());
                                                            
                                                            let forward_result = server_factory.forward_request(&server_id, &modified_text).await;
                                                            
                                                            if let Err(e) = forward_result {
                                                                logger::error("WebSocketManager", &format!("Error forwarding didOpen to new server: {}", e));
                                                            }
                                                        },
                                                        Err(e) => {
                                                            logger::error("WebSocketManager", &format!("Cannot create LSP server for: {}. Error: {}", language_id, e));
                                                        }
                                                    }
                                                    
                                                    return Ok(Message::text(""));
                                                }
                                            },
                                            None => {
                                                logger::info("WebSocketManager", &format!("Language not detected based on file extension for: {}", file_path));
                                            }
                                        }
                                    }
                                    
                                    if let Some(server_id) = active_server {
                                        let forward_result = server_factory.forward_request(server_id, text).await;
                                        
                                        if let Err(e) = forward_result {
                                            logger::error("WebSocketManager", &format!("Error forwarding didOpen: {}", e));
                                        }
                                        
                                        return Ok(Message::text(""));
                                    } else {
                                        logger::error("WebSocketManager", "Received didOpen, but server is not initialized");
                                        return Ok(Message::text(""));
                                    }
                                },
                                
                                _ => {
                                    if let Some(server_id) = active_server {
                                        let forward_result = server_factory.forward_request(server_id, text).await;
                                        
                                        match forward_result {
                                            Ok(response_text) => {
                                                return Ok(Message::text(response_text));
                                            },
                                            Err(e) => {
                                                if id.is_some() {
                                                    let id_value = id.unwrap().clone();
                                                    let error_response = serde_json::json!({
                                                        "jsonrpc": "2.0",
                                                        "id": id_value,
                                                        "error": {
                                                            "code": -32603,
                                                            "message": format!("Error forwarding request: {}", e)
                                                        }
                                                    });
                                                    
                                                    return Ok(Message::text(error_response.to_string()));
                                                } else {
                                                    return Ok(Message::text(""));
                                                }
                                            }
                                        }
                                    } else if id.is_some() {
                                        let id_value = id.unwrap().clone();
                                        let error_response = serde_json::json!({
                                            "jsonrpc": "2.0",
                                            "id": id_value,
                                            "error": {
                                                "code": -32603,
                                                "message": "LSP server not initialized"
                                            }
                                        });
                                        
                                        return Ok(Message::text(error_response.to_string()));
                                    } else {
                                        return Ok(Message::text(""));
                                    }
                                }
                            }
                        }
                    }
                    
                    let error_response = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id_value,
                        "error": {
                            "code": -32600,
                            "message": "Invalid Request"
                        }
                    });
                    
                    Ok(Message::text(error_response.to_string()))
                },
                Err(e) => {
                    let error_response = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": null,
                        "error": {
                            "code": -32700,
                            "message": format!("Parse error: {}", e)
                        }
                    });
                    
                    Ok(Message::text(error_response.to_string()))
                }
            }
        } else {
            let error_response = serde_json::json!({
                "jsonrpc": "2.0",
                "id": null,
                "error": {
                    "code": -32700,
                    "message": "Parse error: Message is not text"
                }
            });
            
            Ok(Message::text(error_response.to_string()))
        }
    }

    fn detect_language_from_file_extension(file_path: &str) -> Option<String> {
        use std::path::Path;
        
        let clean_path = if file_path.contains('?') {
            file_path.split('?').next().unwrap_or(file_path)
        } else {
            file_path
        };
        
        logger::info("WebSocketManager", &format!("Detecting language for path: '{}'", clean_path));
        
        let path = Path::new(clean_path);
        if path.is_dir() {
            logger::info("WebSocketManager", "Path is a directory, checking project files");
            
            if path.join("Cargo.toml").exists() {
                logger::info("WebSocketManager", "Detected Rust project (Cargo.toml)");
                return Some("rust".to_string());
            } else if path.join("package.json").exists() {
                logger::info("WebSocketManager", "Detected JavaScript/TypeScript project (package.json)");
                if path.join("tsconfig.json").exists() {
                    return Some("typescript".to_string());
                }
                return Some("javascript".to_string());
            } else if path.join("pyproject.toml").exists() || path.join("requirements.txt").exists() {
                logger::info("WebSocketManager", "Detected Python project");
                return Some("python".to_string());
            }
            
            let entries = match std::fs::read_dir(path) {
                Ok(entries) => entries,
                Err(_) => return None,
            };
            
            for entry in entries {
                if let Ok(entry) = entry {
                    if let Some(filename) = entry.file_name().to_str() {
                        if filename.ends_with(".rs") {
                            logger::info("WebSocketManager", "Found .rs file in directory");
                            return Some("rust".to_string());
                        } else if filename.ends_with(".py") {
                            return Some("python".to_string());
                        } else if filename.ends_with(".js") {
                            return Some("javascript".to_string());
                        } else if filename.ends_with(".ts") {
                            return Some("typescript".to_string());
                        }
                    }
                }
            }
            
            logger::info("WebSocketManager", "No specific project type detected in directory");
            return None;
        }
        
        let extension = clean_path.split('.').last().unwrap_or("");
        logger::info("WebSocketManager", &format!("File extension: '{}'", extension));
        
        match extension {
            "rs" => {
                logger::info("WebSocketManager", "Detected Rust file (.rs)");
                Some("rust".to_string())
            },
            "py" => Some("python".to_string()),
            "js" => Some("javascript".to_string()),
            "ts" => Some("typescript".to_string()),
            "cpp" | "h" | "c" | "cc" | "hh" => Some("cpp".to_string()),
            "java" => Some("java".to_string()),
            "kt" => Some("kotlin".to_string()),
            "go" => Some("go".to_string()),
            "sh" => Some("bash".to_string()),
            "md" => Some("markdown".to_string()),
            "html" => Some("html".to_string()),
            "css" => Some("css".to_string()),
            "rb" => Some("ruby".to_string()),
            "php" => Some("php".to_string()),
            "sql" => Some("sql".to_string()),
            "xml" => Some("xml".to_string()),
            "json" => Some("json".to_string()),
            "yaml" | "yml" => Some("yaml".to_string()),
            "toml" => Some("toml".to_string()),
            "ini" | "cfg" | "env" => Some("ini".to_string()),
            "bat" => Some("batch".to_string()),
            "ps1" | "psm1" | "psd1" => Some("powershell".to_string()),
            _ => {
                logger::info("WebSocketManager", "No known file extension detected");
                None
            }
        }
    }
}

impl Clone for ServerFactory {
    fn clone(&self) -> Self {
        Self::new()
    }
}

impl Clone for WebSocketManager {
    fn clone(&self) -> Self {
        Self {
            server_factory: self.server_factory.clone(),
            clients: self.clients.clone(),
        }
    }
} 
