
/// File system operations moduleasdasdasd
use std::fs;..
use std::path::{Path, PathBuf};
use std::io::Write;
use tauri::command;
use grep_regex::RegexMatcher;
use grep_searcher::{Searcher, SearcherBuilder, Sink, SinkMatch, SinkContext, BinaryDetection};
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;
use globset::{Glob, GlobSetBuilder, GlobSet};
use std::time::{SystemTime, UNIX_EPOCH};

/// Create a new directory at the specified pathhhhhhhhhhhhhhhhhh
/// 
/// # Arguments
/// * `path` - The path where the directory should be created
/// 
/// # Returns
/// Result indicating success or error message.....
#[command]
pub fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

/// Create  a new file with the given contentTTTT
/// 
/// # Arguments
/// * `path` - The path where the file should be created
/// * `content` - The content to write to the file
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn create_file(path: String, content: String) -> Result<(), String> {
    let parent = Path::new(&path).parent();
    
    if let Some(parent_path) = parent {
        if !parent_path.exists() {
            fs::create_dir_all(parent_path)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to create file: {}", e))
}

/// Read the content of a file
/// 
/// # Arguments
/// * `path` - The path of the file to read
/// 
/// # Returns
/// The file content or error message
#[command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Delete a file or directory
/// 
/// # Arguments
/// * `path` - The path to delete
/// * `recursive` - Whether to delete directories recursively
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn delete_path(path: String, recursive: bool) -> Result<(), String> {
    let path_obj = Path::new(&path);
    
    if path_obj.is_dir() {
        if recursive {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to delete directory recursively: {}", e))
        } else {
            fs::remove_dir(&path)
                .map_err(|e| format!("Failed to delete directory: {}", e))
        }
    } else {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete file: {}", e))
    }
}

/// Rename a file or directory
/// 
/// # Arguments
/// * `from_path` - The current path
/// * `to_path` - The new path
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn rename_path(from_path: String, to_path: String) -> Result<(), String> {
    fs::rename(&from_path, &to_path)
        .map_err(|e| format!("Failed to rename: {}", e))
}

/// Check if a path exists
/// 
/// # Arguments
/// * `path` - The path to check
/// 
/// # Returns
/// True if the path exists, false otherwise
#[command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Check if a path is a directory
/// 
/// # Arguments
/// * `path` - The path to check
/// 
/// # Returns
/// True if the path is a directory, false otherwise
#[command]
pub fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

/// Copy a file
/// 
/// # Arguments
/// * `from_path` - The source path
/// * `to_path` - The destination path
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn copy_file(from_path: String, to_path: String) -> Result<(), String> {
    let to_parent = Path::new(&to_path).parent();
    
    // Create parent directories if they don't exist
    if let Some(parent_path) = to_parent {
        if !parent_path.exists() {
            fs::create_dir_all(parent_path)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }
    
    fs::copy(&from_path, &to_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;
    
    Ok(())
}

/// List directory contents
/// 
/// # Arguments
/// * `path` - The directory path to list
/// 
/// # Returns
/// A list of path entries or error message
#[command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut result = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        let is_dir = metadata.is_dir();
        
        result.push(DirEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: is_dir,
            size: if is_dir { 0 } else { metadata.len() }
        });
    }
    
    Ok(result)
}

/// Directory entry structure
#[derive(serde::Serialize, serde::Deserialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_directory: bool,
    size: u64
}

/// Append text to a file
/// 
/// # Arguments
/// * `path` - The path of the file
/// * `content` - The content to append
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn append_to_file(path: String, content: String) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file for appending: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to file: {}", e))
}

