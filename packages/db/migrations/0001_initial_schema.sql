PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email_address TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('jmap', 'imap-smtp', 'gmail', 'outlook')),
  provider_config_reference TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_mailbox_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom',
  parent_mailbox_id TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, provider_mailbox_id)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_thread_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  latest_message_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  is_unread INTEGER NOT NULL DEFAULT 0 CHECK (is_unread IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, provider_thread_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  provider_thread_id TEXT,
  thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  message_id_header TEXT,
  subject TEXT NOT NULL,
  from_name TEXT,
  from_address TEXT NOT NULL,
  date TEXT NOT NULL,
  received_at TEXT,
  snippet TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  body_html_sanitized TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_flagged INTEGER NOT NULL DEFAULT 0 CHECK (is_flagged IN (0, 1)),
  is_answered INTEGER NOT NULL DEFAULT 0 CHECK (is_answered IN (0, 1)),
  has_attachments INTEGER NOT NULL DEFAULT 0 CHECK (has_attachments IN (0, 1)),
  imap_uidvalidity TEXT,
  imap_uid INTEGER,
  imap_modseq TEXT,
  imap_flags_raw TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, mailbox_id, provider_message_id)
);

CREATE TABLE IF NOT EXISTS message_recipients (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('to', 'cc', 'bcc', 'reply-to')),
  name TEXT,
  address TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  provider_attachment_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_id TEXT,
  local_path_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (message_id, provider_attachment_id)
);

CREATE TABLE IF NOT EXISTS sync_states (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  sync_cursor TEXT,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  uidvalidity TEXT,
  highest_modseq TEXT,
  last_seen_uid INTEGER,
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, mailbox_id, provider_type)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('system', 'user', 'ai-suggested')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, label)
);

CREATE TABLE IF NOT EXISTS message_tags (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, tag_id)
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_reference TEXT NOT NULL,
  default_utility_model TEXT NOT NULL,
  default_drafting_model TEXT NOT NULL,
  temperature REAL,
  max_tokens INTEGER,
  headers_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (action, version)
);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
  model_used TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_tags (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
  model_used TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  label TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_action_items (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
  model_used TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  description TEXT NOT NULL,
  owner TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_reply_drafts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
  model_used TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  body_text TEXT NOT NULL,
  user_edited_body_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_style_profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
  model_used TEXT,
  prompt_version TEXT,
  input_hash TEXT,
  primary_language TEXT NOT NULL,
  tone TEXT NOT NULL,
  formality TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  source_message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_account_mailbox_date
  ON messages(account_id, mailbox_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages(account_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_thread_hash
  ON ai_summaries(account_id, thread_id, input_hash);
