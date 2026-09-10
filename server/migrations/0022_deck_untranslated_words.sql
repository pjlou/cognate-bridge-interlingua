-- Up Migration

-- One row per unknown word the MT pipeline flagged while translating a deck card's
-- English text (see server/src/services/deckTranslate.ts). Normalized into its own
-- table, rather than re-scanning bridge_written for "{word}" placeholders at export
-- time, so re-running translate is idempotent and the "untranslated words" document
-- (server/src/services/deckExport.ts) is a simple read.
CREATE TABLE deck_untranslated_words (
  id            SERIAL PRIMARY KEY,
  deck_id       INTEGER NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  deck_card_id  INTEGER NOT NULL REFERENCES deck_cards (id) ON DELETE CASCADE,
  word          TEXT    NOT NULL
);

CREATE INDEX deck_untranslated_words_deck_idx ON deck_untranslated_words (deck_id);

-- Down Migration

DROP TABLE deck_untranslated_words;
