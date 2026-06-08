import { createMailAccountService } from "@yumail/core";
import { LocalMailMetadataRepository } from "./local-mail-metadata-repository";
import { createDesktopSecureStorageAdapter } from "./development-secure-storage";

export function createDesktopMailAccountService() {
  return createMailAccountService({
    metadataRepository: new LocalMailMetadataRepository(),
    secretStorage: createDesktopSecureStorageAdapter()
  });
}
