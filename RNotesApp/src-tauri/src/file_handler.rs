use crate::document_model::{Node, TextNode};
use crate::config::Config;
use crate::encoder::encode_document;
use crate::decoder::decode_document;
use rfd::FileDialog;
use std::sync::{RwLockWriteGuard};
use std::path::PathBuf;


fn extract_plain_text(nodes: &[Node]) -> String {
    let mut result = String::new();

    for node in nodes {
        match node {
            Node::Paragraph { children, .. }
            | Node::Header { children, .. }
            | Node::Header2 { children, .. }
            | Node::Header3 { children, .. }
            | Node::Header4 { children, .. }
            | Node::ListItem { children, .. }
            | Node::Image { children, .. }
            | Node::TableCell { children, .. } => {
                for text_node in children {
                    result.push_str(&text_node.text);
                }
                result.push('\n');
            }
            Node::UList { children, .. }
            | Node::OList { children, .. } => {
                for list_item in children {
                    for text_node in &list_item.children {
                        result.push_str(&text_node.text);
                    }
                    result.push('\n');
                }
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
pub fn save(document: Vec<Node>, document_name: String, state: tauri::State<Config>) -> Result<String, String> {
    println!("Received document with {} nodes", document.len());
    let save_path = state.save_path.write().unwrap();
    let json_str = serde_json::to_string_pretty(&document)
        .map_err(|e| format!("Serialize error: {}", e))?;
    if save_path.as_os_str().is_empty() == false {
        match save_path.extension().and_then(|e| e.to_str()) {
            Some("rdocx") => {
                let binary_data = encode_document(&document)
                    .map_err(|e| format!("Encode error: {}", e))?;
                std::fs::write(&*save_path, binary_data).expect("There was an error trying to save");
            }
            Some("txt") => {
                std::fs::write(&*save_path, extract_plain_text(&document)).expect("There was an error trying to save");
            }
            _ => {
                std::fs::write(&*save_path, json_str.as_bytes()).expect("There was an error trying to save");
            }
        }
        println!("file saved successfully in {:?}", &*save_path);
        return Ok(format!("file saved successfully in {:?}", &*save_path));
    }
    else {
        return create_file(extract_plain_text(&document), json_str, &document, save_path, document_name);
    }
}

#[tauri::command]
pub fn save_as(document: Vec<Node>, document_name: String, state: tauri::State<Config>) -> Result<String, String>{
    println!("Received document with {} nodes", document.len());
    let json_str = serde_json::to_string_pretty(&document)
    .map_err(|e| format!("Serialize error: {}", e))?;
    let save_path = state.save_path.write().unwrap();
    return create_file(extract_plain_text(&document), json_str, &document, save_path, document_name);
}

pub fn create_file(document_text: String ,json_str: String, document: &[Node], mut save_path: RwLockWriteGuard<'_, PathBuf>, document_name: String) -> Result<String, String>{
    if let Some(mut path) = FileDialog::new()
    .set_title("save file")
    .set_directory(".")
    .set_file_name(format!("{}.rdocx", document_name))
    .add_filter("RNotes Document", &["rdocx"])
    .add_filter("RichText", &["json"])
    .add_filter("Text", &["txt"])
    .save_file()
    { 
        match path.extension().and_then(|e| e.to_str()){
            Some("rdocx") => {
                let binary_data = encode_document(document)
                    .map_err(|e| format!("Encode error: {}", e))?;
                *save_path = path.clone();
                std::fs::write(&path, binary_data).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
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
                path.set_extension("rdocx");
                let binary_data = encode_document(document)
                    .map_err(|e| format!("Encode error: {}", e))?;
                *save_path = path.clone();
                std::fs::write(&path, binary_data).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
        }
    } else {
        println!("The operation was cancelled");
        return Ok("The operation was cancelled".to_string());
    }
}
#[tauri::command]
pub fn open(state: tauri::State<Config>) -> Result<(Vec<Node>, String), String> {
    let mut save_path = state.save_path.write().unwrap();
    if let Some(mut path) = FileDialog::new()
    .set_title("Open File")
    .set_directory(".")
    .add_filter("RNotes Document", &["rdocx"])
    .add_filter("RichText", &["json"])
    .add_filter("Text", &["txt"])
    .pick_file()
    {
        match path.extension().and_then(|e| e.to_str()){
            Some("rdocx") => {
                let content = std::fs::read(&path)
                    .map_err(|e| format!("Error reading file: {}", e))?;
                
                println!("File Open: {:?}", path);
                
                let document = decode_document(&content)
                    .map_err(|e| format!("Error decoding .rdocx: {}", e))?;

                *save_path = path.clone();
                let file_name = path.file_prefix().unwrap();
                let str_file_name = file_name.to_string_lossy().to_string();
                return Ok((document, str_file_name));
            }
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
                        link: None,
                        href: None,
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
                let content = std::fs::read(&path)
                    .map_err(|e| format!("Error reading file: {}", e))?;
                
                if content.len() >= 3 && &content[0..3] == b"RDC" {
                    let document = decode_document(&content)
                        .map_err(|e| format!("Error decoding .rdocx: {}", e))?;

                    *save_path = path.clone();
                    let file_name = path.file_prefix().unwrap();
                    let str_file_name = file_name.to_string_lossy().to_string();
                    return Ok((document, str_file_name));
                }
                
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