PRAGMA foreign_keys = ON;

ALTER TABLE jmap_account_configs
  ADD COLUMN session_url TEXT;
