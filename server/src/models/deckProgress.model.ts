import { withTransaction } from '../db.js';
import {
  EMPTY_VOCABULARY_PROGRESS,
  applyVocabularyGrade,
  type StudyTier,
  type VocabularyCardState,
  type VocabularyGrade,
} from '../services/scheduler.js';
import type { ProgressSummary } from './types.js';

/**
 * Deck-scoped equivalent of `progress.model.ts`'s `recordVocabularyReview` /
 * `setVocabularyRemoved`, against `deck_card_progress` instead of `vocabulary_progress`.
 * The two tables are structurally identical (see migration 0021) except
 * `deck_card_progress` has no `consecutive_successes` column -- that field is
 * vestigial/pre-SM2 on `vocabulary_progress` and `applyVocabularyGrade` never touches
 * it, so it is simply absent from the `ProgressSummary` shaping below (the field is
 * optional on that type).
 *
 * The SM-2 math itself is not reimplemented: both functions call `applyVocabularyGrade`
 * from `server/src/services/scheduler.ts` unmodified, the same pure function the
 * curated-vocabulary path uses.
 */

const DECK_PROGRESS_COLS = `
  card_state, ease_factor, interval_days, repetitions, lapses, learning_step,
  review_count, success_count, last_reviewed_at, next_review_at, removed
`;

interface DeckProgressRow {
  card_state: VocabularyCardState;
  ease_factor: string | number;
  interval_days: string | number;
  repetitions: number;
  lapses: number;
  learning_step: number;
  review_count: number;
  success_count: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  removed: boolean;
}

function mapDeckProgress(row: DeckProgressRow): ProgressSummary {
  return {
    card_state: row.card_state,
    ease_factor: Number(row.ease_factor),
    interval_days: Number(row.interval_days),
    repetitions: row.repetitions,
    lapses: row.lapses,
    learning_step: row.learning_step,
    review_count: row.review_count,
    success_count: row.success_count,
    last_reviewed_at: row.last_reviewed_at,
    next_review_at: row.next_review_at,
    removed: row.removed === true,
  };
}

export interface DeckReviewResult extends ProgressSummary {
  tier2_unlocked: boolean;
}

/**
 * Records one review against a deck card's SM-2 progress. Upserts the progress row,
 * reads the current state `FOR UPDATE` (so two rapid reviews of the same card can't
 * race and both overwrite from the same starting state), applies
 * `applyVocabularyGrade`, and -- on a tier-1 grade that graduates the card -- inserts
 * the tier-2 row exactly as `recordVocabularyReview` does for curated vocabulary.
 */
export async function recordDeckCardReview(
  userId: number,
  deckCardId: number,
  grade: VocabularyGrade,
  tier: StudyTier,
): Promise<DeckReviewResult> {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO deck_card_progress (user_id, deck_card_id, tier)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, deck_card_id, tier) DO NOTHING`,
      [userId, deckCardId, tier],
    );

    const { rows } = await client.query<{
      card_state: VocabularyCardState;
      ease_factor: string;
      interval_days: string;
      repetitions: number;
      lapses: number;
      learning_step: number;
      review_count: number;
      success_count: number;
    }>(
      `SELECT card_state, ease_factor, interval_days, repetitions, lapses, learning_step,
              review_count, success_count
       FROM deck_card_progress
       WHERE user_id = $1 AND deck_card_id = $2 AND tier = $3
       FOR UPDATE`,
      [userId, deckCardId, tier],
    );

    const current = rows[0]
      ? {
          cardState: rows[0].card_state,
          easeFactor: Number(rows[0].ease_factor),
          intervalDays: Number(rows[0].interval_days),
          repetitions: rows[0].repetitions,
          lapses: rows[0].lapses,
          learningStep: rows[0].learning_step,
          reviewCount: rows[0].review_count,
          successCount: rows[0].success_count,
        }
      : EMPTY_VOCABULARY_PROGRESS;

    const outcome = applyVocabularyGrade(current, grade);

    let unlocked = false;
    if (tier === 1 && outcome.unlockTier2) {
      const inserted = await client.query(
        `INSERT INTO deck_card_progress (user_id, deck_card_id, tier)
         VALUES ($1, $2, 2)
         ON CONFLICT (user_id, deck_card_id, tier) DO NOTHING`,
        [userId, deckCardId],
      );
      unlocked = (inserted.rowCount ?? 0) > 0;
    }

    const { rows: updated } = await client.query<DeckProgressRow>(
      `UPDATE deck_card_progress
       SET card_state = $4, ease_factor = $5, interval_days = $6, repetitions = $7,
           lapses = $8, learning_step = $9, review_count = $10, success_count = $11,
           last_reviewed_at = $12, next_review_at = $13, removed = FALSE
       WHERE user_id = $1 AND deck_card_id = $2 AND tier = $3
       RETURNING ${DECK_PROGRESS_COLS}`,
      [
        userId,
        deckCardId,
        tier,
        outcome.cardState,
        outcome.easeFactor,
        outcome.intervalDays,
        outcome.repetitions,
        outcome.lapses,
        outcome.learningStep,
        outcome.reviewCount,
        outcome.successCount,
        outcome.lastReviewedAt,
        outcome.nextReviewAt,
      ],
    );

    return { ...mapDeckProgress(updated[0]!), tier2_unlocked: unlocked };
  });
}

/**
 * Soft-remove or restore a deck card in the learner's study queue. Creates a progress
 * row if needed so a never-seen card stays out of the new queue, mirroring
 * `setVocabularyRemoved`.
 */
export async function setDeckCardRemoved(
  userId: number,
  deckCardId: number,
  tier: StudyTier,
  removed: boolean,
): Promise<ProgressSummary> {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO deck_card_progress (user_id, deck_card_id, tier, removed)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, deck_card_id, tier) DO UPDATE
         SET removed = EXCLUDED.removed`,
      [userId, deckCardId, tier, removed],
    );

    const { rows } = await client.query<DeckProgressRow>(
      `SELECT ${DECK_PROGRESS_COLS}
       FROM deck_card_progress
       WHERE user_id = $1 AND deck_card_id = $2 AND tier = $3`,
      [userId, deckCardId, tier],
    );

    return mapDeckProgress(rows[0]!);
  });
}
