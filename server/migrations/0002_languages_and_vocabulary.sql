-- Up Migration

CREATE TYPE language_family AS ENUM ('Germanic', 'Romance');

-- A constructed auxiliary language taught as scaffolding, not as an end in itself.
CREATE TABLE bridge_languages (
  id           SERIAL          PRIMARY KEY,
  code         TEXT            NOT NULL UNIQUE,
  name         TEXT            NOT NULL,
  family       language_family NOT NULL,
  description  TEXT,
  source_url   TEXT,
  -- Not decorative. Sources carry different terms and the About page has to state
  -- them, so the licence travels with the data rather than living only in a doc.
  license_note TEXT            NOT NULL
);

-- A real language a learner is actually aiming for.
CREATE TABLE target_languages (
  id     SERIAL          PRIMARY KEY,
  code   TEXT            NOT NULL UNIQUE,
  name   TEXT            NOT NULL,
  family language_family NOT NULL
);

-- Which bridges open onto which targets. Many-to-many rather than a column on
-- target_languages: English is a control language for both families, and nothing in
-- the model should assume a target belongs to exactly one bridge.
CREATE TABLE bridge_target_links (
  bridge_language_id INTEGER NOT NULL REFERENCES bridge_languages (id) ON DELETE CASCADE,
  target_language_id INTEGER NOT NULL REFERENCES target_languages (id) ON DELETE CASCADE,
  position           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bridge_language_id, target_language_id)
);

CREATE TABLE bridge_vocabulary (
  id                 SERIAL   PRIMARY KEY,
  bridge_language_id INTEGER  NOT NULL REFERENCES bridge_languages (id) ON DELETE CASCADE,
  headword           TEXT     NOT NULL,
  part_of_speech     TEXT     NOT NULL,
  -- The single gloss shown on a flashcard, plus the full synonym list behind it.
  -- IEDICT gives up to a dozen glosses per entry; showing all of them on a card
  -- makes it unanswerable.
  gloss_en           TEXT     NOT NULL,
  glosses_en         TEXT[]   NOT NULL DEFAULT '{}',
  ipa                TEXT,
  etymology          TEXT,
  difficulty_level   SMALLINT NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  -- Where this row came from, e.g. 'IEDICT 2019'.
  source_ref         TEXT     NOT NULL,
  -- Dictionaries number homographs (arm 1 "poor" vs arm 2 "arm"). Without this the
  -- pair collides on (headword, part_of_speech) and one sense is silently dropped.
  homograph_index    SMALLINT NOT NULL DEFAULT 1,

  UNIQUE (bridge_language_id, headword, part_of_speech, homograph_index)
);

CREATE INDEX bridge_vocabulary_language_difficulty_idx
  ON bridge_vocabulary (bridge_language_id, difficulty_level);

-- Trigram-free prefix search is enough for the browse box and needs no extension.
CREATE INDEX bridge_vocabulary_headword_idx
  ON bridge_vocabulary (bridge_language_id, LOWER(headword) text_pattern_ops);

-- A stated sound-correspondence rule, sourced from a grammar or dictionary.
--
-- The point of this table is that a rule is an object a lesson references, not a
-- string embedded in a description. Rows are also *executable*: pattern_from and
-- pattern_to are a regex and replacement that transform a bridge headword into the
-- predicted target form. The same row that renders "only Italian retains the final
-- -e" is the row that generated `cantare` from `cantar`.
--
-- Germanic rules are explanatory only (the dictionary states the cognates outright,
-- so nothing needs generating) and leave the pattern columns null.
CREATE TABLE correspondence_rules (
  id                 SERIAL  PRIMARY KEY,
  bridge_language_id INTEGER NOT NULL REFERENCES bridge_languages (id) ON DELETE CASCADE,
  -- Stable slug used by the seed scripts to reference a rule without knowing its id.
  -- The target language is encoded in the slug where a rule is target-specific,
  -- e.g. 'ia.infinitive-ar.spa'.
  code               TEXT    NOT NULL,
  description        TEXT    NOT NULL,
  -- Citation for the section the rule is drawn from. Every rule must have one; the
  -- project does not derive correspondences itself.
  source_note        TEXT    NOT NULL,
  -- Null when the rule holds across every target of this bridge.
  target_language_id INTEGER REFERENCES target_languages (id) ON DELETE CASCADE,
  pattern_from       TEXT,
  pattern_to         TEXT,
  example_bridge     TEXT,
  example_target     TEXT,

  UNIQUE (bridge_language_id, code),
  -- A half-specified transformation would silently generate nothing.
  CONSTRAINT correspondence_rules_pattern_pairing
    CHECK ((pattern_from IS NULL) = (pattern_to IS NULL))
);

CREATE TYPE correspondence_provenance AS ENUM ('parsed', 'rule_generated', 'curated');

CREATE TABLE cognate_correspondences (
  id                     SERIAL                    PRIMARY KEY,
  bridge_vocabulary_id   INTEGER                   NOT NULL REFERENCES bridge_vocabulary (id) ON DELETE CASCADE,
  target_language_id     INTEGER                   NOT NULL REFERENCES target_languages (id) ON DELETE CASCADE,
  target_word            TEXT                      NOT NULL,
  correspondence_rule_id INTEGER                   REFERENCES correspondence_rules (id) ON DELETE SET NULL,
  provenance             correspondence_provenance NOT NULL,
  confidence             NUMERIC(3, 2)             NOT NULL DEFAULT 1.00
                           CHECK (confidence >= 0 AND confidence <= 1),
  -- Which lexicon confirmed a generated form, e.g. 'apertium-eng-spa'. Null for
  -- parsed rows, which are attested by the source dictionary itself.
  validated_against      TEXT,
  notes                  TEXT,

  UNIQUE (bridge_vocabulary_id, target_language_id, target_word),

  -- The Romance side generates cognates *from* rules, so a generated row without a
  -- rule would be an unexplained assertion. Parsed rows may legitimately have no
  -- rule: the dictionary lists the cognate without stating a sound law for it.
  CONSTRAINT cognate_generated_requires_rule
    CHECK (provenance <> 'rule_generated' OR correspondence_rule_id IS NOT NULL)
);

CREATE INDEX cognate_correspondences_vocabulary_idx
  ON cognate_correspondences (bridge_vocabulary_id);

CREATE INDEX cognate_correspondences_target_idx
  ON cognate_correspondences (target_language_id);

-- Down Migration

DROP TABLE cognate_correspondences;
DROP TYPE correspondence_provenance;
DROP TABLE correspondence_rules;
DROP TABLE bridge_vocabulary;
DROP TABLE bridge_target_links;
DROP TABLE target_languages;
DROP TABLE bridge_languages;
DROP TYPE language_family;
