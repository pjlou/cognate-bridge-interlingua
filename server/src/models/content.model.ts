import { query, queryOne } from '../db.js';
import {
  isExperimentalBridgeEnabled,
  isExperimentalTargetVisible,
  parseExperimentalBridgeAllowlist,
} from '../lib/experimentalBridges.js';
import type {
  BridgeLanguage,
  BridgeLanguageDetail,
  Cognate,
  CorrespondenceRule,
  FrequencyBand,
  GrammarExample,
  GrammarPattern,
  RuleCard,
  RuleCardExample,
  RuleCardMapping,
  TargetLanguage,
  VocabularyItem,
} from './types.js';

const VOCABULARY_COLUMNS = `
  v.id, v.bridge_language_id, b.code AS bridge_language_code,
  v.headword, v.part_of_speech, v.gloss_en, v.glosses_en,
  v.ipa, v.ipa_source, v.etymology, v.difficulty_level, v.frequency_rank, v.frequency_band,
  v.has_english_cognate, v.transparency_score, v.priority_score, v.is_core_track, v.source_ref
`;

type VocabularyRow = Omit<VocabularyItem, 'cognates' | 'progress'>;

export type BrowseSort = 'headword' | 'frequency';
export type EnglishCognateFilter = 'all' | 'with' | 'without';

function experimentalAllowlist(): Set<string> {
  return parseExperimentalBridgeAllowlist();
}

export async function listBridges(): Promise<BridgeLanguageDetail[]> {
  // Counting in correlated subqueries rather than joining and grouping: joining both
  // vocabulary and grammar to the same bridge row multiplies the two counts together.
  const allowlist = experimentalAllowlist();
  const bridges = await query<BridgeLanguage & { vocabulary_count: number; grammar_pattern_count: number }>(
    `SELECT b.id, b.code, b.name, b.family, b.description, b.source_url, b.license_note,
            (SELECT COUNT(*)::int FROM bridge_vocabulary v WHERE v.bridge_language_id = b.id)
              AS vocabulary_count,
            (SELECT COUNT(*)::int FROM grammar_patterns g WHERE g.bridge_language_id = b.id)
              AS grammar_pattern_count
     FROM bridge_languages b
     ORDER BY b.family, b.name`,
  );

  const visible = bridges.filter((bridge) => isExperimentalBridgeEnabled(bridge.code, allowlist));

  const links = await query<TargetLanguage & { bridge_language_id: number }>(
    `SELECT l.bridge_language_id, t.id, t.code, t.name, t.family
     FROM bridge_target_links l
     JOIN target_languages t ON t.id = l.target_language_id
     ORDER BY l.position, t.name`,
  );

  return visible.map((bridge) => ({
    ...bridge,
    target_languages: links
      .filter((link) => link.bridge_language_id === bridge.id)
      .map(({ bridge_language_id: _ignored, ...target }) => target),
  }));
}

export async function getBridgeByCode(code: string): Promise<BridgeLanguage | null> {
  const bridge = await queryOne<BridgeLanguage>(
    `SELECT id, code, name, family, description, source_url, license_note
     FROM bridge_languages WHERE code = $1`,
    [code],
  );
  if (!bridge) return null;
  if (!isExperimentalBridgeEnabled(bridge.code)) return null;
  return bridge;
}

export async function listTargetLanguages(): Promise<TargetLanguage[]> {
  const allowlist = experimentalAllowlist();
  const targets = await query<TargetLanguage>(
    'SELECT id, code, name, family FROM target_languages ORDER BY family, name',
  );
  return targets.filter((target) => isExperimentalTargetVisible(target.code, allowlist));
}

export async function listCorrespondenceRules(bridgeId: number): Promise<CorrespondenceRule[]> {
  return query<CorrespondenceRule>(
    `SELECT id, code, name, notation, description, source_note, example_bridge, example_target
     FROM correspondence_rules
     WHERE bridge_language_id = $1
     ORDER BY code`,
    [bridgeId],
  );
}

/**
 * Loads cognates for a batch of vocabulary rows in one query.
 *
 * Batching matters here: a study session pulls 20 cards, each with up to five target
 * languages, so doing this per card would be 20 round trips on the hot path.
 *
 * `targetLanguageIds` narrows the result to the languages a learner is tracking. Passing
 * null means "all of them" (anonymous browse). Passing an empty array means the learner
 * has chosen none, so no cognates are attached.
 */
