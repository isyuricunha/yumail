PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS message_bodies (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL,
  body_text TEXT,
  body_html_raw TEXT,
  body_parts_json TEXT NOT NULL DEFAULT '[]',
  cached_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_bodies_account_provider
  ON message_bodies(account_id, provider_message_id);
