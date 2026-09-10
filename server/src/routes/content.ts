import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { buildTargetCoverage } from '../lib/targetCoverage.js';
import { authenticateToken, optionalAuth, requireUser } from '../middleware/auth.js';
import {
  attachCognates,
  browseVocabulary,
  getBridgeByCode,
  getGameLemmaPool,
  getGrammarPattern,
  getRuleCard,
  getStudyQueue,
  getVocabularyRow,
  grammarPatternExists,
  listBridges,
  listCorrespondenceRules,
  listFrequencyBands,
  listGrammarPatterns,
  listPartsOfSpeech,
  listReviewedVocabulary,
  listRuleCards,
  listTargetLanguages,
  ruleCardExists,
  vocabularyExists,
} from '../models/content.model.js';
import {
  attachProgress,
  attachStudyProgress,
  countDue,
  countVocabularyDueSplit,
  englishTargetLanguageId,
  getDueCounts,
  getVocabularyStats,
  listUserTargetLanguageIds,
  previewVocabularyReviews,
  recordReview,
  recordVocabularyReview,
  setUserTargetLanguages,
  setVocabularyRemoved,
} from '../models/progress.model.js';
import { findById, updatePriorityGermanicTargetLanguage, updatePriorityRomanceTargetLanguage } from '../models/user.model.js';
import { ATTRIBUTION } from '../content/attribution.js';

export const contentRouter = Router();

/**
 * Which cognates to show. A signed-in learner sees only the languages they picked,
 * including none: an empty selection hides the correspondence panel rather than
 * dumping every cognate. Anonymous browse still sees all of them.
 *
 * Study cards always include English as well: tier 1 is English → bridge, and an
 * empty target selection still needs the English cognate (or the knowledge that
 * there isn't one).
 */
async function cognateFilter(userId: number | null): Promise<number[] | null> {
  if (userId === null) return null;
  return listUserTargetLanguageIds(userId);
}

async function studyCognateFilter(userId: number): Promise<number[]> {
  const selected = await listUserTargetLanguageIds(userId);
  const englishId = await englishTargetLanguageId();
  if (englishId === null) return selected;
  if (selected.includes(englishId)) return selected;
  return [...selected, englishId];
}

const reviewBody = z.object({ success: z.boolean() });
const vocabularyReviewBody = z.object({
  grade: z.enum(['again', 'hard', 'good', 'easy']),
  tier: z.union([z.literal(1), z.literal(2)]),
});
const vocabularyRemovedBody = z.object({
  tier: z.union([z.literal(1), z.literal(2)]),
  removed: z.boolean(),
});

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (Array.isArray(value)) return parseBoolean(value[0], defaultValue);
  const text = String(value).toLowerCase();
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return defaultValue;
}

/**
 * `band=unranked` selects words with no English frequency match.
 * An omitted param means every band, so existing clients and tests keep working.
 */
function parseBand(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return parseBand(value[0]);
  if (String(value) === 'unranked') return null;
  const band = Number(value);
  return Number.isInteger(band) && band > 0 ? band : undefined;
}

contentRouter.get(
  '/bridges',
  asyncHandler(async (_req, res) => {
    res.json(await listBridges());
  }),
);

contentRouter.get(
  '/targets',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listTargetLanguages());
  }),
);

contentRouter.get(
  '/attribution',
  asyncHandler(async (_req, res) => {
    res.json({ sources: ATTRIBUTION });
  }),
);

contentRouter.get(
  '/me/targets',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = requireUser(req).id;
    const ids = await listUserTargetLanguageIds(userId);
    const all = await listTargetLanguages();
    res.json(all.filter((target) => ids.includes(target.id)));
  }),
);

contentRouter.get(
  '/me/target-coverage',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = requireUser(req).id;
    const ids = await listUserTargetLanguageIds(userId);
    const all = await listTargetLanguages();
    const selected = all.filter((target) => ids.includes(target.id));
    res.json(await buildTargetCoverage(selected.map((t) => ({ code: t.code, name: t.name }))));
  }),
);

contentRouter.put(
  '/me/targets',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ target_language_ids: z.array(z.number().int().positive()).max(20) })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'target_language_ids must be an array of language ids' });
      return;
    }

    const userId = requireUser(req).id;
    const all = await listTargetLanguages();
    const validIds = new Set(all.map((target) => target.id));
    const unknown = parsed.data.target_language_ids.filter((id) => !validIds.has(id));
    if (unknown.length > 0) {
      res.status(400).json({ error: `Unknown target language id: ${unknown[0]}` });
      return;
    }

    await setUserTargetLanguages(userId, parsed.data.target_language_ids);

    const refreshed = await findById(userId);
    if (
      refreshed?.priority_germanic_target_language_id != null &&
      !parsed.data.target_language_ids.includes(refreshed.priority_germanic_target_language_id)
    ) {
      await updatePriorityGermanicTargetLanguage(userId, null);
    }
    if (
      refreshed?.priority_romance_target_language_id != null &&
      !parsed.data.target_language_ids.includes(refreshed.priority_romance_target_language_id)
    ) {
      await updatePriorityRomanceTargetLanguage(userId, null);
    }

    res.json(all.filter((target) => parsed.data.target_language_ids.includes(target.id)));
  }),
);

