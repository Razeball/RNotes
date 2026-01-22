mod document_model;
mod image;
mod config;
mod file_handler;
use file_handler::{open, save, save_as};
use config::Config;
use image::{insert_image_from_clipboard, insert_image_from_file};


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Config::new())
        .invoke_handler(tauri::generate_handler![save, open, save_as, insert_image_from_file, insert_image_from_clipboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
