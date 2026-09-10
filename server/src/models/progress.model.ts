import { query, queryOne, withTransaction } from '../db.js';
import {
  EMPTY_PROGRESS,
  EMPTY_VOCABULARY_PROGRESS,
  applyReview,
  applyVocabularyGrade,
  progressTable,
  type ItemKind,
  type StudyTier,
  type VocabularyCardState,
  type VocabularyGrade,
} from '../services/scheduler.js';
import type { DueCounts, ProgressSummary, VocabularyStats } from './types.js';

export interface ReviewResult extends ProgressSummary {
  next_review_at: string;
  tier2_unlocked?: boolean;
}

/**
 * Records one review against grammar / rule-card progress (Leitner mastery).
 *
 * Read-modify-write inside a transaction with `FOR UPDATE`: two rapid reviews of the
 * same card would otherwise both read the same mastery level and the second would
 * overwrite the first's increment. The row lock serialises them.
 *
 * Vocabulary uses `recordVocabularyReview`.
 */
export async function recordReview(
  kind: ItemKind,
  userId: number,
  itemId: number,
  success: boolean,
): Promise<ReviewResult> {
  if (kind === 'vocabulary') {
    throw new Error('Use recordVocabularyReview for vocabulary cards');
  }

  const { table, itemColumn } = progressTable(kind);

  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO ${table} (user_id, ${itemColumn})
       VALUES ($1, $2)
       ON CONFLICT (user_id, ${itemColumn}) DO NOTHING`,
      [userId, itemId],
    );

    const { rows } = await client.query<{
      mastery_level: number;
      review_count: number;
      success_count: number;
    }>(
      `SELECT mastery_level, review_count, success_count
       FROM ${table}
       WHERE user_id = $1 AND ${itemColumn} = $2
       FOR UPDATE`,
      [userId, itemId],
    );

    const current = rows[0]
      ? {
          masteryLevel: rows[0].mastery_level,
          reviewCount: rows[0].review_count,
          successCount: rows[0].success_count,
        }
      : EMPTY_PROGRESS;

    const outcome = applyReview(current, success);

    const { rows: updated } = await client.query<{
      mastery_level: number;
      review_count: number;
      success_count: number;
      last_reviewed_at: string;
      next_review_at: string;
    }>(
      `UPDATE ${table}
       SET mastery_level = $3, review_count = $4, success_count = $5,
           last_reviewed_at = $6, next_review_at = $7
       WHERE user_id = $1 AND ${itemColumn} = $2
       RETURNING mastery_level, review_count, success_count, last_reviewed_at, next_review_at`,
      [
        userId,
        itemId,
        outcome.masteryLevel,
        outcome.reviewCount,
        outcome.successCount,
        outcome.lastReviewedAt,
        outcome.nextReviewAt,
      ],
    );

    const row = updated[0]!;
    return {
      mastery_level: row.mastery_level,
      review_count: row.review_count,
      success_count: row.success_count,
      last_reviewed_at: row.last_reviewed_at,
      next_review_at: row.next_review_at,
    };
  });
}

export async function recordVocabularyReview(
  userId: number,
  itemId: number,
  grade: VocabularyGrade,
  tier: StudyTier,
): Promise<ReviewResult> {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO vocabulary_progress (user_id, bridge_vocabulary_id, tier)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, bridge_vocabulary_id, tier) DO NOTHING`,
      [userId, itemId, tier],
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
       FROM vocabulary_progress
       WHERE user_id = $1 AND bridge_vocabulary_id = $2 AND tier = $3
       FOR UPDATE`,
      [userId, itemId, tier],
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
        `INSERT INTO vocabulary_progress (user_id, bridge_vocabulary_id, tier)
         VALUES ($1, $2, 2)
         ON CONFLICT (user_id, bridge_vocabulary_id, tier) DO NOTHING`,
        [userId, itemId],
      );
      unlocked = (inserted.rowCount ?? 0) > 0;
    }

    const { rows: updated } = await client.query<{
      card_state: VocabularyCardState;
      ease_factor: string;
      interval_days: string;
      repetitions: number;
      lapses: number;
      learning_step: number;
      review_count: number;
      success_count: number;
      last_reviewed_at: string;
      next_review_at: string;
      removed: boolean;
    }>(
      `UPDATE vocabulary_progress
       SET card_state = $4, ease_factor = $5, interval_days = $6, repetitions = $7,
           lapses = $8, learning_step = $9, review_count = $10, success_count = $11,
           last_reviewed_at = $12, next_review_at = $13, removed = FALSE
       WHERE user_id = $1 AND bridge_vocabulary_id = $2 AND tier = $3
       RETURNING card_state, ease_factor, interval_days, repetitions, lapses, learning_step,
                 review_count, success_count, last_reviewed_at, next_review_at, removed`,
      [
        userId,
        itemId,
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

    const row = updated[0]!;
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
      tier2_unlocked: unlocked,
    };
  });
}

/**
 * Dry-run SM-2 outcomes for a batch of grades (no writes). Used by the games
 * finished screen to preview what “Yes to study schedule” would do.
 */
export async function previewVocabularyReviews(
  userId: number,
  updates: { id: number; grade: VocabularyGrade; tier: StudyTier }[],
  now: Date = new Date(),
): Promise<
  { id: number; headword: string; grade: VocabularyGrade; next_review_at: string }[]
> {
  if (updates.length === 0) return [];

  const ids = [...new Set(updates.map((u) => u.id))];
  const vocabRows = await query<{ id: number; headword: string }>(
    `SELECT id, headword FROM bridge_vocabulary WHERE id = ANY($1::int[])`,
    [ids],
  );
  const headwordById = new Map(vocabRows.map((row) => [row.id, row.headword]));

  const progressRows = await query<{
    bridge_vocabulary_id: number;
    tier: StudyTier;
    card_state: VocabularyCardState;
    ease_factor: string;
    interval_days: string;
    repetitions: number;
    lapses: number;
    learning_step: number;
    review_count: number;
    success_count: number;
  }>(
    `SELECT bridge_vocabulary_id, tier, card_state, ease_factor, interval_days,
            repetitions, lapses, learning_step, review_count, success_count
     FROM vocabulary_progress
     WHERE user_id = $1 AND bridge_vocabulary_id = ANY($2::int[])`,
    [userId, ids],
  );
  const progressByKey = new Map(
    progressRows.map((row) => [
      `${row.bridge_vocabulary_id}:${row.tier}`,
      {
        cardState: row.card_state,
        easeFactor: Number(row.ease_factor),
        intervalDays: Number(row.interval_days),
        repetitions: row.repetitions,
        lapses: row.lapses,
        learningStep: row.learning_step,
        reviewCount: row.review_count,
        successCount: row.success_count,
      },
    ]),
  );

  const preview: {
    id: number;
    headword: string;
    grade: VocabularyGrade;
    next_review_at: string;
  }[] = [];

  for (const update of updates) {
    const headword = headwordById.get(update.id);
    if (!headword) continue;
    const current =
      progressByKey.get(`${update.id}:${update.tier}`) ?? EMPTY_VOCABULARY_PROGRESS;
    const outcome = applyVocabularyGrade(current, update.grade, now);
    preview.push({
      id: update.id,
      headword,
      grade: update.grade,
      next_review_at: outcome.nextReviewAt.toISOString(),
    });
  }

  preview.sort((a, b) => a.headword.localeCompare(b.headword));
  return preview;
}

/**
 * Soft-remove or restore a vocabulary card in the learner's deck.
 * Creates a progress row if needed so never-seen cards stay out of the new queue.
 */
export async function setVocabularyRemoved(
  userId: number,
  itemId: number,
  tier: StudyTier,
  removed: boolean,
): Promise<ProgressSummary> {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO vocabulary_progress (user_id, bridge_vocabulary_id, tier, removed)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, bridge_vocabulary_id, tier) DO UPDATE
         SET removed = EXCLUDED.removed`,
      [userId, itemId, tier, removed],
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
      consecutive_successes: number;
      last_reviewed_at: string | null;
      next_review_at: string | null;
      removed: boolean;
    }>(
      `SELECT ${VOCAB_PROGRESS_COLS}
       FROM vocabulary_progress
       WHERE user_id = $1 AND bridge_vocabulary_id = $2 AND tier = $3`,
      [userId, itemId, tier],
    );

    return mapVocabProgress(rows[0]!);
  });
}

