import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryOne } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from '../test/db.js';
import { DeckTranslateError, translateDeck } from './deckTranslate.js';

interface DeckIds {
  userId: number;
  iaBridgeId: number;
  germanId: number;
}

async function insertId(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ id: number }>(sql, params);
  return row!.id;
}

async function seedBase(): Promise<DeckIds> {
  const userId = await insertId(
    `INSERT INTO users (email, password_hash) VALUES ('deck-owner@example.com', 'x') RETURNING id`,
  );
  const iaBridgeId = await insertId(
    `INSERT INTO bridge_languages (code, name, family, license_note)
     VALUES ('ia', 'Interlingua', 'Romance', 'CC BY 3.0') RETURNING id`,
  );
  const germanId = await insertId(
    `INSERT INTO target_languages (code, name, family) VALUES ('de', 'German', 'Germanic') RETURNING id`,
  );
  return { userId, iaBridgeId, germanId };
}

async function createDeck(
  ownerUserId: number,
  bridgeLanguageId: number | null,
  targetLanguageId: number | null,
  name: string,
): Promise<number> {
  return insertId(
    `INSERT INTO decks (owner_user_id, bridge_language_id, target_language_id, name, status, card_count)
     VALUES ($1, $2, $3, $4, 'mapping', 2)
     RETURNING id`,
    [ownerUserId, bridgeLanguageId, targetLanguageId, name],
  );
}

async function addCard(deckId: number, position: number, englishWritten: string): Promise<number> {
  return insertId(
    `INSERT INTO deck_cards (deck_id, position, english_written, target_written)
     VALUES ($1, $2, $3, 'placeholder')
     RETURNING id`,
    [deckId, position, englishWritten],
  );
}

const CLEAN_SENTENCE = 'I want to learn Interlingua.';

describe.skipIf(!hasTestDatabase)('deckTranslate', () => {
  let ids: DeckIds;

  beforeAll(async () => {
    await migrateTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await truncateAll();
    ids = await seedBase();
  });

  afterAll(async () => {
    await teardown();
  });

  it('throws when the deck has no bridge language assigned yet', async () => {
    const deckId = await createDeck(ids.userId, null, ids.germanId, 'No bridge deck');
    await addCard(deckId, 0, CLEAN_SENTENCE);

    await expect(translateDeck(deckId)).rejects.toBeInstanceOf(DeckTranslateError);
    await expect(translateDeck(deckId)).rejects.toThrow(/complete field mapping first/);

    const deck = await queryOne<{ status: string }>(`SELECT status FROM decks WHERE id = $1`, [deckId]);
    // Never entered the translating pipeline, so status is left untouched.
    expect(deck!.status).toBe('mapping');
  });

  // This build ships no translation engine for any bridge language -- see the
  // bridge-dispatch block in deckTranslate.ts -- so every deck, not just an
  // experimental one, hits this path. Mirrors main's identical test for its 'fin'
  // (no-pipeline) bridge, pointed at an 'ia' deck instead.
  it('throws and marks the deck failed for a bridge with no translation pipeline', async () => {
    const deckId = await createDeck(ids.userId, ids.iaBridgeId, ids.germanId, 'Ia deck');
    await addCard(deckId, 0, CLEAN_SENTENCE);

    await expect(translateDeck(deckId)).rejects.toBeInstanceOf(DeckTranslateError);
    await expect(translateDeck(deckId)).rejects.toThrow(
      /No translation pipeline available for bridge language 'ia'/,
    );

    const deck = await queryOne<{ status: string }>(`SELECT status FROM decks WHERE id = $1`, [deckId]);
    expect(deck!.status).toBe('failed');
  });
});
