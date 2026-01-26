mod document_model;
mod image;
mod config;
mod file_handler;
mod encoder;
mod decoder;
use file_handler::{open, save, save_as};
use config::Config;
use tauri::{Manager, State, WindowEvent, command};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind, MessageDialogButtons};
use image::{insert_image_from_clipboard, insert_image_from_file};

#[command]
fn editor_changed(has_changed: bool, state: State<Config>){
    let mut changed = state.changed.write().unwrap();
    *changed = has_changed;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Config::new())
        .invoke_handler(tauri::generate_handler![save, open, save_as, insert_image_from_file, insert_image_from_clipboard, editor_changed])
        .on_window_event(|window, event|{
            if let WindowEvent::CloseRequested { api, .. } = event {
               let state = window.state::<Config>();
               let has_changes = *state.changed.read().unwrap();
                
               if has_changes {
                    api.prevent_close();
                    
                    let window_for_dialog = window.clone();
                    let window_for_callback = window.clone();
                    
                    window_for_dialog.dialog()
                        .message("You have unsaved changes. Close anyway?")
                        .title("Unsaved Changes")
                        .kind(MessageDialogKind::Warning)
                        .buttons(MessageDialogButtons::OkCancel)
                        .show(move |confirmed| {
                            if confirmed {
                                let state = window_for_callback.state::<Config>();
                                let mut changed = state.changed.write().unwrap();
                                *changed = false;
                                drop(changed);
                                let _ = window_for_callback.destroy();
                            }
                        });
               }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