const VOCAB_PROGRESS_COLS = `
  card_state, ease_factor, interval_days, repetitions, lapses, learning_step,
  review_count, success_count, consecutive_successes, last_reviewed_at, next_review_at,
  removed
`;

function mapVocabProgress(row: {
  card_state: VocabularyCardState;
  ease_factor: string | number;
  interval_days: string | number;
  repetitions: number;
  lapses: number;
  learning_step: number;
  review_count: number;
  success_count: number;
  consecutive_successes?: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  removed?: boolean;
}): ProgressSummary {
  return {
    card_state: row.card_state,
    ease_factor: Number(row.ease_factor),
    interval_days: Number(row.interval_days),
    repetitions: row.repetitions,
    lapses: row.lapses,
    learning_step: row.learning_step,
    review_count: row.review_count,
    success_count: row.success_count,
    consecutive_successes: row.consecutive_successes,
    last_reviewed_at: row.last_reviewed_at,
    next_review_at: row.next_review_at,
    removed: row.removed === true,
  };
}

/** Batch-loads progress for a set of items so a study queue avoids one query per card. */
export async function attachProgress<T extends { id: number }>(
  kind: ItemKind,
  items: T[],
  userId: number | null,
): Promise<(T & { progress: ProgressSummary | null })[]> {
  if (items.length === 0) return [];
  if (userId === null) return items.map((item) => ({ ...item, progress: null }));

  if (kind === 'vocabulary') {
    const rows = await query<
      ProgressSummary & {
        item_id: number;
        card_state: VocabularyCardState;
        ease_factor: string;
        interval_days: string;
        repetitions: number;
        lapses: number;
        learning_step: number;
      }
    >(
      `SELECT bridge_vocabulary_id AS item_id, ${VOCAB_PROGRESS_COLS}
       FROM vocabulary_progress
       WHERE user_id = $1 AND bridge_vocabulary_id = ANY($2::int[]) AND tier = 1`,
      [userId, items.map((item) => item.id)],
    );
    const byItem = new Map(
      rows.map((row) => {
        const { item_id, ...rest } = row;
        return [item_id, mapVocabProgress(rest)];
      }),
    );
    return items.map((item) => ({ ...item, progress: byItem.get(item.id) ?? null }));
  }

  const { table, itemColumn } = progressTable(kind);
  const rows = await query<ProgressSummary & { item_id: number }>(
    `SELECT ${itemColumn} AS item_id, mastery_level, review_count, success_count,
            last_reviewed_at, next_review_at
     FROM ${table}
     WHERE user_id = $1 AND ${itemColumn} = ANY($2::int[])`,
    [userId, items.map((item) => item.id)],
  );

  const byItem = new Map(rows.map(({ item_id, ...progress }) => [item_id, progress]));
  return items.map((item) => ({ ...item, progress: byItem.get(item.id) ?? null }));
}

