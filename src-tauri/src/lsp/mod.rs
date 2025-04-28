pub mod server_factory;
pub mod protocol;
pub mod servers;
pub mod config;
pub mod websocket;
pub mod logger;

use std::thread;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{RwLock, OnceLock};
use std::collections::HashMap;
use tower_lsp::LspService;
use tower_lsp::Server;
use anyhow::Result;
use serde::{Serialize, Deserialize};
use server_factory::ServerFactory;
use websocket::WebSocketManager;


static WS_SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static mut WS_MANAGER: Option<WebSocketManager> = None;
static ACTIVE_SERVERS: OnceLock<RwLock<HashMap<String, bool>>> = OnceLock::new();

fn get_active_servers() -> &'static RwLock<HashMap<String, bool>> {
    ACTIVE_SERVERS.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn get_supported_languages() -> Vec<&'static str> {
    vec!["rust"]
}

pub fn get_recognized_languages() -> Vec<&'static str> {
    vec!["rust", "javascript", "typescript", "python"]
}

pub async fn start_language_server(language: String, file_path: String) -> Result<()> {
    let server_factory = ServerFactory::new();
    
    let server = server_factory.create_language_server_instance(&language, &file_path)?;
    
    let (service, socket) = LspService::new(|client| server.with_client(client));
    Server::new(tokio::io::stdin(), tokio::io::stdout(), socket).serve(service).await;
    
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct FormattedHoverData {
    title: String,
    signature: Option<String>,
    documentation: Option<String>,
    source_code: Option<String>,
    raw: String,
}

#[tauri::command]
pub fn format_hover_data(contents: String) -> Result<FormattedHoverData, String> {
    if contents.is_empty() {
        return Err("Empty hover contents".to_string());
    }
    
    let mut title = "Unknown".to_string();
    let mut signature = None;
    let mut documentation = None;
    let mut source_code = None;
    
    let lines: Vec<&str> = contents.lines().collect();
    
    if !lines.is_empty() {
        title = lines[0].trim().to_string();
        
        if title.contains("```") {
            let parts: Vec<&str> = title.split("```").collect();
            if parts.len() > 1 {
                title = parts[1].trim().to_string();
                
                let lang_parts: Vec<&str> = title.split_whitespace().collect();
                if !lang_parts.is_empty() && (lang_parts[0] == "rust" || lang_parts[0] == "ts" || 
                   lang_parts[0] == "js" || lang_parts[0] == "typescript" || lang_parts[0] == "javascript") {
                    title = lang_parts[1..].join(" ");
                }
            }
        }
        
        let mut in_code_block = false;
        let mut code_lines = Vec::new();
        let mut doc_lines = Vec::new();
        let mut possible_signature_found = false;
        
        for line in lines.iter().skip(1) {
            let line_str = line.trim();
            
            if line_str.starts_with("```") {
                in_code_block = !in_code_block;
                continue;
            }
            
            if in_code_block {
                if code_lines.is_empty() && (line_str == "rust" || line_str == "ts" || 
                   line_str == "js" || line_str == "typescript" || line_str == "javascript") {
                    continue;
                }
                
                code_lines.push(line_str.to_string());
            } else if !line_str.is_empty() { 
                if !possible_signature_found && 
                   (line_str.contains("fn ") || line_str.contains("pub fn ") || 
                    line_str.contains("function") || line_str.contains("(") && line_str.contains(")")) {
                    
                    let is_likely_signature = line_str.contains("->") || 
                                             (line_str.contains("(") && line_str.contains(")") && 
                                              (line_str.contains("fn ") || line_str.contains("function")));
                    
                    if is_likely_signature {
                        if signature.is_none() {
                            signature = Some(line_str.to_string());
                            possible_signature_found = true;
                            continue;
                        }
                    }
                }
                
                let sanitized_line = sanitize_markdown(line_str);
                doc_lines.push(sanitized_line);
            }
        }
        
        if !code_lines.is_empty() {
            if signature.is_none() {
                signature = Some(code_lines[0].to_string());
            }
            
            if code_lines.len() > 1 {
                source_code = Some(code_lines.join("\n"));
            } else if code_lines.len() == 1 && possible_signature_found {
                source_code = Some(code_lines[0].to_string());
            }
        }
        
        if !doc_lines.is_empty() {
            documentation = Some(doc_lines.join("\n"));
        }
    }
    
    if title.contains('\n') || title.len() > 100 {
        let parts: Vec<&str> = title.split(|c| c == ' ' || c == '\n' || c == ':' || c == '-').collect();
        let short_title = parts.iter()
            .filter(|&&s| !s.is_empty())
            .take(3)
            .map(|&s| s.to_string())
            .collect::<Vec<String>>()
            .join(" ");
        
        if !short_title.is_empty() {
            title = short_title + "...";
        }
    }
    
    title = sanitize_markdown(&title);
    
    if title == "Unknown" && signature.is_some() {
        if let Some(sig) = &signature {
            if sig.contains("fn ") {
                if let Some(fn_part) = sig.split("fn ").nth(1) {
                    if let Some(name_part) = fn_part.split('(').next() {
                        title = name_part.trim().to_string();
                    }
                }
            } else if sig.contains("struct ") {
                if let Some(struct_part) = sig.split("struct ").nth(1) {
                    if let Some(name_part) = struct_part.split(|c| c == '{' || c == '<' || c == ' ').next() {
                        title = name_part.trim().to_string();
                    }
                }
            }
        }
    }
    
    Ok(FormattedHoverData {
        title,
        signature,
        documentation,
        source_code,
        raw: contents,
    })
}

fn sanitize_markdown(text: &str) -> String {
    let mut result = text.to_string();
    
    let mut i = 0;
    while i < result.len() {
        if result[i..].starts_with('*') {
            if i + 1 < result.len() && result[i+1..].starts_with('*') {
                i += 2;
            } else {
                result.replace_range(i..i+1, "\\*");
                i += 2;
            }
        } else {
            i += 1;
        }
    }
    
    result = result.replace("_", "\\_")
                 .replace("##", "\\##")
                 .replace("###", "\\###");
    
    let mut preserving_code = String::new();
    let mut inside_code = false;
    let mut current_segment = String::new();
    
    for c in result.chars() {
        if c == '`' {
            inside_code = !inside_code;
            
            current_segment.push(c);
            
            if !inside_code {
                preserving_code.push_str(&current_segment);
                current_segment.clear();
            }
        } else if inside_code {
            current_segment.push(c);
        } else {
            preserving_code.push(c);
        }
    }
    
    if !current_segment.is_empty() {
        preserving_code.push_str(&current_segment);
    }
    
    let final_result = preserving_code.replace("\\\\*", "\\*")
                     .replace("\\\\_", "\\_")
                     .replace("\\\\#", "\\#");
                 
    final_result
}

#[tauri::command]
pub async fn start_lsp_server(language: String, file_path: String) -> Result<String, String> {
    let _server_factory = ServerFactory::new();
    
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Specified path does not exist: {}", file_path));
    }
    
    log("start_lsp_server", &format!("Attempting to start LSP server for language: {}, path: {}", language, file_path));
    
    let mut normalized_language = language.to_lowercase();
    
    if normalized_language == "unknown" || normalized_language.is_empty() {
        if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
            normalized_language = match extension {
                "rs" => "rust".to_string(),
                "py" => "python".to_string(),
                "js" => "javascript".to_string(),
                "ts" => "typescript".to_string(),
                _ => normalized_language
            };
            log("start_lsp_server", &format!("Automatically detected language: {} based on file extension", normalized_language));
        }
    }
    
    let supported_languages = get_supported_languages();
    
    if !supported_languages.contains(&normalized_language.as_str()) {
        return Err(format!(
            "Language '{}' is not supported. Currently supported languages are: {}",
            normalized_language,
            supported_languages.join(", ")
        ));
    }
    
    let is_server_running = {
        let active_servers = get_active_servers();
        let servers_read = active_servers.read().unwrap();
        servers_read.contains_key(&normalized_language)
    };
    
    if is_server_running {
        log("start_lsp_server", &format!("LSP server for language {} is already running, skipping creation of a new one", normalized_language));
        return Ok(format!("LSP server for {} is already running", normalized_language));
    }
    
    {
        let active_servers = get_active_servers();
        let mut servers_write = active_servers.write().unwrap();
        servers_write.insert(normalized_language.clone(), true);
    }
    
    let language_clone = normalized_language.clone();
    let file_path_clone = file_path.clone();
    
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| format!("Failed to create runtime: {}", e))
            .unwrap();
            
        rt.block_on(async {
            let language_for_server = language_clone.clone();
            
            if let Err(e) = start_language_server(language_for_server, file_path_clone).await {
                let active_servers = get_active_servers();
                let mut servers_write = active_servers.write().unwrap();
                servers_write.remove(&language_clone);
                
                log_error("start_lsp_server", &format!("LSP server error: {}", e));
            }
        });
    });
    
    Ok(format!("Started LSP server for {}", normalized_language))
}

