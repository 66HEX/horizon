/// Terminal module for handling terminal sessions and commands.
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Window, State, Emitter, Manager};
use tauri_plugin_shell::{ShellExt, process::{CommandEvent, CommandChild}};
use std::collections::HashMap;
use crate::process_tracker::ProcessTracker;
use sysinfo::Pid;
use std::fs;
use serde_json::{self, json};
use regex::Regex;

/// State management for terminal sessions
#[derive(Default)]
pub struct TerminalState {
    processes: Arc<Mutex<HashMap<String, CommandChild>>>,
    process_tracker: ProcessTracker
}

/// Initializes a new terminal state with empty process tracking
pub fn init_terminal_state() -> TerminalState {
    TerminalState {
        processes: Arc::new(Mutex::new(HashMap::new())),
        process_tracker: ProcessTracker::new()
    }
}

/// Sanitizes terminal output by removing ANSI escape sequences
/// 
/// # Arguments
/// * `text` - The terminal output text to sanitize
/// 
/// # Returns
/// The sanitized text
fn sanitize_terminal_output(text: &str) -> String {
    // Compile regex patterns for efficiency
    lazy_static::lazy_static! {
        static ref PATTERNS: Vec<Regex> = vec![
            Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap(),
            Regex::new(r"\x1b\]8;;.*?\x1b\\").unwrap(),
            Regex::new(r"\x1b\]8;;.*?\x07").unwrap(),
            Regex::new(r"\x1b\]1337;.*?\x1b\\").unwrap(),
            Regex::new(r"\x1b\]1337;.*?\x07").unwrap(),
            Regex::new(r"\x1b\[\?25[hl]").unwrap(),
            Regex::new(r"\x1b\[[0-9]*[ABCDEFGHJKST]").unwrap(),
            Regex::new(r"\x1b\[[0-9]*[JK]").unwrap(),
            Regex::new(r"\x1b\[[0-9;]*m").unwrap(),
            Regex::new(r"\x1b\[[0-9;]*[cnsu]").unwrap(),
            Regex::new(r"\x1b\[[0-9;]*[hl]").unwrap(),
            Regex::new(r"\x1b\[[^a-zA-Z]*[a-zA-Z]").unwrap(),
            Regex::new(r"\x1b\][^a-zA-Z]*[a-zA-Z]").unwrap(),
            Regex::new(r"\x1b[^a-zA-Z]").unwrap(),
        ];
    }

    let mut result = text.to_string();
    for pattern in PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }
    result
}

/// Sanitizes terminal output from raw bytes
/// 
/// # Arguments
/// * `bytes` - The terminal output bytes to sanitize
/// 
/// # Returns
/// The sanitized text
fn sanitize_terminal_bytes(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    sanitize_terminal_output(&text)
}

/// Creates a new terminal session with the specified working directory
/// 
/// # Arguments
/// * `working_dir` - The directory where the terminal session should start
/// * `state` - The terminal state manager
/// * `app` - The Tauri application handle
/// * `window` - The window where the terminal should be displayed
/// 
/// # Returns
/// A Result containing the session ID if successful, or an error message
#[command]
pub async fn create_terminal_session(
    working_dir: String,
    state: State<'_, TerminalState>,
    app: AppHandle,
    window: Window
) -> Result<String, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let id = format!("terminal_{}", timestamp);
    let id_clone = id.clone();

    #[cfg(target_os = "windows")]
    let (cmd, args): (&str, Vec<&str>) = ("cmd", vec![]);

    #[cfg(target_os = "macos")]
    let (cmd, args): (&str, Vec<&str>) = ("zsh", vec![]);

    #[cfg(target_os = "linux")]
    let (cmd, args): (&str, Vec<&str>) = ("bash", vec![]);
    
    let shell = app.shell();
    let command = shell.command(cmd)
        .args(args)
        .current_dir(working_dir);
    
    let (mut rx, child) = command.spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;
    
    let pid = child.pid() as usize;
    
    {
        let mut processes = state.processes.lock().unwrap();
        processes.insert(id.clone(), child);
        
        state.process_tracker.track_process(id.clone(), Pid::from(pid));
    }
    
    let window_clone = window.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    match String::from_utf8(bytes.clone()) {
                        Ok(text) => {
                            // Sanitize the output before sending to the frontend
                            let sanitized_text = sanitize_terminal_output(&text);
                            let _ = window_clone.emit(&format!("terminal_output_{}", id_clone), sanitized_text);
                        },
                        Err(_) => {
                            // W przypadku nieprawidłowego UTF-8, używamy nowej funkcji sanityzującej bajty
                            let sanitized_text = sanitize_terminal_bytes(&bytes);
                            let _ = window_clone.emit(
                                &format!("terminal_output_{}", id_clone), 
                                sanitized_text
                            );
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    // Sanitize error output too
                    let sanitized_line = sanitize_terminal_bytes(&line);
                    let _ = window_clone.emit(&format!("terminal_error_{}", id_clone), sanitized_line);
                }
                CommandEvent::Error(err) => {
                    let error_message = format!("Error: {}", err);
                    let sanitized_error = sanitize_terminal_output(&error_message);
                    let _ = window_clone.emit(&format!("terminal_error_{}", id_clone), sanitized_error);
                }
                CommandEvent::Terminated(status) => {
                    let _ = window_clone.emit(&format!("terminal_exit_{}", id_clone), 
                        format!("Process exited with code: {:?}", status.code));
                }
                _ => {}
            }
        }
    });
    
    Ok(id)
}

