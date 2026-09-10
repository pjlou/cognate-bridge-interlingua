-- Up Migration

-- English lemma rank from the COCA frequency list (www.wordfrequency.info), used to
-- batch study cards into groups of 500. Null when no gloss or English cognate matched
-- a listed lemma; those words are studied after the ranked bands.
ALTER TABLE bridge_vocabulary
  ADD COLUMN frequency_rank INTEGER CHECK (frequency_rank IS NULL OR frequency_rank > 0);

-- 1 = ranks 1-500, 2 = 501-1000, and so on. Kept as a column so the study queue can
-- filter without recomputing the band on every request.
ALTER TABLE bridge_vocabulary
  ADD COLUMN frequency_band SMALLINT CHECK (frequency_band IS NULL OR frequency_band > 0);

-- True when the word has an attested English cognate, or when the headword is close
-- enough to its English gloss that an English speaker can read it on sight. The study
-- queue uses this to skip words the learner almost certainly already knows.
ALTER TABLE bridge_vocabulary
  ADD COLUMN has_english_cognate BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX bridge_vocabulary_study_band_idx
  ON bridge_vocabulary (bridge_language_id, frequency_band, has_english_cognate);

-- Down Migration

DROP INDEX bridge_vocabulary_study_band_idx;
ALTER TABLE bridge_vocabulary DROP COLUMN has_english_cognate;
ALTER TABLE bridge_vocabulary DROP COLUMN frequency_band;
ALTER TABLE bridge_vocabulary DROP COLUMN frequency_rank;
