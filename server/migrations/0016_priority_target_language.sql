-- Up Migration

-- One preferred natural-language cognate for bridge-tile peeks in the matching game.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS priority_target_language_id INTEGER
    REFERENCES target_languages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_priority_target_language_idx
  ON users (priority_target_language_id)
  WHERE priority_target_language_id IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS users_priority_target_language_idx;
ALTER TABLE users DROP COLUMN IF EXISTS priority_target_language_id;
