mod document_model;
mod image;
mod config;
mod file_handler;
mod encoder;
mod decoder;
mod pdf_export;
mod session;
mod markdown;
mod spellcheck;
use file_handler::{open, save, save_as, open_in_tab, save_tab, save_tab_as, export_to_file, open_file_by_path, rename_tab_file};
use pdf_export::{export_to_pdf, print_pdf};
use session::{save_session, get_session};
use markdown::parse_markdown;
use spellcheck::{check_spelling, check_spelling_batch, get_dictionary_words, add_dictionary_word, remove_dictionary_word};
use config::{Config, AppSettings};
use tauri::{Manager, State, WindowEvent, command, AppHandle};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind, MessageDialogButtons};
use image::{insert_image_from_clipboard, insert_image_from_file};

struct StartupFile(std::sync::Mutex<Option<String>>);

#[command]
fn get_startup_file(state: State<StartupFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

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
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let startup_file = args.get(1).and_then(|arg| {
                let path = std::path::Path::new(arg);
                if path.exists() && matches!(
                    path.extension().and_then(|e| e.to_str()),
                    Some("rdocx") | Some("txt") | Some("json")
                ) {
                    Some(arg.clone())
                } else {
                    None
                }
            });
            app.manage(StartupFile(std::sync::Mutex::new(startup_file)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save, open, save_as, 
            save_tab, open_in_tab, save_tab_as, open_file_by_path, rename_tab_file,
            insert_image_from_file, insert_image_from_clipboard, 
            editor_changed, confirm_discard_changes,
            create_tab, remove_tab, is_tab_changed, confirm_close_tab,
            is_tab_saved_to_disk, get_settings, update_settings,
            export_to_pdf, print_pdf,
            export_to_file,
            save_session, get_session,
            get_startup_file,
            parse_markdown,
            check_spelling, check_spelling_batch,
            get_dictionary_words, add_dictionary_word, remove_dictionary_word
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