#[tauri::command]
pub async fn start_lsp_websocket_server(port: u16) -> Result<String, String> {
    if WS_SERVER_RUNNING.load(Ordering::SeqCst) {
        return Ok(format!("LSP WebSocket server already running on port {}", port));
    }

    let addr = format!("127.0.0.1:{}", port);
    match std::net::TcpListener::bind(&addr) {
        Ok(_) => {
            log("start_lsp_websocket_server", &format!("Port {} is available, starting WebSocket server", port));
        },
        Err(e) => {
            log("start_lsp_websocket_server", &format!("Port {} is already in use: {}", port, e));
            
            WS_SERVER_RUNNING.store(true, Ordering::SeqCst);
            
            return Ok(format!("LSP WebSocket server is already running on port {}", port));
        }
    }

    let ws_manager = WebSocketManager::new();
    
    unsafe {
        WS_MANAGER = Some(ws_manager.clone());
    }
    
    let port_clone = port;
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| format!("Failed to create runtime: {}", e))
            .unwrap();
            
        rt.block_on(async {
            WS_SERVER_RUNNING.store(true, Ordering::SeqCst);
            
            let mut current_port = port_clone;
            let max_attempts = 5;
            
            for attempt in 0..max_attempts {
                match ws_manager.start_server(current_port).await {
                    Ok(_) => {
                        log("start_lsp_websocket_server", &format!("LSP WebSocket server successfully started on port {}", current_port));
                        break;
                    },
                    Err(e) => {
                        log_error("start_lsp_websocket_server", &format!("Attempt {}/{}: Cannot start WebSocket server on port {}: {}", 
                            attempt+1, max_attempts, current_port, e));
                            
                        if attempt < max_attempts - 1 {
                            current_port += 1;
                            log("start_lsp_websocket_server", &format!("Trying to use port {}...", current_port));
                        } else {
                            log_error("start_lsp_websocket_server", &format!("All attempts to start WebSocket server exhausted ({} attempts)", max_attempts));
                            WS_SERVER_RUNNING.store(false, Ordering::SeqCst);
                        }
                    }
                }
            }
        });
    });
    
    Ok(format!("Starting LSP WebSocket server on port {} (or next available)", port))
}

