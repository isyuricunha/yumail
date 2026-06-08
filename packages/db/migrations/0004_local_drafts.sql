PRAGMA foreign_keys = ON;

ALTER TABLE messages
  ADD COLUMN in_reply_to_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE messages
  ADD COLUMN references_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS local_drafts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('new', 'reply')),
  related_message_id TEXT,
  related_provider_message_id TEXT,
  related_provider_thread_id TEXT,
  related_message_id_header TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  body_format TEXT NOT NULL DEFAULT 'plain-text'
    CHECK (body_format IN ('plain-text')),
  body_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_drafts_account_updated
  ON local_drafts(account_id, updated_at DESC);
