use crate::document_model::{Node, TextNode, DocumentMeta};
use crate::config::Config;
use crate::encoder::encode_document_with_meta;
use crate::decoder::decode_document_with_meta;
use crate::markdown::{from_markdown, to_markdown};
use rfd::FileDialog;
use std::path::{Path, PathBuf};
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
            | Node::Check { children, .. }
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
                Some("md") => {
                    std::fs::write(&save_path, to_markdown(&document)).expect("There was an error trying to save");
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
                Some("md") => {
                    std::fs::write(&save_path, to_markdown(&document)).expect("There was an error trying to save");
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
/// `all_label` is the caption of the combined filter, passed in by the frontend so it reads in the
/// user's language; the per-format captions are format names and stay as they are.
pub fn open_in_tab(tab_id: String, all_label: Option<String>, state: tauri::State<Config>) -> Result<(Vec<Node>, String, DocumentMeta), String> {
    let all_label = all_label.unwrap_or_else(|| "All supported files".to_string());
    if let Some(path) = FileDialog::new()
        .set_title("Open File")
        .set_directory(".")
        // First, so it is the one selected when the dialog opens. Every file it lists is still read
        // before it is accepted: see `read_document`.
        .add_filter(&all_label, &DOCUMENT_EXTENSIONS)
        .add_filter("RNotes Document", &["rdocx"])
        .add_filter("RichText", &["json"])
        .add_filter("Text", &["txt"])
        .add_filter("Markdown", &["md"])
        .pick_file()
    {
        let result = load_file_from_path(&path)?;
        state.set_tab_path(&tab_id, path.clone());
        state.set_tab_changed(&tab_id, false);
        return Ok(result);
    } else {
        println!("The operation was cancelled");
        return Err("The operation was cancelled".to_string());
    }
}

/// Open silently a file by using a explicit path 
#[tauri::command]
pub fn open_file_by_path(tab_id: String, file_path: String, state: tauri::State<Config>) -> Result<(Vec<Node>, String, DocumentMeta), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    let result = load_file_from_path(&path)?;
    state.set_tab_path(&tab_id, path.clone());
    state.set_tab_changed(&tab_id, false);
    Ok(result)
}

#[tauri::command]
pub fn rename_tab_file(tab_id: String, new_name: String, state: tauri::State<Config>) -> Result<String, String> {
    let tab_info = state.get_tab_info(&tab_id).ok_or("Tab not found")?;
    let old_path = tab_info.save_path;
    if old_path.as_os_str().is_empty() {
        return Ok(String::new()); 
    }
    let parent = old_path.parent().ok_or("Cannot determine parent directory")?;
    let ext = old_path.extension().and_then(|e| e.to_str()).unwrap_or("rdocx");
    let new_file_name = format!("{}.{}", new_name, ext);
    let new_path = parent.join(&new_file_name);
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename file: {}", e))?;
    state.set_tab_path(&tab_id, new_path.clone());
    Ok(new_path.to_string_lossy().to_string())
}


pub const DOCUMENT_EXTENSIONS: [&str; 4] = ["rdocx", "json", "txt", "md"];
pub const NOT_A_DOCUMENT: &str = "rnotes:not-a-document";
pub const DAMAGED_RDOCX: &str = "rnotes:damaged-rdocx";
pub const INVALID_JSON: &str = "rnotes:invalid-json";

fn load_file_from_path(path: &Path) -> Result<(Vec<Node>, String, DocumentMeta), String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Error reading file: {}", e))?;
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    let (mut document, meta) = read_document(&bytes, &extension).map_err(str::to_string)?;

    if document.is_empty() {
        document.push(empty_paragraph());
    }

    let name = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok((document, name, meta))
}


pub(crate) fn read_document(bytes: &[u8], extension: &str) -> Result<(Vec<Node>, DocumentMeta), &'static str> {
    if bytes.starts_with(b"RDC") {
        if let Ok(decoded) = decode_document_with_meta(bytes) {
            return Ok(decoded);
        }
        if extension == "rdocx" {
            return Err(DAMAGED_RDOCX);
        }
    }
    if extension == "rdocx" {
        return Err(NOT_A_DOCUMENT);
    }


    let text = as_text(bytes).ok_or(NOT_A_DOCUMENT)?;

    match extension {
        "json" => parse_json_document(text).ok_or(INVALID_JSON),
        "md" => Ok((from_markdown(text), DocumentMeta::default())),
        "txt" => Ok((text_to_paragraphs(text), DocumentMeta::default())),
        _ => match parse_json_document(text) {
            Some(parsed) if !parsed.0.is_empty() => Ok(parsed),
            _ => Err(NOT_A_DOCUMENT),
        },
    }
}