/// Write text to a file, overwriting existing content
/// 
/// # Arguments
/// * `path` - The path of the file
/// * `content` - The content to write
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn write_to_file(path: String, content: String) -> Result<(), String> {
    println!("write_to_file called for path: {}, content length: {}, content: {:?}", path, content.len(), content);
    
    if content.is_empty() {
        println!("WARNING: Attempting to write empty content to file: {}", path);
    }
    
    let file = fs::File::create(&path)
        .map_err(|e| format!("Failed to create file for writing: {}", e))?;
    
    let mut writer = std::io::BufWriter::new(file);
    let bytes_written = writer.write(content.as_bytes())
        .map_err(|e| format!("Failed to write to file: {}", e))?;
    
    println!("Wrote {} bytes to buffer", bytes_written);
    
    writer.flush()
        .map_err(|e| format!("Failed to flush file buffer: {}", e))?;
    
    let file = writer.into_inner()
        .map_err(|e| format!("Failed to get file handle: {}", e))?;
    
    file.sync_all()
        .map_err(|e| format!("Failed to sync file to disk: {}", e))?;
    
    println!("Successfully wrote {} bytes to file: {}, content: {:?}", content.len(), path, content);
    
    match fs::read_to_string(&path) {
        Ok(read_content) => println!("Verification: Read {} bytes after write", read_content.len()),
        Err(e) => println!("Error verifying file content after write: {}", e),
    }
    
    Ok(())
}

/// Get file information
/// 
/// # Arguments
/// * `path` - The path of the file
/// 
/// # Returns
/// FileInfo or error message
#[command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    if !Path::new(&path).exists() {
        return Err(format!("File does not exist: {}", path));
    }
    
    let mut content = String::new();
    let mut attempts = 0;
    let max_attempts = 3;
    
    while attempts < max_attempts {
        match fs::read_to_string(&path) {
            Ok(file_content) => {
                content = file_content;
                if !content.is_empty() {
                    break;
                }
            },
            Err(e) => {
                if attempts == max_attempts - 1 {
                    return Err(format!("Failed to read file after {} attempts: {}", max_attempts, e));
                }
            }
        }
        
        std::thread::sleep(std::time::Duration::from_millis(50));
        attempts += 1;
    }
    
    println!("Successfully read {} bytes from file: {}", content.len(), path);
    
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    
    let id = format!("{}-{}", path, timestamp);
    
    Ok(FileInfo {
        id,
        path,
        name,
        content,
        is_unsaved: false,
    })
}

/// File information structure
#[derive(serde::Serialize, serde::Deserialize)]
pub struct FileInfo {
    id: String,
    path: String,
    name: String,
    content: String,
    is_unsaved: bool,
}

/// Directory item structure
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DirectoryItem {
    name: String,
    path: String,
    is_directory: bool,
    item_type: String,
    children: Option<Vec<DirectoryItem>>,
    needs_loading: Option<bool>,
}

/// Scan a directory recursively up to a certain depth
/// 
/// # Arguments
/// * `dir_path` - The directory path to scan
/// * `depth` - Current depth in the directory tree
/// * `max_depth` - Maximum depth to scan before marking directories for lazy loading
/// 
/// # Returns
/// A vector of DirectoryItems or error message
#[command]
pub fn scan_directory(dir_path: String, depth: u32, max_depth: u32) -> Result<Vec<DirectoryItem>, String> {
    let entries = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut items = Vec::new();
    
    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        let is_directory = metadata.is_dir();
        let item_type = if is_directory { "directory".to_string() } else { "file".to_string() };
        
        let mut item = DirectoryItem {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory,
            item_type,
            children: Some(Vec::new()),
            needs_loading: None,
        };
        
        if is_directory {
            if depth < max_depth {
                // Continue scanning subdirectories within depth limit
                let children = scan_directory(item.path.clone(), depth + 1, max_depth)
                    .unwrap_or_else(|_| Vec::new());
                item.children = Some(children);
            } else {
                // Mark for lazy loading when depth limit is reached
                item.needs_loading = Some(true);
            }
        } else {
            item.children = None;
        }
        
        items.push(item);
    }
    
    // Sort: directories first, then alphabetically
    items.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(items)
}

/// Check if a file is an image
/// 
/// # Arguments
/// * `path` - The path of the file
/// 
/// # Returns
/// True if the file is an image, false otherwise
#[command]
pub fn is_image_file(path: String) -> bool {
    let extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
    let path_lower = path.to_lowercase();
    
    extensions.iter().any(|ext| path_lower.ends_with(ext))
}

