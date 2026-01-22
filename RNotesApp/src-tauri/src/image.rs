use crate::config::Config;
use std::path::PathBuf;
use rfd::FileDialog;
use std::io::Cursor;
use uuid::Uuid;
use arboard::Clipboard;
use image::ImageFormat;

pub fn get_images_dir(save_path: &PathBuf) -> Result<PathBuf, String> {
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
pub fn insert_image_from_file(state: tauri::State<Config>) -> Result<String, String> {
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
pub fn insert_image_from_clipboard(state: tauri::State<Config>) -> Result<String, String> {
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
