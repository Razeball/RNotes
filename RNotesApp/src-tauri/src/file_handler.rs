use crate::document_model::{Node, TextNode, DocumentMeta, TableRow, ListItemNode};
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

/// What a save or an export did.
///
/// Cancelling the dialog is neither a failure nor a success, so it is a case of its own rather than
/// the string "The operation was cancelled" smuggled through `Ok` — which every caller then had to
/// compare against, and which had drifted into four different conventions across the commands.
/// Failures stay in `Err`. Serialised as `{ "status": "saved", "path": … }`, `{ "status":
/// "cancelled" }` or `{ "status": "pdf" }`.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum SaveOutcome {
    Saved { path: String },
    Cancelled,
    /// Save As with the PDF type picked: the frontend renders the PDF itself.
    Pdf,
}

/// A file could not be written. Followed by the operating system's own reason, which Windows already
/// gives in the user's language.
pub const WRITE_FAILED: &str = "rnotes:write-failed:";
/// The document the frontend sent does not match the model. Followed by where, and why.
pub const INVALID_DOCUMENT: &str = "rnotes:invalid-document:";

/// Turns the document the frontend sent into nodes, and says exactly *where* it is wrong when it is.
///
/// Taking `Vec<Node>` as the command argument let Tauri deserialize it before the command ran, and an
/// unknown node type came back as "invalid args `document` for command `save_tab`: unknown variant
/// `foo`, expected one of …" — with no hint of which of a thousand nodes it was. Deserializing here
/// keeps the position, reported 1-based: "4 › 3 › 1" is the first child of the third child of the
/// fourth block.
pub(crate) fn parse_document(document: serde_json::Value) -> Result<Vec<Node>, String> {
    let serde_json::Value::Array(blocks) = document else {
        return Err(format!("{}|expected a list of blocks", INVALID_DOCUMENT));
    };
    let mut nodes = Vec::with_capacity(blocks.len());
    for (index, block) in blocks.into_iter().enumerate() {
        match serde_json::from_value::<Node>(block.clone()) {
            Ok(node) => nodes.push(node),
            Err(error) => return Err(locate_block_error(index, &block, error)),
        }
    }
    Ok(nodes)
}

/// Finds the exact spot inside a block that failed to deserialize.
///
/// `Node` is tagged by its `type`, so serde buffers the whole block to read the tag first, and the
/// position of anything wrong inside it is lost in that buffer — the error only says the block.
/// Its children are plain structs, though, and deserializing them on their own keeps the path. When
/// they are fine the problem is the block itself (its type, or one of its own fields), and the
/// block's own error is the right one to show.
fn locate_block_error(index: usize, block: &serde_json::Value, error: serde_json::Error) -> String {
    fn inner<T: serde::de::DeserializeOwned>(children: serde_json::Value) -> Option<(Vec<usize>, String)> {
        serde_path_to_error::deserialize::<_, Vec<T>>(children).err().map(|e| {
            let indices = e
                .path()
                .iter()
                .filter_map(|segment| match segment {
                    serde_path_to_error::Segment::Seq { index } => Some(*index),
                    _ => None,
                })
                .collect();
            (indices, e.inner().to_string())
        })
    }

    let children = block.get("children").cloned().unwrap_or(serde_json::Value::Null);
    let deeper = match block.get("type").and_then(|t| t.as_str()) {
        Some("table") => inner::<TableRow>(children),
        Some("ulist") | Some("olist") => inner::<ListItemNode>(children),
        Some(_) => inner::<TextNode>(children),
        None => None,
    };

    let (path, detail) = match deeper {
        Some((indices, detail)) => (std::iter::once(index).chain(indices).collect::<Vec<_>>(), detail),
        None => (vec![index], error.to_string()),
    };
    let position = path.iter().map(|i| (i + 1).to_string()).collect::<Vec<_>>().join(" › ");
    // serde follows an unknown variant with the full list of known ones; the name is the point. Only
    // that list goes — "expected a string" after a wrong type is the useful half of its message.
    let detail = detail.split(", expected one of").next().unwrap_or(&detail).to_string();
    format!("{}{}|{}", INVALID_DOCUMENT, position, detail)
}

/// The bytes a document is saved as, by the extension of the file it is going into.
fn encode_for_extension(extension: &str, document: &[Node], meta: &DocumentMeta) -> Result<Vec<u8>, String> {
    match extension {
        "txt" => Ok(extract_plain_text(document).into_bytes()),
        "md" => Ok(to_markdown(document).into_bytes()),
        "json" => {
            let wrapper = JsonDocumentWrapper { meta: meta.clone(), nodes: document.to_vec() };
            serde_json::to_string_pretty(&wrapper)
                .map(String::into_bytes)
                .map_err(|e| format!("Serialize error: {}", e))
        }
        _ => encode_document_with_meta(document, meta).map_err(|e| format!("Encode error: {}", e)),
    }
}

