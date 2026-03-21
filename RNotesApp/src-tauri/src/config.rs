use std::sync::{Arc, RwLock};
use std::path::PathBuf;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub auto_save_enabled: bool,
    pub auto_save_interval: u32,
    pub show_unsaved_warning: bool,
    pub show_type_speed: bool,
    #[serde(default = "default_page_size")]
    pub page_size: String,
}

fn default_page_size() -> String {
    "letter".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            auto_save_enabled: false,
            auto_save_interval: 5,
            show_unsaved_warning: true,
            show_type_speed: false,
            page_size: default_page_size(),
        }
    }
}

impl AppSettings {
    fn config_path() -> PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("RNotesApp");
        std::fs::create_dir_all(&path).ok();
        path.push("settings.txt");
        path
    }

    pub fn load() -> AppSettings {
        let path = Self::config_path();
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                    return settings;
                }
            }
        }
        AppSettings::default()
    }

    pub fn save(&self) {
        let path = Self::config_path();
        if let Ok(json) = serde_json::to_string_pretty(self) {
            std::fs::write(&path, json).ok();
        }
    }
}

#[derive(Clone)]
pub struct TabInfo {
    pub save_path: PathBuf,
    pub changed: bool,
}

impl TabInfo {
    pub fn new() -> TabInfo {
        TabInfo {
            save_path: PathBuf::new(),
            changed: false,
        }
    }
}

pub struct Config {
    pub tabs: Arc<RwLock<HashMap<String, TabInfo>>>,
    pub active_tab: Arc<RwLock<String>>,
    pub settings: Arc<RwLock<AppSettings>>,
}

impl Config {
    pub fn new() -> Config {
        let mut tabs = HashMap::new();
        let initial_tab_id = "tab-1".to_string();
        tabs.insert(initial_tab_id.clone(), TabInfo::new());
        
        Config { 
            tabs: Arc::new(RwLock::new(tabs)),
            active_tab: Arc::new(RwLock::new(initial_tab_id)),
            settings: Arc::new(RwLock::new(AppSettings::load())),
        }
    }
    
    pub fn get_tab_info(&self, tab_id: &str) -> Option<TabInfo> {
        let tabs = self.tabs.read().unwrap();
        tabs.get(tab_id).cloned()
    }
    
    pub fn set_tab_path(&self, tab_id: &str, path: PathBuf) {
        let mut tabs = self.tabs.write().unwrap();
        if let Some(tab) = tabs.get_mut(tab_id) {
            tab.save_path = path;
        }
    }
    
    pub fn set_tab_changed(&self, tab_id: &str, changed: bool) {
        let mut tabs = self.tabs.write().unwrap();
        if let Some(tab) = tabs.get_mut(tab_id) {
            tab.changed = changed;
        }
    }
    
    pub fn create_tab(&self, tab_id: &str) {
        let mut tabs = self.tabs.write().unwrap();
        tabs.insert(tab_id.to_string(), TabInfo::new());
    }
    
    pub fn remove_tab(&self, tab_id: &str) {
        let mut tabs = self.tabs.write().unwrap();
        tabs.remove(tab_id);
    }
    
    pub fn is_tab_changed(&self, tab_id: &str) -> bool {
        let tabs = self.tabs.read().unwrap();
        tabs.get(tab_id).map(|t| t.changed).unwrap_or(false)
    }
    
    pub fn has_any_unsaved_changes(&self) -> bool {
        let tabs = self.tabs.read().unwrap();
        tabs.values().any(|t| t.changed)
    }

    pub fn count_unsaved_tabs(&self) -> usize {
        let tabs = self.tabs.read().unwrap();
        tabs.values().filter(|t| t.changed).count()
    }

    pub fn is_tab_saved_to_disk(&self, tab_id: &str) -> bool {
        let tabs = self.tabs.read().unwrap();
        tabs.get(tab_id)
            .map(|t| !t.save_path.as_os_str().is_empty())
            .unwrap_or(false)
    }

    pub fn get_settings(&self) -> AppSettings {
        self.settings.read().unwrap().clone()
    }

    pub fn update_settings(&self, new_settings: AppSettings) {
        let mut settings = self.settings.write().unwrap();
        *settings = new_settings.clone();
        drop(settings);
        new_settings.save();
    }
}
