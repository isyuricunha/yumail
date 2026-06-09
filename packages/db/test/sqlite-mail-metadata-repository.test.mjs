import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  INITIAL_SCHEMA_VERSION,
  SqliteAiProviderRepository,
  SqliteMailMetadataRepository,
  migrations,
  requiredTables
} from "../dist/index.js";

class NodeSqlDatabase {
  constructor(database) {
    this.database = database;
  }

  async execute(query, bindValues = []) {
    const result = this.database.prepare(query).run(...bindValues);

    return {
      rowsAffected: Number(result.changes),
      lastInsertId: Number(result.lastInsertRowid)
    };
  }

  async select(query, bindValues = []) {
    return this.database.prepare(query).all(...bindValues);
  }
}

async function applyRegisteredMigrations(database) {
  for (const migration of migrations) {
    const sql = await readFile(path.resolve(migration.path), "utf8");
    database.exec(sql);
  }
}

function createFixture() {
  const timestamp = "2026-06-08T12:00:00.000Z";
  const accountId = "account:yu";
  const mailboxId = `${accountId}:mailbox:inbox`;
  const messageId = `${accountId}:message:message-1`;

  const accountConfig = {
    account: {
      id: accountId,
      displayName: "Yu",
      emailAddress: "yu@example.com",
      providerType: "jmap",
      providerConfigReference: "provider-config:yu",
      isDefault: true,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    jmapBaseUrl: "https://mail.example.com",
    credentialReference: "credential:jmap:yu",
    authMode: "basic",
    authUsername: "yu@example.com",
    jmapAccountId: "jmap-account-1",
    sessionUrl: "https://mail.example.com/jmap/session",
    sessionApiUrl: "https://mail.example.com/jmap/api",
    lastConnectedAt: timestamp
  };
  const mailbox = {
    id: mailboxId,
    accountId,
    providerMailboxId: "inbox",
    name: "Inbox",
    role: "inbox",
    unreadCount: 1,
    totalCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const messageDetail = {
    id: messageId,
    accountId,
    providerType: "jmap",
    providerMessageId: "message-1",
    providerThreadId: "thread-1",
    mailboxId,
    messageIdHeader: "message-1@example.com",
    subject: "Persisted message",
    from: {
      name: "Ada",
      address: "ada@example.com"
    },
    replyTo: [{ name: "Ada replies", address: "reply@example.com" }],
    to: [{ name: "Yu", address: "yu@example.com" }],
    cc: [{ address: "team@example.com" }],
    bcc: [{ address: "audit@example.com" }],
    inReplyToMessageIds: ["previous@example.com"],
    references: ["root@example.com", "previous@example.com"],
    date: timestamp,
    receivedAt: timestamp,
    snippet: "Persisted preview",
    isRead: false,
    isFlagged: true,
    isAnswered: false,
    hasAttachments: true,
    systemTags: ["important"],
    userTags: ["customer"],
    createdAt: timestamp,
    updatedAt: timestamp,
    bodyText: "Persisted plain body",
    bodyHtml: "<p>Persisted HTML body</p>",
    bodyParts: [{
      partId: "text",
      blobId: "body-blob",
      mimeType: "text/plain",
      charset: "utf-8",
      sizeBytes: 20,
      language: [],
      isTruncated: false,
      hasEncodingProblem: false
    }],
    attachments: [{
      id: `${messageId}:attachment:report`,
      messageId,
      providerAttachmentId: "report-blob",
      filename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048
    }]
  };
  const syncState = {
    id: `${accountId}:sync:inbox`,
    accountId,
    mailboxId,
    providerType: "jmap",
    syncCursor: "cursor-1",
    syncStatus: "idle",
    lastSyncAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const draft = {
    id: `${accountId}:draft:local-1`,
    accountId,
    mode: "reply",
    relatedMessageId: messageId,
    relatedProviderMessageId: "message-1",
    relatedProviderThreadId: "thread-1",
    relatedMessageIdHeader: "message-1@example.com",
    references: ["root@example.com", "message-1@example.com"],
    to: [{ name: "Ada", address: "ada@example.com" }],
    cc: [{ address: "team@example.com" }],
    bcc: [],
    subject: "Re: Persisted message",
    bodyFormat: "plain-text",
    bodyText: "Persisted local reply",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const threadDetail = {
    id: `${accountId}:thread:thread-1`,
    accountId,
    providerThreadId: "thread-1",
    subject: "Persisted message",
    participants: [messageDetail.from, ...messageDetail.to],
    messageCount: 1,
    latestMessageAt: messageDetail.date,
    isUnread: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [messageDetail]
  };

  return { accountConfig, mailbox, messageDetail, syncState, draft, threadDetail };
}

test("registers and applies every SQLite migration", async () => {
  const database = new DatabaseSync(":memory:");
  await applyRegisteredMigrations(database);

  assert.equal(INITIAL_SCHEMA_VERSION, 9);
  assert.deepEqual(
    migrations.map((migration) => migration.version),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
  );

  const tables = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
  `).all().map((row) => row.name);

  for (const table of requiredTables) {
    assert.equal(tables.includes(table), true, `Expected migration table ${table}`);
  }

  database.close();
});

test("persists mail cache, local drafts, sync state, and preferences across reopen", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "yumail-sqlite-"));
  const databasePath = path.join(directory, "yumail.sqlite3");
  const fixture = createFixture();
  const authSecret = "Bearer must-not-enter-sqlite";
  const aiApiKey = "AI key must-not-enter-sqlite";
  const aiProvider = {
    id: "ai-provider:default",
    providerType: "openai-compatible",
    displayName: "Private AI",
    baseUrl: "https://ai.example.com/v1",
    model: "utility-model",
    temperature: 0.2,
    maxTokens: 1024,
    authMode: "bearer",
    credentialReference: "credential:ai:default",
    enabled: true,
    isDefault: true,
    createdAt: "2026-06-08T12:00:00.000Z",
    updatedAt: "2026-06-08T12:00:00.000Z"
  };

  try {
    const firstDatabase = new DatabaseSync(databasePath);
    await applyRegisteredMigrations(firstDatabase);
    const firstRepository = new SqliteMailMetadataRepository(
      async () => new NodeSqlDatabase(firstDatabase)
    );
    const firstAiRepository = new SqliteAiProviderRepository(
      async () => new NodeSqlDatabase(firstDatabase)
    );

    await firstRepository.saveAccountConfig(fixture.accountConfig);
    await firstRepository.saveMailboxes(
      fixture.accountConfig.account.id,
      [fixture.mailbox]
    );
    await firstRepository.saveMessages(fixture.mailbox.id, [fixture.messageDetail]);
    await firstRepository.saveMessageDetail(fixture.messageDetail);
    await firstRepository.saveThreadDetail(fixture.threadDetail);
    await firstRepository.saveSyncState(fixture.syncState);
    await firstRepository.saveDraft(fixture.draft);
    await firstRepository.savePreference("reading.mode", { mode: "safe-html" });
    await firstAiRepository.saveAiProvider(aiProvider);
    firstDatabase.close();

    const secondDatabase = new DatabaseSync(databasePath);
    const secondRepository = new SqliteMailMetadataRepository(
      async () => new NodeSqlDatabase(secondDatabase)
    );
    const secondAiRepository = new SqliteAiProviderRepository(
      async () => new NodeSqlDatabase(secondDatabase)
    );
    const [accountConfig] = await secondRepository.listAccountConfigs();
    const [mailbox] = await secondRepository.getMailboxes(
      fixture.accountConfig.account.id
    );
    const [message] = await secondRepository.getMessages(fixture.mailbox.id);
    const detail = await secondRepository.getMessageDetail(
      fixture.accountConfig.account.id,
      fixture.messageDetail.providerMessageId
    );
    const threadDetail = await secondRepository.getThreadDetail(
      fixture.accountConfig.account.id,
      fixture.threadDetail.providerThreadId
    );
    const [syncState] = await secondRepository.listSyncStates();
    const [draft] = await secondRepository.listDrafts(
      fixture.accountConfig.account.id
    );
    const preference = await secondRepository.getPreference("reading.mode");
    const loadedAiProvider = await secondAiRepository.getDefaultAiProvider();
    const serializedMetadata = JSON.stringify({
      accountConfig,
      mailbox,
      message,
      detail,
      threadDetail,
      syncState,
      draft,
      preference,
      loadedAiProvider
    });

    assert.equal(accountConfig.credentialReference, "credential:jmap:yu");
    assert.equal(accountConfig.jmapBaseUrl, "https://mail.example.com");
    assert.equal(accountConfig.authMode, "basic");
    assert.equal(accountConfig.authUsername, "yu@example.com");
    assert.equal(accountConfig.sessionUrl, "https://mail.example.com/jmap/session");
    assert.equal(mailbox.providerMailboxId, "inbox");
    assert.deepEqual(message.to, [{ name: "Yu", address: "yu@example.com" }]);
    assert.deepEqual(message.cc, [{ name: undefined, address: "team@example.com" }]);
    assert.deepEqual(message.bcc, [{ name: undefined, address: "audit@example.com" }]);
    assert.deepEqual(message.replyTo, [{
      name: "Ada replies",
      address: "reply@example.com"
    }]);
    assert.deepEqual(message.inReplyToMessageIds, ["previous@example.com"]);
    assert.deepEqual(message.references, [
      "root@example.com",
      "previous@example.com"
    ]);
    assert.deepEqual(message.systemTags, ["important"]);
    assert.deepEqual(message.userTags, ["customer"]);
    assert.equal(detail.bodyText, "Persisted plain body");
    assert.equal(detail.bodyHtml, "<p>Persisted HTML body</p>");
    assert.equal(detail.bodyParts[0].blobId, "body-blob");
    assert.equal(detail.attachments[0].filename, "report.pdf");
    assert.equal(threadDetail.id, fixture.threadDetail.id);
    assert.equal(threadDetail.messageCount, 1);
    assert.equal(threadDetail.messages[0].bodyText, "Persisted plain body");
    assert.equal(syncState.syncCursor, "cursor-1");
    assert.equal(draft.mode, "reply");
    assert.equal(draft.relatedProviderMessageId, "message-1");
    assert.deepEqual(draft.to, [{ name: "Ada", address: "ada@example.com" }]);
    assert.equal(draft.bodyText, "Persisted local reply");
    assert.deepEqual(preference, { mode: "safe-html" });
    assert.deepEqual(loadedAiProvider, aiProvider);
    assert.equal(serializedMetadata.includes(authSecret), false);
    assert.equal(serializedMetadata.includes(aiApiKey), false);

    const bodyColumns = secondDatabase.prepare(`
      SELECT
        messages.body_text AS message_body_text,
        messages.body_html_sanitized,
        message_bodies.body_text,
        message_bodies.body_html_raw
      FROM messages
      INNER JOIN message_bodies ON message_bodies.message_id = messages.id
    `).get();

    assert.equal(bodyColumns.message_body_text, null);
    assert.equal(bodyColumns.body_html_sanitized, null);
    assert.equal(bodyColumns.body_text, "Persisted plain body");
    assert.equal(bodyColumns.body_html_raw, "<p>Persisted HTML body</p>");

    assert.deepEqual(
      await secondRepository.getDraft(fixture.draft.id),
      fixture.draft
    );
    await secondRepository.deleteDraft(fixture.draft.id);
    assert.equal(await secondRepository.getDraft(fixture.draft.id), undefined);

    await secondRepository.saveMessages(fixture.mailbox.id, []);
    assert.deepEqual(await secondRepository.getMessages(fixture.mailbox.id), []);
    assert.equal(await secondRepository.getMessageDetail(
      fixture.accountConfig.account.id,
      fixture.messageDetail.providerMessageId
    ), undefined);

    await secondRepository.saveMailboxes(fixture.accountConfig.account.id, []);
    assert.deepEqual(
      await secondRepository.getMailboxes(fixture.accountConfig.account.id),
      []
    );
    secondDatabase.close();

    const databaseContents = await readFile(databasePath);
    assert.equal(databaseContents.includes(Buffer.from(authSecret)), false);
    assert.equal(databaseContents.includes(Buffer.from(aiApiKey)), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