/// Sends a command to a specific terminal session
/// 
/// # Arguments
/// * `id` - The ID of the terminal session
/// * `command` - The command to send
/// * `state` - The terminal state manager
/// 
/// # Returns
/// A Result indicating success or failure
#[command]
pub async fn send_terminal_command(
    id: String,
    command: String,
    state: State<'_, TerminalState>
) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    
    if let Some(process) = processes.get_mut(&id) {
        let bytes_to_send = if command == "\r" {
            b"\n".to_vec()
        } else {
            command.as_bytes().to_vec()
        };
        
        process.write(&bytes_to_send)
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        
        Ok(())
    } else {
        Err(format!("No terminal session with id: {}", id))
    }
}

/// Terminates a terminal session
/// 
/// # Arguments
/// * `id` - The ID of the terminal session to terminate
/// * `state` - The terminal state manager
/// 
/// # Returns
/// A Result indicating success or failure
#[command]
pub async fn terminate_terminal_session(
    id: String,
    state: State<'_, TerminalState>
) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    
    if let Some(process) = processes.remove(&id) {
        process.kill()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        
        Ok(())
    } else {
        Err(format!("No terminal session with id: {}", id))
    }
}

/// Updates the working directory of a terminal session
/// 
/// # Arguments
/// * `id` - The ID of the terminal session
/// * `directory` - The new working directory
/// * `state` - The terminal state manager
/// 
/// # Returns
/// A Result indicating success or failure
#[command]
pub async fn update_terminal_directory(
    id: String,
    directory: String,
    state: State<'_, TerminalState>
) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    
    if let Some(process) = processes.get_mut(&id) {
        let command = format!("cd {}\n", directory);
        process.write(command.as_bytes())
            .map_err(|e| format!("Failed to update directory: {}", e))?;
        
        Ok(())
    } else {
        Err(format!("No terminal session with id: {}", id))
    }
}

/// Gets the name of the process running in a terminal session
/// 
/// # Arguments
/// * `id` - The ID of the terminal session
/// * `state` - The terminal state manager
/// 
/// # Returns
/// A Result containing the process name or a default shell name
#[command]
pub async fn get_terminal_process_name(
    id: String,
    state: State<'_, TerminalState>
) -> Result<String, String> {
    if let Some(process_name) = state.process_tracker.get_process_name(&id) {
        Ok(process_name)
    } else {
        #[cfg(target_os = "windows")]
        return Ok("cmd".to_string());

        #[cfg(target_os = "macos")]
        return Ok("zsh".to_string());

        #[cfg(target_os = "linux")]
        return Ok("bash".to_string());
    }
}

/// Saves the command history to a JSON file
/// 
/// # Arguments
/// * `history` - Vector of commands to save
/// * `app` - The Tauri application handle
/// 
/// # Returns
/// A Result indicating success or failure
#[tauri::command]
pub async fn save_command_history(history: Vec<String>, app: AppHandle) -> Result<(), String> {
    let app_dir = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    let history_dir = app_dir.join("terminal_history");
    fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;
    
    let history_file = history_dir.join("history.json");
    let history_json = json!({
        "commands": history,
        "timestamp": chrono::Local::now().to_rfc3339()
    });
    
    fs::write(history_file, history_json.to_string())
        .map_err(|e| e.to_string())
}

/// Loads the command history from a JSON file
/// 
/// # Arguments
/// * `app` - The Tauri application handle
/// 
/// # Returns
/// A Result containing the command history or an empty vector if no history exists
#[tauri::command]
pub async fn load_command_history(app: AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    let history_file = app_dir.join("terminal_history").join("history.json");
    
    if !history_file.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(history_file)
        .map_err(|e| e.to_string())?;
    
    let history: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| e.to_string())?;
    
    let commands = history["commands"]
        .as_array()
        .ok_or_else(|| "Invalid history format".to_string())?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    
    Ok(commands)
}

