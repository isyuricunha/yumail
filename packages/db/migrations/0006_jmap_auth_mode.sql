PRAGMA foreign_keys = ON;

ALTER TABLE jmap_account_configs
  ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'basic';

ALTER TABLE jmap_account_configs
  ADD COLUMN auth_username TEXT;
