import { query, queryOne } from '../db.js';
import type { StudyTier, VocabularyCardState } from '../services/scheduler.js';
import type {
  Cognate,
  DeckSummary,
  ProgressSummary,
  TargetLanguage,
  VocabularyItem,
} from './types.js';

/**
 * Deck-scoped equivalents of `content.model.ts`'s study-queue / vocabulary shaping.
 *
 * Imported-deck cards live in `decks` / `deck_cards` / `deck_card_progress`, parallel to
 * `bridge_vocabulary` / `vocabulary_progress` (see migrations 0019-0022 and
 * `server/src/seed/run.ts` for why they are not folded into the curated tables: a
 * reseed TRUNCATEs the curated tables wholesale and would destroy user-imported decks).
 *
 * The scheduling math itself is not reimplemented here -- `getDeckStudyQueue` and
 * `deckProgress.model.ts`'s `recordDeckCardReview` reuse `applyVocabularyGrade` from
 * `server/src/services/scheduler.ts` unmodified, exactly as the curated path does.
 */

const DECK_COLUMNS = `
  d.id, d.owner_user_id, d.bridge_language_id, b.code AS bridge_language_code,
  d.target_language_id, t.code AS target_language_code, t.name AS target_language_name,
  d.name, d.source_filename, d.status, d.card_count, d.untranslated_count,
  d.created_at, d.translated_at
`;

export async function listDecks(ownerUserId: number): Promise<DeckSummary[]> {
  return query<DeckSummary>(
    `SELECT ${DECK_COLUMNS}
     FROM decks d
     LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
     LEFT JOIN target_languages t ON t.id = d.target_language_id
     WHERE d.owner_user_id = $1
     ORDER BY d.created_at DESC, d.id DESC`,
    [ownerUserId],
  );
}

export async function getDeckById(deckId: number): Promise<DeckSummary | null> {
  return queryOne<DeckSummary>(
    `SELECT ${DECK_COLUMNS}
     FROM decks d
     LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
     LEFT JOIN target_languages t ON t.id = d.target_language_id
     WHERE d.id = $1`,
    [deckId],
  );
}

/**
 * Deletes a deck and everything that hangs off it -- cards, raw media, per-user SM-2
 * progress, and untranslated-word rows -- via the `ON DELETE CASCADE` foreign keys set
 * up in migrations 0020-0022, so a single statement here is sufficient.
 */
export async function deleteDeck(deckId: number): Promise<void> {
  await query(`DELETE FROM decks WHERE id = $1`, [deckId]);
}

/**
 * Resolves a `deck_cards.id` to the deck (and therefore owning user) it belongs to.
 * Used by route-layer ownership checks; returns null when the card does not exist.
 */
export async function deckIdForCard(deckCardId: number): Promise<number | null> {
  const row = await queryOne<{ deck_id: number }>(
    `SELECT deck_id FROM deck_cards WHERE id = $1`,
    [deckCardId],
  );
  return row?.deck_id ?? null;
}

/** Raw joined shape a deck-card query returns, before it is folded into a VocabularyItem. */
interface DeckCardRow {
  id: number;
  deck_id: number;
  bridge_language_id: number | null;
  bridge_language_code: string | null;
  headword: string | null;
  gloss_en: string | null;
  ipa: string | null;
  ipa_source: 'direct_phonology' | 'derived_phonology' | 'uncertain_phonology' | null;
  target_language_id: number | null;
  target_code: string | null;
  target_name: string | null;
  target_family: TargetLanguage['family'] | null;
  target_word: string | null;
  has_audio_english: boolean;
  has_audio_bridge: boolean;
  has_audio_target: boolean;
  card_state: VocabularyCardState | null;
  ease_factor: string | null;
  interval_days: string | null;
  repetitions: number | null;
  lapses: number | null;
  learning_step: number | null;
  review_count: number | null;
  success_count: number | null;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  removed: boolean | null;
}

