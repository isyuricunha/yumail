const LEGACY_STORAGE_KEYS = [
  "yumail.development-secrets.v1",
  "yumail.mail-metadata.v1"
] as const;

export function purgeLegacyBrowserStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Browser storage can be unavailable under restrictive webview policies.
  }
}
