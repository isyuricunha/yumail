PRAGMA foreign_keys = ON;

ALTER TABLE ai_summaries
  ADD COLUMN prompt_id TEXT NOT NULL DEFAULT 'summarize-thread';

ALTER TABLE ai_summaries
  ADD COLUMN summary_text TEXT NOT NULL DEFAULT '';

INSERT INTO prompt_versions (id, action, version, created_at)
VALUES (
  'prompt:summarize-thread:1.0.0',
  'summarize-thread',
  '1.0.0',
  '2026-06-08T00:00:00.000Z'
)
ON CONFLICT(action, version) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_ai_summaries_message_cache
  ON ai_summaries(
    account_id,
    message_id,
    provider_id,
    model_used,
    prompt_id,
    prompt_version,
    input_hash
  );