/// Check if a file is an audio file
/// 
/// # Arguments
/// * `path` - The path of the file
/// 
/// # Returns
/// True if the file is an audio file, false otherwise
#[command]
pub fn is_audio_file(path: String) -> bool {
    let extensions = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
    let path_lower = path.to_lowercase();
    
    extensions.iter().any(|ext| path_lower.ends_with(ext))
}

/// Search file contents with advanced features
/// 
/// # Arguments
/// * `query` - The search query (regex supported)
/// * `dir_path` - The directory path to search in
/// * `max_results` - Maximum number of results to return
/// * `ignore_case` - Whether to ignore case in search
/// * `include_patterns` - Optional glob patterns to include
/// * `exclude_patterns` - Optional glob patterns to exclude
/// 
/// # Returns
/// A vector of items matching the query with preview text
#[command]
pub fn search_file_contents_advanced(
    query: String, 
    dir_path: String, 
    max_results: u32,
    ignore_case: bool,
    include_patterns: Option<Vec<String>>,
    exclude_patterns: Option<Vec<String>>
) -> Result<Vec<MatchResult>, String> {
    if query.is_empty() || dir_path.is_empty() {
        return Ok(Vec::new());
    }
    
    // Compile glob patterns
    let include_glob = compile_glob_patterns(include_patterns)?;
    let exclude_glob = compile_glob_patterns(exclude_patterns)?;
    
    // Create regex matcher with case sensitivity based on parameter
    let matcher = if ignore_case {
        RegexMatcher::new_line_matcher(&format!("(?i){}", query))
            .map_err(|e| format!("Invalid regex pattern: {}", e))?
    } else {
        RegexMatcher::new_line_matcher(&query)
            .map_err(|e| format!("Invalid regex pattern: {}", e))?
    };
    
    // Configure the searcher parameters
    let mut builder = SearcherBuilder::new();
    let searcher_config = builder
        .binary_detection(BinaryDetection::quit(b'\x00'))
        .line_number(true);
    
    // Use a shared vector to collect results
    let matches = Arc::new(Mutex::new(Vec::<MatchResult>::new()));
    let match_count = Arc::new(Mutex::new(0_u32));
    let max_results = max_results;
    
    // Walk directory tree and search files
    for entry in WalkDir::new(&dir_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file() && 
            !is_ignored_file(e.path()) &&
            (include_glob.is_none() || 
             include_glob.as_ref().unwrap().is_match(e.path())) &&
            !(exclude_glob.is_some() && 
              exclude_glob.as_ref().unwrap().is_match(e.path()))
        }) 
    {
        // Stop if we've reached max results
        if *match_count.lock().unwrap() >= max_results {
            break;
        }
        
        let path = entry.path();
        let matches_clone = Arc::clone(&matches);
        let match_count_clone = Arc::clone(&match_count);
        
        let sink = ResultSink::new(path, max_results, matches_clone, match_count_clone);
        
        // Create a new searcher for each file
        let mut searcher = searcher_config.build();
        
        // Search the file and collect results
        if searcher.search_path(&matcher, path, sink).is_err() {
            // Skip files that can't be searched (binary, etc.)
            continue;
        }
    }
    
    // Return the collected results
    let results = matches.lock().unwrap().clone();
    Ok(results)
}

/// Structure to represent a search match with context
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct MatchResult {
    pub path: String,
    pub name: String,
    pub line_number: u64,
    pub preview_text: String,
    pub is_directory: bool,
}

/// Custom sink implementation for grep-searcher
struct ResultSink {
    path: PathBuf,
    matches: Arc<Mutex<Vec<MatchResult>>>,
    match_count: Arc<Mutex<u32>>,
    max_matches: u32,
}

impl ResultSink {
    fn new(
        path: &Path, 
        max_matches: u32,
        matches: Arc<Mutex<Vec<MatchResult>>>,
        match_count: Arc<Mutex<u32>>
    ) -> Self {
        ResultSink {
            path: path.to_path_buf(),
            matches,
            match_count,
            max_matches,
        }
    }
}