export async function attachCognates<T extends { id: number }>(
  items: T[],
  targetLanguageIds: number[] | null,
): Promise<(T & { cognates: Cognate[] })[]> {
  if (items.length === 0) return [];
  if (targetLanguageIds !== null && targetLanguageIds.length === 0) {
    return items.map((item) => ({ ...item, cognates: [] }));
  }

  const rows = await query<{
    bridge_vocabulary_id: number;
    id: number;
    target_word: string;
    provenance: Cognate['provenance'];
    confidence: number;
    validated_against: string | null;
    notes: string | null;
    target_id: number;
    target_code: string;
    target_name: string;
    target_family: TargetLanguage['family'];
    rule_id: number | null;
    rule_code: string | null;
    rule_name: string | null;
    rule_notation: string | null;
    rule_description: string | null;
    rule_source_note: string | null;
    rule_example_bridge: string | null;
    rule_example_target: string | null;
    linked_rules: CorrespondenceRule[] | null;
  }>(
    `SELECT c.bridge_vocabulary_id, c.id, c.target_word, c.provenance, c.confidence,
            c.validated_against, c.notes,
            t.id AS target_id, t.code AS target_code, t.name AS target_name,
            t.family AS target_family,
            r.id AS rule_id, r.code AS rule_code, r.name AS rule_name,
            r.notation AS rule_notation, r.description AS rule_description,
            r.source_note AS rule_source_note,
            r.example_bridge AS rule_example_bridge,
            r.example_target AS rule_example_target,
            (
              SELECT json_agg(json_build_object(
                       'id', lr.id,
                       'code', lr.code,
                       'name', lr.name,
                       'notation', lr.notation,
                       'description', lr.description,
                       'source_note', lr.source_note,
                       'example_bridge', lr.example_bridge,
                       'example_target', lr.example_target
                     ) ORDER BY lr.code)
                FROM cognate_rule_links link
                JOIN correspondence_rules lr ON lr.id = link.correspondence_rule_id
               WHERE link.cognate_correspondence_id = c.id
            ) AS linked_rules
     FROM cognate_correspondences c
     JOIN target_languages t ON t.id = c.target_language_id
     LEFT JOIN correspondence_rules r ON r.id = c.correspondence_rule_id
     WHERE c.bridge_vocabulary_id = ANY($1::int[])
       AND ($2::int[] IS NULL OR c.target_language_id = ANY($2::int[]))
     ORDER BY t.name, c.confidence DESC, c.target_word`,
    [items.map((item) => item.id), targetLanguageIds],
  );

  const byVocabulary = new Map<number, Cognate[]>();
  for (const row of rows) {
    const primary: CorrespondenceRule | null = row.rule_id
      ? {
          id: row.rule_id,
          code: row.rule_code!,
          name: row.rule_name,
          notation: row.rule_notation,
          description: row.rule_description!,
          source_note: row.rule_source_note!,
          example_bridge: row.rule_example_bridge,
          example_target: row.rule_example_target,
        }
      : null;
    const rules =
      row.linked_rules && row.linked_rules.length > 0
        ? row.linked_rules
        : primary
          ? [primary]
          : [];
    const cognate: Cognate = {
      id: row.id,
      target_word: row.target_word,
      provenance: row.provenance,
      confidence: row.confidence,
      validated_against: row.validated_against,
      notes: row.notes,
      target_language: {
        id: row.target_id,
        code: row.target_code,
        name: row.target_name,
        family: row.target_family,
      },
      rule: rules[0] ?? primary,
      rules,
    };
    const bucket = byVocabulary.get(row.bridge_vocabulary_id);
    if (bucket) bucket.push(cognate);
    else byVocabulary.set(row.bridge_vocabulary_id, [cognate]);
  }

  return items.map((item) => ({ ...item, cognates: byVocabulary.get(item.id) ?? [] }));
}

/**
 * The due queue for a learner.
 *
 * A card is due when it has never been seen, or its scheduled time has passed and it is
 * not yet mastered. Unseen items appear as tier 1. Tier 2 appears only after it has been
 * unlocked. Cards are taken from one frequency band at a time, most common English
 * meanings first; within a band, `frequency_rank` then random order.
 */
