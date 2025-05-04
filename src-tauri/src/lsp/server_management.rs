use std::thread;
use std::sync::{RwLock, OnceLock};
use std::collections::HashMap;
use tower_lsp::LspService;
use tower_lsp::Server;
use anyhow::Result;
use crate::lsp::server_factory::ServerFactory;
use crate::lsp::logger;


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
                
                log_error("cleanup_on_exit", &format!("Failed to create runtime for cleanup: {}", e));
                return;
            }
        });
    });

    Ok(format!("Started LSP server for {}", normalized_language))
}

pub async fn find_project_root(file_path: String, language: Option<String>) -> Result<String, String> {
    let server_factory = ServerFactory::new();
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
    
    match server_factory.find_project_root(&lang, &file_path) {
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