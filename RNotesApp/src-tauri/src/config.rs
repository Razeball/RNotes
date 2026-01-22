use std::sync::{Arc, RwLock};
use std::path::PathBuf;

pub struct Config {
    pub save_path: Arc<RwLock<PathBuf>>,
}

impl Config {
    pub fn new() -> Config{
        Config { save_path: Arc::new(RwLock::new(PathBuf::new()))}
    }
}
