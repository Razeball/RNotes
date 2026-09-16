use std::sync::{Arc, RwLock};
use std::path::{Path, PathBuf};

/// Drops a UTF-8 byte order mark, which `serde_json` refuses to parse past.
///
/// Every file under the config directory is plain JSON that someone may reasonably open in an
/// editor, and Notepad and PowerShell both write a BOM. The failure is silent and total — the
/// settings quietly revert to their defaults, or the release notes quietly do not appear — so
/// tolerating it is worth the one line. Found by writing `settings.txt` from PowerShell and watching
/// the app come up in the wrong language.
pub fn strip_bom(text: &str) -> &str {
    text.trim_start_matches('\u{feff}')
}
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
    #[serde(default)]
    pub restore_session: bool,
    #[serde(default)]
    pub markdown_enabled: bool,
    /// BCP-47 tag chosen in Settings. Empty means follow the operating system.
    #[serde(default)]
    pub language: String,
    #[serde(default = "default_true")]
    pub spellcheck_enabled: bool,
    /// Dictionary to check against. Empty means follow the interface language.
    #[serde(default)]
    pub spellcheck_language: String,
    /// Words the user told the checker to stop flagging. Kept sorted and deduplicated.
    #[serde(default)]
    pub personal_dictionary: Vec<String>,
    #[serde(default = "default_true")]
    pub typing_sound_enable: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub run_in_background: bool,
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_true() -> bool {
    true
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
            restore_session: false,
            markdown_enabled: false,
            language: String::new(),
            spellcheck_enabled: true,
            spellcheck_language: String::new(),
            personal_dictionary: Vec::new(),
            typing_sound_enable: true,
            theme: default_theme(),
            run_in_background: false,
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
                if let Ok(settings) = serde_json::from_str::<AppSettings>(strip_bom(&content)) {
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

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredChangelog {
    pub version: String,
    pub release_body: String,
    #[serde(default)]
    pub version_seen: bool,
}

/// What the frontend needs to know at startup, in one round trip.
#[derive(Serialize)]
pub struct ChangelogStartup {
    pub body: Option<String>,
    pub needs_fetch: bool,
}

fn changelog_dir() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("RNotesApp");
    std::fs::create_dir_all(&path).ok();
    path
}

impl StoredChangelog {
    fn path_in(dir: &Path) -> PathBuf {
        dir.join("pending_changelog.json")
    }

    fn read_in(dir: &Path) -> Option<StoredChangelog> {
        let content = std::fs::read_to_string(Self::path_in(dir)).ok()?;
        serde_json::from_str(strip_bom(&content)).ok()
    }

    pub fn store(version: &str, body: &str, seen: bool) {
        Self::store_in(&changelog_dir(), version, body, seen);
    }

    fn store_in(dir: &Path, version: &str, body: &str, seen: bool) {
        let stored = StoredChangelog {
            version: version.to_string(),
            release_body: body.to_string(),
            version_seen: seen,
        };
        if let Ok(json) = serde_json::to_string_pretty(&stored) {
            std::fs::write(Self::path_in(dir), json).ok();
        }
    }

    pub fn body_for(version: &str) -> Option<String> {
        Self::body_for_in(&changelog_dir(), version)
    }

    fn body_for_in(dir: &Path, version: &str) -> Option<String> {
        let stored = Self::read_in(dir)?;
        if is_same_version(&stored.version, version) && !stored.release_body.trim().is_empty() {
            Some(stored.release_body)
        } else {
            None
        }
    }

    pub fn startup(current: &str) -> ChangelogStartup {
        Self::startup_in(&changelog_dir(), current)
    }

    fn startup_in(dir: &Path, current: &str) -> ChangelogStartup {
        let first_launch_on_this_version = LastVersion::take_differs_from_in(dir, current);

        if let Some(stored) = Self::read_in(dir)
            && is_same_version(&stored.version, current)
            && !stored.release_body.trim().is_empty()
        {
            if !stored.version_seen || first_launch_on_this_version {
                Self::store_in(dir, current, &stored.release_body, true);
                return ChangelogStartup {
                    body: Some(stored.release_body),
                    needs_fetch: false,
                };
            }
        }

        ChangelogStartup {
            body: None,
            needs_fetch: first_launch_on_this_version,
        }
    }
}

fn is_same_version(a: &str, b: &str) -> bool {
    a.trim().trim_start_matches(['v', 'V']) == b.trim().trim_start_matches(['v', 'V'])
}

struct LastVersion;

impl LastVersion {
    fn path_in(dir: &Path) -> PathBuf {
        dir.join("last_version.txt")
    }

    fn take_differs_from_in(dir: &Path, current: &str) -> bool {
        let previous = std::fs::read_to_string(Self::path_in(dir)).ok();
        std::fs::write(Self::path_in(dir), current).ok();

        match previous {
            Some(previous) => !is_same_version(&previous, current),
            None => false,
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

    pub fn add_word_to_dictionary(&self, word: &str) -> Vec<String> {
        let trimmed_word = word.trim();
        if trimmed_word.is_empty() {
            return self.get_settings().personal_dictionary;
        }

        let mut settings = self.settings.write().unwrap();
        if !settings
            .personal_dictionary
            .iter()
            .any(|existing| existing.to_lowercase() == trimmed_word.to_lowercase())
        {
            settings.personal_dictionary.push(trimmed_word.to_string());
            settings.personal_dictionary.sort_by_key(|w| w.to_lowercase());
        }
        let updated = settings.clone();
        drop(settings);

        updated.save();
        updated.personal_dictionary
    }

    pub fn delete_word_from_dictionary(&self, word: &str) -> Vec<String> {
        let mut settings = self.settings.write().unwrap();
        settings
            .personal_dictionary
            .retain(|existing| existing.to_lowercase() != word.to_lowercase());
        let updated = settings.clone();
        drop(settings);

        updated.save();
        updated.personal_dictionary
    }

    pub fn update_settings(&self, new_settings: AppSettings) {
        let mut settings = self.settings.write().unwrap();
        let mut merged_settings = new_settings;
        merged_settings.personal_dictionary = std::mem::take(&mut settings.personal_dictionary);
        *settings = merged_settings.clone();
        drop(settings);
        merged_settings.save();
    }
}

#[cfg(test)]
mod changelog_tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> TempDir {
            let dir = std::env::temp_dir().join(format!("rnotes_changelog_{name}"));
            std::fs::remove_dir_all(&dir).ok();
            std::fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn write_raw(&self, contents: &str) {
            std::fs::write(self.0.join("pending_changelog.json"), contents).unwrap();
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).ok();
        }
    }

    #[test]
    fn first_ever_launch_shows_nothing() {
        let dir = TempDir::new("first_launch");
        let startup = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert!(startup.body.is_none());
        assert!(!startup.needs_fetch);
    }


    #[test]
    fn in_app_update_shows_the_stored_notes_once() {
        let dir = TempDir::new("in_app");
        StoredChangelog::store_in(dir.path(), "0.6.0", "Added:\n- a thing", false);

        let first = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert_eq!(first.body.as_deref(), Some("Added:\n- a thing"));


        let second = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert!(second.body.is_none());
        assert!(!second.needs_fetch);
    }


    #[test]
    fn reads_the_file_written_by_0_5_3() {
        let dir = TempDir::new("legacy");
        dir.write_raw(r#"{"version":"0.6.0","body":"Fixed:\n- the window"}"#);

        let startup = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert_eq!(startup.body.as_deref(), Some("Fixed:\n- the window"));
    }

    #[test]
    fn a_new_version_with_no_stored_notes_asks_for_them() {
        let dir = TempDir::new("manual");

        StoredChangelog::startup_in(dir.path(), "0.5.9");

        let startup = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert!(startup.body.is_none());
        assert!(startup.needs_fetch, "a version never run before must ask for its notes");

        let next = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert!(!next.needs_fetch);
    }

    #[test]
    fn notes_for_another_version_are_not_shown() {
        let dir = TempDir::new("mismatch");
        StoredChangelog::store_in(dir.path(), "0.7.0", "Added:\n- the next one", false);

        let startup = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert!(startup.body.is_none());
        assert_eq!(StoredChangelog::body_for_in(dir.path(), "0.6.0"), None);
    }

    #[test]
    fn the_v_prefix_does_not_change_the_version() {
        let dir = TempDir::new("vprefix");
        StoredChangelog::store_in(dir.path(), "v0.6.0", "Changed:\n- something", false);

        let startup = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert_eq!(startup.body.as_deref(), Some("Changed:\n- something"));
    }

    #[test]
    fn body_for_keeps_answering_after_the_window_was_shown() {
        let dir = TempDir::new("settings_click");
        StoredChangelog::store_in(dir.path(), "0.6.0", "Added:\n- a thing", false);
        StoredChangelog::startup_in(dir.path(), "0.6.0");

        assert_eq!(
            StoredChangelog::body_for_in(dir.path(), "0.6.0").as_deref(),
            Some("Added:\n- a thing")
        );
        assert_eq!(
            StoredChangelog::body_for_in(dir.path(), "0.6.0").as_deref(),
            Some("Added:\n- a thing"),
            "asking twice must not consume the notes"
        );
    }

    #[test]
    fn reads_a_hand_written_file_with_a_byte_order_mark() {
        let dir = TempDir::new("bom");
        dir.write_raw("\u{feff}{\"version\":\"0.6.0\",\"body\":\"Added:\\n- a thing\"}");

        let startup = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert_eq!(startup.body.as_deref(), Some("Added:\n- a thing"));
    }


    #[test]
    fn empty_notes_are_treated_as_absent() {
        let dir = TempDir::new("empty");
        StoredChangelog::store_in(dir.path(), "0.6.0", "   \n  ", false);

        let startup = StoredChangelog::startup_in(dir.path(), "0.6.0");
        assert!(startup.body.is_none());
        assert_eq!(StoredChangelog::body_for_in(dir.path(), "0.6.0"), None);
    }
}
