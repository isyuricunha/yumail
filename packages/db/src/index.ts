import type { Account, Mailbox, Message } from "@yumail/mail";
import type { EntityId, IsoDateTime, ProviderType } from "@yumail/shared";

export interface Migration {
  version: number;
  name: string;
  path: string;
}

export const INITIAL_SCHEMA_VERSION = 1;

export const migrations: Migration[] = [
  {
    version: INITIAL_SCHEMA_VERSION,
    name: "initial_schema",
    path: "packages/db/migrations/0001_initial_schema.sql"
  }
];

export const requiredTables = [
  "accounts",
  "mailboxes",
  "messages",
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
  saveSyncState(syncState: ProviderSyncState): Promise<void>;
}

export function createEmptyMailMetadataSnapshot(): MailMetadataSnapshot {
  return {
    accountConfigs: [],
    mailboxesByAccountId: {},
    messagesByMailboxId: {},
    syncStates: []
  };
}