export async function attachStudyProgress<T extends { id: number; tier: StudyTier }>(
  items: T[],
  userId: number,
): Promise<(T & { progress: ProgressSummary | null })[]> {
  if (items.length === 0) return [];

  const rows = await query<
    {
      item_id: number;
      tier: StudyTier;
      card_state: VocabularyCardState;
      ease_factor: string;
      interval_days: string;
      repetitions: number;
      lapses: number;
      learning_step: number;
      review_count: number;
      success_count: number;
      consecutive_successes: number;
      last_reviewed_at: string | null;
      next_review_at: string | null;
      removed: boolean;
    }
  >(
    `SELECT bridge_vocabulary_id AS item_id, tier, ${VOCAB_PROGRESS_COLS}
     FROM vocabulary_progress
     WHERE user_id = $1 AND bridge_vocabulary_id = ANY($2::int[])`,
    [userId, items.map((item) => item.id)],
  );

  const byItem = new Map(rows.map((row) => [`${row.item_id}:${row.tier}`, row]));
  return items.map((item) => {
    const row = byItem.get(`${item.id}:${item.tier}`);
    if (!row) return { ...item, progress: null };
    const { item_id: _id, tier: _tier, ...progress } = row;
    return { ...item, progress: mapVocabProgress(progress) };
  });
}

