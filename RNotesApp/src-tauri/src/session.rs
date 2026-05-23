use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use crate::config::Config;

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct SessionState {
    pub paths: Vec<String>,
    pub active_path: String,
}

impl SessionState {
    fn session_path() -> PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("RNotesApp");
        std::fs::create_dir_all(&path).ok();
        path.push("session.json");
        path
    }

    pub fn save_to_disk(&self) {
        let path = Self::session_path();
        if let Ok(json) = serde_json::to_string_pretty(self) {
            std::fs::write(&path, json).ok();
        }
    }

    pub fn load_from_disk() -> SessionState {
        let path = Self::session_path();
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(state) = serde_json::from_str::<SessionState>(&content) {
                    return state;
                }
            }
        }
        SessionState::default()
    }

    pub fn clear() {
        let path = Self::session_path();
        let empty = SessionState::default();
        if let Ok(json) = serde_json::to_string_pretty(&empty) {
            std::fs::write(&path, json).ok();
        }
    }
}

#[tauri::command]
pub fn save_session(tab_ids: Vec<String>, active_tab_id: String, state: tauri::State<Config>) {
    let settings = state.get_settings();
    if !settings.restore_session {
        SessionState::clear();
        return;
    }

    let mut paths: Vec<String> = Vec::new();
    let mut active_path = String::new();

    for tab_id in &tab_ids {
        if let Some(info) = state.get_tab_info(tab_id) {
            if !info.save_path.as_os_str().is_empty() {
                let path_str = info.save_path.to_string_lossy().to_string();
                if tab_id == &active_tab_id {
                    active_path = path_str.clone();
                }
                paths.push(path_str);
            }
        }
    }

    let session = SessionState { paths, active_path };
    session.save_to_disk();
}

#[tauri::command]
pub fn get_session(state: tauri::State<Config>) -> SessionState {
    let settings = state.get_settings();
    if !settings.restore_session {
        return SessionState::default();
    }
    SessionState::load_from_disk()
}