export interface StudyQueueOptions {
  limit: number;
  /** 1 = ranks 1-500. Null selects unranked words. Omit to include every band. */
  band?: number | null;
  skipEnglishCognates?: boolean;
  /** Restrict the queue to lemmas marked as having an English cognate. */
  requireEnglishCognates?: boolean;
  /**
   * When true, Cognates tier-2 cards appear without a prior Meaning-tier unlock row.
   * Currently unused by any bridge, but kept as a queue-shaping option for a future
   * bridge whose tier-2 should unlock immediately.
   */
  unlockAllTier2?: boolean;
  /** Restrict the queue to lemmas that have an Interlingua cognate row. */
  requireInterlinguaCognate?: boolean;
}

export type StudyQueueItem = VocabularyRow & { tier: 1 | 2; queue_kind: 'new' | 'review' };

const BAND_AND_SKIP = `
       AND ($4::boolean = FALSE OR v.has_english_cognate = FALSE)
       AND ($9::boolean = FALSE OR v.has_english_cognate = TRUE)
       AND (
         $5::boolean = FALSE
         OR ($6::int IS NULL AND v.frequency_band IS NULL)
         OR v.frequency_band = $6
       )
       AND (
         $7::boolean = FALSE
         OR EXISTS (
           SELECT 1
             FROM cognate_correspondences c
             JOIN target_languages t ON t.id = c.target_language_id
            WHERE c.bridge_vocabulary_id = v.id AND t.code = 'ia'
         )
       )`;

export async function getStudyQueue(
  userId: number,
  bridgeId: number,
  options: StudyQueueOptions,
): Promise<StudyQueueItem[]> {
  const bandFilter = options.band === undefined ? null : options.band;
  const restrictBand = options.band !== undefined;
  const unlockAllTier2 = options.unlockAllTier2 === true;
  const requireIa = options.requireInterlinguaCognate === true;
  const requireEnglish = options.requireEnglishCognates === true;

  // Reviews first (queue_kind = 0), then new cards (queue_kind = 1), Anki-style.
  // Newly unlocked tier-2 rows start as card_state=new with null next_review_at.
  // When unlockAllTier2 is on, tier-2 news also include lemmas with no tier-2 row yet.
  return query<StudyQueueItem>(
    `SELECT * FROM (
       SELECT ${VOCABULARY_COLUMNS}, 1 AS tier, 'review'::text AS queue_kind, 0 AS kind_order
       FROM bridge_vocabulary v
       JOIN bridge_languages b ON b.id = v.bridge_language_id
       JOIN vocabulary_progress p
         ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 1
       WHERE v.bridge_language_id = $2
         AND p.removed = FALSE
         AND p.card_state <> 'new'
         AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW()
         ${BAND_AND_SKIP}
       UNION ALL
       SELECT ${VOCABULARY_COLUMNS}, 2 AS tier, 'review'::text AS queue_kind, 0 AS kind_order
       FROM bridge_vocabulary v
       JOIN bridge_languages b ON b.id = v.bridge_language_id
       JOIN vocabulary_progress p
         ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 2
       WHERE v.bridge_language_id = $2
         AND p.removed = FALSE
         AND p.card_state <> 'new'
         AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW()
         ${BAND_AND_SKIP}
       UNION ALL
       SELECT ${VOCABULARY_COLUMNS}, 1 AS tier, 'new'::text AS queue_kind, 1 AS kind_order
       FROM bridge_vocabulary v
       JOIN bridge_languages b ON b.id = v.bridge_language_id
       LEFT JOIN vocabulary_progress p
         ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 1
       WHERE v.bridge_language_id = $2
         AND (
           p.user_id IS NULL
           OR (p.removed = FALSE AND p.card_state = 'new')
         )
         ${BAND_AND_SKIP}
       UNION ALL
       SELECT ${VOCABULARY_COLUMNS}, 2 AS tier, 'new'::text AS queue_kind, 1 AS kind_order
       FROM bridge_vocabulary v
       JOIN bridge_languages b ON b.id = v.bridge_language_id
       LEFT JOIN vocabulary_progress p
         ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 2
       WHERE v.bridge_language_id = $2
         AND (
           (
             p.user_id IS NOT NULL
             AND p.removed = FALSE
             AND (p.card_state = 'new' OR p.next_review_at IS NULL)
           )
           OR ($8::boolean = TRUE AND p.user_id IS NULL)
         )
         ${BAND_AND_SKIP}
     ) cards
     ORDER BY kind_order, priority_score NULLS LAST, frequency_rank NULLS LAST, RANDOM()
     LIMIT $3`,
    [
      userId,
      bridgeId,
      options.limit,
      options.skipEnglishCognates === true,
      restrictBand,
      bandFilter,
      requireIa,
      unlockAllTier2,
      requireEnglish,
    ],
  );
}

