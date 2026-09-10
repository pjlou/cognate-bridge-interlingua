-- Up Migration

-- Soft-remove vocabulary cards from the learner deck without wiping SM-2 state.
ALTER TABLE vocabulary_progress
  ADD COLUMN removed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX vocabulary_progress_removed_idx
  ON vocabulary_progress (user_id, removed)
  WHERE removed = TRUE;

-- Down Migration

DROP INDEX IF EXISTS vocabulary_progress_removed_idx;

ALTER TABLE vocabulary_progress
  DROP COLUMN removed;
