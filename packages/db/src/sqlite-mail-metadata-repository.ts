import type {
  Attachment,
  DraftMode,
  LocalDraft,
  Mailbox,
  MailboxRole,
  Message,
  MessageBodyPart,
  MessageDetail,
  Recipient
} from "@yumail/mail";
import { SYSTEM_TAGS } from "@yumail/shared";
import type { EntityId, ProviderType, SystemTag } from "@yumail/shared";
import type {
  MailMetadataRepository,
  MailMetadataSnapshot,
  ProviderSyncState,
  SqlDatabase,
  SqlDatabaseFactory,
  StoredJmapAccountConfig,
  UserPreferenceRepository
} from "./index";

interface AccountConfigRow {
  id: string;
  display_name: string;
  email_address: string;
  provider_type: string;
  provider_config_reference: string;
  is_default: number;
  created_at: string;
  updated_at: string;
  jmap_base_url: string;
  credential_reference: string;
  auth_mode: string;
  auth_username: string | null;
  jmap_account_id: string | null;
  session_url: string | null;
  session_api_url: string | null;
  last_connected_at: string | null;
}

interface MailboxRow {
  id: string;
  account_id: string;
  provider_mailbox_id: string;
  name: string;
  role: string;
  unread_count: number | null;
  total_count: number | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  account_id: string;
  provider_type: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  mailbox_id: string;
  message_id_header: string | null;
  in_reply_to_json: string;
  references_json: string;
  subject: string;
  from_name: string | null;
  from_address: string;
  date: string;
  received_at: string | null;
  snippet: string;
  is_read: number;
  is_flagged: number;
  is_answered: number;
  has_attachments: number;
  created_at: string;
  updated_at: string;
}

interface RecipientRow {
  recipient_type: "to" | "cc" | "bcc" | "reply-to";
  name: string | null;
  address: string;
}

interface TagRow {
  label: string;
  source: "system" | "user" | "ai-suggested";
}

interface MessageBodyRow {
  body_text: string | null;
  body_html_raw: string | null;
  body_parts_json: string;
}

interface MessageDetailKeyRow {
  account_id: string;
  provider_message_id: string;
}

interface AttachmentRow {
  id: string;
  message_id: string;
  provider_attachment_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_id: string | null;
}

