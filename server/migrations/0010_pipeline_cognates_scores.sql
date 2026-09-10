-- Up Migration

-- Surface-transparent cognates from translation-pair similarity (augment, not replace).
ALTER TYPE correspondence_provenance ADD VALUE IF NOT EXISTS 'similarity';

-- Continuous cognate transparency and composite study priority (lower = sooner).
ALTER TABLE bridge_vocabulary
  ADD COLUMN IF NOT EXISTS transparency_score NUMERIC(4, 3)
    CHECK (transparency_score IS NULL OR (transparency_score >= 0 AND transparency_score <= 1)),
  ADD COLUMN IF NOT EXISTS priority_score NUMERIC(12, 4);

CREATE INDEX IF NOT EXISTS bridge_vocabulary_priority_idx
  ON bridge_vocabulary (bridge_language_id, priority_score NULLS LAST, frequency_rank NULLS LAST);

-- Down Migration

DROP INDEX IF EXISTS bridge_vocabulary_priority_idx;
ALTER TABLE bridge_vocabulary
  DROP COLUMN IF EXISTS priority_score,
  DROP COLUMN IF EXISTS transparency_score;
-- Enum values cannot be removed safely in Postgres; leave 'similarity' in place.
