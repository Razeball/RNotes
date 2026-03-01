use crate::document_model::{Node, TextNode, DocumentMeta};
use crate::config::Config;
use crate::encoder::encode_document_with_meta;
use crate::decoder::decode_document_with_meta;
use rfd::FileDialog;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};


#[derive(Serialize, Deserialize)]
struct JsonDocumentWrapper {
    #[serde(default)]
    meta: DocumentMeta,
    nodes: Vec<Node>,
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
pub fn save(document: Vec<Node>, document_name: String, meta: Option<DocumentMeta>, state: tauri::State<Config>) -> Result<String, String> {
    println!("Received document with {} nodes", document.len());
    let doc_meta = meta.unwrap_or_default();
    let active_tab = state.active_tab.read().unwrap().clone();
    let tab_info = state.get_tab_info(&active_tab);
    
    if let Some(info) = tab_info {
        let save_path = info.save_path;
        let wrapper = JsonDocumentWrapper { meta: doc_meta.clone(), nodes: document.clone() };
        let json_str = serde_json::to_string_pretty(&wrapper)
            .map_err(|e| format!("Serialize error: {}", e))?;
        if !save_path.as_os_str().is_empty() {
            match save_path.extension().and_then(|e| e.to_str()) {
                Some("rdocx") => {
                    let binary_data = encode_document_with_meta(&document, &doc_meta)
                        .map_err(|e| format!("Encode error: {}", e))?;
                    std::fs::write(&save_path, binary_data).expect("There was an error trying to save");
                }
                Some("txt") => {
                    std::fs::write(&save_path, extract_plain_text(&document)).expect("There was an error trying to save");
                }
                _ => {
                    std::fs::write(&save_path, json_str.as_bytes()).expect("There was an error trying to save");
                }
            }
            state.set_tab_changed(&active_tab, false);
            println!("file saved successfully in {:?}", &save_path);
            return Ok(format!("file saved successfully in {:?}", &save_path));
        }
        else {
            return create_file_for_tab(extract_plain_text(&document), json_str, &document, &doc_meta, document_name, &active_tab, &state);
        }
    }
    Err("Tab not found".to_string())
}

#[tauri::command]
pub fn save_as(document: Vec<Node>, document_name: String, meta: Option<DocumentMeta>, state: tauri::State<Config>) -> Result<String, String>{
    println!("Received document with {} nodes", document.len());
    let doc_meta = meta.unwrap_or_default();
    let wrapper = JsonDocumentWrapper { meta: doc_meta.clone(), nodes: document.clone() };
    let json_str = serde_json::to_string_pretty(&wrapper)
        .map_err(|e| format!("Serialize error: {}", e))?;
    let active_tab = state.active_tab.read().unwrap().clone();
    return create_file_for_tab(extract_plain_text(&document), json_str, &document, &doc_meta, document_name, &active_tab, &state);
}

#[tauri::command]
pub fn save_tab(document: Vec<Node>, document_name: String, tab_id: String, meta: Option<DocumentMeta>, state: tauri::State<Config>) -> Result<String, String> {
    let doc_meta = meta.unwrap_or_default();
    println!("Saving tab {} with {} nodes", tab_id, document.len());
    let tab_info = state.get_tab_info(&tab_id);
    
    if let Some(info) = tab_info {
        let save_path = info.save_path;
        let wrapper = JsonDocumentWrapper { meta: doc_meta.clone(), nodes: document.clone() };
        let json_str = serde_json::to_string_pretty(&wrapper)
            .map_err(|e| format!("Serialize error: {}", e))?;
        
        if !save_path.as_os_str().is_empty() {
            match save_path.extension().and_then(|e| e.to_str()) {
                Some("rdocx") => {
                    let binary_data = encode_document_with_meta(&document, &doc_meta)
                        .map_err(|e| format!("Encode error: {}", e))?;
                    std::fs::write(&save_path, binary_data).expect("There was an error trying to save");
                }
                Some("txt") => {
                    std::fs::write(&save_path, extract_plain_text(&document)).expect("There was an error trying to save");
                }
                _ => {
                    std::fs::write(&save_path, json_str.as_bytes()).expect("There was an error trying to save");
                }
            }
            state.set_tab_changed(&tab_id, false);
            println!("Tab {} saved successfully in {:?}", tab_id, &save_path);
            return Ok(format!("file saved successfully in {:?}", &save_path));
        } else {
            return create_file_for_tab(extract_plain_text(&document), json_str, &document, &doc_meta, document_name, &tab_id, &state);
        }
    }
    Err("Tab not found".to_string())
}

#[tauri::command]
pub fn save_tab_as(document: Vec<Node>, document_name: String, tab_id: String, meta: Option<DocumentMeta>, state: tauri::State<Config>) -> Result<String, String> {
    let doc_meta = meta.unwrap_or_default();
    println!("Save as for tab {} with {} nodes", tab_id, document.len());
    let wrapper = JsonDocumentWrapper { meta: doc_meta.clone(), nodes: document.clone() };
    let json_str = serde_json::to_string_pretty(&wrapper)
        .map_err(|e| format!("Serialize error: {}", e))?;
    return create_file_for_tab(extract_plain_text(&document), json_str, &document, &doc_meta, document_name, &tab_id, &state);
}

#[tauri::command]
pub fn open_in_tab(tab_id: String, state: tauri::State<Config>) -> Result<(Vec<Node>, String, DocumentMeta), String> {
    if let Some(mut path) = FileDialog::new()
        .set_title("Open File")
        .set_directory(".")
        .add_filter("RNotes Document", &["rdocx"])
        .add_filter("RichText", &["json"])
        .add_filter("Text", &["txt"])
        .pick_file()
    {
        let result = load_file_from_path(&mut path)?;
        state.set_tab_path(&tab_id, path.clone());
        state.set_tab_changed(&tab_id, false);
        return Ok(result);
    } else {
        println!("The operation was cancelled");
        return Err("The operation was cancelled".to_string());
    }
}

fn load_file_from_path(path: &mut PathBuf) -> Result<(Vec<Node>, String, DocumentMeta), String> {
    match path.extension().and_then(|e| e.to_str()) {
        Some("rdocx") => {
            let content = std::fs::read(&path)
                .map_err(|e| format!("Error reading file: {}", e))?;
            
            println!("File Open: {:?}", path);
            
            let (document, meta) = decode_document_with_meta(&content)
                .map_err(|e| format!("Error decoding .rdocx: {}", e))?;

            let file_name = path.file_stem().unwrap();
            let str_file_name = file_name.to_string_lossy().to_string();
            return Ok((document, str_file_name, meta));
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
                    font_family: None,
                }],
             }
            })
            .collect();
            
            let file_name = path.file_stem().unwrap();
            let str_file_name = file_name.to_string_lossy().to_string();
            return Ok((document, str_file_name, DocumentMeta::default()));
        }
        Some("json") => {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Error reading file: {}", e))?;
            
            println!("File Open: {:?}", path);
            
            let (document, meta) = if let Ok(wrapper) = serde_json::from_str::<JsonDocumentWrapper>(&content) {
                (wrapper.nodes, wrapper.meta)
            } else {
                let nodes: Vec<Node> = serde_json::from_str(&content)
                    .map_err(|e| format!("Error parsing JSON: {}", e))?;
                (nodes, DocumentMeta::default())
            };

            let file_name = path.file_stem().unwrap();
            let str_file_name = file_name.to_string_lossy().to_string();
            return Ok((document, str_file_name, meta));
        }
        _ => {
            let content = std::fs::read(&path)
                .map_err(|e| format!("Error reading file: {}", e))?;
            
            if content.len() >= 3 && &content[0..3] == b"RDC" {
                let (document, meta) = decode_document_with_meta(&content)
                    .map_err(|e| format!("Error decoding .rdocx: {}", e))?;

                let file_name = path.file_stem().unwrap();
                let str_file_name = file_name.to_string_lossy().to_string();
                return Ok((document, str_file_name, meta));
            }
            
            path.set_extension("json");
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Error reading file: {}", e))?;
            
            println!("File Open: {:?}", path);
            
            let (document, meta) = if let Ok(wrapper) = serde_json::from_str::<JsonDocumentWrapper>(&content) {
                (wrapper.nodes, wrapper.meta)
            } else {
                let nodes: Vec<Node> = serde_json::from_str(&content)
                    .map_err(|e| format!("Error parsing JSON: {}", e))?;
                (nodes, DocumentMeta::default())
            };

            let file_name = path.file_stem().unwrap();
            let str_file_name = file_name.to_string_lossy().to_string();
            return Ok((document, str_file_name, meta));
        }
    }
}

