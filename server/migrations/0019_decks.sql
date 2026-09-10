-- Up Migration

-- A user-owned deck, imported from an Anki .apkg export. Deliberately not folded into
-- bridge_languages/bridge_vocabulary: those are truncated and rebuilt wholesale by
-- `npm run seed` (see server/src/seed/backup.ts), which only knows how to carry
-- forward progress on the curated dictionary content by natural key -- an imported
-- deck has no such natural key and would be silently destroyed on the next reseed if
-- it lived in that table. See server/src/services/mt/* for the translation pipeline
-- that fills a deck's bridge_written/bridge_ipa fields once mapping is confirmed.
CREATE TABLE decks (
  id                  SERIAL      PRIMARY KEY,
  owner_user_id       INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Null until the mapping step (deck_cards.raw_fields exists first; the deck's own
  -- bridge/target language choice is confirmed alongside the field mapping).
  bridge_language_id  INTEGER     REFERENCES bridge_languages (id),
  target_language_id  INTEGER     REFERENCES target_languages (id),
  name                TEXT        NOT NULL,
  source_filename     TEXT,
  status              TEXT        NOT NULL DEFAULT 'mapping'
                         CHECK (status IN ('mapping', 'translating', 'ready', 'failed')),
  card_count          INTEGER     NOT NULL DEFAULT 0,
  untranslated_count  INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  translated_at       TIMESTAMPTZ
);

CREATE INDEX decks_owner_idx ON decks (owner_user_id, status);

-- Down Migration

DROP TABLE decks;