// Card + deck + language fields. Deliberately never selects the bytea audio columns
// themselves (english_audio/target_audio/bridge_audio) -- only boolean presence -- so a
// deck heavy with recorded clips does not slow down listing/study queries. The actual
// bytes are read elsewhere by a dedicated per-card endpoint.
const DECK_CARD_COLUMNS = `
  dc.id, dc.deck_id, d.bridge_language_id, b.code AS bridge_language_code,
  dc.bridge_written AS headword, dc.english_written AS gloss_en,
  dc.bridge_ipa AS ipa, dc.bridge_ipa_source AS ipa_source,
  d.target_language_id, t.code AS target_code, t.name AS target_name, t.family AS target_family,
  dc.target_written AS target_word,
  (dc.english_audio IS NOT NULL) AS has_audio_english,
  (dc.bridge_audio IS NOT NULL) AS has_audio_bridge,
  (dc.target_audio IS NOT NULL) AS has_audio_target
`;

const DECK_PROGRESS_COLUMNS = `
  p.card_state, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
  p.review_count, p.success_count, p.last_reviewed_at, p.next_review_at, p.removed
`;

type MappedDeckItem = VocabularyItem & {
  tier: 1 | 2;
  queue_kind?: 'new' | 'review';
  source: 'deck';
  deck_id: number;
  deck_card_id: number;
  has_audio: { english: boolean; bridge: boolean; target: boolean };
};

function mapDeckRow(row: DeckCardRow, tier: 1 | 2, queueKind?: 'new' | 'review'): MappedDeckItem {
  const hasTargetLanguage =
    row.target_language_id !== null && row.target_code !== null && row.target_name !== null &&
    row.target_family !== null;

  const cognates: Cognate[] = hasTargetLanguage
    ? [
        {
          id: row.id,
          target_language: {
            id: row.target_language_id as number,
            code: row.target_code as string,
            name: row.target_name as string,
            family: row.target_family as TargetLanguage['family'],
          },
          target_word: row.target_word ?? '',
          provenance: 'curated',
          confidence: 1,
          validated_against: null,
          notes: null,
          rule: null,
          rules: [],
        },
      ]
    : [];

  const progress: ProgressSummary | null =
    row.card_state === null
      ? null
      : {
          card_state: row.card_state,
          ease_factor: Number(row.ease_factor),
          interval_days: Number(row.interval_days),
          repetitions: row.repetitions ?? 0,
          lapses: row.lapses ?? 0,
          learning_step: row.learning_step ?? 0,
          review_count: row.review_count ?? 0,
          success_count: row.success_count ?? 0,
          last_reviewed_at: row.last_reviewed_at,
          next_review_at: row.next_review_at,
          removed: row.removed === true,
        };

  return {
    id: row.id,
    // A deck reaches 'ready' (and therefore becomes eligible for study) only once
    // bridge_language_id is confirmed by the mapping step, so this is safe by the time
    // any of these queries are reachable from the study-queue route.
    bridge_language_id: row.bridge_language_id as number,
    bridge_language_code: row.bridge_language_code as string,
    headword: row.headword ?? '',
    part_of_speech: '',
    gloss_en: row.gloss_en ?? '',
    glosses_en: [row.gloss_en ?? ''],
    ipa: row.ipa,
    ipa_source: row.ipa_source,
    etymology: null,
    difficulty_level: 1,
    frequency_rank: null,
    frequency_band: null,
    has_english_cognate: true,
    transparency_score: null,
    priority_score: null,
    is_core_track: false,
    source_ref: 'Imported deck',
    cognates,
    progress,
    tier,
    ...(queueKind ? { queue_kind: queueKind } : {}),
    source: 'deck',
    deck_id: row.deck_id,
    deck_card_id: row.id,
    has_audio: {
      english: row.has_audio_english,
      bridge: row.has_audio_bridge,
      target: row.has_audio_target,
    },
  };
}

export interface DeckStudyQueueOptions {
  limit: number;
  unlockAllTier2?: boolean;
  tierMode?: 'both' | 'learn_bridge' | 'apply_bridge' | 'skip_bridge';
}

export type DeckStudyQueueItem = VocabularyItem & { tier: 1 | 2; queue_kind: 'new' | 'review' };

