/**
 * DB writes for the two-step Anki import flow: (1) persist a parsed .apkg's raw,
 * unmapped note data immediately on upload -- durably, in Postgres, not an in-memory
 * token -- so the field-mapping step that follows can run at the user's own pace
 * without depending on server process state surviving in between; (2) once the user
 * picks which field plays which role, copy that data into the deck's real columns.
 */

import type { PoolClient } from 'pg';
import { queryOne, withTransaction } from '../db.js';
import type { ApkgMediaFile, ParsedApkg } from '../services/apkgParser.js';

const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ImportPreview {
  deckId: number;
  noteType: string;
  fieldNames: string[];
  sampleRows: Record<string, string>[];
  noteCount: number;
  skippedNoteTypeCount: number;
}

/**
 * Creates the `decks` row (status='mapping', bridge/target unset) and one `deck_cards`
 * row per parsed note, storing each note's field values in `raw_fields` and any
 * resolved [sound:...] media in `deck_card_raw_media`. Nothing in `english_written`/
 * `target_written`/etc. is populated yet -- that happens in `confirmDeckMapping` below.
 */
export async function createDeckFromApkg(
  ownerUserId: number,
  parsed: ParsedApkg,
  sourceFilename: string,
): Promise<ImportPreview> {
  return withTransaction(async (client) => {
    const deckName = sourceFilename.replace(/\.apkg$/i, '') || 'Imported deck';
    const { rows: deckRows } = await client.query<{ id: number }>(
      `INSERT INTO decks (owner_user_id, name, source_filename, status)
       VALUES ($1, $2, $3, 'mapping')
       RETURNING id`,
      [ownerUserId, deckName, sourceFilename],
    );
    const deckId = deckRows[0]!.id;

    for (const batch of chunk(parsed.notes, CHUNK_SIZE)) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      batch.forEach((note, index) => {
        const base = index * 3;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        values.push(deckId, index, JSON.stringify(note.fields));
      });
      const { rows: cardRows } = await client.query<{ id: number }>(
        `INSERT INTO deck_cards (deck_id, position, raw_fields)
         VALUES ${placeholders.join(', ')}
         RETURNING id`,
        values,
      );

      for (const [index, note] of batch.entries()) {
        const deckCardId = cardRows[index]!.id;
        for (const [fieldName, files] of Object.entries(note.media)) {
          for (const file of files as ApkgMediaFile[]) {
            await client.query(
              `INSERT INTO deck_card_raw_media (deck_card_id, field_name, filename, mime, bytes)
               VALUES ($1, $2, $3, $4, $5)`,
              [deckCardId, fieldName, file.filename, file.mime, file.bytes],
            );
          }
        }
      }
    }

    await client.query(`UPDATE decks SET card_count = $2 WHERE id = $1`, [
      deckId,
      parsed.notes.length,
    ]);

    return {
      deckId,
      noteType: parsed.noteType,
      fieldNames: parsed.fieldNames,
      sampleRows: parsed.notes.slice(0, 5).map((note) => note.fields),
      noteCount: parsed.notes.length,
      skippedNoteTypeCount: parsed.skippedNoteTypeCount,
    };
  });
}

export interface FieldMapping {
  englishText: string;
  englishAudio?: string | null;
  targetText: string;
  targetAudio?: string | null;
}

export interface DeckMappingInfo {
  id: number;
  ownerUserId: number;
  status: string;
}

export async function getDeckMappingInfo(deckId: number): Promise<DeckMappingInfo | null> {
  return queryOne<DeckMappingInfo>(
    `SELECT id, owner_user_id AS "ownerUserId", status FROM decks WHERE id = $1`,
    [deckId],
  );
}

/**
 * Copies each card's raw_fields[mapping.englishText]/[mapping.targetText] into
 * english_written/target_written, and the matching deck_card_raw_media rows (if an
 * audio role was chosen) into english_audio/target_audio. Sets the deck's bridge/
 * target language and card_count, and moves status to 'mapping' still (translateDeck,
 * built separately, is what advances it to 'translating'/'ready').
 */
export async function confirmDeckMapping(
  deckId: number,
  bridgeLanguageId: number,
  targetLanguageId: number,
  mapping: FieldMapping,
): Promise<{ cardCount: number }> {
  return withTransaction(async (client) => {
    const { rows: cards } = await client.query<{ id: number; raw_fields: Record<string, string> }>(
      `SELECT id, raw_fields FROM deck_cards WHERE deck_id = $1 ORDER BY position`,
      [deckId],
    );

    for (const batch of chunk(cards, CHUNK_SIZE)) {
      for (const card of batch) {
        const englishWritten = card.raw_fields[mapping.englishText] ?? '';
        const targetWritten = card.raw_fields[mapping.targetText] ?? '';
        await client.query(
          `UPDATE deck_cards SET english_written = $2, target_written = $3 WHERE id = $1`,
          [card.id, englishWritten, targetWritten],
        );

        if (mapping.englishAudio) {
          await copyMediaIntoAudioColumn(client, card.id, mapping.englishAudio, 'english');
        }
        if (mapping.targetAudio) {
          await copyMediaIntoAudioColumn(client, card.id, mapping.targetAudio, 'target');
        }
      }
    }

    await client.query(
      `UPDATE decks
       SET bridge_language_id = $2, target_language_id = $3, card_count = $4
       WHERE id = $1`,
      [deckId, bridgeLanguageId, targetLanguageId, cards.length],
    );

    return { cardCount: cards.length };
  });
}

async function copyMediaIntoAudioColumn(
  client: PoolClient,
  deckCardId: number,
  fieldName: string,
  slot: 'english' | 'target',
): Promise<void> {
  const media = await client.query<{ mime: string; bytes: Buffer }>(
    `SELECT mime, bytes FROM deck_card_raw_media
     WHERE deck_card_id = $1 AND field_name = $2
     ORDER BY id LIMIT 1`,
    [deckCardId, fieldName],
  );
  const row = media.rows[0];
  if (!row) return;
  const column = slot === 'english' ? 'english_audio' : 'target_audio';
  const mimeColumn = slot === 'english' ? 'english_audio_mime' : 'target_audio_mime';
  await client.query(
    `UPDATE deck_cards SET ${column} = $2, ${mimeColumn} = $3 WHERE id = $1`,
    [deckCardId, row.bytes, row.mime],
  );
}
