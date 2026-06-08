import {
  createAiProviderSettingsService,
  createComposeService,
  createMailAccountService,
  createThreadSummaryService,
  createThreadReadingService
} from "@yumail/core";
import {
  SqliteAiProviderRepository,
  SqliteAiSummaryRepository,
  SqliteMailMetadataRepository
} from "@yumail/db";
import { createTauriPlatformAdapters } from "@yumail/platform-tauri";

export const DESKTOP_SECURE_STORAGE_STATUS =
  "Credentials are stored by the operating system credential manager.";

export function createDesktopMailServices() {
  const platformAdapters = createTauriPlatformAdapters();
  const metadataRepository = new SqliteMailMetadataRepository(
    () => platformAdapters.database.openYuMailDatabase()
  );
  const aiProviderRepository = new SqliteAiProviderRepository(
    () => platformAdapters.database.openYuMailDatabase()
  );
  const aiSummaryRepository = new SqliteAiSummaryRepository(
    () => platformAdapters.database.openYuMailDatabase()
  );
  const secretStorage = platformAdapters.secureStorage;

  return {
    aiProviderSettingsService: createAiProviderSettingsService({
      providerRepository: aiProviderRepository,
      secretStorage,
      fetch: platformAdapters.http.fetch
    }),
    threadSummaryService: createThreadSummaryService({
      providerRepository: aiProviderRepository,
      summaryRepository: aiSummaryRepository,
      secretStorage,
      fetch: platformAdapters.http.fetch
    }),
    accountService: createMailAccountService({
      metadataRepository,
      secretStorage,
      fetch: platformAdapters.http.fetch
    }),
    threadReadingService: createThreadReadingService({
      metadataRepository,
      secretStorage,
      fetch: platformAdapters.http.fetch
    }),
    composeService: createComposeService({
      metadataRepository,
      secretStorage,
      fetch: platformAdapters.http.fetch
    })
  };
}
