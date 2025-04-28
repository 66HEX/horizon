#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Main entry point for the code editor application.
//! This module prevents the additional console window on Windows in release mode.

/// Main function that starts the application.....
fn main() {
    horizon_lib::run()
}
