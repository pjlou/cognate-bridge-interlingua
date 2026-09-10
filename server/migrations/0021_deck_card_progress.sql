-- Up Migration

-- Per-user SM-2 progress on an imported deck's cards, keyed by (user, card, tier) --
-- structurally identical to vocabulary_progress (see migration 0013) so the same
-- pure scheduling math in server/src/services/scheduler.ts (applyVocabularyGrade)
-- can be reused unmodified; only the CRUD layer around it differs, mirroring
-- server/src/models/progress.model.ts as server/src/models/deckProgress.model.ts.
-- A card can carry independent tier-1 (English<->Bridge) and tier-2 (Bridge<->Target)
-- progress rows, same as the built-in bridge decks.
CREATE TABLE deck_card_progress (
  user_id           INTEGER               NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  deck_card_id      INTEGER               NOT NULL REFERENCES deck_cards (id) ON DELETE CASCADE,
  tier              SMALLINT              NOT NULL CHECK (tier IN (1, 2)),

  card_state        vocabulary_card_state NOT NULL DEFAULT 'new',
  ease_factor       NUMERIC(4, 2)         NOT NULL DEFAULT 2.50 CHECK (ease_factor >= 1.30),
  interval_days     NUMERIC(12, 6)        NOT NULL DEFAULT 0,
  repetitions       INTEGER               NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  lapses            INTEGER               NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  learning_step     INTEGER               NOT NULL DEFAULT 0 CHECK (learning_step >= 0),
  review_count      INTEGER               NOT NULL DEFAULT 0,
  success_count     INTEGER               NOT NULL DEFAULT 0,
  first_seen_at     TIMESTAMPTZ,
  last_reviewed_at  TIMESTAMPTZ,
  next_review_at    TIMESTAMPTZ,
  removed           BOOLEAN               NOT NULL DEFAULT FALSE,

  PRIMARY KEY (user_id, deck_card_id, tier),
  CONSTRAINT deck_card_progress_counts CHECK (success_count <= review_count)
);

CREATE INDEX deck_card_progress_due_idx
  ON deck_card_progress (user_id, tier, next_review_at);

CREATE INDEX deck_card_progress_removed_idx
  ON deck_card_progress (user_id, removed)
  WHERE removed = TRUE;

-- Down Migration

DROP TABLE deck_card_progress;
