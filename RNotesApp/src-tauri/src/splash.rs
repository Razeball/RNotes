use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{command, AppHandle, Manager, State};

/// Coordination between the splash window and main window.
/// The main window is created and hidden in the background with the splash windows in top of it.
/// The splash decide when to switch window and the main window just inform when the app is ready.
#[derive(Default)]
pub struct SplashState {
    is_main_ready: AtomicBool,
}

/// Called when the app is mounted
#[command]
pub fn main_window_ready(state: State<SplashState>) {
    state.is_main_ready.store(true, Ordering::SeqCst);
}

#[command]
pub fn is_main_window_ready(state: State<SplashState>) -> bool {
    state.is_main_ready.load(Ordering::SeqCst)
}

/// Shows the app and closes the splash. 
#[command]
pub fn close_splash_window(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
}