fn create_file_for_tab(document_text: String, json_str: String, document: &[Node], meta: &DocumentMeta, document_name: String, tab_id: &str, state: &tauri::State<Config>) -> Result<String, String> {
    if let Some(mut path) = FileDialog::new()
        .set_title("Save File")
        .set_directory(".")
        .set_file_name(format!("{}.rdocx", document_name))
        .add_filter("RNotes Document", &["rdocx"])
        .add_filter("RichText", &["json"])
        .add_filter("Text", &["txt"])
        .save_file()
    { 
        match path.extension().and_then(|e| e.to_str()) {
            Some("rdocx") => {
                let binary_data = encode_document_with_meta(document, meta)
                    .map_err(|e| format!("Encode error: {}", e))?;
                state.set_tab_path(tab_id, path.clone());
                state.set_tab_changed(tab_id, false);
                std::fs::write(&path, binary_data).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
            Some("txt") => {
                state.set_tab_path(tab_id, path.clone());
                state.set_tab_changed(tab_id, false);
                std::fs::write(&path, document_text).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
            Some("json") => {
                state.set_tab_path(tab_id, path.clone());
                state.set_tab_changed(tab_id, false);
                std::fs::write(&path, json_str.as_bytes()).expect("There was an error trying to save");
                return Ok(format!("file saved successfully in {:?}", &path));
            }
            _ => {
                path.set_extension("rdocx");
                let binary_data = encode_document_with_meta(document, meta)
                    .map_err(|e| format!("Encode error: {}", e))?;
                state.set_tab_path(tab_id, path.clone());
                state.set_tab_changed(tab_id, false);
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
pub fn open(state: tauri::State<Config>) -> Result<(Vec<Node>, String, DocumentMeta), String> {
    let active_tab = state.active_tab.read().unwrap().clone();
    
    if let Some(mut path) = FileDialog::new()
        .set_title("Open File")
        .set_directory(".")
        .add_filter("RNotes Document", &["rdocx"])
        .add_filter("RichText", &["json"])
        .add_filter("Text", &["txt"])
        .pick_file()
    {
        let result = load_file_from_path(&mut path)?;
        state.set_tab_path(&active_tab, path.clone());
        state.set_tab_changed(&active_tab, false);
        return Ok(result);
    } else {
        println!("The operation was cancelled");
        return Err("The operation was cancelled".to_string());
    }
}