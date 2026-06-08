PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jmap_account_configs (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  jmap_base_url TEXT NOT NULL,
  credential_reference TEXT NOT NULL,
  jmap_account_id TEXT,
  session_api_url TEXT,
  last_connected_at TEXT,
  UNIQUE (credential_reference)
);
