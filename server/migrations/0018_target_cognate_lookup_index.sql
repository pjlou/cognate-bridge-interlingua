-- Up Migration

-- Target dictionary lookup matches normalized target forms by language.
CREATE INDEX IF NOT EXISTS cognate_target_language_word_idx
  ON cognate_correspondences (target_language_id, LOWER(target_word));

-- Down Migration

DROP INDEX IF EXISTS cognate_target_language_word_idx;
