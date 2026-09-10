/**
 * Builds the documents a deck export hands the user: an Anki-importable tab-separated
 * file, a plain-text list of words the MT pipeline could not translate, and a full JSON
 * backup (every card field, audio, and this user's SRS history) meant for moving a deck
 * -- edits and study progress included -- to another account or install.
 */
import { query, queryOne } from '../db.js';

export class DeckExportError extends Error {}

interface DeckExportRow {
  id: number;
  name: string;
  status: string;
  target_language_name: string | null;
}

interface DeckCardExportRow {
  english_written: string | null;
  bridge_written: string | null;
  bridge_ipa: string | null;
  target_written: string | null;
}

interface UntranslatedWordRow {
  word: string;
  english_written: string | null;
}

const EXCERPT_MAX_LENGTH = 80;

/**
 * Anki's plain-text importer reads fields as literal tab-separated columns -- a stray
 * tab or newline inside a field's own text would silently create an extra column or
 * row on import, so both are collapsed to a single space rather than passed through.
 */
function sanitizeField(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[\t\r\n]+/g, ' ').trim();
}

function truncate(text: string, max = EXCERPT_MAX_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

async function fetchReadyDeck(deckId: number): Promise<DeckExportRow> {
  const deck = await queryOne<DeckExportRow>(
    `SELECT d.id, d.name, d.status, tl.name AS target_language_name
     FROM decks d
     LEFT JOIN target_languages tl ON tl.id = d.target_language_id
     WHERE d.id = $1`,
    [deckId],
  );
  if (!deck) {
    throw new DeckExportError(`Deck ${deckId} not found.`);
  }
  if (deck.status !== 'ready') {
    throw new DeckExportError(
      `Deck ${deckId} is not ready for export (status: '${deck.status}').`,
    );
  }
  return deck;
}

/**
 * Anki "Import File" plain-text format: `#`-prefixed lines are directives the importer
 * reads natively (`#separator:tab`, `#columns:...`), followed by one tab-separated data
 * row per card. Columns are English / Bridge / Bridge IPA / the deck's target language.
 */
export async function buildAnkiTsv(deckId: number): Promise<string> {
  const deck = await fetchReadyDeck(deckId);
  const targetColumnName = sanitizeField(deck.target_language_name) || 'Target';

  const cards = await query<DeckCardExportRow>(
    `SELECT english_written, bridge_written, bridge_ipa, target_written
     FROM deck_cards
     WHERE deck_id = $1
     ORDER BY position`,
    [deckId],
  );

  const lines = [
    '#separator:tab',
    '#html:false',
    `#columns:English\tBridge\tBridge IPA\t${targetColumnName}`,
  ];

  for (const card of cards) {
    lines.push(
      [
        sanitizeField(card.english_written),
        sanitizeField(card.bridge_written),
        sanitizeField(card.bridge_ipa),
        sanitizeField(card.target_written),
      ].join('\t'),
    );
  }

  return lines.join('\n');
}

/**
 * A plain-text list of every word the MT pipeline could not translate for this deck,
 * grouped by distinct word (case-sensitive), each with a source-sentence excerpt so a
 * non-technical user can see where it came from without opening the deck itself.
 */
export async function buildUntranslatedDoc(deckId: number): Promise<string> {
  const deck = await fetchReadyDeck(deckId);

  const rows = await query<UntranslatedWordRow>(
    `SELECT duw.word, dc.english_written
     FROM deck_untranslated_words duw
     JOIN deck_cards dc ON dc.id = duw.deck_card_id
     WHERE duw.deck_id = $1
     ORDER BY duw.word, dc.position`,
    [deckId],
  );

  const examplesByWord = new Map<string, string[]>();
  for (const row of rows) {
    const examples = examplesByWord.get(row.word) ?? [];
    if (row.english_written) examples.push(row.english_written);
    examplesByWord.set(row.word, examples);
  }

  const words = [...examplesByWord.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const lines = [
    `Untranslated words for "${deck.name}" (${words.length} word${words.length === 1 ? '' : 's'})`,
    '',
  ];

  for (const word of words) {
    const examples = examplesByWord.get(word) ?? [];
    if (examples.length === 0) {
      lines.push(`${word} — (no source sentence recorded)`);
      continue;
    }
    const [first, ...rest] = examples;
    const excerpt = truncate(first!);
    const more = rest.length > 0 ? ` (+${rest.length} more)` : '';
    lines.push(`${word} — from: "${excerpt}"${more}`);
  }

  return lines.join('\n');
}

export const DECK_BACKUP_FORMAT = 'cognate-bridge-deck-backup';
export const DECK_BACKUP_VERSION = 1;

interface DeckBackupMetaRow {
  id: number;
  name: string;
  status: string;
  bridge_language_code: string | null;
  target_language_code: string | null;
  target_language_name: string | null;
}

interface DeckBackupCardRow {
  position: number;
  english_written: string | null;
  target_written: string | null;
  bridge_written: string | null;
  bridge_ipa: string | null;
  bridge_ipa_source: string | null;
  translated: boolean;
  english_audio: Buffer | null;
  english_audio_mime: string | null;
  target_audio: Buffer | null;
  target_audio_mime: string | null;
  bridge_audio: Buffer | null;
  bridge_audio_mime: string | null;
  p1_card_state: string | null;
  p1_ease_factor: string | null;
  p1_interval_days: string | null;
  p1_repetitions: number | null;
  p1_lapses: number | null;
  p1_learning_step: number | null;
  p1_review_count: number | null;
  p1_success_count: number | null;
  p1_first_seen_at: string | null;
  p1_last_reviewed_at: string | null;
  p1_next_review_at: string | null;
  p1_removed: boolean | null;
  p2_card_state: string | null;
  p2_ease_factor: string | null;
  p2_interval_days: string | null;
  p2_repetitions: number | null;
  p2_lapses: number | null;
  p2_learning_step: number | null;
  p2_review_count: number | null;
  p2_success_count: number | null;
  p2_first_seen_at: string | null;
  p2_last_reviewed_at: string | null;
  p2_next_review_at: string | null;
  p2_removed: boolean | null;
}

export interface DeckBackupProgress {
  card_state: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step: number;
  review_count: number;
  success_count: number;
  first_seen_at: string | null;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  removed: boolean;
}

export interface DeckBackupCard {
  position: number;
  english_written: string | null;
  target_written: string | null;
  bridge_written: string | null;
  bridge_ipa: string | null;
  bridge_ipa_source: string | null;
  translated: boolean;
  english_audio: string | null;
  english_audio_mime: string | null;
  target_audio: string | null;
  target_audio_mime: string | null;
  bridge_audio: string | null;
  bridge_audio_mime: string | null;
  progress: {
    tier1: DeckBackupProgress | null;
    tier2: DeckBackupProgress | null;
  };
}

export interface DeckBackup {
  format: typeof DECK_BACKUP_FORMAT;
  version: typeof DECK_BACKUP_VERSION;
  exported_at: string;
  deck: {
    name: string;
    bridge_language_code: string | null;
    target_language_code: string | null;
    target_language_name: string | null;
  };
  cards: DeckBackupCard[];
}

function tier1Progress(row: DeckBackupCardRow): DeckBackupProgress | null {
  if (row.p1_card_state === null) return null;
  return {
    card_state: row.p1_card_state,
    ease_factor: Number(row.p1_ease_factor),
    interval_days: Number(row.p1_interval_days),
    repetitions: row.p1_repetitions ?? 0,
    lapses: row.p1_lapses ?? 0,
    learning_step: row.p1_learning_step ?? 0,
    review_count: row.p1_review_count ?? 0,
    success_count: row.p1_success_count ?? 0,
    first_seen_at: row.p1_first_seen_at,
    last_reviewed_at: row.p1_last_reviewed_at,
    next_review_at: row.p1_next_review_at,
    removed: row.p1_removed === true,
  };
}

function tier2Progress(row: DeckBackupCardRow): DeckBackupProgress | null {
  if (row.p2_card_state === null) return null;
  return {
    card_state: row.p2_card_state,
    ease_factor: Number(row.p2_ease_factor),
    interval_days: Number(row.p2_interval_days),
    repetitions: row.p2_repetitions ?? 0,
    lapses: row.p2_lapses ?? 0,
    learning_step: row.p2_learning_step ?? 0,
    review_count: row.p2_review_count ?? 0,
    success_count: row.p2_success_count ?? 0,
    first_seen_at: row.p2_first_seen_at,
    last_reviewed_at: row.p2_last_reviewed_at,
    next_review_at: row.p2_next_review_at,
    removed: row.p2_removed === true,
  };
}

/**
 * A full, self-contained JSON snapshot of a deck: every card field, its audio (base64,
 * since JSON has no binary type), and the requesting user's own SM-2 history on each
 * card/tier -- everything needed to move a deck, edits and study progress included, to
 * another account or Cognate Bridge install. Unlike `buildAnkiTsv`/`buildUntranslatedDoc`
 * this is not meant for Anki; there is no importer for this format yet, so it is a
 * one-way backup today.
 */
export async function buildDeckBackup(deckId: number, userId: number): Promise<DeckBackup> {
  const deck = await queryOne<DeckBackupMetaRow>(
    `SELECT d.id, d.name, d.status, b.code AS bridge_language_code,
            t.code AS target_language_code, t.name AS target_language_name
     FROM decks d
     LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
     LEFT JOIN target_languages t ON t.id = d.target_language_id
     WHERE d.id = $1`,
    [deckId],
  );
  if (!deck) {
    throw new DeckExportError(`Deck ${deckId} not found.`);
  }

  const rows = await query<DeckBackupCardRow>(
    `SELECT dc.position, dc.english_written, dc.target_written, dc.bridge_written,
            dc.bridge_ipa, dc.bridge_ipa_source, dc.translated,
            dc.english_audio, dc.english_audio_mime,
            dc.target_audio, dc.target_audio_mime,
            dc.bridge_audio, dc.bridge_audio_mime,
            p1.card_state AS p1_card_state, p1.ease_factor AS p1_ease_factor,
            p1.interval_days AS p1_interval_days, p1.repetitions AS p1_repetitions,
            p1.lapses AS p1_lapses, p1.learning_step AS p1_learning_step,
            p1.review_count AS p1_review_count, p1.success_count AS p1_success_count,
            p1.first_seen_at AS p1_first_seen_at, p1.last_reviewed_at AS p1_last_reviewed_at,
            p1.next_review_at AS p1_next_review_at, p1.removed AS p1_removed,
            p2.card_state AS p2_card_state, p2.ease_factor AS p2_ease_factor,
            p2.interval_days AS p2_interval_days, p2.repetitions AS p2_repetitions,
            p2.lapses AS p2_lapses, p2.learning_step AS p2_learning_step,
            p2.review_count AS p2_review_count, p2.success_count AS p2_success_count,
            p2.first_seen_at AS p2_first_seen_at, p2.last_reviewed_at AS p2_last_reviewed_at,
            p2.next_review_at AS p2_next_review_at, p2.removed AS p2_removed
     FROM deck_cards dc
     LEFT JOIN deck_card_progress p1
       ON p1.deck_card_id = dc.id AND p1.user_id = $2 AND p1.tier = 1
     LEFT JOIN deck_card_progress p2
       ON p2.deck_card_id = dc.id AND p2.user_id = $2 AND p2.tier = 2
     WHERE dc.deck_id = $1
     ORDER BY dc.position`,
    [deckId, userId],
  );

  const cards: DeckBackupCard[] = rows.map((row) => ({
    position: row.position,
    english_written: row.english_written,
    target_written: row.target_written,
    bridge_written: row.bridge_written,
    bridge_ipa: row.bridge_ipa,
    bridge_ipa_source: row.bridge_ipa_source,
    translated: row.translated,
    english_audio: row.english_audio ? row.english_audio.toString('base64') : null,
    english_audio_mime: row.english_audio ? row.english_audio_mime : null,
    target_audio: row.target_audio ? row.target_audio.toString('base64') : null,
    target_audio_mime: row.target_audio ? row.target_audio_mime : null,
    bridge_audio: row.bridge_audio ? row.bridge_audio.toString('base64') : null,
    bridge_audio_mime: row.bridge_audio ? row.bridge_audio_mime : null,
    progress: {
      tier1: tier1Progress(row),
      tier2: tier2Progress(row),
    },
  }));

  return {
    format: DECK_BACKUP_FORMAT,
    version: DECK_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    deck: {
      name: deck.name,
      bridge_language_code: deck.bridge_language_code,
      target_language_code: deck.target_language_code,
      target_language_name: deck.target_language_name,
    },
    cards,
  };
}
