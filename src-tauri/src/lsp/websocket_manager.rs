use std::sync::atomic::{AtomicBool, Ordering};
use crate::lsp::websocket::WebSocketManager;
use crate::lsp::server_management::{log, log_error};


static WS_SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static mut WS_MANAGER: Option<WebSocketManager> = None;

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
    std::thread::spawn(move || {
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

pub fn is_lsp_websocket_running() -> bool {
    WS_SERVER_RUNNING.load(Ordering::SeqCst)
}

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