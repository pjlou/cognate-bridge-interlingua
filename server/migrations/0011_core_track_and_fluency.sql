-- Up Migration

-- Pedagogically "representative" Interlingua closed-class / auxiliary vocabulary
-- (Spec v0.3 §10.1 Core Interlingua). Non-core conjugated verb noise stays false.
ALTER TABLE bridge_vocabulary
  ADD COLUMN IF NOT EXISTS is_core_track BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS bridge_vocabulary_core_track_idx
  ON bridge_vocabulary (bridge_language_id, is_core_track)
  WHERE is_core_track;

-- Down Migration

DROP INDEX IF EXISTS bridge_vocabulary_core_track_idx;
ALTER TABLE bridge_vocabulary DROP COLUMN IF EXISTS is_core_track;
