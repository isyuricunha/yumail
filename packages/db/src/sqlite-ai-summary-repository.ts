import type { AiSummaryRecord, ThreadSummary } from "@yumail/ai";
import type {
  AiSummaryCacheKey,
  AiSummaryRepository,
  SqlDatabase,
  SqlDatabaseFactory
} from "./index";

interface AiSummaryRow {
  id: string;
  account_id: string;
  message_id: string | null;
  thread_id: string | null;
  provider_id: string;
  model_used: string;
  prompt_id: string;
  prompt_version: string;
  input_hash: string;
  output_json: string;
  summary_text: string;
  created_at: string;
  updated_at: string;
}

export class SqliteAiSummaryRepository implements AiSummaryRepository {
  private databasePromise?: Promise<SqlDatabase>;

  constructor(private readonly createDatabase: SqlDatabaseFactory) {}

  async getCachedSummary(
    cacheKey: AiSummaryCacheKey
  ): Promise<AiSummaryRecord | undefined> {
    const database = await this.getDatabase();
    const scope = getSummaryScope(cacheKey);
    const rows = await database.select<AiSummaryRow>(`
      SELECT
        id,
        account_id,
        message_id,
        thread_id,
        provider_id,
        model_used,
        prompt_id,
        prompt_version,
        input_hash,
        output_json,
        summary_text,
        created_at,
        updated_at
      FROM ai_summaries
      WHERE account_id = ?
        AND ${scope.column} = ?
        AND provider_id = ?
        AND model_used = ?
        AND prompt_id = ?
        AND prompt_version = ?
        AND input_hash = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `, [
      cacheKey.accountId,
      scope.value,
      cacheKey.providerId,
      cacheKey.model,
      cacheKey.promptId,
      cacheKey.promptVersion,
      cacheKey.inputHash
    ]);
    const row = rows[0];

    return row ? mapAiSummary(row) : undefined;
  }

  async saveSummary(record: AiSummaryRecord): Promise<void> {
    const database = await this.getDatabase();

    await database.execute(`
      INSERT INTO ai_summaries (
        id,
        account_id,
        message_id,
        thread_id,
        provider_id,
        model_used,
        prompt_id,
        prompt_version,
        input_hash,
        output_json,
        summary_text,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_id = excluded.provider_id,
        model_used = excluded.model_used,
        prompt_id = excluded.prompt_id,
        prompt_version = excluded.prompt_version,
        input_hash = excluded.input_hash,
        output_json = excluded.output_json,
        summary_text = excluded.summary_text,
        updated_at = excluded.updated_at
    `, [
      record.id,
      record.accountId,
      record.messageId ?? null,
      record.threadId ?? null,
      record.providerId,
      record.model,
      record.promptId,
      record.promptVersion,
      record.inputHash,
      JSON.stringify(record.summary),
      record.summaryText,
      record.createdAt,
      record.updatedAt
    ]);
  }

  async deleteSummariesForContext(input: {
    accountId: string;
    messageId?: string;
    threadId?: string;
  }): Promise<number> {
    const database = await this.getDatabase();
    const scope = getSummaryScope(input);
    const result = await database.execute(
      `DELETE FROM ai_summaries WHERE account_id = ? AND ${scope.column} = ?`,
      [input.accountId, scope.value]
    );

    return result.rowsAffected;
  }

  async deleteSummariesForAccount(accountId: string): Promise<number> {
    const database = await this.getDatabase();
    const result = await database.execute(
      "DELETE FROM ai_summaries WHERE account_id = ?",
      [accountId]
    );

    return result.rowsAffected;
  }

  private getDatabase(): Promise<SqlDatabase> {
    this.databasePromise ??= this.createDatabase().then(async (database) => {
      await database.execute("PRAGMA foreign_keys = ON");
      return database;
    });

    return this.databasePromise;
  }
}

function getSummaryScope(input: {
  messageId?: string;
  threadId?: string;
}): {
  column: "message_id" | "thread_id";
  value: string;
} {
  if (input.threadId) {
    return {
      column: "thread_id",
      value: input.threadId
    };
  }

  if (input.messageId) {
    return {
      column: "message_id",
      value: input.messageId
    };
  }

  throw new Error("AI summary cache scope requires a message ID or thread ID.");
}

function mapAiSummary(row: AiSummaryRow): AiSummaryRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    ...(row.message_id ? { messageId: row.message_id } : {}),
    ...(row.thread_id ? { threadId: row.thread_id } : {}),
    providerId: row.provider_id,
    model: row.model_used,
    promptId: row.prompt_id,
    promptVersion: row.prompt_version,
    inputHash: row.input_hash,
    summary: JSON.parse(row.output_json) as ThreadSummary,
    summaryText: row.summary_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
