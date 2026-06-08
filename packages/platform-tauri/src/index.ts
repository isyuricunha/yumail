import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

export interface SecureStorageAdapter {
  getSecret(reference: string): Promise<string | null>;
  setSecret(reference: string, value: string): Promise<void>;
  deleteSecret(reference: string): Promise<void>;
}

export interface FileSystemAdapter {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
}

export interface NotificationAdapter {
  notify(input: NotificationInput): Promise<void>;
}

export interface NotificationInput {
  title: string;
  body: string;
}

export interface OpenerAdapter {
  openExternalUrl(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
}

export interface AppStorageAdapter {
  getAppDataDir(): Promise<string>;
  getDatabasePath(): Promise<string>;
}

export interface SqlExecutionResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlDatabaseAdapter {
  execute(query: string, bindValues?: unknown[]): Promise<SqlExecutionResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
}

export interface DatabaseAdapter {
  openYuMailDatabase(): Promise<SqlDatabaseAdapter>;
}

export interface TauriPlatformAdapters {
  secureStorage: SecureStorageAdapter;
  database: DatabaseAdapter;
  filesystem: FileSystemAdapter;
  notifications: NotificationAdapter;
  opener: OpenerAdapter;
  appStorage: AppStorageAdapter;
}

export function createTauriPlatformAdapters(): TauriPlatformAdapters {
  return {
    secureStorage: {
      getSecret: (reference) => invoke<string | null>("secure_storage_get", { reference }),
      setSecret: (reference, value) => invoke<void>("secure_storage_set", { reference, value }),
      deleteSecret: (reference) => invoke<void>("secure_storage_delete", { reference })
    },
    database: {
      async openYuMailDatabase() {
        const database = await Database.load("sqlite:yumail.sqlite3");

        return {
          execute: (query, bindValues) => database.execute(query, bindValues),
          select: <T>(query: string, bindValues?: unknown[]) => (
            database.select<T[]>(query, bindValues)
          )
        };
      }
    },
    filesystem: {
      readTextFile: (path) => invoke<string>("filesystem_read_text_file", { path }),
      writeTextFile: (path, contents) => invoke<void>("filesystem_write_text_file", { path, contents }),
      ensureDirectory: (path) => invoke<void>("filesystem_ensure_directory", { path })
    },
    notifications: {
      notify: (input) => invoke<void>("notifications_notify", { input })
    },
    opener: {
      openExternalUrl: (url) => invoke<void>("opener_open_external_url", { url }),
      openPath: (path) => invoke<void>("opener_open_path", { path })
    },
    appStorage: {
      getAppDataDir: () => invoke<string>("app_storage_data_dir"),
      getDatabasePath: () => invoke<string>("app_storage_database_path")
    }
  };
}