/**
 * Deck-scoped study queue. Mirrors `content.model.ts`'s `getStudyQueue` 4-branch
 * UNION ALL (tier-1 review / tier-2 review / tier-1 new / tier-2 new, gated by
 * tierMode/unlockAllTier2 identically), joined from deck_cards/deck_card_progress
 * instead of bridge_vocabulary/vocabulary_progress. Deck cards have no
 * priority_score/frequency_rank to order by, and no frequency-band or
 * skip-english-cognate concept, so those filters are simply absent here.
 */
export async function getDeckStudyQueue(
  userId: number,
  deckId: number,
  options: DeckStudyQueueOptions,
): Promise<DeckStudyQueueItem[]> {
  const unlockAllTier2 = options.unlockAllTier2 === true;
  const tierMode = options.tierMode ?? 'both';

  const rows = await query<DeckCardRow & { tier: 1 | 2; queue_kind: 'new' | 'review' }>(
    `SELECT * FROM (
       SELECT ${DECK_CARD_COLUMNS}, ${DECK_PROGRESS_COLUMNS},
              1 AS tier, 'review'::text AS queue_kind, 0 AS kind_order
       FROM deck_cards dc
       JOIN decks d ON d.id = dc.deck_id
       LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
       LEFT JOIN target_languages t ON t.id = d.target_language_id
       JOIN deck_card_progress p
         ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 1
       WHERE dc.deck_id = $2
         AND $5::text IN ('both', 'learn_bridge')
         AND p.removed = FALSE
         AND p.card_state <> 'new'
         AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW()
       UNION ALL
       SELECT ${DECK_CARD_COLUMNS}, ${DECK_PROGRESS_COLUMNS},
              2 AS tier, 'review'::text AS queue_kind, 0 AS kind_order
       FROM deck_cards dc
       JOIN decks d ON d.id = dc.deck_id
       LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
       LEFT JOIN target_languages t ON t.id = d.target_language_id
       JOIN deck_card_progress p
         ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 2
       WHERE dc.deck_id = $2
         AND $5::text IN ('both', 'apply_bridge', 'skip_bridge')
         AND p.removed = FALSE
         AND p.card_state <> 'new'
         AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW()
       UNION ALL
       SELECT ${DECK_CARD_COLUMNS}, ${DECK_PROGRESS_COLUMNS},
              1 AS tier, 'new'::text AS queue_kind, 1 AS kind_order
       FROM deck_cards dc
       JOIN decks d ON d.id = dc.deck_id
       LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
       LEFT JOIN target_languages t ON t.id = d.target_language_id
       LEFT JOIN deck_card_progress p
         ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 1
       WHERE dc.deck_id = $2
         AND $5::text IN ('both', 'learn_bridge')
         AND (
           p.user_id IS NULL
           OR (p.removed = FALSE AND p.card_state = 'new')
         )
       UNION ALL
       SELECT ${DECK_CARD_COLUMNS}, ${DECK_PROGRESS_COLUMNS},
              2 AS tier, 'new'::text AS queue_kind, 1 AS kind_order
       FROM deck_cards dc
       JOIN decks d ON d.id = dc.deck_id
       LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
       LEFT JOIN target_languages t ON t.id = d.target_language_id
       LEFT JOIN deck_card_progress p
         ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 2
       WHERE dc.deck_id = $2
         AND $5::text IN ('both', 'apply_bridge', 'skip_bridge')
         AND (
           (
             p.user_id IS NOT NULL
             AND p.removed = FALSE
             AND (p.card_state = 'new' OR p.next_review_at IS NULL)
           )
           OR ($4::boolean = TRUE AND p.user_id IS NULL)
         )
     ) cards
     ORDER BY kind_order, RANDOM()
     LIMIT $3`,
    [userId, deckId, options.limit, unlockAllTier2, tierMode],
  );

  return rows.map((row) => mapDeckRow(row, row.tier, row.queue_kind) as DeckStudyQueueItem);
}

export interface DeckDueCounts {
  new: number;
  review: number;
  vocabulary: number;
}

export interface DeckDueCountsOptions {
  tierMode?: 'both' | 'learn_bridge' | 'apply_bridge' | 'skip_bridge';
  unlockAllTier2?: boolean;
}