fn as_text(bytes: &[u8]) -> Option<&str> {
    let text = std::str::from_utf8(bytes).ok()?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    if text.contains('\0') {
        return None;
    }
    Some(text)
}

fn parse_json_document(text: &str) -> Option<(Vec<Node>, DocumentMeta)> {
    if let Ok(wrapper) = serde_json::from_str::<JsonDocumentWrapper>(text) {
        return Some((wrapper.nodes, wrapper.meta));
    }
    serde_json::from_str::<Vec<Node>>(text)
        .ok()
        .map(|nodes| (nodes, DocumentMeta::default()))
}

fn text_to_paragraphs(text: &str) -> Vec<Node> {
    text.lines()
        .map(|line| Node::Paragraph {
            alignment: None,
            children: vec![plain_text(line)],
        })
        .collect()
}

fn empty_paragraph() -> Node {
    Node::Paragraph {
        alignment: None,
        children: vec![plain_text("")],
    }
}

fn plain_text(text: &str) -> TextNode {
    TextNode {
        text: text.to_string(),
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
        .add_filter("Markdown", &["md"])
        .add_filter("PDF Document", &["pdf"])
        .save_file()
    { 
        match path.extension().and_then(|e| e.to_str()) {
            Some("pdf") => {
                return Ok("__PDF_REQUESTED__".to_string());
            }
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
            Some("md") => {
                state.set_tab_path(tab_id, path.clone());
                state.set_tab_changed(tab_id, false);
                std::fs::write(&path, to_markdown(document)).expect("There was an error trying to save");
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
pub fn export_to_file(document: Vec<Node>, document_name: String, format: String, meta: Option<DocumentMeta>) -> Result<String, String> {
    let doc_meta = meta.unwrap_or_default();
    let (filter_name, extensions, default_ext) = match format.as_str() {
        "txt" => ("Text", vec!["txt"], "txt"),
        "md" => ("Markdown", vec!["md"], "md"),
        "json" => ("RichText", vec!["json"], "json"),
        "rdocx" => ("RNotes Document", vec!["rdocx"], "rdocx"),
        _ => return Err(format!("Unsupported export format: {}", format)),
    };

    if let Some(path) = FileDialog::new()
        .set_title(&format!("Export as {}", filter_name))
        .set_directory(".")
        .set_file_name(format!("{}.{}", document_name, default_ext))
        .add_filter(filter_name, &extensions)
        .save_file()
    {
        match format.as_str() {
            "txt" => {
                std::fs::write(&path, extract_plain_text(&document))
                    .map_err(|e| format!("Error writing file: {}", e))?;
            }
            "md" => {
                std::fs::write(&path, to_markdown(&document))
                    .map_err(|e| format!("Error writing file: {}", e))?;
            }
            "json" => {
                let wrapper = JsonDocumentWrapper { meta: doc_meta, nodes: document };
                let json_str = serde_json::to_string_pretty(&wrapper)
                    .map_err(|e| format!("Serialize error: {}", e))?;
                std::fs::write(&path, json_str.as_bytes())
                    .map_err(|e| format!("Error writing file: {}", e))?;
            }
            "rdocx" => {
                let binary_data = encode_document_with_meta(&document, &doc_meta)
                    .map_err(|e| format!("Encode error: {}", e))?;
                std::fs::write(&path, binary_data)
                    .map_err(|e| format!("Error writing file: {}", e))?;
            }
            _ => return Err(format!("Unsupported export format: {}", format)),
        }
        Ok(format!("Exported successfully to {:?}", &path))
    } else {
        Ok("The operation was cancelled".to_string())
    }
}
#[tauri::command]
pub fn open(state: tauri::State<Config>) -> Result<(Vec<Node>, String, DocumentMeta), String> {
    let active_tab = state.active_tab.read().unwrap().clone();
    
    if let Some(path) = FileDialog::new()
        .set_title("Open File")
        .set_directory(".")
        .add_filter("All supported files", &DOCUMENT_EXTENSIONS)
        .add_filter("RNotes Document", &["rdocx"])
        .add_filter("RichText", &["json"])
        .add_filter("Text", &["txt"])
        .add_filter("Markdown", &["md"])
        .pick_file()
    {
        let result = load_file_from_path(&path)?;
        state.set_tab_path(&active_tab, path.clone());
        state.set_tab_changed(&active_tab, false);
        return Ok(result);
    } else {
        println!("The operation was cancelled");
        return Err("The operation was cancelled".to_string());
    }
}
#[cfg(test)]
mod detection_tests {
    use super::*;

    fn rdocx_bytes() -> Vec<u8> {
        let nodes = vec![Node::Paragraph { alignment: None, children: vec![plain_text("hello")] }];
        encode_document_with_meta(&nodes, &DocumentMeta::default()).unwrap()
    }

    fn first_text(nodes: &[Node]) -> String {
        match &nodes[0] {
            Node::Paragraph { children, .. } => children[0].text.clone(),
            _ => panic!("expected a paragraph first"),
        }
    }

    #[test]
    fn opens_each_supported_format_under_its_own_name() {
        assert!(read_document(&rdocx_bytes(), "rdocx").is_ok());
        assert!(read_document(b"# Title\n\ntext", "md").is_ok());
        assert!(read_document(b"one\ntwo", "txt").is_ok());
        let json = br#"{"nodes":[{"type":"paragraph","children":[{"text":"x"}]}]}"#;
        assert!(read_document(json, "json").is_ok());
    }

    /// The bytes win over the name: a renamed RNotes document still opens as one.
    #[test]
    fn a_renamed_rdocx_opens_as_rdocx() {
        let (nodes, _) = read_document(&rdocx_bytes(), "txt").unwrap();
        assert_eq!(first_text(&nodes), "hello");
    }

    /// "Has the extension but is not valid" — the case the All filter has to catch.
    #[test]
    fn refuses_a_file_that_only_has_the_right_name() {
        assert_eq!(read_document(b"PK\x03\x04 zip bytes", "rdocx").unwrap_err(), NOT_A_DOCUMENT);
        assert_eq!(read_document(br#"{"name":"package","version":"1"}"#, "json").unwrap_err(), INVALID_JSON);
        assert_eq!(read_document(b"[{\"no\":\"type\"}]", "json").unwrap_err(), INVALID_JSON);
        // A PNG renamed to .txt: not UTF-8.
        assert_eq!(read_document(b"\x89PNG\r\n\x1a\n\0\0\0", "txt").unwrap_err(), NOT_A_DOCUMENT);
        // Valid UTF-8 with NULs: UTF-16 text, or a binary that happens to decode.
        assert_eq!(read_document(b"h\0e\0l\0l\0o\0", "md").unwrap_err(), NOT_A_DOCUMENT);
    }

    #[test]
    fn a_truncated_rdocx_is_reported_as_damaged_not_as_foreign() {
        let mut bytes = rdocx_bytes();
        bytes.truncate(6);
        assert_eq!(read_document(&bytes, "rdocx").unwrap_err(), DAMAGED_RDOCX);
    }

    /// A note that happens to start with the letters "RDC" is still a note.
    #[test]
    fn text_starting_with_the_magic_letters_stays_text() {
        let (nodes, _) = read_document(b"RDC meeting notes", "txt").unwrap();
        assert_eq!(first_text(&nodes), "RDC meeting notes");
    }

    /// Notepad writes a byte order mark; it must not end up as an invisible first character.
    #[test]
    fn a_byte_order_mark_is_dropped() {
        let (nodes, _) = read_document("\u{feff}hello".as_bytes(), "txt").unwrap();
        assert_eq!(first_text(&nodes), "hello");
    }

    /// Unknown names reach this through drag and drop. Only something that is unmistakably a document
    /// is accepted; arbitrary text (a .log, a .py) is not opened as a note.
    #[test]
    fn an_unknown_extension_needs_document_content() {
        assert!(read_document(&rdocx_bytes(), "bak").is_ok());
        assert!(read_document(br#"[{"type":"paragraph","children":[{"text":"x"}]}]"#, "").is_ok());
        assert_eq!(read_document(b"fn main() {}", "rs").unwrap_err(), NOT_A_DOCUMENT);
        assert_eq!(read_document(b"[]", "bak").unwrap_err(), NOT_A_DOCUMENT);
    }

    /// The old fallback read `<name>.json` instead of the file it was given. Through the real loader,
    /// an unknown extension reads the file it was handed and nothing else.
    #[test]
    fn the_loader_reads_the_path_it_was_given() {
        let dir = std::env::temp_dir().join("rnotes_detection_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("note.bak");
        std::fs::write(&path, rdocx_bytes()).unwrap();
        std::fs::remove_file(dir.join("note.json")).ok();

        let (nodes, name, _) = load_file_from_path(&path).unwrap();
        assert_eq!(first_text(&nodes), "hello");
        assert_eq!(name, "note");
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Slate needs a block to put the caret in.
    #[test]
    fn an_empty_text_file_still_yields_one_paragraph() {
        let dir = std::env::temp_dir().join("rnotes_detection_empty");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("empty.txt");
        std::fs::write(&path, "").unwrap();
        let (nodes, _, _) = load_file_from_path(&path).unwrap();
        assert_eq!(nodes.len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }
}
