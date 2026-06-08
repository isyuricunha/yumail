import type { AiProviderConfiguration } from "@yumail/ai";
import type {
  Account,
  JmapAuthMode,
  LocalDraft,
  Mailbox,
  Message,
  MessageDetail
} from "@yumail/mail";
import type { EntityId, IsoDateTime, ProviderType } from "@yumail/shared";

export interface Migration {
  version: number;
  name: string;
  path: string;
}

export const INITIAL_SCHEMA_VERSION = 7;

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    path: "packages/db/migrations/0001_initial_schema.sql"
  },
  {
    version: 2,
    name: "message_detail_cache",
    path: "packages/db/migrations/0002_message_detail_cache.sql"
  },
  {
    version: 3,
    name: "jmap_account_configs",
    path: "packages/db/migrations/0003_jmap_account_configs.sql"
  },
  {
    version: 4,
    name: "local_drafts",
    path: "packages/db/migrations/0004_local_drafts.sql"
  },
  {
    version: 5,
    name: "jmap_session_url",
    path: "packages/db/migrations/0005_jmap_session_url.sql"
  },
  {
    version: 6,
    name: "jmap_auth_mode",
    path: "packages/db/migrations/0006_jmap_auth_mode.sql"
  },
  {
    version: INITIAL_SCHEMA_VERSION,
    name: "ai_provider_settings",
    path: "packages/db/migrations/0007_ai_provider_settings.sql"
  }
];

export const requiredTables = [
  "accounts",
  "jmap_account_configs",
  "mailboxes",
  "messages",
  "message_recipients",
  "message_bodies",
  "local_drafts",
  "threads",
  "attachments",
  "tags",
  "message_tags",
  "ai_providers",
  "prompt_versions",
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
  authMode: JmapAuthMode;
  authUsername?: string;
  jmapAccountId?: string;
  sessionUrl?: string;
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

export interface AccountRepository {
  listAccountConfigs(): Promise<StoredJmapAccountConfig[]>;
  saveAccountConfig(accountConfig: StoredJmapAccountConfig): Promise<void>;
}

export interface MailboxRepository {
  saveMailboxes(accountId: EntityId, mailboxes: Mailbox[]): Promise<void>;
  getMailboxes(accountId: EntityId): Promise<Mailbox[]>;
}

export interface MessageRepository {
  saveMessages(mailboxId: EntityId, messages: Message[]): Promise<void>;
  getMessages(mailboxId: EntityId): Promise<Message[]>;
}

export interface MessageDetailRepository {
  saveMessageDetail(messageDetail: MessageDetail): Promise<void>;
  getMessageDetail(
    accountId: EntityId,
    providerMessageId: string
  ): Promise<MessageDetail | undefined>;
}

export interface SyncStateRepository {
  listSyncStates(): Promise<ProviderSyncState[]>;
  saveSyncState(syncState: ProviderSyncState): Promise<void>;
}

export interface DraftRepository {
  listDrafts(accountId: EntityId): Promise<LocalDraft[]>;
  getDraft(draftId: EntityId): Promise<LocalDraft | undefined>;
  saveDraft(draft: LocalDraft): Promise<void>;
  deleteDraft(draftId: EntityId): Promise<void>;
}

export interface UserPreferenceRepository {
  getPreference<T>(key: string): Promise<T | undefined>;
  savePreference<T>(key: string, value: T): Promise<void>;
}

export interface AiProviderRepository {
  listAiProviders(): Promise<AiProviderConfiguration[]>;
  getDefaultAiProvider(): Promise<AiProviderConfiguration | undefined>;
  saveAiProvider(configuration: AiProviderConfiguration): Promise<void>;
}

export interface MailMetadataRepository
  extends AccountRepository,
  MailboxRepository,
  MessageRepository,
  MessageDetailRepository,
  SyncStateRepository,
  DraftRepository {
  loadSnapshot(): Promise<MailMetadataSnapshot>;
}

export interface SqlExecutionResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<SqlExecutionResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
}

export type SqlDatabaseFactory = () => Promise<SqlDatabase>;

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

export { SqliteMailMetadataRepository } from "./sqlite-mail-metadata-repository.js";
export { SqliteAiProviderRepository } from "./sqlite-ai-provider-repository.js";