impl Sink for ResultSink {
    type Error = std::io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch) -> Result<bool, Self::Error> {
        let mut match_count = self.match_count.lock().unwrap();
        if *match_count >= self.max_matches {
            return Ok(false);
        }
        
        let line_text = String::from_utf8_lossy(mat.bytes()).to_string();
        let trimmed_text = line_text.trim();
        
        let name = self.path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
            
        let path_str = self.path.to_string_lossy().to_string();
        
        let mut matches = self.matches.lock().unwrap();
        matches.push(MatchResult {
            path: path_str,
            name,
            line_number: mat.line_number().unwrap_or(0),
            preview_text: trimmed_text.to_string(),
            is_directory: false,
        });
        
        *match_count += 1;
        Ok(true)
    }

    fn context(&mut self, _searcher: &Searcher, _ctx: &SinkContext) -> Result<bool, Self::Error> {
        // We're not handling context lines for now
        Ok(true)
    }
    
    fn finish(&mut self, _searcher: &Searcher, _finish: &grep_searcher::SinkFinish) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Helper function to compile glob patterns
fn compile_glob_patterns(patterns: Option<Vec<String>>) -> Result<Option<GlobSet>, String> {
    if let Some(patterns) = patterns {
        if patterns.is_empty() {
            return Ok(None);
        }
        
        let mut builder = GlobSetBuilder::new();
        for pattern in patterns {
            let glob = Glob::new(&pattern)
                .map_err(|e| format!("Invalid glob pattern '{}': {}", pattern, e))?;
            builder.add(glob);
        }
        
        let globset = builder.build()
            .map_err(|e| format!("Failed to compile glob patterns: {}", e))?;
            
        Ok(Some(globset))
    } else {
        Ok(None)
    }
}

/// Helper function to determine if a file should be ignored
fn is_ignored_file(path: &Path) -> bool {
    // Skip based on extension
    let skip_extensions = [
        ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", 
        ".avi", ".mov", ".mp4", ".mkv", ".pdf", ".zip", 
        ".rar", ".tar", ".gz", ".7z"
    ];
    
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if skip_extensions.iter().any(|&s| s.ends_with(&format!(".{}", ext.to_lowercase()))) {
            return true;
        }
    }
    
    // Skip hidden files and directories
    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
        if file_name.starts_with(".") {
            return true;
        }
    }
    
    // Skip large files
    if let Ok(metadata) = fs::metadata(path) {
        if metadata.len() > 5 * 1024 * 1024 {  // Skip files larger than 5MB
            return true;
        }
    } else {
        return true; // Skip if we can't get metadata
    }
    
    false
}

/// Search files by name with advanced features
/// 
/// # Arguments
/// * `query` - The search query
/// * `dir_path` - The directory path to search in
/// * `max_results` - Maximum number of results to return
/// * `include_patterns` - Optional glob patterns to include
/// * `exclude_patterns` - Optional glob patterns to exclude
/// 
/// # Returns
/// A vector of items matching the query in name
#[command]
pub fn search_files_by_name_advanced(
    query: String,
    dir_path: String,
    max_results: u32,
    include_patterns: Option<Vec<String>>,
    exclude_patterns: Option<Vec<String>>
) -> Result<Vec<DirectoryItem>, String> {
    if query.is_empty() || dir_path.is_empty() {
        return Ok(Vec::new());
    }
    
    // Compile glob patterns
    let include_glob = compile_glob_patterns(include_patterns)?;
    let exclude_glob = compile_glob_patterns(exclude_patterns)?;
    
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    let mut results_count = 0;
    
    // Walk directory tree and match file names
    for entry in WalkDir::new(&dir_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            (include_glob.is_none() || 
             include_glob.as_ref().unwrap().is_match(e.path())) &&
            !(exclude_glob.is_some() && 
              exclude_glob.as_ref().unwrap().is_match(e.path()))
        }) 
    {
        if results_count >= max_results {
            break;
        }
        
        let path = entry.path();
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        // Check if the name matches the query
        if name.to_lowercase().contains(&query_lower) {
            let is_dir = entry.file_type().is_dir();
            let item_type = if is_dir { "directory" } else { "file" };
            
            results.push(DirectoryItem {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                is_directory: is_dir,
                item_type: item_type.to_string(),
                children: None,
                needs_loading: if is_dir { Some(true) } else { None },
            });
            
            results_count += 1;
        }
    }
    
    Ok(results)
}

