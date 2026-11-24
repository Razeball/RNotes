use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use rfd::FileDialog;
use serde::{Deserialize, Serialize};

use crate::config::strip_bom;
use crate::file_handler::write_atomically;

const FONT_EXTENSIONS: [&str; 2] = ["ttf", "otf"];
const LIBRARY_FILE: &str = "library.json";

/// One file of an imported family, stored relative to the fonts directory.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StoredFace {
    pub file: String,
    pub weight_min: u16,
    pub weight_max: u16,
    pub italic: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StoredFamily {
    pub name: String,
    pub faces: Vec<StoredFace>,
}

/// `library.json`. `enabled` is `None` until the user first accepts the font window, and the
/// frontend then applies its own defaults — the list of what RNotes always offered lives there.
#[derive(Serialize, Deserialize, Default, Debug, PartialEq)]
pub struct FontLibrary {
    #[serde(default)]
    pub enabled: Option<Vec<String>>,
    #[serde(default)]
    pub families: Vec<StoredFamily>,
}

/// What the frontend receives: the same library with every face as an absolute path, ready for
/// `convertFileSrc`.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FaceView {
    pub path: String,
    pub weight_min: u16,
    pub weight_max: u16,
    pub italic: bool,
}

#[derive(Serialize, Debug)]
pub struct FamilyView {
    pub name: String,
    pub faces: Vec<FaceView>,
}

#[derive(Serialize, Debug)]
pub struct LibraryView {
    pub enabled: Option<Vec<String>>,
    pub families: Vec<FamilyView>,
}

/// What an import did. `skipped` names the files that are not fonts RNotes can read.
#[derive(Serialize, Debug, Default, PartialEq)]
pub struct ImportReport {
    pub added: Vec<String>,
    pub skipped: Vec<String>,
}

/// What a font file says about itself.
#[derive(Debug, PartialEq)]
pub struct ParsedFace {
    pub family: String,
    pub weight_min: u16,
    pub weight_max: u16,
    pub italic: bool,
}

fn fonts_dir() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("RNotesApp");
    path.push("fonts");
    path
}

fn read_library(dir: &Path) -> FontLibrary {
    fs::read_to_string(dir.join(LIBRARY_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(strip_bom(&text)).ok())
        .unwrap_or_default()
}

fn write_library(dir: &Path, library: &FontLibrary) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_vec_pretty(library).map_err(|e| e.to_string())?;
    write_atomically(&dir.join(LIBRARY_FILE), &json)
}

/// The family name a font declares: the typographic family (name ID 16) when present, which is
/// the one that groups "Foo Light" and "Foo Bold" under "Foo", otherwise the legacy family (ID 1).
/// English is preferred, then any record that decodes.
fn family_name(face: &ttf_parser::Face) -> Option<String> {
    const ENGLISH_US: u16 = 0x0409;
    for id in [ttf_parser::name_id::TYPOGRAPHIC_FAMILY, ttf_parser::name_id::FAMILY] {
        let records: Vec<_> = face.names().into_iter().filter(|name| name.name_id == id).collect();
        let decoded = records
            .iter()
            .filter(|name| name.language_id == ENGLISH_US)
            .chain(records.iter())
            .find_map(|name| name.to_string())
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty());
        if decoded.is_some() {
            return decoded;
        }
    }
    None
}

/// Reads one font file. A variable font reports the range of its `wght` axis, so a single file
/// can stand for every weight of its family.
pub fn parse_font(data: &[u8]) -> Option<ParsedFace> {
    let face = ttf_parser::Face::parse(data, 0).ok()?;
    let family = family_name(&face)?;
    let weight = face.weight().to_number();
    let (weight_min, weight_max) = face
        .variation_axes()
        .into_iter()
        .find(|axis| axis.tag == ttf_parser::Tag::from_bytes(b"wght"))
        .map(|axis| (axis.min_value.round() as u16, axis.max_value.round() as u16))
        .unwrap_or((weight, weight));
    Some(ParsedFace { family, weight_min, weight_max, italic: face.is_italic() || face.is_oblique() })
}

fn is_font_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| FONT_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Every font file under `dir`, at any depth: downloaded families usually keep their static
/// weights in a `static/` subfolder.
pub fn font_files_in(dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut pending = vec![dir.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(entries) = fs::read_dir(&current) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if is_font_file(&path) {
                found.push(path);
            }
        }
    }
    found.sort();
    found
}

/// A family name as a folder name: anything Windows refuses in a path becomes `_`.
fn folder_for(family: &str) -> String {
    let cleaned: String = family
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').to_string();
    if cleaned.is_empty() { "font".to_string() } else { cleaned }
}