/// Sends a signal to a terminal session
/// 
/// # Arguments
/// * `id` - The ID of the terminal session
/// * `signal` - The signal to send (e.g., "SIGINT")
/// * `state` - The terminal state manager
/// 
/// # Returns
/// A Result indicating success or failure
#[command]
pub async fn send_terminal_signal(
    id: String,
    signal: String,
    state: State<'_, TerminalState>
) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    
    if let Some(process) = processes.get_mut(&id) {
        #[cfg(unix)]
        {
            use sysinfo::{Pid, System, Signal};
            
            let pid = Pid::from(process.pid() as usize);
            let mut system = System::new();
            system.refresh_processes();
            
            if system.process(pid).is_some() {
                let sig = match signal.as_str() {
                    "SIGINT" => Signal::Interrupt,
                    "SIGKILL" => Signal::Kill,
                    _ => return Err(format!("Unsupported signal: {}", signal)),
                };

                let child_pid = find_child_process(&system, pid)
                    .map(|p| p.pid())
                    .unwrap_or(pid);

                if let Some(process) = system.process(child_pid) {
                    match process.kill_with(sig) {
                        Some(true) => {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            
                            system.refresh_processes();
                            if system.process(child_pid).is_some() {
                                if let Some(process) = system.process(child_pid) {
                                    process.kill_with(Signal::Kill);
                                }
                            }
                        },
                        Some(false) => return Err("Failed to send signal".to_string()),
                        None => return Err("Process already terminated".to_string()),
                    }
                }
            } else {
                return Err("Process not found".to_string());
            }
        }
        
        #[cfg(windows)]
        {
            use std::process::Command;
            
            let pid = process.pid();
            if signal == "SIGINT" {
                let output = Command::new("wmic")
                    .args(&["process", "where", &format!("ParentProcessId={}", pid), "get", "ProcessId"])
                    .output()
                    .map_err(|e| format!("Failed to get child processes: {}", e))?;
                
                let child_pids: Vec<String> = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .filter_map(|line| line.trim().parse::<String>().ok())
                    .collect();
                
                if let Some(child_pid) = child_pids.first() {
                    if let Ok(pid) = child_pid.parse::<u32>() {
                        Command::new("taskkill")
                            .args(&["/pid", &pid.to_string(), "/f"])
                            .status()
                            .map_err(|e| format!("Failed to kill process: {}", e))?;
                    }
                } else {
                    process.write(&[0x03]).map_err(|e| format!("Failed to send Ctrl+C: {}", e))?;
                }
            } else {
                return Err("Only SIGINT is supported on Windows".to_string());
            }
        }
        
        Ok(())
    } else {
        Err(format!("No terminal session with id: {}", id))
    }
}

/// Checks if a terminal session has any child processes running
/// 
/// # Arguments
/// * `id` - The ID of the terminal session
/// * `state` - The terminal state manager
/// 
/// # Returns
/// A Result containing true if there are child processes, false otherwise
#[command]
pub async fn has_child_process(
    id: String,
    state: State<'_, TerminalState>
) -> Result<bool, String> {
    let processes = state.processes.lock().unwrap();
    
    if let Some(process) = processes.get(&id) {
        #[cfg(unix)]
        {
            use sysinfo::{Pid, System};
            
            let pid = Pid::from(process.pid() as usize);
            let mut system = System::new();
            system.refresh_processes();
            
            if system.process(pid).is_some() {
                Ok(crate::process_tracker::find_child_process(&system, pid).is_some())
            } else {
                Ok(false)
            }
        }
        
        #[cfg(windows)]
        {
            use std::process::Command;
            
            let pid = process.pid();
            let output = Command::new("wmic")
                .args(&["process", "where", &format!("ParentProcessId={}", pid), "get", "ProcessId"])
                .output()
                .map_err(|e| format!("Failed to get child processes: {}", e))?;
            
            let child_pids: Vec<String> = String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| line.trim().parse::<String>().ok())
                .collect();
            
            Ok(!child_pids.is_empty())
        }
    } else {
        Err(format!("No terminal session with id: {}", id))
    }
}

/// Detects URLs in the given text
/// 
/// # Arguments
/// * `text` - The text to process
/// 
/// # Returns
/// A JSON object with the detected URLs and their positions
fn detect_urls_in_text(text: &str) -> serde_json::Value {
    lazy_static::lazy_static! {
        static ref URL_REGEX: Regex = Regex::new(r"(https?://[^\s]+)").unwrap();
    }
    
    let mut results = Vec::new();
    for cap in URL_REGEX.captures_iter(text) {
        let url = cap.get(0).unwrap().as_str();
        let start = cap.get(0).unwrap().start();
        let end = cap.get(0).unwrap().end();
        
        results.push(json!({
            "url": url,
            "start": start,
            "end": end
        }));
    }
    
    json!({
        "text": text,
        "urls": results
    })
}

/// Command to detect URLs in text
/// 
/// # Arguments
/// * `text` - The text to process
/// 
/// # Returns
/// A JSON object with detected URLs
#[command]
pub async fn detect_terminal_urls(text: String) -> Result<serde_json::Value, String> {
    Ok(detect_urls_in_text(&text))
}