/// Maintain backward compatibility with existing API
#[command]
pub fn search_file_contents(query: String, dir_path: String, max_results: u32) -> Result<Vec<DirectoryItem>, String> {
    // Call the advanced version with default parameters
    let results = search_file_contents_advanced(
        query,
        dir_path,
        max_results,
        true,  // ignore_case = true
        None,  // include_patterns = None
        None   // exclude_patterns = None
    )?;
    
    // Convert MatchResult to DirectoryItem
    let directory_items: Vec<DirectoryItem> = results.into_iter()
        .map(|result| DirectoryItem {
            name: result.name,
            path: result.path,
            is_directory: result.is_directory,
            item_type: if result.is_directory { "directory".to_string() } else { "file".to_string() },
            children: None,
            needs_loading: if result.is_directory { Some(true) } else { None },
        })
        .collect();
    
    Ok(directory_items)
}

/// Maintain backward compatibility with existing API
#[command]
pub fn search_files_by_name(query: String, dir_path: String, max_results: u32) -> Result<Vec<DirectoryItem>, String> {
    // Call the advanced version with default parameters
    search_files_by_name_advanced(
        query,
        dir_path,
        max_results,
        None,  // include_patterns = None
        None   // exclude_patterns = None
    )
=======
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::SystemTime;
use chrono::{DateTime, Local};
use anyhow::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Error = 0,
    Warn = 1,
    Info = 2,
    Debug = 3,
    Trace = 4,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Error => "ERROR",
            LogLevel::Warn => "WARN ",
            LogLevel::Info => "INFO ",
            LogLevel::Debug => "DEBUG",
            LogLevel::Trace => "TRACE",
        }
    }
}

static LOG_LEVEL: AtomicU8 = AtomicU8::new(2);
static mut LOG_FILE_PATH: Option<String> = None;

pub fn safe_init(log_file_path: &str, level: LogLevel) {
    LOG_LEVEL.store(level as u8, Ordering::Relaxed);
    
    unsafe {
        LOG_FILE_PATH = Some(log_file_path.to_string());
    }
    
    if let Some(parent) = Path::new(log_file_path).parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }
    
    info("LSP", &format!("Logger initialized with level: {}", level.as_str()));
}

pub fn init(log_file_path: &str, level: LogLevel) -> Result<()> {
    safe_init(log_file_path, level);
    Ok(())
}

fn log_to_file(log_entry: &str) {
    unsafe {
        if let Some(path) = &LOG_FILE_PATH {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path) {
                
                let _ = file.write_all(log_entry.as_bytes());
            }
        }
    }
}

pub fn log(level: LogLevel, component: &str, message: &str) {
    let current_level = LOG_LEVEL.load(Ordering::Relaxed);
    if (level as u8) > current_level {
        return;
    }

    let now: DateTime<Local> = SystemTime::now().into();
    let formatted_time = now.format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    let log_entry = format!("[{}] [{}] [{}]: {}\n", formatted_time, level.as_str(), component, message);
    
    log_to_file(&log_entry);
    
    eprintln!("{}", log_entry);
}

pub fn is_available() -> bool {
    true
}

pub fn reset() {
    LOG_LEVEL.store(LogLevel::Info as u8, Ordering::Relaxed);
    unsafe {
        LOG_FILE_PATH = None;
    }
}

pub fn error(component: &str, message: &str) {
    log(LogLevel::Error, component, message);
}

pub fn warn(component: &str, message: &str) {
    log(LogLevel::Warn, component, message);
}

pub fn info(component: &str, message: &str) {
    log(LogLevel::Info, component, message);
}

pub fn debug(component: &str, message: &str) {
    log(LogLevel::Debug, component, message);
}

pub fn trace(component: &str, message: &str) {
    log(LogLevel::Trace, component, message);

} 