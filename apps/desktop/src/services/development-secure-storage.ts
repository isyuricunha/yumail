import type { SecretStorageAdapter } from "@yumail/core";
import { createTauriPlatformAdapters } from "@yumail/platform-tauri";

const DEVELOPMENT_SECRETS_KEY = "yumail.development-secrets.v1";

export const DEVELOPMENT_SECURE_STORAGE_WARNING =
  "Development credential storage is active. Secrets are stored in browser localStorage until an OS keychain or Stronghold adapter is configured.";

let warned = false;

function warnDevelopmentStorage() {
  if (!warned) {
    console.warn(DEVELOPMENT_SECURE_STORAGE_WARNING);
    warned = true;
  }
}

function readSecrets(): Record<string, string> {
  const rawValue = localStorage.getItem(DEVELOPMENT_SECRETS_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    return typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue)
      ? Object.fromEntries(
        Object.entries(parsedValue).filter((entry): entry is [string, string] => (
          typeof entry[0] === "string" && typeof entry[1] === "string"
        ))
      )
      : {};
  } catch {
    return {};
  }
}

function writeSecrets(secrets: Record<string, string>) {
  localStorage.setItem(DEVELOPMENT_SECRETS_KEY, JSON.stringify(secrets));
}

function createDevelopmentSecureStorageAdapter(): SecretStorageAdapter {
  return {
    async getSecret(reference) {
      warnDevelopmentStorage();
      return readSecrets()[reference] ?? null;
    },
    async setSecret(reference, value) {
      warnDevelopmentStorage();
      writeSecrets({
        ...readSecrets(),
        [reference]: value
      });
    },
    async deleteSecret(reference) {
      warnDevelopmentStorage();
      const secrets = readSecrets();
      delete secrets[reference];
      writeSecrets(secrets);
    }
  };
}

export function createDesktopSecureStorageAdapter(): SecretStorageAdapter {
  const tauriSecureStorage = createTauriPlatformAdapters().secureStorage;
  const developmentStorage = createDevelopmentSecureStorageAdapter();

  return {
    async getSecret(reference) {
      try {
        return await tauriSecureStorage.getSecret(reference);
      } catch {
        return developmentStorage.getSecret(reference);
      }
    },
    async setSecret(reference, value) {
      try {
        await tauriSecureStorage.setSecret(reference, value);
      } catch {
        await developmentStorage.setSecret(reference, value);
      }
    },
    async deleteSecret(reference) {
      try {
        await tauriSecureStorage.deleteSecret(reference);
      } catch {
        await developmentStorage.deleteSecret(reference);
      }
    }
  };
}
