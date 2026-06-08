use serde::Deserialize;
use tauri::{Manager, Runtime};

#[derive(Deserialize)]
struct NotificationInput {
    title: String,
    body: String,
}

#[tauri::command]
fn secure_storage_get(_reference: String) -> Result<Option<String>, String> {
    Err("Secure storage adapter is not configured yet.".to_string())
}

#[tauri::command]
fn secure_storage_set(_reference: String, _value: String) -> Result<(), String> {
    Err("Secure storage adapter is not configured yet.".to_string())
}

#[tauri::command]
fn secure_storage_delete(_reference: String) -> Result<(), String> {
    Err("Secure storage adapter is not configured yet.".to_string())
}

#[tauri::command]
fn filesystem_read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn filesystem_write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn filesystem_ensure_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn notifications_notify(input: NotificationInput) -> Result<(), String> {
    let _ = (input.title, input.body);
    Ok(())
}

#[tauri::command]
fn opener_open_external_url(url: String) -> Result<(), String> {
    let _ = url;
    Ok(())
}

#[tauri::command]
fn opener_open_path(path: String) -> Result<(), String> {
    let _ = path;
    Ok(())
}

#[tauri::command]
fn app_storage_data_dir<R: Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn app_storage_database_path<R: Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("yumail.sqlite3").to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            secure_storage_get,
            secure_storage_set,
            secure_storage_delete,
            filesystem_read_text_file,
            filesystem_write_text_file,
            filesystem_ensure_directory,
            notifications_notify,
            opener_open_external_url,
            opener_open_path,
            app_storage_data_dir,
            app_storage_database_path
        ])
        .run(tauri::generate_context!())
        .expect("failed to run YuMail desktop app");
}