contentRouter.get(
  '/bridges/:code/vocabulary',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'headword';
    const sort = sortRaw === 'frequency' ? 'frequency' : 'headword';
    const cognateRaw =
      typeof req.query.english_cognates === 'string' ? req.query.english_cognates : 'all';
    const englishCognates =
      cognateRaw === 'with' || cognateRaw === 'without' ? cognateRaw : 'all';

    const { items, total } = await browseVocabulary(bridge.id, {
      search,
      limit,
      offset,
      sort,
      englishCognates,
    });
    const userId = req.user?.id ?? null;
    const withCognates = await attachCognates(items, await cognateFilter(userId));
    const withProgress = await attachProgress('vocabulary', withCognates, userId);

    res.json({ items: withProgress, total });
  }),
);

contentRouter.get(
  '/bridges/:code/study',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }

    const userId = requireUser(req).id;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const requireEnglishCognates = parseBoolean(req.query.require_english_cognates);
    const skipEnglishCognates = requireEnglishCognates
      ? false
      : parseBoolean(req.query.skip_english_cognates);
    const band = parseBand(req.query.band);
    const queue = await getStudyQueue(userId, bridge.id, {
      limit,
      band,
      skipEnglishCognates,
      requireEnglishCognates,
    });
    const withCognates = await attachCognates(queue, await studyCognateFilter(userId));
    res.json(await attachStudyProgress(withCognates, userId));
  }),
);

contentRouter.get(
  '/bridges/:code/game-lemmas',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }

    const userId = requireUser(req).id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const cognateRaw =
      typeof req.query.english_cognates === 'string' ? req.query.english_cognates : 'all';
    const englishCognates = cognateRaw === 'with' || cognateRaw === 'without' ? cognateRaw : 'all';
    const partOfSpeech =
      typeof req.query.part_of_speech === 'string' && req.query.part_of_speech.trim()
        ? req.query.part_of_speech.trim()
        : null;

    const pool = await getGameLemmaPool(userId, bridge.id, {
      limit,
      englishCognates,
      partOfSpeech,
    });
    const withCognates = await attachCognates(pool, await studyCognateFilter(userId));
    const withProgress = await attachProgress('vocabulary', withCognates, userId);
    res.json(withProgress.slice(0, limit));
  }),
);

contentRouter.get(
  '/bridges/:code/parts-of-speech',
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }
    res.json(await listPartsOfSpeech(bridge.id));
  }),
);

contentRouter.get(
  '/bridges/:code/frequency-bands',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }

    const userId = requireUser(req).id;
    const requireEnglishCognates = parseBoolean(req.query.require_english_cognates);
    const skipEnglishCognates = requireEnglishCognates
      ? false
      : parseBoolean(req.query.skip_english_cognates);
    res.json(
      await listFrequencyBands(userId, bridge.id, skipEnglishCognates, {
        requireEnglishCognates,
      }),
    );
  }),
);

contentRouter.get(
  '/bridges/:code/rules',
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }
    res.json(await listCorrespondenceRules(bridge.id));
  }),
);

contentRouter.get(
  '/bridges/:code/due',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }
    const userId = requireUser(req).id;
    const requireEnglishCognates = parseBoolean(req.query.require_english_cognates);
    const skipEnglishCognates = requireEnglishCognates
      ? false
      : parseBoolean(req.query.skip_english_cognates);
    const band = parseBand(req.query.band);
    const queueOpts = {
      skipEnglishCognates,
      requireEnglishCognates,
      band,
    };
    // When band/skip filters are set, return vocabulary split for the study session;
    // grammar stays unfiltered (bridge-wide).
    if (skipEnglishCognates || requireEnglishCognates || band !== undefined) {
      const split = await countVocabularyDueSplit(userId, bridge.id, queueOpts);
      const grammar = await countDue('grammar', userId, bridge.id);
      res.json({
        new: split.new,
        review: split.review,
        vocabulary: split.new + split.review,
        grammar,
      });
      return;
    }
    res.json(await getDueCounts(userId, bridge.id));
  }),
);

contentRouter.get(
  '/bridges/:code/stats',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }
    res.json(await getVocabularyStats(requireUser(req).id, bridge.id));
  }),
);

