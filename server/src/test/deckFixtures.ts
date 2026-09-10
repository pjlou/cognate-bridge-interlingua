import { queryOne } from '../db.js';

/**
 * A minimal ready deck for exercising deckContent.model.ts / deckProgress.model.ts:
 * one bridge language, one target language, and two translated cards.
 */
export interface DeckFixture {
  bridgeLanguageId: number;
  targetLanguageId: number;
  deckId: number;
  cardIds: number[];
}

async function insertId(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ id: number }>(sql, params);
  return row!.id;
}

export async function seedDeckFixture(ownerUserId: number): Promise<DeckFixture> {
  const bridgeLanguageId = await insertId(
    `INSERT INTO bridge_languages (code, name, family, license_note)
     VALUES ('ia', 'Interlingua', 'Romance', 'CC BY 3.0')
     RETURNING id`,
  );
  const targetLanguageId = await insertId(
    `INSERT INTO target_languages (code, name, family)
     VALUES ('de', 'German', 'Germanic')
     RETURNING id`,
  );

  const deckId = await insertId(
    `INSERT INTO decks
       (owner_user_id, bridge_language_id, target_language_id, name, source_filename, status, card_count)
     VALUES ($1, $2, $3, 'My Anki Deck', 'deck.apkg', 'ready', 2)
     RETURNING id`,
    [ownerUserId, bridgeLanguageId, targetLanguageId],
  );

  const hausCardId = await insertId(
    `INSERT INTO deck_cards
       (deck_id, position, english_written, target_written, bridge_written, bridge_ipa,
        bridge_ipa_source, translated)
     VALUES ($1, 0, 'house', 'Haus', 'haus', '/haʊs/', 'direct_phonology', TRUE)
     RETURNING id`,
    [deckId],
  );

  const wasserCardId = await insertId(
    `INSERT INTO deck_cards
       (deck_id, position, english_written, target_written, bridge_written, translated)
     VALUES ($1, 1, 'water', 'Wasser', 'wasser', TRUE)
     RETURNING id`,
    [deckId],
  );

  return {
    bridgeLanguageId,
    targetLanguageId,
    deckId,
    cardIds: [hausCardId, wasserCardId],
  };
}