const GAME_COGNATE_AND_POS = `
       AND (
         $3::text = 'all'
         OR ($3 = 'with' AND v.has_english_cognate = TRUE)
         OR ($3 = 'without' AND v.has_english_cognate = FALSE)
       )
       AND ($4::text[] IS NULL OR LOWER(v.part_of_speech) = ANY($4::text[]))
       AND ($5::text[] IS NULL OR NOT (LOWER(v.part_of_speech) = ANY($5::text[])))
       AND (
         $7::boolean = FALSE
         OR EXISTS (
           SELECT 1
             FROM cognate_correspondences c
             JOIN target_languages t ON t.id = c.target_language_id
            WHERE c.bridge_vocabulary_id = v.id AND t.code = 'ia'
         )
       )`;

const GRAMMAR_PARTICLE_POS = [
  'art',
  'article',
  'prep',
  'preposition',
  'conj',
  'conjunction',
  'prn',
  'pron',
  'pronoun',
  'int',
  'interj',
  'interjection',
];

function gamePosFilterLists(partOfSpeech: string | null): {
  include: string[] | null;
  exclude: string[] | null;
} {
  if (!partOfSpeech) return { include: null, exclude: null };
  if (partOfSpeech === 'grammar_particle') return { include: GRAMMAR_PARTICLE_POS, exclude: null };
  if (partOfSpeech === 'content_words') return { include: null, exclude: GRAMMAR_PARTICLE_POS };
  return { include: [partOfSpeech], exclude: null };
}

/**
 * Lemmas for the matching game: unique vocabulary rows in study-queue order
 * (due reviews, then new), then padded by priority/frequency if the queue is short.
 */
