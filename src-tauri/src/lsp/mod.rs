pub mod server_factory;
pub mod protocol;
pub mod servers;
pub mod config;
pub mod websocket;
pub mod logger;
pub mod markdown;
pub mod hover;
pub mod types;
pub mod server_management;
pub mod websocket_manager;

pub use server_management::{
    get_supported_languages,
    get_recognized_languages,
    log,
    log_error
};

pub use websocket_manager::cleanup_on_exit;

#[tauri::command]
pub async fn start_lsp_server(language: String, file_path: String) -> Result<String, String> {
    server_management::start_lsp_server(language, file_path).await
}

#[tauri::command]
pub async fn find_project_root(file_path: String, language: Option<String>) -> Result<String, String> {
    server_management::find_project_root(file_path, language).await
}

#[tauri::command]
pub async fn start_lsp_websocket_server(port: u16) -> Result<String, String> {
    websocket_manager::start_lsp_websocket_server(port).await
}

#[tauri::command]
pub fn is_lsp_websocket_running() -> bool {
    websocket_manager::is_lsp_websocket_running()
}

#[tauri::command]
pub async fn stop_lsp_websocket_server() -> Result<String, String> {
    websocket_manager::stop_lsp_websocket_server().await
}

#[tauri::command]
pub fn format_hover_data_enhanced(contents: String) -> Result<hover::EnhancedHoverData, String> {
    hover::format_hover_data_enhanced(contents)
}