/// Writes `bytes` to `path` without ever leaving the file half-written.
///
/// `std::fs::write` truncates the file before it writes, so a disk that filled up halfway used to
/// destroy the previous version along with the new one. The bytes go to a temporary file in the same
/// folder first — the same volume, so the rename that follows is a single step — and replace the
/// document only once all of them are on disk. On failure the temporary file is removed and the
/// original is exactly as it was.
pub(crate) fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let failed = |e: std::io::Error| format!("{}{}", WRITE_FAILED, e);
    let folder = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "document".to_string());
    let temporary = folder.join(format!(".{}.rnotes-tmp", name));

    let written = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        // Replaces an existing file on Windows too (MoveFileExW with MOVEFILE_REPLACE_EXISTING).
        std::fs::rename(&temporary, path)
    })();

    if let Err(e) = written {
        let _ = std::fs::remove_file(&temporary);
        return Err(failed(e));
    }
    Ok(())
}

#[tauri::command]
pub fn save_tab(document: serde_json::Value, document_name: String, tab_id: String, meta: Option<DocumentMeta>, state: tauri::State<Config>) -> Result<SaveOutcome, String> {
    let document = parse_document(document)?;
    let meta = meta.unwrap_or_default();
    let info = state.get_tab_info(&tab_id).ok_or("Tab not found")?;
    let save_path = info.save_path;

    if save_path.as_os_str().is_empty() {
        return create_file_for_tab(&document, &meta, document_name, &tab_id, &state);
    }

    // An existing file keeps its format. One with a name RNotes does not write is saved as JSON,
    // which is what this has always done.
    // Written as a filter on purpose: clippy reads a `match` here as a hand-rolled `unwrap_or`, and
    // `unwrap_or("json")` would let ".bak" through to be saved in the binary format instead.
    let extension = save_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let extension = if DOCUMENT_EXTENSIONS.contains(&extension) { extension } else { "json" };
    write_atomically(&save_path, &encode_for_extension(extension, &document, &meta)?)?;
    state.set_tab_changed(&tab_id, false);
    Ok(SaveOutcome::Saved { path: save_path.to_string_lossy().to_string() })
}

#[tauri::command]
pub fn save_tab_as(document: serde_json::Value, document_name: String, tab_id: String, meta: Option<DocumentMeta>, state: tauri::State<Config>) -> Result<SaveOutcome, String> {
    let document = parse_document(document)?;
    let meta = meta.unwrap_or_default();
    create_file_for_tab(&document, &meta, document_name, &tab_id, &state)
}

