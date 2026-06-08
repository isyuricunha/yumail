import type {
  MailMetadataRepository,
  MailMetadataSnapshot,
  ProviderSyncState,
  StoredJmapAccountConfig
} from "@yumail/db";
import { createEmptyMailMetadataSnapshot } from "@yumail/db";
import type { Mailbox, Message } from "@yumail/mail";
import type { EntityId } from "@yumail/shared";

const MAIL_METADATA_KEY = "yumail.mail-metadata.v1";

function readSnapshot(): MailMetadataSnapshot {
  const rawValue = localStorage.getItem(MAIL_METADATA_KEY);

  if (!rawValue) {
    return createEmptyMailMetadataSnapshot();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<MailMetadataSnapshot>;

    return {
      accountConfigs: Array.isArray(parsedValue.accountConfigs) ? parsedValue.accountConfigs : [],
      mailboxesByAccountId: parsedValue.mailboxesByAccountId ?? {},
      messagesByMailboxId: parsedValue.messagesByMailboxId ?? {},
      syncStates: Array.isArray(parsedValue.syncStates) ? parsedValue.syncStates : []
    };
  } catch {
    return createEmptyMailMetadataSnapshot();
  }
}

function writeSnapshot(snapshot: MailMetadataSnapshot) {
  localStorage.setItem(MAIL_METADATA_KEY, JSON.stringify(snapshot));
}

export class LocalMailMetadataRepository implements MailMetadataRepository {
  async loadSnapshot(): Promise<MailMetadataSnapshot> {
    return readSnapshot();
  }

  async listAccountConfigs(): Promise<StoredJmapAccountConfig[]> {
    return readSnapshot().accountConfigs;
  }

  async saveAccountConfig(accountConfig: StoredJmapAccountConfig): Promise<void> {
    const snapshot = readSnapshot();
    const accountConfigs = snapshot.accountConfigs.filter(
      (candidate) => candidate.account.id !== accountConfig.account.id
    );

    writeSnapshot({
      ...snapshot,
      accountConfigs: [accountConfig, ...accountConfigs]
    });
  }

  async saveMailboxes(accountId: EntityId, mailboxes: Mailbox[]): Promise<void> {
    const snapshot = readSnapshot();

    writeSnapshot({
      ...snapshot,
      mailboxesByAccountId: {
        ...snapshot.mailboxesByAccountId,
        [accountId]: mailboxes
      }
    });
  }

  async getMailboxes(accountId: EntityId): Promise<Mailbox[]> {
    return readSnapshot().mailboxesByAccountId[accountId] ?? [];
  }

  async saveMessages(mailboxId: EntityId, messages: Message[]): Promise<void> {
    const snapshot = readSnapshot();

    writeSnapshot({
      ...snapshot,
      messagesByMailboxId: {
        ...snapshot.messagesByMailboxId,
        [mailboxId]: messages
      }
    });
  }

  async getMessages(mailboxId: EntityId): Promise<Message[]> {
    return readSnapshot().messagesByMailboxId[mailboxId] ?? [];
  }

  async saveSyncState(syncState: ProviderSyncState): Promise<void> {
    const snapshot = readSnapshot();
    const syncStates = snapshot.syncStates.filter((candidate) => candidate.id !== syncState.id);

    writeSnapshot({
      ...snapshot,
      syncStates: [syncState, ...syncStates]
    });
  }
}
