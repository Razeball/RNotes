use crate::file_handler::DOCUMENT_EXTENSIONS;
use crate::image::image_extension_of;
use serde::Serialize;
use std::io::Read;
use std::path::Path;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DropKind {
    /// Opens in a tab of its own.
    Document,
    /// Goes into the document that was active when it was dropped.
    Image,
    /// Neither; reported and left alone.
    Unsupported,
}

#[derive(Serialize)]
pub struct DroppedFile {
    pub path: String,
    pub name: String,
    pub kind: DropKind,
}

const HEADER_LEN: u64 = 64;

pub fn classify(name: &str, header: &[u8], is_file: bool) -> DropKind {
    if !is_file {
        return DropKind::Unsupported;
    }
    if image_extension_of(header).is_some() {
        return DropKind::Image;
    }
    let extension = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if header.starts_with(b"RDC") || DOCUMENT_EXTENSIONS.contains(&extension.as_str()) {
        return DropKind::Document;
    }
    DropKind::Unsupported
}

#[tauri::command]
pub fn classify_dropped_files(paths: Vec<String>) -> Vec<DroppedFile> {
    paths
        .into_iter()
        .map(|path| {
            let p = Path::new(&path);
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            let is_file = p.is_file();
            let mut header = Vec::new();
            if is_file {
                if let Ok(file) = std::fs::File::open(p) {
                    let _ = file.take(HEADER_LEN).read_to_end(&mut header);
                }
            }
            let kind = classify(&name, &header, is_file);
            DroppedFile { path, name, kind }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
    const JPEG: &[u8] = b"\xFF\xD8\xFF\xE0\0\x10JFIF";

    #[test]
    fn images_are_recognised_by_content_whatever_they_are_called() {
        assert_eq!(classify("photo.png", PNG, true), DropKind::Image);
        assert_eq!(classify("photo.txt", JPEG, true), DropKind::Image);
        assert_eq!(image_extension_of(JPEG), Some("jpg"));
    }

    #[test]
    fn documents_are_recognised_by_name_or_by_magic() {
        assert_eq!(classify("notes.md", b"# hi", true), DropKind::Document);
        assert_eq!(classify("NOTES.TXT", b"hi", true), DropKind::Document);
        assert_eq!(classify("backup.bak", b"RDC\x04", true), DropKind::Document);
    }

    #[test]
    fn everything_else_is_turned_away() {
        assert_eq!(classify("setup.exe", b"MZ\x90\0", true), DropKind::Unsupported);
        assert_eq!(classify("archive.zip", b"PK\x03\x04", true), DropKind::Unsupported);
        assert_eq!(classify("folder", b"", false), DropKind::Unsupported);
    }

    #[test]
    fn content_beats_a_misleading_name() {
        assert_eq!(classify("picture.md", PNG, true), DropKind::Image);
    }
}