export async function listUserTargetLanguageIds(userId: number): Promise<number[]> {
  const rows = await query<{ target_language_id: number }>(
    'SELECT target_language_id FROM user_target_languages WHERE user_id = $1',
    [userId],
  );
  return rows.map((row) => row.target_language_id);
}

export async function englishTargetLanguageId(): Promise<number | null> {
  const row = await queryOne<{ id: number }>('SELECT id FROM target_languages WHERE code = $1', [
    'en',
  ]);
  return row?.id ?? null;
}

export async function targetLanguageIdByCode(code: string): Promise<number | null> {
  const row = await queryOne<{ id: number }>('SELECT id FROM target_languages WHERE code = $1', [
    code,
  ]);
  return row?.id ?? null;
}

export async function setUserTargetLanguages(
  userId: number,
  targetLanguageIds: number[],
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM user_target_languages WHERE user_id = $1', [userId]);
    if (targetLanguageIds.length === 0) return;
    await client.query(
      `INSERT INTO user_target_languages (user_id, target_language_id)
       SELECT $1, UNNEST($2::int[])`,
      [userId, targetLanguageIds],
    );
  });
}

const BAND_AND_SKIP_DUE = `
       AND ($3::boolean = FALSE OR v.has_english_cognate = FALSE)
       AND ($8::boolean = FALSE OR v.has_english_cognate = TRUE)
       AND (
         $4::boolean = FALSE
         OR ($5::int IS NULL AND v.frequency_band IS NULL)
         OR v.frequency_band = $5
       )
       AND (
         $6::boolean = FALSE
         OR EXISTS (
           SELECT 1
             FROM cognate_correspondences c
             JOIN target_languages t ON t.id = c.target_language_id
            WHERE c.bridge_vocabulary_id = v.id AND t.code = 'ia'
         )
       )`;

export async function countVocabularyDueSplit(
  userId: number,
  bridgeId: number,
  options: {
    skipEnglishCognates?: boolean;
    requireEnglishCognates?: boolean;
    band?: number | null;
    unlockAllTier2?: boolean;
    requireInterlinguaCognate?: boolean;
  } = {},
): Promise<{ new: number; review: number }> {
  const bandFilter = options.band === undefined ? null : options.band;
  const restrictBand = options.band !== undefined;
  const skip = options.skipEnglishCognates === true;
  const requireEnglish = options.requireEnglishCognates === true;
  const unlockAllTier2 = options.unlockAllTier2 === true;
  const requireIa = options.requireInterlinguaCognate === true;

  const row = await queryOne<{ due_new: number; due_review: number; due_new_tier2: number }>(
    `SELECT
       (SELECT COUNT(*)::int
          FROM bridge_vocabulary v
          LEFT JOIN vocabulary_progress p
            ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 1
         WHERE v.bridge_language_id = $2
           AND (
             p.user_id IS NULL
             OR (p.removed = FALSE AND p.card_state = 'new')
           )
           ${BAND_AND_SKIP_DUE}) AS due_new,
       (SELECT (
           (SELECT COUNT(*)::int
              FROM bridge_vocabulary v
              JOIN vocabulary_progress p
                ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 1
             WHERE v.bridge_language_id = $2
               AND p.removed = FALSE
               AND p.card_state <> 'new'
               AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW()
               ${BAND_AND_SKIP_DUE})
         + (SELECT COUNT(*)::int
              FROM bridge_vocabulary v
              JOIN vocabulary_progress p
                ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 2
             WHERE v.bridge_language_id = $2
               AND p.removed = FALSE
               AND p.card_state <> 'new'
               AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW()
               ${BAND_AND_SKIP_DUE})
       )) AS due_review,
       (SELECT COUNT(*)::int
          FROM bridge_vocabulary v
          LEFT JOIN vocabulary_progress p
            ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 2
         WHERE v.bridge_language_id = $2
           AND (
             (
               p.user_id IS NOT NULL
               AND p.removed = FALSE
               AND (p.card_state = 'new' OR p.next_review_at IS NULL)
             )
             OR ($7::boolean = TRUE AND p.user_id IS NULL)
           )
           ${BAND_AND_SKIP_DUE}) AS due_new_tier2`,
    [userId, bridgeId, skip, restrictBand, bandFilter, requireIa, unlockAllTier2, requireEnglish],
  );

  return {
    new: (row?.due_new ?? 0) + (row?.due_new_tier2 ?? 0),
    review: row?.due_review ?? 0,
  };
}

