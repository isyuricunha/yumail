PRAGMA foreign_keys = ON;

ALTER TABLE ai_providers
  ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'openai-compatible';

ALTER TABLE ai_providers
  ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'bearer';

ALTER TABLE ai_providers
  ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1));

ALTER TABLE ai_providers
  ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0
    CHECK (is_default IN (0, 1));

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_providers_single_default
  ON ai_providers(is_default)
  WHERE is_default = 1;
