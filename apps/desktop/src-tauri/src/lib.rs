use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::{Manager, Runtime};
use tauri_plugin_sql::{Migration, MigrationKind};

const CREDENTIAL_SERVICE: &str = "com.yumail.desktop";
const DATABASE_URL: &str = "sqlite:yumail.sqlite3";

#[derive(Deserialize)]
struct NotificationInput {
    title: String,
    body: String,
}

#[derive(Deserialize)]
struct HttpHeaderInput {
    name: String,
    value: String,
}

#[derive(Deserialize)]
struct HttpRequestInput {
    url: String,
    method: String,
    headers: Vec<HttpHeaderInput>,
    body: Option<String>,
}

#[derive(Serialize)]
struct HttpHeaderOutput {
    name: String,
    value: String,
}

#[derive(Serialize)]
struct HttpResponseOutput {
    status: u16,
    url: String,
    headers: Vec<HttpHeaderOutput>,
    body: String,
}

#[tauri::command]
fn secure_storage_get(reference: String) -> Result<Option<String>, String> {
    let entry = credential_entry(&reference)?;

    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Could not read the credential from secure storage: {error}"
        )),
    }
}

#[tauri::command]
fn secure_storage_set(reference: String, value: String) -> Result<(), String> {
    let entry = credential_entry(&reference)?;
    entry
        .set_password(&value)
        .map_err(|error| format!("Could not save the credential in secure storage: {error}"))
}

#[tauri::command]
fn secure_storage_delete(reference: String) -> Result<(), String> {
    let entry = credential_entry(&reference)?;

    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Could not delete the credential from secure storage: {error}"
        )),
    }
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
async fn http_fetch(input: HttpRequestInput) -> Result<HttpResponseOutput, String> {
    let method = input
        .method
        .parse::<reqwest::Method>()
        .map_err(|error| format!("Invalid HTTP method: {error}"))?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Could not create HTTP client: {error}"))?;
    let mut request = client.request(method, &input.url);

    for header in input.headers {
        if header.name.contains(['\r', '\n']) || header.value.contains(['\r', '\n']) {
            return Err("HTTP headers must not contain newline characters.".to_string());
        }

        request = request.header(header.name, header.value);
    }

    if let Some(body) = input.body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("HTTP request failed: {error}"))?;
    let status = response.status().as_u16();
    let url = response.url().to_string();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value.to_str().ok().map(|header_value| HttpHeaderOutput {
                name: name.as_str().to_string(),
                value: header_value.to_string(),
            })
        })
        .collect::<Vec<_>>();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read HTTP response body: {error}"))?;

    Ok(HttpResponseOutput {
        status,
        url,
        headers,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
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
        .app_config_dir()
        .map(|path| path.join("yumail.sqlite3").to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

fn credential_entry(reference: &str) -> Result<Entry, String> {
    if reference.trim().is_empty() {
        return Err("Credential reference must not be empty.".to_string());
    }

    Entry::new(CREDENTIAL_SERVICE, reference)
        .map_err(|error| format!("Could not access the operating system credential store: {error}"))
}

fn database_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../../../../packages/db/migrations/0001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "message_detail_cache",
            sql: include_str!("../../../../packages/db/migrations/0002_message_detail_cache.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "jmap_account_configs",
            sql: include_str!("../../../../packages/db/migrations/0003_jmap_account_configs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "local_drafts",
            sql: include_str!("../../../../packages/db/migrations/0004_local_drafts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "jmap_session_url",
            sql: include_str!("../../../../packages/db/migrations/0005_jmap_session_url.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_database_migrations_in_order() {
        let migrations = database_migrations();
        let versions = migrations
            .iter()
            .map(|migration| migration.version)
            .collect::<Vec<_>>();

        assert_eq!(versions, vec![1, 2, 3, 4, 5]);
        assert!(migrations.iter().all(|migration| !migration.sql.is_empty()));
    }

    #[test]
    fn rejects_empty_credential_references() {
        assert!(credential_entry("  ").is_err());
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, database_migrations())
                .build(),
        )
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
            http_fetch,
            app_storage_data_dir,
            app_storage_database_path
        ])
        .run(tauri::generate_context!())
        .expect("failed to run YuMail desktop app");
}