#[tauri::command]
pub fn is_lsp_websocket_running() -> bool {
    WS_SERVER_RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
pub async fn stop_lsp_websocket_server() -> Result<String, String> {
    if !WS_SERVER_RUNNING.load(Ordering::SeqCst) {
        return Ok("LSP WebSocket server not running".to_string());
    }
    
    let ws_manager = unsafe {
        match WS_MANAGER {
            Some(ref manager) => manager,
            None => return Err("WebSocket manager not initialized".to_string()),
        }
    };
    
    if let Err(e) = ws_manager.stop_server().await {
        log_error("stop_lsp_websocket_server", &format!("Error stopping WebSocket server: {}", e));
        return Err(format!("Failed to stop WebSocket server: {}", e));
    }
    
    WS_SERVER_RUNNING.store(false, Ordering::SeqCst);
    
    Ok("LSP WebSocket server stopped".to_string())
}

pub fn cleanup_on_exit() {
    if WS_SERVER_RUNNING.load(Ordering::SeqCst) {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                log_error("cleanup_on_exit", &format!("Failed to create runtime for cleanup: {}", e));
                return;
            }
        };
        
        let ws_manager = unsafe {
            match WS_MANAGER {
                Some(ref manager) => manager,
                None => {
                    log_error("cleanup_on_exit", "WebSocket manager not initialized for cleanup");
                    return;
                }
            }
        };
        
        rt.block_on(async {
            if let Err(e) = ws_manager.stop_server().await {
                log_error("cleanup_on_exit", &format!("Error stopping WebSocket server during cleanup: {}", e));
            }
        });
        
        WS_SERVER_RUNNING.store(false, Ordering::SeqCst);
        
        log("cleanup_on_exit", "LSP WebSocket server stopped during application shutdown");
    }
}

#[tauri::command]
pub async fn find_project_root(file_path: String, language: Option<String>) -> Result<String, String> {
    let _server_factory = ServerFactory::new();
    let lang = language.unwrap_or_else(|| "generic".to_string());
    
    if lang != "generic" {
        let recognized_languages = get_recognized_languages();
        
        if !recognized_languages.contains(&lang.to_lowercase().as_str()) {
            return Err(format!(
                "Can't recognize '{}' Language. Recognized languages: {}",
                lang,
                recognized_languages.join(", ")
            ));
        }
    }
    
    log("find_project_root", &format!("Backend: find_project_root called for path: {}, language: {}", file_path, lang));
    
    match _server_factory.find_project_root(&lang, &file_path) {
        Ok(root_path) => {
            log("find_project_root", &format!("Backend: found root directory: {}", root_path));
            Ok(root_path)
        },
        Err(e) => {
            log("find_project_root", &format!("Backend: error finding root directory: {}", e));
            Err(format!("Failed to find project root: {}", e))
        }
    }
}

pub fn log(component: &str, message: &str) {
    logger::info(component, message);
}

pub fn log_error(component: &str, message: &str) {
    logger::error(component, message);
} 