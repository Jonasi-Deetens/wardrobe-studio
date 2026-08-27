use tauri::{Emitter, Listener, Manager};

/// Sent to the webview with the paths of any `.wardrobe` files the OS wants opened.
const OPEN_PROJECT_EVENT: &str = "open-project";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    /*
     * Double-clicking a project must reuse the window that is already open.
     *
     * Without this, a second process starts with its own empty design and the first window
     * still shows the old one — and on Windows the file path only ever arrives as an argument
     * to that second process, so it has to be forwarded here.
     */
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = project_paths(&argv);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                if !paths.is_empty() {
                    let _ = window.emit(OPEN_PROJECT_EVENT, paths);
                }
            }
        }));
    }

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            /*
             * A cold start opened from a file gets the path on the command line. The webview
             * is not listening yet, so this waits for it to say it is ready rather than
             * emitting into nothing.
             */
            let paths = project_paths(&std::env::args().collect::<Vec<_>>());
            if !paths.is_empty() {
                let handle = app.handle().clone();
                /* Once, not on every announcement: the webview says it is ready again after a
                   reload, and reopening the file then would throw away whatever is on screen. */
                app.once_any("app-ready", move |_| {
                    let _ = handle.emit(OPEN_PROJECT_EVENT, paths);
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Picks the openable files out of a process argument list, ignoring flags and the exe path.
fn project_paths(argv: &[String]) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter(|arg| std::path::Path::new(arg).is_file())
        .cloned()
        .collect()
}
