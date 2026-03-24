use tauri::{command, AppHandle, Manager};
use std::path::PathBuf;
use rfd::FileDialog;

#[cfg(windows)]
fn webview_print_to_pdf(
    app: &AppHandle,
    path: &str,
    page_width: f64,
    page_height: f64,
    margin_top: f64,
    margin_bottom: f64,
    margin_left: f64,
    margin_right: f64,
) -> Result<(), String> {
    use std::sync::mpsc;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_7, ICoreWebView2Environment6,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{Interface, PCWSTR};

    let (tx, rx) = mpsc::channel::<Result<(), String>>();

    let path_owned = path.to_string();

    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    window
        .with_webview(move |webview| {
            let controller = webview.controller();
            let env = webview.environment();
            unsafe {
                let core = controller
                    .CoreWebView2()
                    .expect("Failed to get CoreWebView2");
                let core7: ICoreWebView2_7 =
                    core.cast().expect("Failed to cast to ICoreWebView2_7");

                
                let env6: ICoreWebView2Environment6 =
                    env.cast().expect("Failed to cast to ICoreWebView2Environment6");
                let settings = env6
                    .CreatePrintSettings()
                    .expect("Failed to create print settings");

                let _ = settings.SetPageWidth(page_width);
                let _ = settings.SetPageHeight(page_height);
                let _ = settings.SetMarginTop(margin_top);
                let _ = settings.SetMarginBottom(margin_bottom);
                let _ = settings.SetMarginLeft(margin_left);
                let _ = settings.SetMarginRight(margin_right);
                let _ = settings.SetShouldPrintHeaderAndFooter(false);
                let _ = settings.SetShouldPrintBackgrounds(true);

                let path_wide: Vec<u16> =
                    path_owned.encode_utf16().chain(Some(0)).collect();

                let tx_clone = tx.clone();
                let handler =
                    PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
                        if success && result.is_ok() {
                            let _ = tx_clone.send(Ok(()));
                        } else {
                            let _ = tx_clone.send(Err(format!(
                                "PrintToPdf failed: {:?}",
                                result
                            )));
                        }
                        Ok(())
                    }));

                if let Err(e) = core7.PrintToPdf(
                    PCWSTR(path_wide.as_ptr()),
                    &settings,
                    &handler,
                ) {
                    let _ = tx.send(Err(format!("PrintToPdf call failed: {:?}", e)));
                }
            }
        })
        .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|_| "PDF export channel closed unexpectedly".to_string())?
}


#[command]
pub async fn export_to_pdf(
    app: AppHandle,
    page_width: f64,
    page_height: f64,
    margin_top: f64,
    margin_bottom: f64,
    margin_left: f64,
    margin_right: f64,
    document_name: Option<String>,
) -> Result<String, String> {
    let file_name = document_name
        .filter(|n| !n.is_empty())
        .map(|n| format!("{}.pdf", n))
        .unwrap_or_else(|| "document.pdf".to_string());

    let path = FileDialog::new()
        .set_title("Export as PDF")
        .set_directory(".")
        .set_file_name(&file_name)
        .add_filter("PDF Document", &["pdf"])
        .save_file()
        .ok_or("The operation was cancelled")?;

    let path_str = path
        .to_str()
        .ok_or("Invalid file path")?
        .to_string();

    #[cfg(windows)]
    webview_print_to_pdf(&app, &path_str, page_width, page_height, margin_top, margin_bottom, margin_left, margin_right)?;

    #[cfg(not(windows))]
    return Err("PDF export is only supported on Windows".to_string());

    Ok(format!("PDF exported to {:?}", path))
}


#[command]
pub async fn print_pdf(
    app: AppHandle,
    page_width: f64,
    page_height: f64,
    margin_top: f64,
    margin_bottom: f64,
    margin_left: f64,
    margin_right: f64,
) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("rnotes_print_{}.pdf", uuid::Uuid::new_v4()));
    let temp_path_str = temp_path
        .to_str()
        .ok_or("Invalid temp path")?
        .to_string();

    #[cfg(windows)]
    webview_print_to_pdf(&app, &temp_path_str, page_width, page_height, margin_top, margin_bottom, margin_left, margin_right)?;

    #[cfg(not(windows))]
    return Err("PDF printing is only supported on Windows".to_string());

    
    open_and_cleanup(app, temp_path).await
}

async fn open_and_cleanup(app: AppHandle, path: PathBuf) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let path_str = path
        .to_str()
        .ok_or("Invalid path")?
        .to_string();

    app.opener()
        .open_path(&path_str, None::<&str>)
        .map_err(|e| format!("Failed to open PDF: {}", e))?;

    
    let cleanup_path = path.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let _ = std::fs::remove_file(&cleanup_path);
    });

    Ok(())
}
