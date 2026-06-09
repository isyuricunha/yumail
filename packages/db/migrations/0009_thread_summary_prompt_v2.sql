PRAGMA foreign_keys = ON;

INSERT INTO prompt_versions (id, action, version, created_at)
VALUES (
  'prompt:summarize-thread:2.0.0',
  'summarize-thread',
  '2.0.0',
  '2026-06-09T00:00:00.000Z'
)
ON CONFLICT(action, version) DO NOTHING;
