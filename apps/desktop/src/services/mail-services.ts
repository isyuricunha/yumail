import { createMailAccountService, createThreadReadingService } from "@yumail/core";
import { LocalMailMetadataRepository } from "./local-mail-metadata-repository";
import { createDesktopSecureStorageAdapter } from "./development-secure-storage";

export function createDesktopMailServices() {
  const metadataRepository = new LocalMailMetadataRepository();
  const secretStorage = createDesktopSecureStorageAdapter();

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
