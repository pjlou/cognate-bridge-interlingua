import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from '../test/db.js';
import { DeckExportError, buildAnkiTsv, buildUntranslatedDoc } from './deckExport.js';

async function insertId(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ id: number }>(sql, params);
  return row!.id;
}

interface Base {
  userId: number;
  iaBridgeId: number;
  germanId: number;
}

async function seedBase(): Promise<Base> {
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

/**
 * This repo ships no translation engine for any bridge language (see
 * `services/deckTranslate.ts`), so unlike main's version of this test file -- which
 * calls the real `translateDeck` to populate bridge_written/bridge_ipa -- these tests
 * seed an already-'ready' deck with its translated fields set directly. `buildAnkiTsv`/
 * `buildUntranslatedDoc` only read those columns, so this exercises the exact same
 * export logic without depending on machine translation.
 */
async function createReadyDeck(base: Base, name: string): Promise<number> {
  return insertId(
    `INSERT INTO decks
       (owner_user_id, bridge_language_id, target_language_id, name, status, card_count, translated_at)
     VALUES ($1, $2, $3, $4, 'ready', 0, NOW())
     RETURNING id`,
    [base.userId, base.iaBridgeId, base.germanId, name],
  );
}

async function createMappingDeck(base: Base, name: string): Promise<number> {
  return insertId(
    `INSERT INTO decks (owner_user_id, bridge_language_id, target_language_id, name, status, card_count)
     VALUES ($1, $2, $3, $4, 'mapping', 2)
     RETURNING id`,
    [base.userId, base.iaBridgeId, base.germanId, name],
  );
}

interface CardFields {
  englishWritten?: string;
  bridgeWritten?: string;
  bridgeIpa?: string;
  targetWritten?: string;
}

async function addCard(deckId: number, position: number, fields: CardFields): Promise<number> {
  return insertId(
    `INSERT INTO deck_cards
       (deck_id, position, english_written, bridge_written, bridge_ipa, target_written, translated)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING id`,
    [
      deckId,
      position,
      fields.englishWritten ?? null,
      fields.bridgeWritten ?? null,
      fields.bridgeIpa ?? null,
      fields.targetWritten ?? null,
    ],
  );
}

const CLEAN_SENTENCE = 'I want to learn Interlingua.';
const UNKNOWN_SENTENCE = 'The dog runs quickly through the wexlebonk.';

describe.skipIf(!hasTestDatabase)('deckExport', () => {
  let base: Base;

  beforeAll(async () => {
    await migrateTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await truncateAll();
    base = await seedBase();
  });

  afterAll(async () => {
    await teardown();
  });

  describe('buildAnkiTsv', () => {
    it('emits the Anki import-file header and one tab-separated row per card', async () => {
      const deckId = await createReadyDeck(base, 'Export deck');
      await addCard(deckId, 0, {
        englishWritten: CLEAN_SENTENCE,
        bridgeWritten: 'Io vole apprender interlingua.',
        bridgeIpa: 'io ˈvole apːrenˈder interˈliŋɡwa',
        targetWritten: 'Ich will Interlingua lernen.',
      });
      await addCard(deckId, 1, {
        englishWritten: UNKNOWN_SENTENCE,
        bridgeWritten: 'Le can curre rapidemente per le {wexlebonk}.',
        targetWritten: 'Der Hund läuft schnell durch den wexlebonk.',
      });

      const tsv = await buildAnkiTsv(deckId);
      const lines = tsv.split('\n');

      expect(lines[0]).toBe('#separator:tab');
      expect(lines[1]).toBe('#html:false');
      expect(lines[2]).toBe('#columns:English\tBridge\tBridge IPA\tGerman');
      expect(lines).toHaveLength(5);

      const row1 = lines[3]!.split('\t');
      expect(row1).toEqual([
        'I want to learn Interlingua.',
        'Io vole apprender interlingua.',
        'io ˈvole apːrenˈder interˈliŋɡwa',
        'Ich will Interlingua lernen.',
      ]);

      const row2 = lines[4]!.split('\t');
      expect(row2[0]).toBe('The dog runs quickly through the wexlebonk.');
      expect(row2[1]).toBe('Le can curre rapidemente per le {wexlebonk}.');
      expect(row2[3]).toBe('Der Hund läuft schnell durch den wexlebonk.');
    });

    it('sanitizes an embedded tab or newline in a field to a single space', async () => {
      const deckId = await createReadyDeck(base, 'Dirty field deck');
      await addCard(deckId, 0, {
        englishWritten: CLEAN_SENTENCE,
        targetWritten: 'Line one\tLine two\nLine three',
      });

      const tsv = await buildAnkiTsv(deckId);
      const dataLine = tsv.split('\n')[3]!;
      const columns = dataLine.split('\t');

      // Exactly 4 columns -- the embedded tab must not have created a 5th.
      expect(columns).toHaveLength(4);
      expect(columns[3]).toBe('Line one Line two Line three');
      expect(tsv).not.toMatch(/Line one\t\tLine two/);
    });

    it('throws DeckExportError when the deck is not ready', async () => {
      const deckId = await createMappingDeck(base, 'Unready deck');
      await addCard(deckId, 0, { englishWritten: CLEAN_SENTENCE, targetWritten: 'placeholder' });
      // status is still 'mapping'.

      await expect(buildAnkiTsv(deckId)).rejects.toBeInstanceOf(DeckExportError);
    });

    it('throws DeckExportError for an unknown deck id', async () => {
      await expect(buildAnkiTsv(999999)).rejects.toBeInstanceOf(DeckExportError);
    });
  });

  describe('buildUntranslatedDoc', () => {
    it('lists each distinct unknown word once with a source-sentence excerpt', async () => {
      const deckId = await createReadyDeck(base, 'Untranslated deck');
      const card1 = await addCard(deckId, 0, {
        englishWritten: UNKNOWN_SENTENCE,
        targetWritten: 'placeholder',
      });
      await addCard(deckId, 1, { englishWritten: CLEAN_SENTENCE, targetWritten: 'placeholder' });
      await query(
        `INSERT INTO deck_untranslated_words (deck_id, deck_card_id, word) VALUES ($1, $2, 'wexlebonk')`,
        [deckId, card1],
      );

      const doc = await buildUntranslatedDoc(deckId);
      const lines = doc.split('\n');

      expect(lines[0]).toBe('Untranslated words for "Untranslated deck" (1 word)');
      expect(lines[1]).toBe('');
      expect(lines[2]).toBe(`wexlebonk — from: "${UNKNOWN_SENTENCE}"`);
      expect(lines).toHaveLength(3);

      const unknownRow = await queryOne<{ deck_card_id: number }>(
        `SELECT deck_card_id FROM deck_untranslated_words WHERE deck_id = $1 AND word = 'wexlebonk'`,
        [deckId],
      );
      expect(unknownRow!.deck_card_id).toBe(card1);
    });

    it('counts occurrences across multiple cards and notes the extras', async () => {
      const deckId = await createReadyDeck(base, 'Repeat deck');
      const card1 = await addCard(deckId, 0, {
        englishWritten: UNKNOWN_SENTENCE,
        targetWritten: 'placeholder',
      });
      const card2 = await addCard(deckId, 1, {
        englishWritten: UNKNOWN_SENTENCE,
        targetWritten: 'placeholder',
      });
      await query(
        `INSERT INTO deck_untranslated_words (deck_id, deck_card_id, word)
         VALUES ($1, $2, 'wexlebonk'), ($1, $3, 'wexlebonk')`,
        [deckId, card1, card2],
      );

      const doc = await buildUntranslatedDoc(deckId);
      expect(doc).toContain('Untranslated words for "Repeat deck" (1 word)');
      expect(doc).toContain('wexlebonk — from:');
      expect(doc).toMatch(/\(\+1 more\)/);
    });

    it('truncates a long source sentence to roughly 80 characters', async () => {
      const longSentence = `The dog runs quickly through the wexlebonk while singing a very long song about ${'x'.repeat(60)}.`;
      const deckId = await createReadyDeck(base, 'Long sentence deck');
      const card1 = await addCard(deckId, 0, {
        englishWritten: longSentence,
        targetWritten: 'placeholder',
      });
      await query(
        `INSERT INTO deck_untranslated_words (deck_id, deck_card_id, word) VALUES ($1, $2, 'wexlebonk')`,
        [deckId, card1],
      );

      const doc = await buildUntranslatedDoc(deckId);
      const wordLine = doc.split('\n').find((line) => line.startsWith('wexlebonk'));
      expect(wordLine).toBeDefined();
      expect(wordLine).toContain('…');
      // The excerpt itself (inside the quotes) should be short, not the whole sentence.
      const excerptMatch = wordLine!.match(/from: "(.+)"/);
      expect(excerptMatch).not.toBeNull();
      expect(excerptMatch![1]!.length).toBeLessThanOrEqual(80);
    });

    it('throws DeckExportError when the deck is not ready', async () => {
      const deckId = await createMappingDeck(base, 'Unready deck 2');
      await addCard(deckId, 0, { englishWritten: CLEAN_SENTENCE, targetWritten: 'placeholder' });

      await expect(buildUntranslatedDoc(deckId)).rejects.toBeInstanceOf(DeckExportError);
    });
  });
});
