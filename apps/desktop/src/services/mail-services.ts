import { createMailAccountService, createThreadReadingService } from "@yumail/core";
import { SqliteMailMetadataRepository } from "@yumail/db";
import { createTauriPlatformAdapters } from "@yumail/platform-tauri";

export const DESKTOP_SECURE_STORAGE_STATUS =
  "Credentials are stored by the operating system credential manager.";

export function createDesktopMailServices() {
  const platformAdapters = createTauriPlatformAdapters();
  const metadataRepository = new SqliteMailMetadataRepository(
    () => platformAdapters.database.openYuMailDatabase()
  );
  const secretStorage = platformAdapters.secureStorage;

  return {
    accountService: createMailAccountService({
      metadataRepository,
      secretStorage
    }),
    threadReadingService: createThreadReadingService({
      metadataRepository,
      secretStorage
    })
  };
}