/// Copies `sources` into `dir` and records them in `library`. Pure apart from the file system, so
/// the tests can run it against a temporary directory.
///
/// A face that is already in the family (same weight range and style) is not added twice, which
/// makes importing the same folder again harmless. Two different files with the same name in one
/// family get a numbered name rather than overwriting each other.
pub fn import_into(dir: &Path, library: &mut FontLibrary, sources: &[PathBuf]) -> ImportReport {
    let mut report = ImportReport::default();
    let mut added = BTreeSet::new();

    for source in sources {
        let display = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let Some(parsed) = fs::read(source).ok().and_then(|data| parse_font(&data)) else {
            report.skipped.push(display);
            continue;
        };

        let index = match library.families.iter().position(|f| f.name.eq_ignore_ascii_case(&parsed.family)) {
            Some(index) => index,
            None => {
                library.families.push(StoredFamily { name: parsed.family.clone(), faces: Vec::new() });
                library.families.len() - 1
            }
        };
        let family = &mut library.families[index];
        let duplicate = family.faces.iter().any(|face| {
            face.weight_min == parsed.weight_min && face.weight_max == parsed.weight_max && face.italic == parsed.italic
        });
        if duplicate {
            continue;
        }

        let folder = folder_for(&family.name);
        let target_dir = dir.join(&folder);
        if fs::create_dir_all(&target_dir).is_err() {
            report.skipped.push(display);
            continue;
        }
        let stem = source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "font".into());
        let extension = source.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_else(|| "ttf".into());
        let mut file_name = format!("{stem}.{extension}");
        let mut counter = 2;
        while target_dir.join(&file_name).exists() {
            file_name = format!("{stem}-{counter}.{extension}");
            counter += 1;
        }
        if fs::copy(source, target_dir.join(&file_name)).is_err() {
            report.skipped.push(display);
            continue;
        }

        family.faces.push(StoredFace {
            file: format!("{folder}/{file_name}"),
            weight_min: parsed.weight_min,
            weight_max: parsed.weight_max,
            italic: parsed.italic,
        });
        added.insert(family.name.clone());
    }

    library.families.retain(|family| !family.faces.is_empty());
    report.added = added.into_iter().collect();
    report
}

/// Removes an imported family: its files, its entry, and its place in the toolbar's list.
pub fn remove_family(dir: &Path, library: &mut FontLibrary, name: &str) -> Result<(), String> {
    let Some(index) = library.families.iter().position(|f| f.name == name) else {
        return Err(format!("No imported font named {name}"));
    };
    let family = library.families.remove(index);
    for face in &family.faces {
        let _ = fs::remove_file(dir.join(&face.file));
    }
    let _ = fs::remove_dir(dir.join(folder_for(&family.name)));
    if let Some(enabled) = library.enabled.as_mut() {
        enabled.retain(|font| font != name);
    }
    Ok(())
}

fn view_of(dir: &Path, library: FontLibrary) -> LibraryView {
    LibraryView {
        enabled: library.enabled,
        families: library
            .families
            .into_iter()
            .map(|family| FamilyView {
                name: family.name,
                faces: family
                    .faces
                    .into_iter()
                    .map(|face| FaceView {
                        path: dir.join(&face.file).to_string_lossy().into_owned(),
                        weight_min: face.weight_min,
                        weight_max: face.weight_max,
                        italic: face.italic,
                    })
                    .collect(),
            })
            .collect(),
    }
}

#[tauri::command]
pub fn font_library() -> LibraryView {
    let dir = fonts_dir();
    view_of(&dir, read_library(&dir))
}

#[tauri::command]
pub fn set_enabled_fonts(enabled: Vec<String>) -> Result<(), String> {
    let dir = fonts_dir();
    let mut library = read_library(&dir);
    library.enabled = Some(enabled);
    write_library(&dir, &library)
}

/// Opens the picker — a folder, or one or more font files — and imports what it finds. `None`
/// when the dialog was cancelled. The title comes from the frontend so it is in the user's language.
#[tauri::command]
pub fn import_fonts(from_folder: bool, title: String, filter_label: String) -> Result<Option<ImportReport>, String> {
    let dialog = FileDialog::new().set_title(&title);
    let sources = if from_folder {
        match dialog.pick_folder() {
            Some(folder) => font_files_in(&folder),
            None => return Ok(None),
        }
    } else {
        match dialog.add_filter(&filter_label, &FONT_EXTENSIONS).pick_files() {
            Some(files) => files,
            None => return Ok(None),
        }
    };

    let dir = fonts_dir();
    let mut library = read_library(&dir);
    let report = import_into(&dir, &mut library, &sources);
    write_library(&dir, &library)?;
    Ok(Some(report))
}

#[tauri::command]
pub fn delete_font_family(name: String) -> Result<(), String> {
    let dir = fonts_dir();
    let mut library = read_library(&dir);
    remove_family(&dir, &mut library, &name)?;
    write_library(&dir, &library)
}

