mod document_model;
mod image;
mod config;
mod file_handler;
mod encoder;
mod decoder;
use file_handler::{open, save, save_as, open_in_tab, save_tab, save_tab_as};
use config::{Config, AppSettings};
use tauri::{Manager, State, WindowEvent, command, AppHandle};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind, MessageDialogButtons};
use image::{insert_image_from_clipboard, insert_image_from_file};

#[command]
fn editor_changed(has_changed: bool, tab_id: String, state: State<Config>){
    state.set_tab_changed(&tab_id, has_changed);
}

#[command]
fn create_tab(tab_id: String, state: State<Config>) {
    state.create_tab(&tab_id);
}

#[command]
fn remove_tab(tab_id: String, state: State<Config>) {
    state.remove_tab(&tab_id);
}

#[command]
fn is_tab_changed(tab_id: String, state: State<Config>) -> bool {
    state.is_tab_changed(&tab_id)
}

#[command]
fn is_tab_saved_to_disk(tab_id: String, state: State<Config>) -> bool {
    state.is_tab_saved_to_disk(&tab_id)
}

#[command]
fn get_settings(state: State<Config>) -> AppSettings {
    state.get_settings()
}

#[command]
fn update_settings(settings: AppSettings, state: State<Config>) {
    state.update_settings(settings);
}

#[command]
fn confirm_discard_changes(app: AppHandle, state: State<Config>) -> bool {
    let has_changes = state.has_any_unsaved_changes();
    
    if !has_changes {
        return true; 
    }

    let settings = state.get_settings();
    if !settings.show_unsaved_warning {
        return true;
    }
    
    let result = app.dialog()
        .message("You have unsaved changes. Do you want to discard them and create a new document?")
        .title("Unsaved Changes")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show();
    
    result
}

#[command]
fn confirm_close_tab(app: AppHandle, tab_id: String, state: State<Config>) -> bool {
    let has_changes = state.is_tab_changed(&tab_id);
    
    if !has_changes {
        return true;
    }

    let settings = state.get_settings();
    if !settings.show_unsaved_warning {
        return true;
    }
    
    let result = app.dialog()
        .message("This tab has unsaved changes. Close anyway?")
        .title("Unsaved Changes")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show();
    
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Config::new())
        .invoke_handler(tauri::generate_handler![
            save, open, save_as, 
            save_tab, open_in_tab, save_tab_as,
            insert_image_from_file, insert_image_from_clipboard, 
            editor_changed, confirm_discard_changes,
            create_tab, remove_tab, is_tab_changed, confirm_close_tab,
            is_tab_saved_to_disk, get_settings, update_settings
        ])
        .on_window_event(|window, event|{
            if let WindowEvent::CloseRequested { api, .. } = event {
               let state = window.state::<Config>();
               let settings = state.get_settings();

               if !settings.show_unsaved_warning {
                   return;
               }

               let unsaved_count = state.count_unsaved_tabs();
                
               if unsaved_count > 0 {
                    api.prevent_close();
                    
                    let window_for_dialog = window.clone();
                    let window_for_callback = window.clone();
                    
                    let message = if unsaved_count == 1 {
                        "You have 1 tab with unsaved changes. Close anyway?".to_string()
                    } else {
                        format!("You have {} tabs with unsaved changes. Close anyway?", unsaved_count)
                    };
                    
                    window_for_dialog.dialog()
                        .message(message)
                        .title("Unsaved Changes")
                        .kind(MessageDialogKind::Warning)
                        .buttons(MessageDialogButtons::OkCancel)
                        .show(move |confirmed| {
                            if confirmed {
                                let _ = window_for_callback.destroy();
                            }
                        });
               }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
