/// Main library module for the code editor application
pub mod terminal;
pub mod process_tracker;
pub mod fs;

/// Entry point for the Tauri application
/// 
/// Initializes the terminal state and sets up the Tauri application with required plugins
/// and command handlers.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let terminal_state = terminal::init_terminal_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(terminal_state)
        .invoke_handler(tauri::generate_handler![
            terminal::create_terminal_session,
            terminal::send_terminal_command, 
            terminal::terminate_terminal_session,
            terminal::update_terminal_directory,
            terminal::get_terminal_process_name,
            terminal::save_command_history,
            terminal::load_command_history,
            terminal::send_terminal_signal,
            terminal::has_child_process,
            fs::create_directory,
            fs::create_file,
            fs::read_file,
            fs::delete_path,
            fs::rename_path,
            fs::path_exists,
            fs::is_directory,
            fs::copy_file,
            fs::list_directory,
            fs::append_to_file,
            fs::write_to_file,
            fs::get_file_info,
            fs::scan_directory,
            fs::is_image_file,
            fs::is_audio_file,
            fs::search_file_contents,
            fs::search_files_by_name
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
