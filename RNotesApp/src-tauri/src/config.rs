use std::sync::{Arc, RwLock};
use std::path::PathBuf;
use std::collections::HashMap;

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
}

impl Config {
    pub fn new() -> Config {
        let mut tabs = HashMap::new();
        let initial_tab_id = "tab-1".to_string();
        tabs.insert(initial_tab_id.clone(), TabInfo::new());
        
        Config { 
            tabs: Arc::new(RwLock::new(tabs)),
            active_tab: Arc::new(RwLock::new(initial_tab_id)),
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
}
