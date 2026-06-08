import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  INITIAL_SCHEMA_VERSION,
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
    jmapAccountId: "jmap-account-1",
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
    to: [{ name: "Yu", address: "yu@example.com" }],
    cc: [{ address: "team@example.com" }],
    bcc: [{ address: "audit@example.com" }],
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

  return { accountConfig, mailbox, messageDetail, syncState };
}

test("registers and applies every SQLite migration", async () => {
  const database = new DatabaseSync(":memory:");
  await applyRegisteredMigrations(database);

  assert.equal(INITIAL_SCHEMA_VERSION, 3);
  assert.deepEqual(migrations.map((migration) => migration.version), [1, 2, 3]);

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

test("persists account, message, body cache, sync state, and preferences across reopen", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "yumail-sqlite-"));
  const databasePath = path.join(directory, "yumail.sqlite3");
  const fixture = createFixture();
  const authSecret = "Bearer must-not-enter-sqlite";

  try {
    const firstDatabase = new DatabaseSync(databasePath);
    await applyRegisteredMigrations(firstDatabase);
    const firstRepository = new SqliteMailMetadataRepository(
      async () => new NodeSqlDatabase(firstDatabase)
    );

    await firstRepository.saveAccountConfig(fixture.accountConfig);
    await firstRepository.saveMailboxes(
      fixture.accountConfig.account.id,
      [fixture.mailbox]
    );
    await firstRepository.saveMessages(fixture.mailbox.id, [fixture.messageDetail]);
    await firstRepository.saveMessageDetail(fixture.messageDetail);
    await firstRepository.saveSyncState(fixture.syncState);
    await firstRepository.savePreference("reading.mode", { mode: "safe-html" });
    firstDatabase.close();

    const secondDatabase = new DatabaseSync(databasePath);
    const secondRepository = new SqliteMailMetadataRepository(
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
    const [syncState] = await secondRepository.listSyncStates();
    const preference = await secondRepository.getPreference("reading.mode");
    const serializedMetadata = JSON.stringify({
      accountConfig,
      mailbox,
      message,
      detail,
      syncState,
      preference
    });

    assert.equal(accountConfig.credentialReference, "credential:jmap:yu");
    assert.equal(accountConfig.jmapBaseUrl, "https://mail.example.com");
    assert.equal(mailbox.providerMailboxId, "inbox");
    assert.deepEqual(message.to, [{ name: "Yu", address: "yu@example.com" }]);
    assert.deepEqual(message.cc, [{ name: undefined, address: "team@example.com" }]);
    assert.deepEqual(message.bcc, [{ name: undefined, address: "audit@example.com" }]);
    assert.deepEqual(message.systemTags, ["important"]);
    assert.deepEqual(message.userTags, ["customer"]);
    assert.equal(detail.bodyText, "Persisted plain body");
    assert.equal(detail.bodyHtml, "<p>Persisted HTML body</p>");
    assert.equal(detail.bodyParts[0].blobId, "body-blob");
    assert.equal(detail.attachments[0].filename, "report.pdf");
    assert.equal(syncState.syncCursor, "cursor-1");
    assert.deepEqual(preference, { mode: "safe-html" });
    assert.equal(serializedMetadata.includes(authSecret), false);

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
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
