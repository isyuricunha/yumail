import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  INITIAL_SCHEMA_VERSION,
  SqliteAiSummaryRepository,
  migrations
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

function insertDependencies(database) {
  const timestamp = "2026-06-08T12:00:00.000Z";

  database.prepare(`
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
  `).run(
    "account:1",
    "Yu",
    "yu@example.com",
    "jmap",
    "provider-config:1",
    1,
    timestamp,
    timestamp
  );
  database.prepare(`
    INSERT INTO mailboxes (
      id,
      account_id,
      provider_mailbox_id,
      name,
      role,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "mailbox:inbox",
    "account:1",
    "inbox",
    "Inbox",
    "inbox",
    timestamp,
    timestamp
  );
  database.prepare(`
    INSERT INTO messages (
      id,
      account_id,
      provider_type,
      provider_message_id,
      mailbox_id,
      subject,
      from_address,
      date,
      snippet,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "message:1",
    "account:1",
    "jmap",
    "provider-message-1",
    "mailbox:inbox",
    "Launch plan",
    "ada@example.com",
    timestamp,
    "Launch Friday",
    timestamp,
    timestamp
  );
  database.prepare(`
    INSERT INTO ai_providers (
      id,
      provider_type,
      name,
      base_url,
      api_key_reference,
      default_utility_model,
      default_drafting_model,
      auth_mode,
      enabled,
      is_default,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "ai-provider:default",
    "openai-compatible",
    "Private AI",
    "https://ai.example.com/v1",
    "credential:ai:default",
    "summary-model",
    "summary-model",
    "bearer",
    1,
    1,
    timestamp,
    timestamp
  );
}

test("registers the AI summary cache migration", async () => {
  const database = new DatabaseSync(":memory:");
  await applyRegisteredMigrations(database);
  const promptVersion = database.prepare(`
    SELECT action, version
    FROM prompt_versions
    WHERE id = ?
  `).get("prompt:summarize-thread:1.0.0");

  assert.equal(INITIAL_SCHEMA_VERSION, 8);
  assert.deepEqual(
    migrations.map((migration) => migration.version),
    [1, 2, 3, 4, 5, 6, 7, 8]
  );
  assert.equal(migrations.at(-1).name, "ai_thread_summaries");
  assert.equal(promptVersion.action, "summarize-thread");
  assert.equal(promptVersion.version, "1.0.0");
  database.close();
});

test("persists and reloads versioned AI summaries without API keys", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "yumail-ai-summary-"));
  const databasePath = path.join(directory, "yumail.sqlite3");
  const apiKey = "must-never-enter-summary-sqlite";
  const record = {
    id: "ai-summary:1",
    accountId: "account:1",
    messageId: "message:1",
    providerId: "ai-provider:default",
    model: "summary-model",
    promptId: "summarize-thread",
    promptVersion: "1.0.0",
    inputHash: "a".repeat(64),
    summary: {
      mainPoint: "The launch is approved.",
      currentStatus: "Scheduled for Friday.",
      decisions: ["Launch Friday."],
      actionItems: ["Publish the checklist."],
      deadlines: ["Friday"],
      peopleInvolved: ["Ada", "Yu"],
      attachmentNotes: ["checklist.pdf metadata was provided."]
    },
    summaryText: "The launch is approved.\n\nStatus: Scheduled for Friday.",
    createdAt: "2026-06-08T12:00:00.000Z",
    updatedAt: "2026-06-08T12:00:00.000Z"
  };
  const cacheKey = {
    accountId: record.accountId,
    messageId: record.messageId,
    providerId: record.providerId,
    model: record.model,
    promptId: record.promptId,
    promptVersion: record.promptVersion,
    inputHash: record.inputHash
  };

  try {
    const firstDatabase = new DatabaseSync(databasePath);
    await applyRegisteredMigrations(firstDatabase);
    insertDependencies(firstDatabase);
    const firstRepository = new SqliteAiSummaryRepository(
      async () => new NodeSqlDatabase(firstDatabase)
    );

    await firstRepository.saveSummary(record);
    firstDatabase.close();

    const secondDatabase = new DatabaseSync(databasePath);
    const secondRepository = new SqliteAiSummaryRepository(
      async () => new NodeSqlDatabase(secondDatabase)
    );
    const loaded = await secondRepository.getCachedSummary(cacheKey);

    assert.deepEqual(loaded, record);

    const row = secondDatabase.prepare(`
      SELECT prompt_id, prompt_version, summary_text, output_json
      FROM ai_summaries
      WHERE id = ?
    `).get(record.id);

    assert.equal(row.prompt_id, "summarize-thread");
    assert.equal(row.prompt_version, "1.0.0");
    assert.equal(row.summary_text, record.summaryText);
    assert.deepEqual(JSON.parse(row.output_json), record.summary);
    secondDatabase.close();

    const databaseContents = await readFile(databasePath);
    assert.equal(databaseContents.includes(Buffer.from(apiKey)), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
