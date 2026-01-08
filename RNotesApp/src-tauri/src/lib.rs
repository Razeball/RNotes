use std::{path::PathBuf};
use std::sync::{Arc, RwLock, RwLockWriteGuard};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Serialize, Deserialize};
use rfd::FileDialog;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum Node {
    #[serde(rename = "paragraph")]
    Paragraph {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header")]
    Header {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header2")]
    Header2 {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header3")]
    Header3 {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "header4")]
    Header4 {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "ulist")]
    UList {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "olist")]
    OList {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "list-item")]
    ListItem {
        alignment: Option<Alignment>,
        children: Vec<TextNode>,
    },
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
enum Alignment {
    Start,
    Center,
    End,
    Justify,
}

#[derive(Serialize, Deserialize, Debug)]
struct TextNode {
    text: String,
    bold: Option<bool>,
    italic: Option<bool>,
    underline: Option<bool>,
    #[serde(rename = "fontSize")]
    font_size: Option<u32>,
    color: Option<String>,
}

struct Config {
    save_path: Arc<RwLock<PathBuf>>,
}

impl Config {
    pub fn new() -> Config{
        Config { save_path: Arc::new(RwLock::new(PathBuf::new()))}
    }
}



#[tauri::command]
fn save(document: Vec<Node>, document_name: String, state: tauri::State<Config>) -> Result<String, String> {
    println!("Received document with {} nodes", document.len());
    let mut save_path = state.save_path.write().unwrap();
    let json_str = serde_json::to_string_pretty(&document)
        .map_err(|e| format!("Serialize error: {}", e))?;
    if save_path.as_os_str().is_empty() == false {
        std::fs::write(&*save_path, json_str.as_bytes()).expect("There was an error trying to save");
        println!("file saved successfully in {:?}", &*save_path);
        return Ok(format!("file saved successfully in {:?}", &*save_path));
    }
    else {
        return create_file(json_str, save_path, document_name);
    }
}

#[tauri::command]
fn save_as(document: Vec<Node>, document_name: String, state: tauri::State<Config>) -> Result<String, String>{
    println!("Received document with {} nodes", document.len());
    let json_str = serde_json::to_string_pretty(&document)
    .map_err(|e| format!("Serialize error: {}", e))?;
    let mut save_path = state.save_path.write().unwrap();
    return create_file(json_str, save_path, document_name);
}

fn create_file(json_str: String, mut save_path: RwLockWriteGuard<'_, PathBuf>, document_name: String) -> Result<String, String>{
    if let Some(path) = FileDialog::new()
    .set_title("save file")
    .set_directory(".")
    .set_file_name(format!("{}.json", document_name))
    .add_filter("Text", &["json"])
    .save_file()
    { 
        *save_path = path.clone();
        std::fs::write(&path, json_str.as_bytes()).expect("There was an error trying to save");
        println!("file saved successfully in {:?}", &path);
        return Ok(format!("file saved successfully in {:?}", &path));
    } else {
        println!("The operation was cancelled");
        return Ok("The operation was cancelled".to_string());
    }
}
#[tauri::command]
fn open(state: tauri::State<Config>) -> Result<(Vec<Node>, String), String> {
    let mut save_path = state.save_path.write().unwrap();
    if let Some(path) = FileDialog::new()
    .set_title("Open File")
    .set_directory(".")
    .add_filter("Text", &["json", "txt"])
    .pick_file()
    {
        let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Error reading file: {}", e))?;
        
        println!("File Open: {:?}", path);
        println!("Content:\n{}", content);
        
        let document: Vec<Node> = serde_json::from_str(&content)
        .map_err(|e| format!("Error parsing JSON: {}", e))?;

        *save_path = path.clone();
        let file_name = path.file_prefix().unwrap();
        let str_file_name = file_name.to_string_lossy().to_string();
        return Ok((document, str_file_name));
    }
    else {
        println!("The operation was cancelled");
        return Err("The operation was cancelled".to_string());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Config::new())
        .invoke_handler(tauri::generate_handler![greet, save, open, save_as])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