/// A system family as the font window lists it. `italic` says whether any of its faces is italic
/// or oblique; without one the webview would slant the upright face, which is not the font.
#[derive(Debug, Serialize)]
pub struct SystemFamily {
    pub name: String,
    pub italic: bool,
}

/// Every family installed on the system, by the English name the webview resolves. Scanning reads
/// the header of every font file, so it runs off the main thread.
#[tauri::command]
pub async fn system_fonts() -> Vec<SystemFamily> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        let mut families: BTreeMap<String, bool> = BTreeMap::new();
        for face in db.faces() {
            let Some((name, _)) = face.families.first() else { continue };
            let name = name.trim();
            // Windows lists vertical-text variants of CJK fonts as "@Name"; they are not for us.
            if name.is_empty() || name.starts_with('@') {
                continue;
            }
            *families.entry(name.to_string()).or_default() |= face.style != fontdb::Style::Normal;
        }
        families.into_iter().map(|(name, italic)| SystemFamily { name, italic }).collect()
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The five fonts RNotes bundles are real files in the repo: a static set and a variable one.
    fn bundled(relative: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/fonts").join(relative)
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rnotes-fonts-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_family_weight_and_style_from_the_file() {
        let bold_italic = parse_font(&fs::read(bundled("Arimo/static/Arimo-BoldItalic.ttf")).unwrap()).unwrap();
        assert_eq!(bold_italic, ParsedFace { family: "Arimo".into(), weight_min: 700, weight_max: 700, italic: true });

        let variable = parse_font(&fs::read(bundled("Arimo/Arimo-VariableFont_wght.ttf")).unwrap()).unwrap();
        // One file, the whole range of its `wght` axis rather than the single default weight.
        assert_eq!(variable, ParsedFace { family: "Arimo".into(), weight_min: 400, weight_max: 700, italic: false });
    }

    #[test]
    fn a_folder_becomes_one_family_per_font_with_its_variants() {
        let store = temp_dir("folder");
        let mut library = FontLibrary::default();
        let report = import_into(&store, &mut library, &font_files_in(&bundled("Arimo")));

        assert_eq!(report.added, vec!["Arimo".to_string()]);
        assert!(report.skipped.is_empty());
        assert_eq!(library.families.len(), 1);
        let faces = &library.families[0].faces;
        assert!(faces.iter().any(|f| f.weight_min == 700 && f.weight_max == 700 && f.italic));
        assert!(faces.iter().any(|f| f.weight_min == 400 && f.weight_max == 400 && !f.italic));
        for face in faces {
            assert!(store.join(&face.file).is_file(), "{} was not copied", face.file);
        }
        fs::remove_dir_all(store).ok();
    }

    #[test]
    fn importing_the_same_files_twice_adds_nothing() {
        let store = temp_dir("twice");
        let mut library = FontLibrary::default();
        let files = vec![bundled("Arimo/static/Arimo-Regular.ttf")];
        import_into(&store, &mut library, &files);
        let again = import_into(&store, &mut library, &files);

        assert!(again.added.is_empty());
        assert_eq!(library.families[0].faces.len(), 1);
        fs::remove_dir_all(store).ok();
    }

    #[test]
    fn a_file_that_is_not_a_font_is_skipped_by_name() {
        let store = temp_dir("skip");
        let fake = store.join("notes.ttf");
        fs::write(&fake, b"this is text, not a font").unwrap();
        let mut library = FontLibrary::default();
        let report = import_into(&store.join("lib"), &mut library, &[fake]);

        assert_eq!(report.skipped, vec!["notes.ttf".to_string()]);
        assert!(library.families.is_empty());
        fs::remove_dir_all(store).ok();
    }

    #[test]
    fn removing_a_family_deletes_its_files_and_unlists_it() {
        let store = temp_dir("remove");
        let mut library = FontLibrary { enabled: Some(vec!["Arial".into(), "Arimo".into()]), families: Vec::new() };
        import_into(&store, &mut library, &[bundled("Arimo/static/Arimo-Regular.ttf")]);
        let file = store.join(&library.families[0].faces[0].file);

        remove_family(&store, &mut library, "Arimo").unwrap();

        assert!(!file.exists());
        assert!(library.families.is_empty());
        assert_eq!(library.enabled, Some(vec!["Arial".to_string()]));
        fs::remove_dir_all(store).ok();
    }

    #[test]
    fn family_names_become_safe_folder_names() {
        assert_eq!(folder_for("Foo: Bar/Baz?"), "Foo_ Bar_Baz_");
        assert_eq!(folder_for("  ..  "), "font");
    }

    #[test]
    fn a_library_without_an_enabled_list_reads_as_none() {
        let library: FontLibrary = serde_json::from_str(r#"{"families":[]}"#).unwrap();
        assert_eq!(library.enabled, None);
    }
}