interface SyncStateRow {
  id: string;
  account_id: string;
  mailbox_id: string | null;
  provider_type: string;
  sync_cursor: string | null;
  sync_status: "idle" | "syncing" | "error";
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PreferenceRow {
  value_json: string;
}

interface LocalDraftRow {
  id: string;
  account_id: string;
  mode: string;
  related_message_id: string | null;
  related_provider_message_id: string | null;
  related_provider_thread_id: string | null;
  related_message_id_header: string | null;
  references_json: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  subject: string;
  body_format: string;
  body_text: string;
  created_at: string;
  updated_at: string;
}

const ACCOUNT_CONFIG_SELECT = `
  SELECT
    accounts.id,
    accounts.display_name,
    accounts.email_address,
    accounts.provider_type,
    accounts.provider_config_reference,
    accounts.is_default,
    accounts.created_at,
    accounts.updated_at,
    jmap_account_configs.jmap_base_url,
    jmap_account_configs.credential_reference,
    jmap_account_configs.auth_mode,
    jmap_account_configs.auth_username,
    jmap_account_configs.jmap_account_id,
    jmap_account_configs.session_url,
    jmap_account_configs.session_api_url,
    jmap_account_configs.last_connected_at
  FROM accounts
  INNER JOIN jmap_account_configs
    ON jmap_account_configs.account_id = accounts.id
`;

const MESSAGE_SELECT = `
  SELECT
    id,
    account_id,
    provider_type,
    provider_message_id,
    provider_thread_id,
    mailbox_id,
    message_id_header,
    in_reply_to_json,
    references_json,
    subject,
    from_name,
    from_address,
    date,
    received_at,
    snippet,
    is_read,
    is_flagged,
    is_answered,
    has_attachments,
    created_at,
    updated_at
  FROM messages
`;

export class SqliteMailMetadataRepository
implements MailMetadataRepository, UserPreferenceRepository {
  private databasePromise?: Promise<SqlDatabase>;

  constructor(private readonly createDatabase: SqlDatabaseFactory) {}

  async loadSnapshot(): Promise<MailMetadataSnapshot> {
    const accountConfigs = await this.listAccountConfigs();
    const mailboxesByAccountId: Record<EntityId, Mailbox[]> = {};
    const messagesByMailboxId: Record<EntityId, Message[]> = {};
    const messageDetailsByCacheKey: Record<string, MessageDetail> = {};

    for (const accountConfig of accountConfigs) {
      const accountId = accountConfig.account.id;
      const mailboxes = await this.getMailboxes(accountId);
      mailboxesByAccountId[accountId] = mailboxes;

      for (const mailbox of mailboxes) {
        messagesByMailboxId[mailbox.id] = await this.getMessages(mailbox.id);
      }
    }

    const database = await this.getDatabase();
    const detailKeys = await database.select<MessageDetailKeyRow>(`
      SELECT account_id, provider_message_id
      FROM message_bodies
    `);

    for (const detailKey of detailKeys) {
      const detail = await this.getMessageDetail(
        detailKey.account_id,
        detailKey.provider_message_id
      );

      if (detail) {
        messageDetailsByCacheKey[
          createMessageDetailCacheKey(detail.accountId, detail.providerMessageId)
        ] = detail;
      }
    }

    return {
      accountConfigs,
      mailboxesByAccountId,
      messagesByMailboxId,
      messageDetailsByCacheKey,
      syncStates: await this.listSyncStates()
    };
  }

  async listAccountConfigs(): Promise<StoredJmapAccountConfig[]> {
    const database = await this.getDatabase();
    const rows = await database.select<AccountConfigRow>(`
      ${ACCOUNT_CONFIG_SELECT}
      WHERE accounts.provider_type = 'jmap'
      ORDER BY accounts.is_default DESC, accounts.updated_at DESC
    `);

    return rows.map(mapAccountConfig);
  }

  async saveAccountConfig(accountConfig: StoredJmapAccountConfig): Promise<void> {
    const database = await this.getDatabase();
    const account = accountConfig.account;

    await database.execute(`
      INSERT INTO accounts (
        id,
        display_name,
        email_address,
        provider_type,
        provider_config_reference,
        is_default,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        email_address = excluded.email_address,
        provider_type = excluded.provider_type,
        provider_config_reference = excluded.provider_config_reference,
        is_default = excluded.is_default,
        updated_at = excluded.updated_at
    `, [
      account.id,
      account.displayName,
      account.emailAddress,
      account.providerType,
      account.providerConfigReference,
      toInteger(account.isDefault),
      account.createdAt,
      account.updatedAt
    ]);

    await database.execute(`
      INSERT INTO jmap_account_configs (
        account_id,
        jmap_base_url,
        credential_reference,
        auth_mode,
        auth_username,
        jmap_account_id,
        session_url,
        session_api_url,
        last_connected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        jmap_base_url = excluded.jmap_base_url,
        credential_reference = excluded.credential_reference,
        auth_mode = excluded.auth_mode,
        auth_username = excluded.auth_username,
        jmap_account_id = excluded.jmap_account_id,
        session_url = excluded.session_url,
        session_api_url = excluded.session_api_url,
        last_connected_at = excluded.last_connected_at
    `, [
      account.id,
      accountConfig.jmapBaseUrl,
      accountConfig.credentialReference,
      accountConfig.authMode,
      accountConfig.authUsername ?? null,
      accountConfig.jmapAccountId ?? null,
      accountConfig.sessionUrl ?? null,
      accountConfig.sessionApiUrl ?? null,
      accountConfig.lastConnectedAt ?? null
    ]);
  }

  async saveMailboxes(accountId: EntityId, mailboxes: Mailbox[]): Promise<void> {
    const database = await this.getDatabase();

    for (const mailbox of mailboxes) {
      await database.execute(`
        INSERT INTO mailboxes (
          id,
          account_id,
          provider_mailbox_id,
          name,
          role,
          unread_count,
          total_count,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          account_id = excluded.account_id,
          provider_mailbox_id = excluded.provider_mailbox_id,
          name = excluded.name,
          role = excluded.role,
          unread_count = excluded.unread_count,
          total_count = excluded.total_count,
          updated_at = excluded.updated_at
      `, [
        mailbox.id,
        accountId,
        mailbox.providerMailboxId,
        mailbox.name,
        mailbox.role,
        mailbox.unreadCount ?? 0,
        mailbox.totalCount ?? 0,
        mailbox.createdAt,
        mailbox.updatedAt
      ]);
    }

    await deleteMissingRows(database, {
      table: "mailboxes",
      scopeColumn: "account_id",
      scopeValue: accountId,
      retainedIds: mailboxes.map((mailbox) => mailbox.id)
    });
  }

  async getMailboxes(accountId: EntityId): Promise<Mailbox[]> {
    const database = await this.getDatabase();
    const rows = await database.select<MailboxRow>(`
      SELECT
        id,
        account_id,
        provider_mailbox_id,
        name,
        role,
        unread_count,
        total_count,
        created_at,
        updated_at
      FROM mailboxes
      WHERE account_id = ?
      ORDER BY
        CASE role
          WHEN 'inbox' THEN 0
          WHEN 'sent' THEN 1
          WHEN 'drafts' THEN 2
          WHEN 'archive' THEN 3
          WHEN 'trash' THEN 4
          WHEN 'junk' THEN 5
          ELSE 6
        END,
        name COLLATE NOCASE
    `, [accountId]);

    return rows.map(mapMailbox);
  }

  async saveMessages(mailboxId: EntityId, messages: Message[]): Promise<void> {
    const database = await this.getDatabase();

    for (const message of messages) {
      if (message.mailboxId !== mailboxId) {
        throw new Error("Message mailbox ID does not match the repository target mailbox.");
      }

      await this.saveMessage(database, message);
      await this.saveRecipients(database, message);
      await this.saveTags(database, message);
    }

    await deleteMissingRows(database, {
      table: "messages",
      scopeColumn: "mailbox_id",
      scopeValue: mailboxId,
      retainedIds: messages.map((message) => message.id)
    });
  }

  async getMessages(mailboxId: EntityId): Promise<Message[]> {
    const database = await this.getDatabase();
    const rows = await database.select<MessageRow>(`
      ${MESSAGE_SELECT}
      WHERE mailbox_id = ?
      ORDER BY date DESC
    `, [mailboxId]);

    return Promise.all(rows.map((row) => this.hydrateMessage(database, row)));
  }

  async saveMessageDetail(messageDetail: MessageDetail): Promise<void> {
    const database = await this.getDatabase();
    await this.saveMessage(database, messageDetail);
    await this.saveRecipients(database, messageDetail);
    await this.saveTags(database, messageDetail);

    await database.execute(`
      INSERT INTO message_bodies (
        message_id,
        account_id,
        provider_message_id,
        body_text,
        body_html_raw,
        body_parts_json,
        cached_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        account_id = excluded.account_id,
        provider_message_id = excluded.provider_message_id,
        body_text = excluded.body_text,
        body_html_raw = excluded.body_html_raw,
        body_parts_json = excluded.body_parts_json,
        cached_at = excluded.cached_at,
        updated_at = excluded.updated_at
    `, [
      messageDetail.id,
      messageDetail.accountId,
      messageDetail.providerMessageId,
      messageDetail.bodyText ?? null,
      messageDetail.bodyHtml ?? null,
      JSON.stringify(messageDetail.bodyParts),
      messageDetail.updatedAt,
      messageDetail.updatedAt
    ]);

    await database.execute(
      "DELETE FROM attachments WHERE message_id = ?",
      [messageDetail.id]
    );

    for (const attachment of messageDetail.attachments) {
      await database.execute(`
        INSERT INTO attachments (
          id,
          account_id,
          message_id,
          provider_attachment_id,
          filename,
          mime_type,
          size_bytes,
          content_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        attachment.id,
        messageDetail.accountId,
        messageDetail.id,
        attachment.providerAttachmentId,
        attachment.filename,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.contentId ?? null,
        messageDetail.createdAt,
        messageDetail.updatedAt
      ]);
    }
  }

  async getMessageDetail(
    accountId: EntityId,
    providerMessageId: string
  ): Promise<MessageDetail | undefined> {
    const database = await this.getDatabase();
    const [messageRow] = await database.select<MessageRow>(`
      ${MESSAGE_SELECT}
      WHERE account_id = ? AND provider_message_id = ?
      LIMIT 1
    `, [accountId, providerMessageId]);

    if (!messageRow) {
      return undefined;
    }

    const [bodyRow] = await database.select<MessageBodyRow>(`
      SELECT body_text, body_html_raw, body_parts_json
      FROM message_bodies
      WHERE message_id = ?
      LIMIT 1
    `, [messageRow.id]);

    if (!bodyRow) {
      return undefined;
    }

    const message = await this.hydrateMessage(database, messageRow);
    const attachmentRows = await database.select<AttachmentRow>(`
      SELECT
        id,
        message_id,
        provider_attachment_id,
        filename,
        mime_type,
        size_bytes,
        content_id
      FROM attachments
      WHERE message_id = ?
      ORDER BY filename COLLATE NOCASE
    `, [message.id]);

    return {
      ...message,
      bodyText: bodyRow.body_text ?? undefined,
      bodyHtml: bodyRow.body_html_raw ?? undefined,
      bodyParts: parseJsonArray<MessageBodyPart>(bodyRow.body_parts_json),
      attachments: attachmentRows.map(mapAttachment)
    };
  }

  async listSyncStates(): Promise<ProviderSyncState[]> {
    const database = await this.getDatabase();
    const rows = await database.select<SyncStateRow>(`
      SELECT
        id,
        account_id,
        mailbox_id,
        provider_type,
        sync_cursor,
        sync_status,
        last_sync_at,
        created_at,
        updated_at
      FROM sync_states
      ORDER BY updated_at DESC
    `);

    return rows.map(mapSyncState);
  }

  async saveSyncState(syncState: ProviderSyncState): Promise<void> {
    const database = await this.getDatabase();

    await database.execute(`
      INSERT INTO sync_states (
        id,
        account_id,
        mailbox_id,
        provider_type,
        sync_cursor,
        sync_status,
        last_sync_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_id = excluded.account_id,
        mailbox_id = excluded.mailbox_id,
        provider_type = excluded.provider_type,
        sync_cursor = excluded.sync_cursor,
        sync_status = excluded.sync_status,
        last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at
    `, [
      syncState.id,
      syncState.accountId,
      syncState.mailboxId ?? null,
      syncState.providerType,
      syncState.syncCursor ?? null,
      syncState.syncStatus,
      syncState.lastSyncAt ?? null,
      syncState.createdAt,
      syncState.updatedAt
    ]);
  }

  async listDrafts(accountId: EntityId): Promise<LocalDraft[]> {
    const database = await this.getDatabase();
    const rows = await database.select<LocalDraftRow>(`
      SELECT
        id,
        account_id,
        mode,
        related_message_id,
        related_provider_message_id,
        related_provider_thread_id,
        related_message_id_header,
        references_json,
        to_json,
        cc_json,
        bcc_json,
        subject,
        body_format,
        body_text,
        created_at,
        updated_at
      FROM local_drafts
      WHERE account_id = ?
      ORDER BY updated_at DESC
    `, [accountId]);

    return rows.map(mapLocalDraft);
  }

  async getDraft(draftId: EntityId): Promise<LocalDraft | undefined> {
    const database = await this.getDatabase();
    const [row] = await database.select<LocalDraftRow>(`
      SELECT
        id,
        account_id,
        mode,
        related_message_id,
        related_provider_message_id,
        related_provider_thread_id,
        related_message_id_header,
        references_json,
        to_json,
        cc_json,
        bcc_json,
        subject,
        body_format,
        body_text,
        created_at,
        updated_at
      FROM local_drafts
      WHERE id = ?
      LIMIT 1
    `, [draftId]);

    return row ? mapLocalDraft(row) : undefined;
  }

  async saveDraft(draft: LocalDraft): Promise<void> {
    const database = await this.getDatabase();

    await database.execute(`
      INSERT INTO local_drafts (
        id,
        account_id,
        mode,
        related_message_id,
        related_provider_message_id,
        related_provider_thread_id,
        related_message_id_header,
        references_json,
        to_json,
        cc_json,
        bcc_json,
        subject,
        body_format,
        body_text,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_id = excluded.account_id,
        mode = excluded.mode,
        related_message_id = excluded.related_message_id,
        related_provider_message_id = excluded.related_provider_message_id,
        related_provider_thread_id = excluded.related_provider_thread_id,
        related_message_id_header = excluded.related_message_id_header,
        references_json = excluded.references_json,
        to_json = excluded.to_json,
        cc_json = excluded.cc_json,
        bcc_json = excluded.bcc_json,
        subject = excluded.subject,
        body_format = excluded.body_format,
        body_text = excluded.body_text,
        updated_at = excluded.updated_at
    `, [
      draft.id,
      draft.accountId,
      draft.mode,
      draft.relatedMessageId ?? null,
      draft.relatedProviderMessageId ?? null,
      draft.relatedProviderThreadId ?? null,
      draft.relatedMessageIdHeader ?? null,
      JSON.stringify(draft.references),
      JSON.stringify(draft.to),
      JSON.stringify(draft.cc),
      JSON.stringify(draft.bcc),
      draft.subject,
      draft.bodyFormat,
      draft.bodyText,
      draft.createdAt,
      draft.updatedAt
    ]);
  }

  async deleteDraft(draftId: EntityId): Promise<void> {
    const database = await this.getDatabase();
    await database.execute("DELETE FROM local_drafts WHERE id = ?", [draftId]);
  }

  async getPreference<T>(key: string): Promise<T | undefined> {
    const database = await this.getDatabase();
    const [row] = await database.select<PreferenceRow>(`
      SELECT value_json
      FROM user_preferences
      WHERE key = ?
      LIMIT 1
    `, [key]);

    if (!row) {
      return undefined;
    }

    return JSON.parse(row.value_json) as T;
  }

  async savePreference<T>(key: string, value: T): Promise<void> {
    const database = await this.getDatabase();
    const now = new Date().toISOString();

    await database.execute(`
      INSERT INTO user_preferences (
        key,
        value_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `, [key, JSON.stringify(value), now, now]);
  }

  private getDatabase(): Promise<SqlDatabase> {
    this.databasePromise ??= this.createDatabase().then(async (database) => {
      await database.execute("PRAGMA foreign_keys = ON");
      return database;
    });

    return this.databasePromise;
  }

  private async saveMessage(database: SqlDatabase, message: Message): Promise<void> {
    await database.execute(`
      INSERT INTO messages (
        id,
        account_id,
        provider_type,
        provider_message_id,
        provider_thread_id,
        mailbox_id,
        message_id_header,
        in_reply_to_json,
        references_json,
        subject,
        from_name,
        from_address,
        date,
        received_at,
        snippet,
        is_read,
        is_flagged,
        is_answered,
        has_attachments,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_id = excluded.account_id,
        provider_type = excluded.provider_type,
        provider_message_id = excluded.provider_message_id,
        provider_thread_id = excluded.provider_thread_id,
        mailbox_id = excluded.mailbox_id,
        message_id_header = excluded.message_id_header,
        in_reply_to_json = excluded.in_reply_to_json,
        references_json = excluded.references_json,
        subject = excluded.subject,
        from_name = excluded.from_name,
        from_address = excluded.from_address,
        date = excluded.date,
        received_at = excluded.received_at,
        snippet = excluded.snippet,
        is_read = excluded.is_read,
        is_flagged = excluded.is_flagged,
        is_answered = excluded.is_answered,
        has_attachments = excluded.has_attachments,
        updated_at = excluded.updated_at
    `, [
      message.id,
      message.accountId,
      message.providerType,
      message.providerMessageId,
      message.providerThreadId ?? null,
      message.mailboxId,
      message.messageIdHeader ?? null,
      JSON.stringify(message.inReplyToMessageIds ?? []),
      JSON.stringify(message.references ?? []),
      message.subject,
      message.from.name ?? null,
      message.from.address,
      message.date,
      message.receivedAt ?? null,
      message.snippet,
      toInteger(message.isRead),
      toInteger(message.isFlagged),
      toInteger(message.isAnswered),
      toInteger(message.hasAttachments),
      message.createdAt,
      message.updatedAt
    ]);
  }

  private async saveRecipients(database: SqlDatabase, message: Message): Promise<void> {
    await database.execute(
      "DELETE FROM message_recipients WHERE message_id = ?",
      [message.id]
    );

    const recipients: Array<{
      type: "to" | "cc" | "bcc" | "reply-to";
      recipient: Recipient;
      index: number;
    }> = [
      ...message.to.map((recipient, index) => ({ type: "to" as const, recipient, index })),
      ...message.cc.map((recipient, index) => ({ type: "cc" as const, recipient, index })),
      ...message.bcc.map((recipient, index) => ({ type: "bcc" as const, recipient, index })),
      ...(message.replyTo ?? []).map((recipient, index) => ({
        type: "reply-to" as const,
        recipient,
        index
      }))
    ];

    for (const { type, recipient, index } of recipients) {
      await database.execute(`
        INSERT INTO message_recipients (
          id,
          message_id,
          recipient_type,
          name,
          address
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        `${message.id}:recipient:${type}:${String(index).padStart(6, "0")}`,
        message.id,
        type,
        recipient.name ?? null,
        recipient.address
      ]);
    }
  }

  private async saveTags(database: SqlDatabase, message: Message): Promise<void> {
    await database.execute(
      "DELETE FROM message_tags WHERE message_id = ?",
      [message.id]
    );

    const tagsByLabel = new Map<string, "system" | "user">(
      message.userTags.map((label) => [label, "user"])
    );

    for (const label of message.systemTags) {
      tagsByLabel.set(label, "system");
    }

    for (const [label, source] of tagsByLabel) {
      const tagId = `${message.accountId}:tag:${encodeURIComponent(label)}`;

      await database.execute(`
        INSERT INTO tags (
          id,
          account_id,
          label,
          source,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, label) DO UPDATE SET
          source = excluded.source,
          updated_at = excluded.updated_at
      `, [
        tagId,
        message.accountId,
        label,
        source,
        message.createdAt,
        message.updatedAt
      ]);
      await database.execute(`
        INSERT INTO message_tags (
          message_id,
          tag_id,
          created_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(message_id, tag_id) DO NOTHING
      `, [message.id, tagId, message.updatedAt]);
    }
  }

  private async hydrateMessage(
    database: SqlDatabase,
    row: MessageRow
  ): Promise<Message> {
    const [recipients, tags] = await Promise.all([
      database.select<RecipientRow>(`
        SELECT recipient_type, name, address
        FROM message_recipients
        WHERE message_id = ?
        ORDER BY id
      `, [row.id]),
      database.select<TagRow>(`
        SELECT tags.label, tags.source
        FROM tags
        INNER JOIN message_tags ON message_tags.tag_id = tags.id
        WHERE message_tags.message_id = ?
        ORDER BY tags.label COLLATE NOCASE
      `, [row.id])
    ]);

    return {
      id: row.id,
      accountId: row.account_id,
      providerType: row.provider_type as ProviderType,
      providerMessageId: row.provider_message_id,
      providerThreadId: row.provider_thread_id ?? undefined,
      mailboxId: row.mailbox_id,
      messageIdHeader: row.message_id_header ?? undefined,
      inReplyToMessageIds: parseJsonArray<string>(row.in_reply_to_json),
      references: parseJsonArray<string>(row.references_json),
      subject: row.subject,
      from: {
        name: row.from_name ?? undefined,
        address: row.from_address
      },
      to: mapRecipients(recipients, "to"),
      cc: mapRecipients(recipients, "cc"),
      bcc: mapRecipients(recipients, "bcc"),
      replyTo: mapRecipients(recipients, "reply-to"),
      date: row.date,
      receivedAt: row.received_at ?? undefined,
      snippet: row.snippet,
      isRead: fromInteger(row.is_read),
      isFlagged: fromInteger(row.is_flagged),
      isAnswered: fromInteger(row.is_answered),
      hasAttachments: fromInteger(row.has_attachments),
      systemTags: tags
        .filter((tag): tag is TagRow & { label: SystemTag } => (
          tag.source === "system" && isSystemTag(tag.label)
        ))
        .map((tag) => tag.label),
      userTags: tags
        .filter((tag) => tag.source === "user")
        .map((tag) => tag.label),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

function mapAccountConfig(row: AccountConfigRow): StoredJmapAccountConfig {
  return {
    account: {
      id: row.id,
      displayName: row.display_name,
      emailAddress: row.email_address,
      providerType: row.provider_type as ProviderType,
      providerConfigReference: row.provider_config_reference,
      isDefault: fromInteger(row.is_default),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    jmapBaseUrl: row.jmap_base_url,
    credentialReference: row.credential_reference,
    authMode: row.auth_mode === "bearer" ? "bearer" : "basic",
    authUsername: row.auth_username ?? undefined,
    jmapAccountId: row.jmap_account_id ?? undefined,
    sessionUrl: row.session_url ?? undefined,
    sessionApiUrl: row.session_api_url ?? undefined,
    lastConnectedAt: row.last_connected_at ?? undefined
  };
}

function mapMailbox(row: MailboxRow): Mailbox {
  return {
    id: row.id,
    accountId: row.account_id,
    providerMailboxId: row.provider_mailbox_id,
    name: row.name,
    role: row.role as MailboxRole,
    unreadCount: row.unread_count ?? undefined,
    totalCount: row.total_count ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRecipients(
  rows: RecipientRow[],
  type: "to" | "cc" | "bcc" | "reply-to"
): Recipient[] {
  return rows
    .filter((row) => row.recipient_type === type)
    .map((row) => ({
      name: row.name ?? undefined,
      address: row.address
    }));
}

function mapLocalDraft(row: LocalDraftRow): LocalDraft {
  return {
    id: row.id,
    accountId: row.account_id,
    mode: row.mode as DraftMode,
    relatedMessageId: row.related_message_id ?? undefined,
    relatedProviderMessageId: row.related_provider_message_id ?? undefined,
    relatedProviderThreadId: row.related_provider_thread_id ?? undefined,
    relatedMessageIdHeader: row.related_message_id_header ?? undefined,
    references: parseJsonArray<string>(row.references_json),
    to: parseJsonArray<Recipient>(row.to_json),
    cc: parseJsonArray<Recipient>(row.cc_json),
    bcc: parseJsonArray<Recipient>(row.bcc_json),
    subject: row.subject,
    bodyFormat: row.body_format as "plain-text",
    bodyText: row.body_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    messageId: row.message_id,
    providerAttachmentId: row.provider_attachment_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    contentId: row.content_id ?? undefined
  };
}

function mapSyncState(row: SyncStateRow): ProviderSyncState {
  return {
    id: row.id,
    accountId: row.account_id,
    mailboxId: row.mailbox_id ?? undefined,
    providerType: row.provider_type as ProviderType,
    syncCursor: row.sync_cursor ?? undefined,
    syncStatus: row.sync_status,
    lastSyncAt: row.last_sync_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsedValue: unknown = JSON.parse(value);
    return Array.isArray(parsedValue) ? parsedValue as T[] : [];
  } catch {
    return [];
  }
}

function toInteger(value: boolean): number {
  return value ? 1 : 0;
}

function fromInteger(value: number): boolean {
  return value === 1;
}

function isSystemTag(value: string): value is SystemTag {
  return SYSTEM_TAGS.some((tag) => tag === value);
}

function createMessageDetailCacheKey(
  accountId: EntityId,
  providerMessageId: string
): string {
  return `${encodeURIComponent(accountId)}:${encodeURIComponent(providerMessageId)}`;
}

async function deleteMissingRows(
  database: SqlDatabase,
  input: {
    table: "mailboxes" | "messages";
    scopeColumn: "account_id" | "mailbox_id";
    scopeValue: EntityId;
    retainedIds: EntityId[];
  }
): Promise<void> {
  if (input.retainedIds.length === 0) {
    await database.execute(
      `DELETE FROM ${input.table} WHERE ${input.scopeColumn} = ?`,
      [input.scopeValue]
    );
    return;
  }

  const placeholders = input.retainedIds.map(() => "?").join(", ");
  await database.execute(
    `DELETE FROM ${input.table}
     WHERE ${input.scopeColumn} = ?
       AND id NOT IN (${placeholders})`,
    [input.scopeValue, ...input.retainedIds]
  );
}
