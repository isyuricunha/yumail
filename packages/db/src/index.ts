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
