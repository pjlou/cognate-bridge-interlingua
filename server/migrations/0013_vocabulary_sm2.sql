-- Up Migration

-- Anki-classic SM-2 fields for vocabulary only. Grammar / rule-card progress keep
-- Leitner mastery_level.

CREATE TYPE vocabulary_card_state AS ENUM ('new', 'learning', 'review', 'relearning');

ALTER TABLE vocabulary_progress
  ADD COLUMN card_state vocabulary_card_state NOT NULL DEFAULT 'new',
  ADD COLUMN ease_factor NUMERIC(4, 2) NOT NULL DEFAULT 2.50
    CHECK (ease_factor >= 1.30),
  ADD COLUMN interval_days NUMERIC(12, 6) NOT NULL DEFAULT 0,
  ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0
    CHECK (repetitions >= 0),
  ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0
    CHECK (lapses >= 0),
  ADD COLUMN learning_step INTEGER NOT NULL DEFAULT 0
    CHECK (learning_step >= 0);

-- Backfill from the old Leitner mastery boxes before dropping the column.
UPDATE vocabulary_progress SET
  card_state = CASE
    WHEN mastery_level = 0 AND review_count = 0 THEN 'new'::vocabulary_card_state
    WHEN mastery_level = 0 THEN 'learning'::vocabulary_card_state
    WHEN mastery_level = 25 THEN 'learning'::vocabulary_card_state
    ELSE 'review'::vocabulary_card_state
  END,
  ease_factor = 2.50,
  interval_days = CASE
    WHEN mastery_level = 0 THEN 0
    WHEN mastery_level = 25 THEN 0.5
    WHEN mastery_level = 50 THEN 1
    WHEN mastery_level = 75 THEN 3
    WHEN mastery_level = 100 THEN 365
    ELSE 1
  END,
  repetitions = CASE
    WHEN mastery_level >= 50 THEN GREATEST(success_count, 1)
    ELSE 0
  END,
  learning_step = CASE
    WHEN mastery_level = 25 THEN 1
    WHEN mastery_level = 0 AND review_count > 0 THEN 0
    ELSE 0
  END;

ALTER TABLE vocabulary_progress DROP COLUMN mastery_level;

DROP INDEX IF EXISTS vocabulary_progress_due_idx;

-- Due cards are those whose scheduled time has passed. New / learning cards with a
-- null next_review_at remain eligible via the study query's LEFT JOIN path.
CREATE INDEX vocabulary_progress_due_idx
  ON vocabulary_progress (user_id, tier, next_review_at);

-- Down Migration

DROP INDEX IF EXISTS vocabulary_progress_due_idx;

ALTER TABLE vocabulary_progress
  ADD COLUMN mastery_level SMALLINT NOT NULL DEFAULT 0
    CHECK (mastery_level BETWEEN 0 AND 100 AND mastery_level % 25 = 0);

UPDATE vocabulary_progress SET mastery_level = CASE
  WHEN card_state = 'new' THEN 0
  WHEN card_state IN ('learning', 'relearning') THEN 25
  WHEN interval_days >= 365 THEN 100
  WHEN interval_days >= 3 THEN 75
  WHEN interval_days >= 1 THEN 50
  ELSE 25
END;

ALTER TABLE vocabulary_progress
  DROP COLUMN learning_step,
  DROP COLUMN lapses,
  DROP COLUMN repetitions,
  DROP COLUMN interval_days,
  DROP COLUMN ease_factor,
  DROP COLUMN card_state;

DROP TYPE vocabulary_card_state;

CREATE INDEX vocabulary_progress_due_idx
  ON vocabulary_progress (user_id, tier, next_review_at)
  WHERE mastery_level < 100;