contentRouter.get(
  '/vocabulary/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid vocabulary id' });
      return;
    }

    const item = await getVocabularyRow(id);
    if (!item) {
      res.status(404).json({ error: 'Vocabulary item not found' });
      return;
    }

    const userId = req.user?.id ?? null;
    // The detail view deliberately ignores the learner's target filter: this is the
    // page for inspecting a word in full, so it shows every attested correspondence.
    const [withCognates] = await attachCognates([item], null);
    const [withProgress] = await attachProgress('vocabulary', [withCognates!], userId);
    res.json(withProgress);
  }),
);

contentRouter.post(
  '/vocabulary/preview-schedule',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        updates: z
          .array(
            z.object({
              id: z.number().int().positive(),
              grade: z.enum(['again', 'hard', 'good', 'easy']),
              tier: z.union([z.literal(1), z.literal(2)]).default(1),
            }),
          )
          .max(60),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'updates must be an array of { id, grade, tier? }' });
      return;
    }
    const preview = await previewVocabularyReviews(requireUser(req).id, body.data.updates);
    res.json(preview);
  }),
);

contentRouter.post(
  '/vocabulary/:id/review',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid vocabulary id' });
      return;
    }

    const parsed = vocabularyReviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'grade must be again, hard, good, or easy, and tier must be 1 or 2',
      });
      return;
    }

    if (!(await vocabularyExists(id))) {
      res.status(404).json({ error: 'Vocabulary item not found' });
      return;
    }

    const result = await recordVocabularyReview(
      requireUser(req).id,
      id,
      parsed.data.grade,
      parsed.data.tier,
    );
    res.json({ message: 'Review recorded', ...result });
  }),
);

contentRouter.post(
  '/vocabulary/:id/removed',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid vocabulary id' });
      return;
    }

    const parsed = vocabularyRemovedBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'removed must be a boolean, and tier must be 1 or 2' });
      return;
    }

    if (!(await vocabularyExists(id))) {
      res.status(404).json({ error: 'Vocabulary item not found' });
      return;
    }

    const result = await setVocabularyRemoved(
      requireUser(req).id,
      id,
      parsed.data.tier,
      parsed.data.removed,
    );
    res.json({
      message: parsed.data.removed ? 'Card removed from deck' : 'Card restored to deck',
      ...result,
    });
  }),
);

contentRouter.get(
  '/me/vocabulary',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const code = typeof req.query.bridge === 'string' ? req.query.bridge : '';
    const bridge = await getBridgeByCode(code);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }

    const userId = requireUser(req).id;
    const items = await listReviewedVocabulary(userId, bridge.id);
    res.json(await attachCognates(items, await cognateFilter(userId)));
  }),
);

contentRouter.get(
  '/bridges/:code/grammar',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }
    res.json(await listGrammarPatterns(bridge.id, req.user?.id ?? null));
  }),
);

contentRouter.get(
  '/bridges/:code/grammar/:slug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const bridge = await getBridgeByCode(req.params.code!);
    if (!bridge) {
      res.status(404).json({ error: 'Unknown bridge language' });
      return;
    }

    const pattern = await getGrammarPattern(bridge.id, req.params.slug!, req.user?.id ?? null);
    if (!pattern) {
      res.status(404).json({ error: 'Grammar pattern not found' });
      return;
    }
    res.json(pattern);
  }),
);

contentRouter.post(
  '/grammar/:id/review',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid grammar pattern id' });
      return;
    }

    const parsed = reviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'success must be a boolean' });
      return;
    }

    if (!(await grammarPatternExists(id))) {
      res.status(404).json({ error: 'Grammar pattern not found' });
      return;
    }

    const result = await recordReview('grammar', requireUser(req).id, id, parsed.data.success);
    res.json({ message: 'Review recorded', ...result });
  }),
);

contentRouter.get(
  '/rule-cards',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await listRuleCards(req.user?.id ?? null));
  }),
);

contentRouter.get(
  '/rule-cards/:slug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const card = await getRuleCard(req.params.slug!, req.user?.id ?? null);
    if (!card) {
      res.status(404).json({ error: 'Rule card not found' });
      return;
    }
    res.json(card);
  }),
);

contentRouter.post(
  '/rule-cards/:id/review',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid rule card id' });
      return;
    }

    const parsed = reviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'success must be a boolean' });
      return;
    }

    if (!(await ruleCardExists(id))) {
      res.status(404).json({ error: 'Rule card not found' });
      return;
    }

    const result = await recordReview('rule_card', requireUser(req).id, id, parsed.data.success);
    res.json({ message: 'Review recorded', ...result });
  }),
);
