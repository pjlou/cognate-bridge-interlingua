/**
 * Batch-translates an imported deck's cards into its chosen bridge language.
 *
 * This build ships no translation engine for any bridge language (see the bridge-
 * dispatch block in `translateDeck` below for why). The generic plumbing here --
 * status transitions, the per-card translate loop, and the deck_untranslated_words
 * delete-then-reinsert -- is kept in full so a future bridge with a real MT pipeline
 * can be wired in by replacing that one block.
 */
import type { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../db.js';

export interface TranslateDeckResult {
  translatedCount: number;
  /** Total distinct (deck_card_id, word) rows inserted into deck_untranslated_words. */
  unknownWordCount: number;
}

export class DeckTranslateError extends Error {}

interface DeckRow {
  id: number;
  bridge_language_id: number | null;
  bridge_code: string | null;
}

interface DeckCardRow {
  id: number;
  english_written: string | null;
}

interface EngineSentence {
  text: string;
  unknownWords: string[];
}

type TranslateFn = (text: string) => EngineSentence[];
type IpaFn = (text: string) => [string | null, string | null];

interface TranslatedCard {
  id: number;
  bridgeWritten: string;
  bridgeIpa: string | null;
  bridgeIpaSource: string | null;
  unknownWords: string[];
}

const UNTRANSLATED_WORDS_CHUNK = 500;

/**
 * Translates every card in a deck, writes back `bridge_written`/`bridge_ipa`/
 * `bridge_ipa_source`/`translated` per card, and replaces the deck's
 * `deck_untranslated_words` rows with a fresh set -- safe to call again on an already
 * `'ready'` deck (re-translates everything, deletes then re-inserts the unknown-word
 * rows within the same pass, so nothing accumulates across reruns).
 */
export async function translateDeck(deckId: number): Promise<TranslateDeckResult> {
  const deck = await queryOne<DeckRow>(
    `SELECT d.id, d.bridge_language_id, bl.code AS bridge_code
     FROM decks d
     LEFT JOIN bridge_languages bl ON bl.id = d.bridge_language_id
     WHERE d.id = $1`,
    [deckId],
  );

  if (!deck) {
    throw new DeckTranslateError(`Deck ${deckId} not found.`);
  }
  if (deck.bridge_language_id === null || !deck.bridge_code) {
    throw new DeckTranslateError(
      'Deck has no bridge language assigned yet -- complete field mapping first.',
    );
  }

  await query(`UPDATE decks SET status = 'translating' WHERE id = $1`, [deckId]);

  try {
    // This build ships no translation engine for any bridge language (Interlingua is a
    // real language, not an invented conlang whose grammar this project controls -- see
    // docs/SOURCES.md and the /translate page for why). Every deck import fails here by
    // design; the client disables the Translate action before it can be triggered, but
    // the server enforces it too since it's the source of truth.
    throw new DeckTranslateError(
      `No translation pipeline available for bridge language '${deck.bridge_code}'.`,
    );
  } catch (error) {
    await query(`UPDATE decks SET status = 'failed' WHERE id = $1`, [deckId]).catch(() => {});
    throw error;
  }
}

async function runTranslation(
  deckId: number,
  translateText: TranslateFn,
  translationIpa: IpaFn,
): Promise<TranslateDeckResult> {
  const cards = await query<DeckCardRow>(
    `SELECT id, english_written FROM deck_cards WHERE deck_id = $1 ORDER BY position`,
    [deckId],
  );

  // translateText/translationIpa are pure, synchronous, in-process calls (no subprocess,
  // no I/O) -- a plain loop is enough, chunking only matters for the DB round trips below.
  const translated: TranslatedCard[] = cards.map((card) => {
    const source = card.english_written ?? '';
    const sentences = translateText(source);
    const bridgeWritten = sentences.map((sentence) => sentence.text).join(' ');
    const unknownWords = [...new Set(sentences.flatMap((sentence) => sentence.unknownWords))];
    const [ipa, ipaSource] = translationIpa(bridgeWritten);
    return {
      id: card.id,
      bridgeWritten,
      bridgeIpa: ipa,
      bridgeIpaSource: ipaSource,
      unknownWords,
    };
  });

  const untranslatedRows: Array<[number, number, string]> = [];
  for (const card of translated) {
    for (const word of card.unknownWords) {
      untranslatedRows.push([deckId, card.id, word]);
    }
  }

  return withTransaction(async (client) => {
    for (const card of translated) {
      await client.query(
        `UPDATE deck_cards
         SET bridge_written = $2, bridge_ipa = $3, bridge_ipa_source = $4, translated = TRUE
         WHERE id = $1`,
        [card.id, card.bridgeWritten, card.bridgeIpa, card.bridgeIpaSource],
      );
    }

    // Delete-then-reinsert within this same transaction so a rerun on an already
    // 'ready' deck never accumulates duplicate rows.
    await client.query(`DELETE FROM deck_untranslated_words WHERE deck_id = $1`, [deckId]);
    await insertUntranslatedWords(client, untranslatedRows);

    const distinctWords = new Set(untranslatedRows.map((row) => row[2]));

    await client.query(
      `UPDATE decks
       SET status = 'ready', translated_at = NOW(), untranslated_count = $2
       WHERE id = $1`,
      [deckId, distinctWords.size],
    );

    return { translatedCount: translated.length, unknownWordCount: untranslatedRows.length };
  });
}

async function insertUntranslatedWords(
  client: PoolClient,
  rows: Array<[number, number, string]>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += UNTRANSLATED_WORDS_CHUNK) {
    const chunk = rows.slice(start, start + UNTRANSLATED_WORDS_CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map(([deckId, deckCardId, word]) => {
      params.push(deckId, deckCardId, word);
      return `($${params.length - 2}, $${params.length - 1}, $${params.length})`;
    });
    await client.query(
      `INSERT INTO deck_untranslated_words (deck_id, deck_card_id, word) VALUES ${tuples.join(', ')}`,
      params,
    );
  }
}