export async function countDue(kind: ItemKind, userId: number, bridgeId: number): Promise<number> {
  if (kind === 'grammar') {
    const row = await queryOne<{ due: number }>(
      `SELECT COUNT(*)::int AS due
         FROM grammar_patterns g
         LEFT JOIN grammar_progress p
           ON p.grammar_pattern_id = g.id AND p.user_id = $1
         WHERE g.bridge_language_id = $2
           AND COALESCE(p.mastery_level, 0) < 100
           AND (p.next_review_at IS NULL OR p.next_review_at <= NOW())`,
      [userId, bridgeId],
    );
    return row?.due ?? 0;
  }

  if (kind === 'rule_card') {
    const row = await queryOne<{ due: number }>(
      `SELECT COUNT(*)::int AS due
         FROM rule_cards r
         LEFT JOIN rule_card_progress p
           ON p.rule_card_id = r.id AND p.user_id = $1
         WHERE COALESCE(p.mastery_level, 0) < 100
           AND (p.next_review_at IS NULL OR p.next_review_at <= NOW())`,
      [userId],
    );
    return row?.due ?? 0;
  }

  const split = await countVocabularyDueSplit(userId, bridgeId);
  return split.new + split.review;
}

export async function getDueCounts(
  userId: number,
  bridgeId: number,
  options: {
    skipEnglishCognates?: boolean;
    requireEnglishCognates?: boolean;
    band?: number | null;
    unlockAllTier2?: boolean;
    requireInterlinguaCognate?: boolean;
  } = {},
): Promise<DueCounts> {
  const split = await countVocabularyDueSplit(userId, bridgeId, options);
  const grammar = await countDue('grammar', userId, bridgeId);
  return {
    new: split.new,
    review: split.review,
    vocabulary: split.new + split.review,
    grammar,
  };
}

export async function getVocabularyStats(
  userId: number,
  bridgeId: number,
): Promise<VocabularyStats> {
  const split = await countVocabularyDueSplit(userId, bridgeId);

  const row = await queryOne<{
    studied: number;
    successes: number;
    reviews: number;
    average_ease: string | null;
    mature: number;
  }>(
    `SELECT
       COUNT(*)::int AS studied,
       COALESCE(SUM(p.success_count), 0)::int AS successes,
       COALESCE(SUM(p.review_count), 0)::int AS reviews,
       AVG(p.ease_factor) AS average_ease,
       COUNT(*) FILTER (WHERE p.interval_days >= 21)::int AS mature
     FROM vocabulary_progress p
     JOIN bridge_vocabulary v ON v.id = p.bridge_vocabulary_id
     WHERE p.user_id = $1 AND v.bridge_language_id = $2 AND p.tier = 1
       AND p.review_count > 0`,
    [userId, bridgeId],
  );

  const reviews = row?.reviews ?? 0;
  return {
    studied: row?.studied ?? 0,
    due_new: split.new,
    due_review: split.review,
    retention: reviews > 0 ? (row!.successes ?? 0) / reviews : null,
    average_ease: row?.average_ease !== null && row?.average_ease !== undefined
      ? Number(row.average_ease)
      : null,
    mature: row?.mature ?? 0,
  };
}
