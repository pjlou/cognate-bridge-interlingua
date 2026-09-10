-- Up Migration

-- A drillable grammatical structure: V2 word order, strong-verb ablaut Class III,
-- object-pronoun proclisis, and so on.
--
-- One table serves both families. The Germanic patterns come from Parke's grammar and
-- the Romance ones from Gode & Blair, but nothing in the shape is family-specific, so
-- adding regularised Romance agreement content later needs no migration.
CREATE TABLE grammar_patterns (
  id                 SERIAL          PRIMARY KEY,
  bridge_language_id INTEGER         NOT NULL REFERENCES bridge_languages (id) ON DELETE CASCADE,
  slug               TEXT            NOT NULL,
  name               TEXT            NOT NULL,
  family             language_family NOT NULL,
  -- One line for the pattern list.
  summary            TEXT            NOT NULL,
  -- The full explanation shown before the drill.
  description        TEXT            NOT NULL,
  source_note        TEXT            NOT NULL,
  difficulty_level   SMALLINT        NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  position           INTEGER         NOT NULL DEFAULT 0,

  UNIQUE (bridge_language_id, slug)
);

-- Example sentences as rows, not as a JSON blob on grammar_patterns.
--
-- The spec calls for these to be structured rather than free text, and the drill needs
-- to address them individually: pick one example, hide the highlighted constituent, and
-- score the answer. A blob would make that a client-side string operation and would put
-- the parallel translations out of reach of a query.
CREATE TABLE grammar_pattern_examples (
  id                 SERIAL  PRIMARY KEY,
  grammar_pattern_id INTEGER NOT NULL REFERENCES grammar_patterns (id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,
  bridge_text        TEXT    NOT NULL,
  gloss_en           TEXT    NOT NULL,
  -- The constituent the pattern is about: the finite verb for V2, the object pronoun
  -- for proclisis. The drill blanks this out.
  highlight          TEXT,
  prompt             TEXT,
  answer             TEXT,
  -- Wrong options for the multiple-choice mode. Empty means the example is
  -- illustrative only and is shown but not drilled.
  distractors        TEXT[]  NOT NULL DEFAULT '{}',
  note               TEXT,

  UNIQUE (grammar_pattern_id, position),

  -- A drillable example needs both halves; an illustrative one needs neither.
  CONSTRAINT grammar_example_drill_pairing
    CHECK ((prompt IS NULL) = (answer IS NULL))
);

-- The same sentence in a real target language, so a drill can show that Interlingua
-- `Io le vide` is Spanish `Yo lo veo` and Italian `Io lo vedo` -- the correspondence
-- layer applied to syntax rather than to single words.
CREATE TABLE grammar_pattern_parallels (
  id                         SERIAL  PRIMARY KEY,
  grammar_pattern_example_id INTEGER NOT NULL
                               REFERENCES grammar_pattern_examples (id) ON DELETE CASCADE,
  target_language_id         INTEGER NOT NULL
                               REFERENCES target_languages (id) ON DELETE CASCADE,
  target_text                TEXT    NOT NULL,

  UNIQUE (grammar_pattern_example_id, target_language_id)
);

CREATE INDEX grammar_pattern_examples_pattern_idx
  ON grammar_pattern_examples (grammar_pattern_id, position);

-- Down Migration

DROP TABLE grammar_pattern_parallels;
DROP TABLE grammar_pattern_examples;
DROP TABLE grammar_patterns;