#[tauri::command]
/// `all_label` is the caption of the combined filter, passed in by the frontend so it reads in the
/// user's language; the per-format captions are format names and stay as they are.
/// `None` when the dialog was cancelled, which is not an error.
pub fn open_in_tab(tab_id: String, all_label: Option<String>, state: tauri::State<Config>) -> Result<Option<(Vec<Node>, String, DocumentMeta)>, String> {
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
        Ok(Some(result))
    } else {
        Ok(None)
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

fn create_file_for_tab(document: &[Node], meta: &DocumentMeta, document_name: String, tab_id: &str, state: &tauri::State<Config>) -> Result<SaveOutcome, String> {
    let Some(mut path) = FileDialog::new()
        .set_title("Save File")
        .set_directory(".")
        .set_file_name(format!("{}.rdocx", document_name))
        .add_filter("RNotes Document", &["rdocx"])
        .add_filter("RichText", &["json"])
        .add_filter("Text", &["txt"])
        .add_filter("Markdown", &["md"])
        .add_filter("PDF Document", &["pdf"])
        .save_file()
    else {
        return Ok(SaveOutcome::Cancelled);
    };

    let extension = match path.extension().and_then(|e| e.to_str()) {
        Some("pdf") => return Ok(SaveOutcome::Pdf),
        Some(ext @ ("rdocx" | "txt" | "md" | "json")) => ext.to_string(),
        // No extension, or one RNotes does not write: it becomes an RNotes document.
        _ => {
            path.set_extension("rdocx");
            "rdocx".to_string()
        }
    };

    write_atomically(&path, &encode_for_extension(&extension, document, meta)?)?;

    // Only now. This used to happen before the write, so a failed write left the tab pointing at a
    // file that did not exist and marked as saved — and closing it would not have warned.
    state.set_tab_path(tab_id, path.clone());
    state.set_tab_changed(tab_id, false);
    Ok(SaveOutcome::Saved { path: path.to_string_lossy().to_string() })
}

#[tauri::command]
pub fn export_to_file(document: serde_json::Value, document_name: String, format: String, meta: Option<DocumentMeta>) -> Result<SaveOutcome, String> {
    let document = parse_document(document)?;
    let meta = meta.unwrap_or_default();
    let (filter_name, extension) = match format.as_str() {
        "txt" => ("Text", "txt"),
        "md" => ("Markdown", "md"),
        "json" => ("RichText", "json"),
        "rdocx" => ("RNotes Document", "rdocx"),
        _ => return Err(format!("Unsupported export format: {}", format)),
    };

    let Some(path) = FileDialog::new()
        .set_title(format!("Export as {}", filter_name))
        .set_directory(".")
        .set_file_name(format!("{}.{}", document_name, extension))
        .add_filter(filter_name, &[extension])
        .save_file()
    else {
        return Ok(SaveOutcome::Cancelled);
    };

    write_atomically(&path, &encode_for_extension(extension, &document, &meta)?)?;
    Ok(SaveOutcome::Saved { path: path.to_string_lossy().to_string() })
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

#[cfg(test)]
mod save_tests {
    use super::*;
    use serde_json::json;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rnotes_save_{name}"));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn leftovers(dir: &Path) -> Vec<String> {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".rnotes-tmp"))
            .collect()
    }

    /// The frontend reads `status`; the other fields only exist where they mean something.
    #[test]
    fn the_outcome_serialises_with_a_status_tag() {
        assert_eq!(serde_json::to_value(SaveOutcome::Cancelled).unwrap(), json!({ "status": "cancelled" }));
        assert_eq!(serde_json::to_value(SaveOutcome::Pdf).unwrap(), json!({ "status": "pdf" }));
        assert_eq!(
            serde_json::to_value(SaveOutcome::Saved { path: "notes/a.rdocx".into() }).unwrap(),
            json!({ "status": "saved", "path": "notes/a.rdocx" })
        );
    }

    #[test]
    fn a_valid_document_parses() {
        let doc = json!([{ "type": "paragraph", "children": [{ "text": "hola" }] }]);
        assert_eq!(parse_document(doc).unwrap().len(), 1);
    }

    fn located(error: String) -> (String, String) {
        assert!(error.starts_with(INVALID_DOCUMENT), "{error}");
        let (position, detail) = error[INVALID_DOCUMENT.len()..].split_once('|').unwrap();
        (position.to_string(), detail.to_string())
    }

    /// The point of the change: the message says which block, not just that one was wrong. Only the
    /// top level is a tagged enum — rows, cells and list items are structs — so this is where an
    /// unknown `type` can fail.
    #[test]
    fn an_unknown_block_type_is_reported_with_its_position() {
        let doc = json!([
            { "type": "paragraph", "children": [{ "text": "a" }] },
            { "type": "paragraph", "children": [{ "text": "b" }] },
            { "type": "mystery", "children": [{ "text": "?" }] }
        ]);
        let (position, detail) = located(parse_document(doc).unwrap_err());
        assert_eq!(position, "3");
        assert!(detail.contains("mystery"), "{detail}");
        assert!(!detail.contains("expected one of"), "the list of every variant is noise: {detail}");
    }

    /// Deep inside a table the path is what makes the message usable: block 2, row 1, cell 2, text 1.
    #[test]
    fn a_malformed_node_deep_in_a_table_is_located() {
        let doc = json!([
            { "type": "paragraph", "children": [{ "text": "a" }] },
            { "type": "table", "children": [
                { "type": "table-row", "children": [
                    { "type": "table-cell", "children": [{ "text": "ok" }] },
                    { "type": "table-cell", "children": [{ "text": 5 }] }
                ]}
            ]}
        ]);
        let (position, detail) = located(parse_document(doc).unwrap_err());
        assert_eq!(position, "2 › 1 › 2 › 1");
        assert!(detail.contains("invalid type") && detail.contains("expected a string"), "{detail}");
    }

    #[test]
    fn writes_and_replaces_a_file_leaving_nothing_behind() {
        let dir = temp_dir("replace");
        let path = dir.join("note.txt");
        write_atomically(&path, b"first").unwrap();
        write_atomically(&path, b"second").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"second");
        assert!(leftovers(&dir).is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// A write that cannot land must leave the previous version untouched — the case `fs::write`
    /// got wrong, since it empties the file before it writes.
    #[test]
    fn a_failed_write_keeps_the_previous_version() {
        let dir = temp_dir("failure");
        let path = dir.join("note.txt");
        std::fs::write(&path, b"precious").unwrap();

        // A directory where the temporary file has to go makes the write fail at the first step.
        std::fs::create_dir_all(dir.join(".note.txt.rnotes-tmp")).unwrap();
        let error = write_atomically(&path, b"new version").unwrap_err();

        assert!(error.starts_with(WRITE_FAILED), "{error}");
        assert_eq!(std::fs::read(&path).unwrap(), b"precious");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_missing_folder_is_an_error_not_a_panic() {
        let path = std::env::temp_dir().join("rnotes_no_such_folder_xyz").join("note.txt");
        assert!(write_atomically(&path, b"x").unwrap_err().starts_with(WRITE_FAILED));
    }

    #[test]
    fn each_extension_gets_its_own_bytes() {
        let doc = vec![Node::Paragraph { alignment: None, children: vec![plain_text("hola")] }];
        let meta = DocumentMeta::default();
        assert_eq!(encode_for_extension("txt", &doc, &meta).unwrap(), b"hola
");
        assert!(encode_for_extension("rdocx", &doc, &meta).unwrap().starts_with(b"RDC"));
        assert!(String::from_utf8(encode_for_extension("json", &doc, &meta).unwrap()).unwrap().contains("\"nodes\""));
    }
}
