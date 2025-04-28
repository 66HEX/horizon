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