/**
 * Due-count summary for one deck, gated by tierMode/unlockAllTier2 exactly like
 * `getDeckStudyQueue` (and `progress.model.ts`'s `countVocabularyDueSplit` for the
 * built-in path): a single-tier mode counts only that tier's due/new cards, and a
 * fresh deck's never-graduated tier-2 cards only count as "new" when unlocked.
 */
export async function getDeckDueCounts(
  userId: number,
  deckId: number,
  options: DeckDueCountsOptions = {},
): Promise<DeckDueCounts> {
  const tierMode = options.tierMode ?? 'both';
  const unlockAllTier2 = options.unlockAllTier2 === true;

  const row = await queryOne<{ due_new: number; due_review: number }>(
    `SELECT
       (
         (SELECT COUNT(*)::int
            FROM deck_cards dc
            LEFT JOIN deck_card_progress p
              ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 1
           WHERE dc.deck_id = $2
             AND $3::text IN ('both', 'learn_bridge')
             AND (p.user_id IS NULL OR (p.removed = FALSE AND p.card_state = 'new')))
       + (SELECT COUNT(*)::int
            FROM deck_cards dc
            LEFT JOIN deck_card_progress p
              ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 2
           WHERE dc.deck_id = $2
             AND $3::text IN ('both', 'apply_bridge', 'skip_bridge')
             AND (
               (p.user_id IS NOT NULL AND p.removed = FALSE
                 AND (p.card_state = 'new' OR p.next_review_at IS NULL))
               OR ($4::boolean = TRUE AND p.user_id IS NULL)
             ))
       )::int AS due_new,
       (
         (SELECT COUNT(*)::int
            FROM deck_cards dc
            JOIN deck_card_progress p
              ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 1
           WHERE dc.deck_id = $2
             AND $3::text IN ('both', 'learn_bridge')
             AND p.removed = FALSE AND p.card_state <> 'new'
             AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW())
       + (SELECT COUNT(*)::int
            FROM deck_cards dc
            JOIN deck_card_progress p
              ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = 2
           WHERE dc.deck_id = $2
             AND $3::text IN ('both', 'apply_bridge', 'skip_bridge')
             AND p.removed = FALSE AND p.card_state <> 'new'
             AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW())
       )::int AS due_review`,
    [userId, deckId, tierMode, unlockAllTier2],
  );

  const dueNew = row?.due_new ?? 0;
  const dueReview = row?.due_review ?? 0;
  return { new: dueNew, review: dueReview, vocabulary: dueNew + dueReview };
}

/**
 * Single-card fetch, used by the review/removed endpoints to return an updated card
 * after a write (same VocabularyItem shaping as `getDeckStudyQueue`, mirroring how
 * `content.model.ts`'s `getVocabularyRow` fetches a single row by id).
 *
 * Deviation from the requested signature: a `tier` parameter is required here. A deck
 * card carries two *independent* progress rows (tier 1 and tier 2), so `(userId,
 * deckCardId)` alone cannot determine which one's SM-2 state to attach -- and the
 * review/removed routes that call this always know the tier from the request that just
 * fired, so threading it through is free for them.
 */
export async function getDeckStudyQueueItem(
  userId: number,
  deckCardId: number,
  tier: StudyTier,
): Promise<(VocabularyItem & { tier: 1 | 2 }) | null> {
  const row = await queryOne<DeckCardRow>(
    `SELECT ${DECK_CARD_COLUMNS}, ${DECK_PROGRESS_COLUMNS}
     FROM deck_cards dc
     JOIN decks d ON d.id = dc.deck_id
     LEFT JOIN bridge_languages b ON b.id = d.bridge_language_id
     LEFT JOIN target_languages t ON t.id = d.target_language_id
     LEFT JOIN deck_card_progress p
       ON p.deck_card_id = dc.id AND p.user_id = $1 AND p.tier = $3
     WHERE dc.id = $2`,
    [userId, deckCardId, tier],
  );
  if (!row) return null;
  return mapDeckRow(row, tier);
}
