import { invoke } from "@tauri-apps/api/core";

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

export interface TauriPlatformAdapters {
  secureStorage: SecureStorageAdapter;
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
