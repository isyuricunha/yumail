import type { Account, Mailbox, Message, MessageDetail } from "@yumail/mail";
import type { EntityId, IsoDateTime, ProviderType } from "@yumail/shared";

export interface Migration {
  version: number;
  name: string;
  path: string;
}

export const INITIAL_SCHEMA_VERSION = 2;

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    path: "packages/db/migrations/0001_initial_schema.sql"
  },
  {
    version: INITIAL_SCHEMA_VERSION,
    name: "message_detail_cache",
    path: "packages/db/migrations/0002_message_detail_cache.sql"
  }
];

export const requiredTables = [
  "accounts",
  "mailboxes",
  "messages",
  "message_bodies",
  "threads",
  "attachments",
  "ai_providers",
  "ai_summaries",
  "ai_tags",
  "ai_action_items",
  "ai_reply_drafts",
  "writing_style_profiles",
  "sync_states",
  "user_preferences"
] as const;

export type RequiredTable = (typeof requiredTables)[number];

export interface StoredJmapAccountConfig {
  account: Account;
  jmapBaseUrl: string;
  credentialReference: string;
  jmapAccountId?: string;
  sessionApiUrl?: string;
  lastConnectedAt?: IsoDateTime;
}

export interface ProviderSyncState {
  id: EntityId;
  accountId: EntityId;
  mailboxId?: EntityId;
  providerType: ProviderType;
  syncCursor?: string;
  syncStatus: "idle" | "syncing" | "error";
  lastSyncAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface MailMetadataSnapshot {
  accountConfigs: StoredJmapAccountConfig[];
  mailboxesByAccountId: Record<EntityId, Mailbox[]>;
  messagesByMailboxId: Record<EntityId, Message[]>;
  messageDetailsByCacheKey: Record<string, MessageDetail>;
  syncStates: ProviderSyncState[];
}

export interface MailMetadataRepository {
  loadSnapshot(): Promise<MailMetadataSnapshot>;
  listAccountConfigs(): Promise<StoredJmapAccountConfig[]>;
  saveAccountConfig(accountConfig: StoredJmapAccountConfig): Promise<void>;
  saveMailboxes(accountId: EntityId, mailboxes: Mailbox[]): Promise<void>;
  getMailboxes(accountId: EntityId): Promise<Mailbox[]>;
  saveMessages(mailboxId: EntityId, messages: Message[]): Promise<void>;
  getMessages(mailboxId: EntityId): Promise<Message[]>;
  saveMessageDetail(messageDetail: MessageDetail): Promise<void>;
  getMessageDetail(
    accountId: EntityId,
    providerMessageId: string
  ): Promise<MessageDetail | undefined>;
  saveSyncState(syncState: ProviderSyncState): Promise<void>;
}

export function createMessageDetailCacheKey(
  accountId: EntityId,
  providerMessageId: string
): string {
  return `${encodeURIComponent(accountId)}:${encodeURIComponent(providerMessageId)}`;
}

export function createEmptyMailMetadataSnapshot(): MailMetadataSnapshot {
  return {
    accountConfigs: [],
    mailboxesByAccountId: {},
    messagesByMailboxId: {},
    messageDetailsByCacheKey: {},
    syncStates: []
  };
}