export async function getGameLemmaPool(
  userId: number,
  bridgeId: number,
  options: {
    limit: number;
    englishCognates?: EnglishCognateFilter;
    partOfSpeech?: string | null;
    requireInterlinguaCognate?: boolean;
  },
): Promise<VocabularyRow[]> {
  const limit = Math.min(Math.max(options.limit, 1), 60);
  const englishCognates: EnglishCognateFilter =
    options.englishCognates === 'with' || options.englishCognates === 'without'
      ? options.englishCognates
      : 'all';
  const requireIa = options.requireInterlinguaCognate === true;
  const { include: posInclude, exclude: posExclude } = gamePosFilterLists(
    options.partOfSpeech?.trim() || null,
  );

  const scheduled = await query<
    VocabularyRow & { kind_order: number; schedule_at: string | null }
  >(
    `SELECT * FROM (
       SELECT ${VOCABULARY_COLUMNS}, 0 AS kind_order, p.next_review_at AS schedule_at
       FROM bridge_vocabulary v
       JOIN bridge_languages b ON b.id = v.bridge_language_id
       JOIN vocabulary_progress p
         ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 1
       WHERE v.bridge_language_id = $2
         AND p.removed = FALSE
         AND p.card_state <> 'new'
         AND p.next_review_at IS NOT NULL AND p.next_review_at <= NOW()
         ${GAME_COGNATE_AND_POS}
       UNION ALL
       SELECT ${VOCABULARY_COLUMNS}, 1 AS kind_order, NULL::timestamptz AS schedule_at
       FROM bridge_vocabulary v
       JOIN bridge_languages b ON b.id = v.bridge_language_id
       LEFT JOIN vocabulary_progress p
         ON p.bridge_vocabulary_id = v.id AND p.user_id = $1 AND p.tier = 1
       WHERE v.bridge_language_id = $2
         AND (
           p.user_id IS NULL
           OR (p.removed = FALSE AND p.card_state = 'new')
         )
         ${GAME_COGNATE_AND_POS}
     ) cards
     ORDER BY kind_order, schedule_at ASC NULLS LAST, priority_score NULLS LAST,
              frequency_rank NULLS LAST, id
     LIMIT $6`,
    [
      userId,
      bridgeId,
      englishCognates,
      posInclude,
      posExclude,
      Math.max(limit * 3, 120),
      requireIa,
    ],
  );

  const picked: VocabularyRow[] = [];
  const seen = new Set<number>();
  for (const row of scheduled) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const { kind_order: _kind, schedule_at: _at, ...vocab } = row;
    void _kind;
    void _at;
    picked.push(vocab);
    if (picked.length >= limit) return picked;
  }

  const remaining = limit - picked.length;
  if (remaining <= 0) return picked;

  const pad = await query<VocabularyRow>(
    `SELECT ${VOCABULARY_COLUMNS}
     FROM bridge_vocabulary v
     JOIN bridge_languages b ON b.id = v.bridge_language_id
     WHERE v.bridge_language_id = $1
       AND (
         $2::text = 'all'
         OR ($2 = 'with' AND v.has_english_cognate = TRUE)
         OR ($2 = 'without' AND v.has_english_cognate = FALSE)
       )
       AND ($3::text[] IS NULL OR LOWER(v.part_of_speech) = ANY($3::text[]))
       AND ($4::text[] IS NULL OR NOT (LOWER(v.part_of_speech) = ANY($4::text[])))
       AND NOT (v.id = ANY($5::int[]))
       AND (
         $7::boolean = FALSE
         OR EXISTS (
           SELECT 1
             FROM cognate_correspondences c
             JOIN target_languages t ON t.id = c.target_language_id
            WHERE c.bridge_vocabulary_id = v.id AND t.code = 'ia'
         )
       )
     ORDER BY v.priority_score NULLS LAST, v.frequency_rank NULLS LAST, v.id
     LIMIT $6`,
    [bridgeId, englishCognates, posInclude, posExclude, [...seen], remaining, requireIa],
  );

  return [...picked, ...pad];
}

export async function listPartsOfSpeech(bridgeId: number): Promise<string[]> {
  const rows = await query<{ part_of_speech: string }>(
    `SELECT DISTINCT part_of_speech
     FROM bridge_vocabulary
     WHERE bridge_language_id = $1
     ORDER BY part_of_speech`,
    [bridgeId],
  );
  return rows.map((row) => row.part_of_speech);
}

export async function listFrequencyBands(
  userId: number,
  bridgeId: number,
  skipEnglishCognates: boolean,
  options: {
    unlockAllTier2?: boolean;
    requireInterlinguaCognate?: boolean;
    requireEnglishCognates?: boolean;
  } = {},
): Promise<FrequencyBand[]> {
  const unlockAllTier2 = options.unlockAllTier2 === true;
  const requireIa = options.requireInterlinguaCognate === true;
  const requireEnglish = options.requireEnglishCognates === true;
  const rows = await query<{
    frequency_band: number | null;
    total: number;
    due: number;
  }>(
    `SELECT v.frequency_band,
            (COUNT(*))::int AS total,
            (
              COUNT(*) FILTER (
                WHERE p1.user_id IS NULL
                  OR (p1.removed = FALSE AND p1.card_state = 'new')
              )
              + COUNT(*) FILTER (
                  WHERE p2.user_id IS NOT NULL
                    AND p2.removed = FALSE
                    AND (p2.card_state = 'new' OR p2.next_review_at IS NULL)
                )
              + COUNT(*) FILTER (
                  WHERE $5::boolean = TRUE AND p2.user_id IS NULL
                )
              + COUNT(*) FILTER (
                  WHERE p1.user_id IS NOT NULL
                    AND p1.removed = FALSE
                    AND p1.card_state <> 'new'
                    AND p1.next_review_at IS NOT NULL AND p1.next_review_at <= NOW()
                )
              + COUNT(*) FILTER (
                  WHERE p2.user_id IS NOT NULL
                    AND p2.removed = FALSE
                    AND p2.card_state <> 'new'
                    AND p2.next_review_at IS NOT NULL AND p2.next_review_at <= NOW()
                )
            )::int AS due
     FROM bridge_vocabulary v
     LEFT JOIN vocabulary_progress p1
       ON p1.bridge_vocabulary_id = v.id AND p1.user_id = $1 AND p1.tier = 1
     LEFT JOIN vocabulary_progress p2
       ON p2.bridge_vocabulary_id = v.id AND p2.user_id = $1 AND p2.tier = 2
     WHERE v.bridge_language_id = $2
       AND ($3::boolean = FALSE OR v.has_english_cognate = FALSE)
       AND ($6::boolean = FALSE OR v.has_english_cognate = TRUE)
       AND (
         $4::boolean = FALSE
         OR EXISTS (
           SELECT 1
             FROM cognate_correspondences c
             JOIN target_languages t ON t.id = c.target_language_id
            WHERE c.bridge_vocabulary_id = v.id AND t.code = 'ia'
         )
       )
     GROUP BY v.frequency_band
     ORDER BY v.frequency_band NULLS LAST`,
    [userId, bridgeId, skipEnglishCognates, requireIa, unlockAllTier2, requireEnglish],
  );

  return rows.map((row) => {
    if (row.frequency_band === null) {
      return {
        band: null,
        rank_from: null,
        rank_to: null,
        total: row.total,
        due: row.due,
      };
    }
    const from = (row.frequency_band - 1) * 500 + 1;
    return {
      band: row.frequency_band,
      rank_from: from,
      rank_to: from + 499,
      total: row.total,
      due: row.due,
    };
  });
}

