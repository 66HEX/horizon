use lsp_types::{CompletionItem, CompletionItemKind, Documentation, MarkupContent, MarkupKind};
use tower_lsp::lsp_types::Url;
use anyhow::Result;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::process::{Child, ChildStdin, ChildStdout};
use std::io::{BufReader, Write, BufRead, Read};
use serde_json::{Value, json};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use crate::lsp::logger;

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

pub trait LSPUtils {
    fn path_to_uri(path: &str) -> Result<Url> {
        let path = Path::new(path).canonicalize()?;
        let url = Url::from_file_path(path).map_err(|_| anyhow::anyhow!("Invalid file path"))?;
        Ok(url)
    }
    
    fn uri_to_path(uri: &Url) -> Result<String> {
        let path = uri.to_file_path()
            .map_err(|_| anyhow::anyhow!("Invalid URI"))?;
        let path_str = path.to_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid path encoding"))?;
        Ok(path_str.to_string())
    }
    
    fn create_completion_item(label: &str, kind: Option<CompletionItemKind>, detail: Option<&str>, documentation: Option<&str>) -> CompletionItem {
        CompletionItem {
            label: label.to_string(),
            kind,
            detail: detail.map(|s| s.to_string()),
            documentation: documentation.map(|doc| Documentation::MarkupContent(MarkupContent {
                kind: MarkupKind::Markdown,
                value: doc.to_string(),
            })),
            ..Default::default()
        }
    }
}

pub struct LspProcessConnection {
    stdin: Arc<Mutex<ChildStdin>>,
    next_id: AtomicU64,
    response_handlers: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<JsonRpcResponse>>>>,
}

impl Clone for LspProcessConnection {
    fn clone(&self) -> Self {
        Self {
            stdin: self.stdin.clone(),
            next_id: AtomicU64::new(self.next_id.load(Ordering::SeqCst)),
            response_handlers: self.response_handlers.clone(),
        }
    }
}

impl LspProcessConnection {
    pub fn new(process: &mut Child) -> Result<Self> {
        let stdin = process.stdin.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get stdin handle from process"))?;
        let stdout = process.stdout.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get stdout handle from process"))?;
        
        let stdin = Arc::new(Mutex::new(stdin));
        let response_handlers = Arc::new(Mutex::new(HashMap::new()));
        let next_id = AtomicU64::new(1);
        
        let connection = Self {
            stdin,
            next_id,
            response_handlers,
        };
        
        let response_handlers_clone = connection.response_handlers.clone();
        std::thread::spawn(move || {
            Self::read_responses(stdout, response_handlers_clone);
        });
        
        Ok(connection)
    }
    
    pub async fn send_request<T: Serialize>(&self, method: &str, params: Option<T>) -> Result<JsonRpcResponse> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let id_value = json!(id);
        
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: id_value.clone(),
            method: method.to_string(),
            params: params.map(|p| serde_json::to_value(p).unwrap_or(Value::Null)),
        };
        
        let request_json = serde_json::to_string(&request)?;
        
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.response_handlers.lock().unwrap().insert(id, tx);
        
        let message = format!("Content-Length: {}\r\n\r\n{}", request_json.len(), request_json);
        
        self.stdin.lock().unwrap().write_all(message.as_bytes())?;
        self.stdin.lock().unwrap().flush()?;
        
        logger::info("LspProcessConnection", &format!("Sent LSP request: {}", request_json));
        
        match rx.await {
            Ok(response) => {
                logger::info("LspProcessConnection", "Received LSP response");
                Ok(response)
            },
            Err(_) => Err(anyhow::anyhow!("Failed to receive response from LSP server"))
        }
    }
    
    pub fn send_notification<T: Serialize>(&self, method: &str, params: Option<T>) -> Result<()> {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params: params.map(|p| serde_json::to_value(p).unwrap_or(Value::Null)),
        };
        
        let notification_json = serde_json::to_string(&notification)?;
        
        let message = format!("Content-Length: {}\r\n\r\n{}", notification_json.len(), notification_json);
        
        self.stdin.lock().unwrap().write_all(message.as_bytes())?;
        self.stdin.lock().unwrap().flush()?;
        
        logger::info("LspProcessConnection", &format!("Sent LSP notification: {}", notification_json));
        
        Ok(())
    }
    
    fn read_responses(stdout: ChildStdout, response_handlers: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<JsonRpcResponse>>>>) {
        let mut reader = BufReader::new(stdout);
        let mut buffer = String::new();
        let mut content_length = 0;
        let mut reading_headers = true;
        
        loop {
            buffer.clear();
            match reader.read_line(&mut buffer) {
                Ok(0) => {
                    logger::info("LspProcessConnection", "LSP process stdout closed");
                    break;
                },
                Ok(_) => {
                    if reading_headers {
                        if buffer.trim().is_empty() {
                            if content_length == 0 {
                                logger::warn("LspProcessConnection", "Missing Content-Length header");
                                reading_headers = true;
                                continue;
                            }
                            
                            let mut content = vec![0; content_length];
                            if let Err(e) = reader.read_exact(&mut content) {
                                logger::error("LspProcessConnection", &format!("Failed to read response content: {}", e));
                                reading_headers = true;
                                continue;
                            }
                            
                            match String::from_utf8(content) {
                                Ok(content_str) => {
                                    // First, check if it's a notification (no "id" field but has "method")
                                    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&content_str) {
                                        if json_value.get("method").is_some() && json_value.get("id").is_none() {
                                            // This is a notification, not a response
                                            logger::info("LspProcessConnection", &format!("Received LSP notification: {}", content_str));
                                            // We could handle notifications here if needed
                                            reading_headers = true;
                                            content_length = 0;
                                            continue;
                                        }
                                    }
                                    
                                    // Otherwise, try to parse as a response
                                    match serde_json::from_str::<JsonRpcResponse>(&content_str) {
                                        Ok(response) => {
                                            if let Some(id) = response.id.as_u64() {
                                                if let Some(handler) = response_handlers.lock().unwrap().remove(&id) {
                                                    let _ = handler.send(response);
                                                }
                                            }
                                        },
                                        Err(e) => {
                                            logger::error("LspProcessConnection", &format!("Failed to parse LSP response: {}", e));
                                            logger::error("LspProcessConnection", &format!("Response content: {}", content_str));
                                        }
                                    }
                                },
                                Err(e) => {
                                    logger::error("LspProcessConnection", &format!("Invalid UTF-8 sequence in response: {}", e));
                                }
                            }
                            
                            reading_headers = true;
                            content_length = 0;
                        } else if buffer.starts_with("Content-Length:") {
                            if let Some(len_str) = buffer.strip_prefix("Content-Length:") {
                                if let Ok(len) = len_str.trim().parse::<usize>() {
                                    content_length = len;
                                }
                            }
                        }
                    }
                },
                Err(e) => {
                    logger::error("LspProcessConnection", &format!("Error reading from LSP process: {}", e));
                    break;
                }
            }
        }
    }
} 