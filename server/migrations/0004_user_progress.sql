-- Up Migration

-- Which real languages a learner is tracking. Drives which cognates appear beside a
-- bridge word: someone learning German does not need the Portuguese column.
CREATE TABLE user_target_languages (
  user_id            INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_language_id INTEGER     NOT NULL REFERENCES target_languages (id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, target_language_id)
);

-- Spaced-repetition state for one learner and one vocabulary item.
--
-- Composite primary key rather than a surrogate id plus a unique constraint: there is
-- no such thing as two progress rows for the same pair, and every query looks the row
-- up by exactly this pair.
CREATE TABLE vocabulary_progress (
  user_id              INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bridge_vocabulary_id INTEGER     NOT NULL REFERENCES bridge_vocabulary (id) ON DELETE CASCADE,
  mastery_level        SMALLINT    NOT NULL DEFAULT 0
                         CHECK (mastery_level BETWEEN 0 AND 100 AND mastery_level % 25 = 0),
  review_count         INTEGER     NOT NULL DEFAULT 0,
  success_count        INTEGER     NOT NULL DEFAULT 0,
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at     TIMESTAMPTZ,
  next_review_at       TIMESTAMPTZ,

  PRIMARY KEY (user_id, bridge_vocabulary_id),
  CONSTRAINT vocabulary_progress_counts CHECK (success_count <= review_count)
);

-- Serves the due query, which filters on user and a next_review_at in the past.
CREATE INDEX vocabulary_progress_due_idx
  ON vocabulary_progress (user_id, next_review_at)
  WHERE mastery_level < 100;

-- Grammar drills schedule on exactly the same algorithm as vocabulary, so the shape is
-- deliberately identical rather than a variation on it.
CREATE TABLE grammar_progress (
  user_id            INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  grammar_pattern_id INTEGER     NOT NULL REFERENCES grammar_patterns (id) ON DELETE CASCADE,
  mastery_level      SMALLINT    NOT NULL DEFAULT 0
                       CHECK (mastery_level BETWEEN 0 AND 100 AND mastery_level % 25 = 0),
  review_count       INTEGER     NOT NULL DEFAULT 0,
  success_count      INTEGER     NOT NULL DEFAULT 0,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at   TIMESTAMPTZ,
  next_review_at     TIMESTAMPTZ,

  PRIMARY KEY (user_id, grammar_pattern_id),
  CONSTRAINT grammar_progress_counts CHECK (success_count <= review_count)
);

CREATE INDEX grammar_progress_due_idx
  ON grammar_progress (user_id, next_review_at)
  WHERE mastery_level < 100;

-- Down Migration

DROP TABLE grammar_progress;
DROP TABLE vocabulary_progress;
DROP TABLE user_target_languages;
