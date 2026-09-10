-- Up Migration

-- Named sound-law display. Romance rules keep using `description` and leave these null.
ALTER TABLE correspondence_rules
  ADD COLUMN name TEXT,
  ADD COLUMN notation TEXT;

-- Several laws can explain one attested pair (e.g. Grimm and a vowel change).
CREATE TABLE cognate_rule_links (
  cognate_correspondence_id INTEGER NOT NULL REFERENCES cognate_correspondences (id) ON DELETE CASCADE,
  correspondence_rule_id    INTEGER NOT NULL REFERENCES correspondence_rules (id) ON DELETE CASCADE,
  PRIMARY KEY (cognate_correspondence_id, correspondence_rule_id)
);

CREATE INDEX cognate_rule_links_rule_idx ON cognate_rule_links (correspondence_rule_id);

INSERT INTO cognate_rule_links (cognate_correspondence_id, correspondence_rule_id)
SELECT id, correspondence_rule_id
  FROM cognate_correspondences
 WHERE correspondence_rule_id IS NOT NULL;

-- Two independently scheduled cards per vocabulary item: tier 1 (English → bridge)
-- and tier 2 (bridge → selected languages), unlocked after the first tier sticks.
ALTER TABLE vocabulary_progress
  ADD COLUMN tier SMALLINT NOT NULL DEFAULT 1
    CHECK (tier IN (1, 2)),
  ADD COLUMN consecutive_successes INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_successes >= 0);

ALTER TABLE vocabulary_progress DROP CONSTRAINT vocabulary_progress_pkey;

ALTER TABLE vocabulary_progress
  ADD PRIMARY KEY (user_id, bridge_vocabulary_id, tier);

DROP INDEX IF EXISTS vocabulary_progress_due_idx;

CREATE INDEX vocabulary_progress_due_idx
  ON vocabulary_progress (user_id, tier, next_review_at)
  WHERE mastery_level < 100;

-- Down Migration

DROP INDEX IF EXISTS vocabulary_progress_due_idx;

ALTER TABLE vocabulary_progress DROP CONSTRAINT vocabulary_progress_pkey;

ALTER TABLE vocabulary_progress
  DROP COLUMN consecutive_successes,
  DROP COLUMN tier;

ALTER TABLE vocabulary_progress
  ADD PRIMARY KEY (user_id, bridge_vocabulary_id);

CREATE INDEX vocabulary_progress_due_idx
  ON vocabulary_progress (user_id, next_review_at)
  WHERE mastery_level < 100;

DROP TABLE cognate_rule_links;

ALTER TABLE correspondence_rules
  DROP COLUMN notation,
  DROP COLUMN name;
