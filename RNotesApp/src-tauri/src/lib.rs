use std::path::PathBuf;
use std::sync::{Arc, RwLock, RwLockWriteGuard};
use std::io::Cursor;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Serialize, Deserialize};
use rfd::FileDialog;
use uuid::Uuid;
use arboard::Clipboard;
use image::ImageFormat;

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
    #[serde(rename = "image")]
    Image {
        url: Option<String>,
        size: Option<ImageSize>,
        children: Vec<TextNode>,
    },
    #[serde(rename = "table")]
    Table {
        children: Vec<TableRow>,
    },
    #[serde(rename = "table-row")]
    TableRow {
        children: Vec<TableCell>,
    },
    #[serde(rename = "table-cell")]
    TableCell {
        children: Vec<TextNode>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct TableRow {
    #[serde(rename = "type")]
    node_type: String,
    children: Vec<TableCell>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TableCell {
    #[serde(rename = "type")]
    node_type: String,
    children: Vec<TextNode>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
enum ImageSize {
    Small,
    Medium,
    Large,
    Original,
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
    code: Option<bool>,
    quote: Option<bool>,
    #[serde(rename = "crossedOut")]
    crossed_out: Option<bool>,
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

fn extract_plain_text(nodes: &[Node]) -> String {
    let mut result = String::new();

    for node in nodes {
        match node {
            Node::Paragraph { children, .. }
            | Node::Header { children, .. }
            | Node::Header2 { children, .. }
            | Node::Header3 { children, .. }
            | Node::Header4 { children, .. }
            | Node::UList { children, .. }
            | Node::OList { children, .. }
            | Node::ListItem { children, .. }
            | Node::Image { children, .. }
            | Node::TableCell { children, .. } => {
                for text_node in children {
                    result.push_str(&text_node.text);
                }
                result.push('\n');
            }
            Node::Table { children } => {
                for row in children {
                    for cell in &row.children {
                        for text_node in &cell.children {
                            result.push_str(&text_node.text);
                        }
                        result.push('\t');
                    }
                    result.push('\n');
                }
            }
            Node::TableRow { children } => {
                for cell in children {
                    for text_node in &cell.children {
                        result.push_str(&text_node.text);
                    }
                    result.push('\t');
                }
                result.push('\n');
            }
        };
    }

    result
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
        return create_file(extract_plain_text(&document), json_str, save_path, document_name);
    }
}

#[tauri::command]
fn save_as(document: Vec<Node>, document_name: String, state: tauri::State<Config>) -> Result<String, String>{
    println!("Received document with {} nodes", document.len());
    let json_str = serde_json::to_string_pretty(&document)
    .map_err(|e| format!("Serialize error: {}", e))?;
    let mut save_path = state.save_path.write().unwrap();
    return create_file(extract_plain_text(&document), json_str, save_path, document_name);
}

fn create_file(document_text: String ,json_str: String, mut save_path: RwLockWriteGuard<'_, PathBuf>, document_name: String) -> Result<String, String>{
    if let Some(mut path) = FileDialog::new()
    .set_title("save file")
    .set_directory(".")
    .set_file_name(format!("{}.json", document_name))
    .add_filter("RichText", &["json"])
    .add_filter("Text", &["txt"])
    .save_file()
    { 
        match path.extension().and_then(|e| e.to_str()){
            Some("txt") => {
                *save_path = path.clone();
                std::fs::write(&path, document_text).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
            Some("json") =>{
                *save_path = path.clone();
                std::fs::write(&path, json_str.as_bytes()).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
            _ => {
                path.set_extension("json");
                *save_path = path.clone();
                std::fs::write(&path, json_str.as_bytes()).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
        }
    } else {
        println!("The operation was cancelled");
        return Ok("The operation was cancelled".to_string());
    }
}
#[tauri::command]
fn open(state: tauri::State<Config>) -> Result<(Vec<Node>, String), String> {
    let mut save_path = state.save_path.write().unwrap();
    if let Some(mut path) = FileDialog::new()
    .set_title("Open File")
    .set_directory(".")
    .add_filter("RichText", &["json"])
    .add_filter("Text", &["txt"])
    .pick_file()
    {
        match path.extension().and_then(|e| e.to_str()){
            Some("txt") => {
                let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Error reading file: {}", e))?;
                
                let document = content.lines().map(|line| {
                    Node::Paragraph { alignment: None, children: vec![TextNode {
                        text: line.to_string(),
                        bold: None,
                        italic: None,
                        underline: None,
                        quote: None,
                        code: None, 
                        crossed_out: None,
                        font_size: None,
                        color: None,
                    }],
                 }
                })
                .collect();
                
                *save_path = path.clone();
                let file_name = path.file_prefix().unwrap();
                let str_file_name = file_name.to_string_lossy().to_string();
                return Ok((document, str_file_name));
            }
            Some("json") => {
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
            _ => {
                path.set_extension("json");
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
        }
    }
    else {
        println!("The operation was cancelled");
        return Err("The operation was cancelled".to_string());
    }
}


fn get_images_dir(save_path: &PathBuf) -> Result<PathBuf, String> {
    let images_dir = if save_path.as_os_str().is_empty() {
        
        std::env::temp_dir().join("rnotes_images")
    } else {

        let parent = save_path.parent().unwrap_or(std::path::Path::new("."));
        parent.join("images")
    };
    
    if !images_dir.exists() {
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Error creating images directory: {}", e))?;
    }
    
    Ok(images_dir)
}

#[tauri::command]
fn insert_image_from_file(state: tauri::State<Config>) -> Result<String, String> {
    let save_path = state.save_path.read().unwrap();
    
    if let Some(source_path) = FileDialog::new()
        .set_title("Select Image")
        .set_directory(".")
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"])
        .pick_file()
    {
        let images_dir = get_images_dir(&save_path)?;
        
        
        let extension = source_path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let unique_name = format!("{}.{}", Uuid::new_v4(), extension);
        let dest_path = images_dir.join(&unique_name);
        

        std::fs::copy(&source_path, &dest_path)
            .map_err(|e| format!("Error copying image: {}", e))?;

        Ok(dest_path.to_string_lossy().to_string())
    } else {
        Err("Operation cancelled".to_string())
    }
}

#[tauri::command]
fn insert_image_from_clipboard(state: tauri::State<Config>) -> Result<String, String> {
    let save_path = state.save_path.read().unwrap();
    
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Error accessing clipboard: {}", e))?;
    
    let image = clipboard.get_image()
        .map_err(|_| "No image found in clipboard".to_string())?;
    
    let images_dir = get_images_dir(&save_path)?;
    

    let unique_name = format!("{}.png", Uuid::new_v4());
    let dest_path = images_dir.join(&unique_name);

    let rgba_image = image::RgbaImage::from_raw(
        image.width as u32,
        image.height as u32,
        image.bytes.into_owned(),
    ).ok_or("Error creating image from clipboard data")?;
    
    let mut buffer = Cursor::new(Vec::new());
    rgba_image.write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("Error encoding image: {}", e))?;
    
    std::fs::write(&dest_path, buffer.into_inner())
        .map_err(|e| format!("Error saving image: {}", e))?;
    

    Ok(dest_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Config::new())
        .invoke_handler(tauri::generate_handler![greet, save, open, save_as, insert_image_from_file, insert_image_from_clipboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
