-- Up Migration

-- One row per Anki note in an imported deck. Deliberately holds the note's raw,
-- unmapped field data (raw_fields) from the moment of upload -- durable in Postgres,
-- not an in-memory/token store -- so the field-mapping step (POST
-- /api/decks/:id/confirm-mapping) can run any time after upload without depending on
-- server process state surviving in between (Render's free tier can idle a service
-- down and back up between requests).
CREATE TABLE deck_cards (
  id              SERIAL      PRIMARY KEY,
  deck_id         INTEGER     NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  position        INTEGER     NOT NULL,

  -- { <Anki field name>: <HTML-stripped field text> }, from the parsed .apkg note.
  raw_fields      JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Populated by confirm-mapping from raw_fields per the user's chosen field roles.
  -- Null until then.
  english_written TEXT,
  target_written  TEXT,

  -- Populated by the batch-translate step (server/src/services/deckTranslate.ts).
  bridge_written     TEXT,
  bridge_ipa         TEXT,
  bridge_ipa_source  TEXT
                       CHECK (bridge_ipa_source IS NULL OR bridge_ipa_source IN (
                         'direct_phonology', 'derived_phonology', 'uncertain_phonology'
                       )),
  translated         BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Audio is bytea (see plan: no external object storage, Postgres/Neon is the only
  -- reliably persistent infra already available; Render's own filesystem is
  -- ephemeral). Never selected in list/queue queries -- only a boolean presence flag
  -- is projected there -- so a deck heavy with recorded clips doesn't slow studying.
  english_audio       BYTEA,
  english_audio_mime  TEXT,
  target_audio        BYTEA,
  target_audio_mime   TEXT,
  -- Left empty by import; filled in later, manually, by the StudyPage recording flow.
  bridge_audio        BYTEA,
  bridge_audio_mime   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX deck_cards_deck_idx ON deck_cards (deck_id, position);

-- Media extracted from a raw field's [sound:...] reference, before mapping decides
-- which field (if any) plays the role of "the audio field." Small per deck; consumed
-- and safe to clear once confirm-mapping has copied the chosen field's media into
-- deck_cards.english_audio/target_audio.
CREATE TABLE deck_card_raw_media (
  id            SERIAL PRIMARY KEY,
  deck_card_id  INTEGER NOT NULL REFERENCES deck_cards (id) ON DELETE CASCADE,
  field_name    TEXT    NOT NULL,
  filename      TEXT    NOT NULL,
  mime          TEXT    NOT NULL,
  bytes         BYTEA   NOT NULL
);

CREATE INDEX deck_card_raw_media_card_idx ON deck_card_raw_media (deck_card_id, field_name);

-- Down Migration

DROP TABLE deck_card_raw_media;
DROP TABLE deck_cards;
