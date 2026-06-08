import type { AiProviderConfiguration } from "@yumail/ai";
import type {
  AiProviderRepository,
  SqlDatabase,
  SqlDatabaseFactory
} from "./index";

interface AiProviderRow {
  id: string;
  provider_type: string;
  name: string;
  base_url: string;
  api_key_reference: string;
  default_utility_model: string;
  temperature: number | null;
  max_tokens: number | null;
  auth_mode: string;
  enabled: number;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export class SqliteAiProviderRepository implements AiProviderRepository {
  private databasePromise?: Promise<SqlDatabase>;

  constructor(private readonly createDatabase: SqlDatabaseFactory) {}

  async listAiProviders(): Promise<AiProviderConfiguration[]> {
    const database = await this.getDatabase();
    const rows = await database.select<AiProviderRow>(`
      SELECT
        id,
        provider_type,
        name,
        base_url,
        api_key_reference,
        default_utility_model,
        temperature,
        max_tokens,
        auth_mode,
        enabled,
        is_default,
        created_at,
        updated_at
      FROM ai_providers
      ORDER BY is_default DESC, updated_at DESC
    `);

    return rows.map(mapAiProvider);
  }

  async getDefaultAiProvider(): Promise<AiProviderConfiguration | undefined> {
    const providers = await this.listAiProviders();
    return providers.find((provider) => provider.isDefault) ?? providers[0];
  }

  async saveAiProvider(configuration: AiProviderConfiguration): Promise<void> {
    const database = await this.getDatabase();

    if (configuration.isDefault) {
      await database.execute(
        "UPDATE ai_providers SET is_default = 0 WHERE id <> ?",
        [configuration.id]
      );
    }

    await database.execute(`
      INSERT INTO ai_providers (
        id,
        provider_type,
        name,
        base_url,
        api_key_reference,
        default_utility_model,
        default_drafting_model,
        temperature,
        max_tokens,
        headers_reference,
        auth_mode,
        enabled,
        is_default,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_type = excluded.provider_type,
        name = excluded.name,
        base_url = excluded.base_url,
        api_key_reference = excluded.api_key_reference,
        default_utility_model = excluded.default_utility_model,
        default_drafting_model = excluded.default_drafting_model,
        temperature = excluded.temperature,
        max_tokens = excluded.max_tokens,
        auth_mode = excluded.auth_mode,
        enabled = excluded.enabled,
        is_default = excluded.is_default,
        updated_at = excluded.updated_at
    `, [
      configuration.id,
      configuration.providerType,
      configuration.displayName,
      configuration.baseUrl,
      configuration.credentialReference,
      configuration.model,
      configuration.model,
      configuration.temperature ?? null,
      configuration.maxTokens ?? null,
      null,
      configuration.authMode,
      toInteger(configuration.enabled),
      toInteger(configuration.isDefault),
      configuration.createdAt,
      configuration.updatedAt
    ]);
  }

  private getDatabase(): Promise<SqlDatabase> {
    this.databasePromise ??= this.createDatabase().then(async (database) => {
      await database.execute("PRAGMA foreign_keys = ON");
      return database;
    });

    return this.databasePromise;
  }
}

function mapAiProvider(row: AiProviderRow): AiProviderConfiguration {
  return {
    id: row.id,
    providerType: "openai-compatible",
    displayName: row.name,
    baseUrl: row.base_url,
    model: row.default_utility_model,
    temperature: row.temperature ?? undefined,
    maxTokens: row.max_tokens ?? undefined,
    authMode: row.auth_mode === "none" ? "none" : "bearer",
    credentialReference: row.api_key_reference,
    enabled: fromInteger(row.enabled),
    isDefault: fromInteger(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInteger(value: boolean): number {
  return value ? 1 : 0;
}

function fromInteger(value: number): boolean {
  return value === 1;
}