export async function browseVocabulary(
  bridgeId: number,
  options: {
    search?: string;
    limit: number;
    offset: number;
    sort?: BrowseSort;
    englishCognates?: EnglishCognateFilter;
  },
): Promise<{ items: VocabularyRow[]; total: number }> {
  const search = options.search?.trim() ?? '';
  // A blank search must not become '%%' with a LIKE cost; the null check short-circuits.
  const pattern = search ? `${search.toLowerCase()}%` : null;
  const sort: BrowseSort = options.sort === 'frequency' ? 'frequency' : 'headword';
  const englishCognates: EnglishCognateFilter =
    options.englishCognates === 'with' || options.englishCognates === 'without'
      ? options.englishCognates
      : 'all';

  const where = `
     WHERE v.bridge_language_id = $1
       AND ($2::text IS NULL OR LOWER(v.headword) LIKE $2 OR LOWER(v.gloss_en) LIKE $2)
       AND (
         $3::text = 'all'
         OR ($3 = 'with' AND v.has_english_cognate = TRUE)
         OR ($3 = 'without' AND v.has_english_cognate = FALSE)
       )`;

  const orderBy =
    sort === 'frequency'
      ? `ORDER BY v.frequency_rank ASC NULLS LAST, v.headword, v.homograph_index`
      : `ORDER BY v.headword, v.homograph_index`;

  const items = await query<VocabularyRow>(
    `SELECT ${VOCABULARY_COLUMNS}
     FROM bridge_vocabulary v
     JOIN bridge_languages b ON b.id = v.bridge_language_id
     ${where}
     ${orderBy}
     LIMIT $4 OFFSET $5`,
    [bridgeId, pattern, englishCognates, options.limit, options.offset],
  );

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM bridge_vocabulary v
     ${where}`,
    [bridgeId, pattern, englishCognates],
  );

  return { items, total: totalRow?.total ?? 0 };
}

export async function getVocabularyRow(id: number): Promise<VocabularyRow | null> {
  return queryOne<VocabularyRow>(
    `SELECT ${VOCABULARY_COLUMNS}
     FROM bridge_vocabulary v
     JOIN bridge_languages b ON b.id = v.bridge_language_id
     WHERE v.id = $1`,
    [id],
  );
}

/** Vocabulary the learner has progress on (any SM-2 state). */
export async function listReviewedVocabulary(
  userId: number,
  bridgeId: number,
): Promise<(VocabularyRow & { progress: VocabularyItem['progress']; tier: 1 | 2 })[]> {
  const rows = await query<
    VocabularyRow & {
      tier: 1 | 2;
      card_state: 'new' | 'learning' | 'review' | 'relearning';
      ease_factor: string;
      interval_days: string;
      repetitions: number;
      lapses: number;
      learning_step: number;
      review_count: number;
      success_count: number;
      last_reviewed_at: string | null;
      next_review_at: string | null;
      removed: boolean;
    }
  >(
    `SELECT ${VOCABULARY_COLUMNS}, p.tier,
            p.card_state, p.ease_factor, p.interval_days, p.repetitions, p.lapses,
            p.learning_step, p.review_count, p.success_count,
            p.last_reviewed_at, p.next_review_at, p.removed
     FROM vocabulary_progress p
     JOIN bridge_vocabulary v ON v.id = p.bridge_vocabulary_id
     JOIN bridge_languages b ON b.id = v.bridge_language_id
     WHERE p.user_id = $1 AND v.bridge_language_id = $2
     ORDER BY p.removed, p.next_review_at NULLS FIRST, v.headword, p.tier`,
    [userId, bridgeId],
  );

  return rows.map(
    ({
      card_state,
      ease_factor,
      interval_days,
      repetitions,
      lapses,
      learning_step,
      review_count,
      success_count,
      last_reviewed_at,
      next_review_at,
      removed,
      ...item
    }) => ({
      ...item,
      progress: {
        card_state,
        ease_factor: Number(ease_factor),
        interval_days: Number(interval_days),
        repetitions,
        lapses,
        learning_step,
        review_count,
        success_count,
        last_reviewed_at,
        next_review_at,
        removed,
      },
    }),
  );
}

type GrammarPatternRow = Omit<GrammarPattern, 'examples' | 'progress' | 'example_count'> & {
  example_count: number;
};

export async function listGrammarPatterns(
  bridgeId: number,
  userId: number | null,
): Promise<GrammarPattern[]> {
  const rows = await query<
    GrammarPatternRow & {
      mastery_level: number | null;
      review_count: number | null;
      success_count: number | null;
      last_reviewed_at: string | null;
      next_review_at: string | null;
    }
  >(
    `SELECT g.id, g.bridge_language_id, b.code AS bridge_language_code, g.slug, g.name,
            g.family, g.summary, g.description, g.source_note, g.difficulty_level,
            g.drill_kind,
            (SELECT COUNT(*)::int FROM grammar_pattern_examples e
              WHERE e.grammar_pattern_id = g.id) AS example_count,
            p.mastery_level, p.review_count, p.success_count,
            p.last_reviewed_at, p.next_review_at
     FROM grammar_patterns g
     JOIN bridge_languages b ON b.id = g.bridge_language_id
     LEFT JOIN grammar_progress p
       ON p.grammar_pattern_id = g.id AND p.user_id = $2
     WHERE g.bridge_language_id = $1
     ORDER BY g.position, g.name`,
    [bridgeId, userId],
  );

  return rows.map(
    ({ mastery_level, review_count, success_count, last_reviewed_at, next_review_at, ...pattern }) => ({
      ...pattern,
      progress:
        mastery_level === null
          ? null
          : {
              mastery_level,
              review_count: review_count ?? 0,
              success_count: success_count ?? 0,
              last_reviewed_at,
              next_review_at,
            },
    }),
  );
}

export async function getGrammarPattern(
  bridgeId: number,
  slug: string,
  userId: number | null,
): Promise<GrammarPattern | null> {
  const patterns = await listGrammarPatterns(bridgeId, userId);
  const pattern = patterns.find((candidate) => candidate.slug === slug);
  if (!pattern) return null;

  const exampleRows = await query<Omit<GrammarExample, 'parallels'>>(
    `SELECT id, position, bridge_text, gloss_en, highlight, prompt, answer, distractors, note
     FROM grammar_pattern_examples
     WHERE grammar_pattern_id = $1
     ORDER BY position`,
    [pattern.id],
  );

  const parallelRows = await query<{
    grammar_pattern_example_id: number;
    target_text: string;
    target_id: number;
    target_code: string;
    target_name: string;
    target_family: TargetLanguage['family'];
  }>(
    `SELECT pp.grammar_pattern_example_id, pp.target_text,
            t.id AS target_id, t.code AS target_code, t.name AS target_name,
            t.family AS target_family
     FROM grammar_pattern_parallels pp
     JOIN target_languages t ON t.id = pp.target_language_id
     JOIN grammar_pattern_examples e ON e.id = pp.grammar_pattern_example_id
     WHERE e.grammar_pattern_id = $1
     ORDER BY t.name`,
    [pattern.id],
  );

  const parallelsByExample = new Map<number, GrammarExample['parallels']>();
  for (const row of parallelRows) {
    const entry = {
      target_text: row.target_text,
      target_language: {
        id: row.target_id,
        code: row.target_code,
        name: row.target_name,
        family: row.target_family,
      },
    };
    const bucket = parallelsByExample.get(row.grammar_pattern_example_id);
    if (bucket) bucket.push(entry);
    else parallelsByExample.set(row.grammar_pattern_example_id, [entry]);
  }

  return {
    ...pattern,
    examples: exampleRows.map((example) => ({
      ...example,
      parallels: parallelsByExample.get(example.id) ?? [],
    })),
  };
}

export async function grammarPatternExists(id: number): Promise<boolean> {
  return (await queryOne('SELECT 1 FROM grammar_patterns WHERE id = $1', [id])) !== null;
}

export async function vocabularyExists(id: number): Promise<boolean> {
  return (await queryOne('SELECT 1 FROM bridge_vocabulary WHERE id = $1', [id])) !== null;
}

type RuleCardRow = Omit<RuleCard, 'examples' | 'mappings' | 'progress' | 'example_count'> & {
  example_count: number;
};

export async function listRuleCards(userId: number | null): Promise<RuleCard[]> {
  const rows = await query<
    RuleCardRow & {
      mastery_level: number | null;
      review_count: number | null;
      success_count: number | null;
      last_reviewed_at: string | null;
      next_review_at: string | null;
    }
  >(
    `SELECT c.id, c.slug, c.name, c.tier, c.position, c.teaching_frame, c.pattern_summary,
            c.description, c.caveat, c.source_note, c.difficulty_level, c.sound_law_prefixes,
            (SELECT COUNT(*)::int FROM rule_card_examples e
              WHERE e.rule_card_id = c.id) AS example_count,
            p.mastery_level, p.review_count, p.success_count,
            p.last_reviewed_at, p.next_review_at
     FROM rule_cards c
     LEFT JOIN rule_card_progress p
       ON p.rule_card_id = c.id AND p.user_id = $1
     ORDER BY c.position, c.name`,
    [userId],
  );

  return rows.map(
    ({ mastery_level, review_count, success_count, last_reviewed_at, next_review_at, ...card }) => ({
      ...card,
      tier: card.tier as 1 | 2,
      progress:
        mastery_level === null
          ? null
          : {
              mastery_level,
              review_count: review_count ?? 0,
              success_count: success_count ?? 0,
              last_reviewed_at,
              next_review_at,
            },
    }),
  );
}

export async function getRuleCard(
  slug: string,
  userId: number | null,
): Promise<RuleCard | null> {
  const cards = await listRuleCards(userId);
  const card = cards.find((candidate) => candidate.slug === slug);
  if (!card) return null;

  const mappings = await query<RuleCardMapping>(
    `SELECT id, position, from_label, to_label, notation
     FROM rule_card_mappings
     WHERE rule_card_id = $1
     ORDER BY position`,
    [card.id],
  );

  const examples = await query<RuleCardExample>(
    `SELECT id, position, mapping_id, prompt, answer, distractors, note, false_friend, forms
     FROM rule_card_examples
     WHERE rule_card_id = $1
     ORDER BY position`,
    [card.id],
  );

  return {
    ...card,
    mappings,
    examples: examples.map((example) => ({
      ...example,
      forms:
        example.forms && typeof example.forms === 'object' && !Array.isArray(example.forms)
          ? (example.forms as Record<string, string>)
          : {},
    })),
  };
}

export async function ruleCardExists(id: number): Promise<boolean> {
  return (await queryOne('SELECT 1 FROM rule_cards WHERE id = $1', [id])) !== null;
}

/** Best-effort slug for a named sound-law code from vocabulary annotations. */
export async function ruleCardSlugForSoundLaw(code: string): Promise<string | null> {
  const row = await queryOne<{ slug: string }>(
    `SELECT slug FROM rule_cards
     WHERE EXISTS (
       SELECT 1 FROM unnest(sound_law_prefixes) AS prefix
        WHERE $1 LIKE prefix || '%'
     )
     ORDER BY position
     LIMIT 1`,
    [code],
  );
  return row?.slug ?? null;
}
