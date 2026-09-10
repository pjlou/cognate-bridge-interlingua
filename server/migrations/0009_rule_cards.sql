-- Up Migration

-- Cross-bridge decoder cards: synchronic sound-correspondence rules the learner
-- studies as first-class objects (list + drill + SRS), separate from bridge-scoped
-- executable `correspondence_rules` used to annotate vocabulary cognates.
CREATE TABLE rule_cards (
  id                 SERIAL   PRIMARY KEY,
  slug               TEXT     NOT NULL UNIQUE,
  name               TEXT     NOT NULL,
  -- 1 = teach first (highest yield); 2 = secondary.
  tier               SMALLINT NOT NULL CHECK (tier IN (1, 2)),
  position           INTEGER  NOT NULL DEFAULT 0,
  teaching_frame     TEXT     NOT NULL,
  pattern_summary    TEXT     NOT NULL,
  description        TEXT     NOT NULL,
  caveat             TEXT,
  source_note        TEXT     NOT NULL,
  difficulty_level   SMALLINT NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  -- Optional link keys into bridge-specific sound-law codes (prefix match) for deep
  -- links from vocabulary correspondence panels, e.g. 'ia.infinitive-ar' or 'fin.grad'.
  sound_law_prefixes TEXT[]   NOT NULL DEFAULT '{}'
);

CREATE TABLE rule_card_mappings (
  id           SERIAL  PRIMARY KEY,
  rule_card_id INTEGER NOT NULL REFERENCES rule_cards (id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  from_label   TEXT    NOT NULL,
  to_label     TEXT    NOT NULL,
  notation     TEXT,

  UNIQUE (rule_card_id, position)
);

CREATE TABLE rule_card_examples (
  id           SERIAL  PRIMARY KEY,
  rule_card_id INTEGER NOT NULL REFERENCES rule_cards (id) ON DELETE CASCADE,
  mapping_id   INTEGER REFERENCES rule_card_mappings (id) ON DELETE SET NULL,
  position     INTEGER NOT NULL,
  prompt       TEXT,
  answer       TEXT,
  distractors  TEXT[]  NOT NULL DEFAULT '{}',
  note         TEXT,
  false_friend BOOLEAN NOT NULL DEFAULT FALSE,
  -- Triad / multi-language display: { "la": "pater", "en": "father", "de": "Vater", ... }
  forms        JSONB   NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE (rule_card_id, position),

  CONSTRAINT rule_card_example_drill_pairing
    CHECK ((prompt IS NULL) = (answer IS NULL))
);

CREATE INDEX rule_card_examples_card_idx
  ON rule_card_examples (rule_card_id, position);

CREATE INDEX rule_card_mappings_card_idx
  ON rule_card_mappings (rule_card_id, position);

-- Same SRS shape as grammar_progress.
CREATE TABLE rule_card_progress (
  user_id          INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rule_card_id     INTEGER     NOT NULL REFERENCES rule_cards (id) ON DELETE CASCADE,
  mastery_level    SMALLINT    NOT NULL DEFAULT 0
                     CHECK (mastery_level BETWEEN 0 AND 100 AND mastery_level % 25 = 0),
  review_count     INTEGER     NOT NULL DEFAULT 0,
  success_count    INTEGER     NOT NULL DEFAULT 0,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  next_review_at   TIMESTAMPTZ,

  PRIMARY KEY (user_id, rule_card_id),
  CONSTRAINT rule_card_progress_counts CHECK (success_count <= review_count)
);

CREATE INDEX rule_card_progress_due_idx
  ON rule_card_progress (user_id, next_review_at)
  WHERE mastery_level < 100;

-- Down Migration

DROP TABLE IF EXISTS rule_card_progress;
DROP TABLE IF EXISTS rule_card_examples;
DROP TABLE IF EXISTS rule_card_mappings;
DROP TABLE IF EXISTS rule_cards;
