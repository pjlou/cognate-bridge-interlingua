import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticateToken, requireUser } from '../middleware/auth.js';
import { getBridgeByCode, listTargetLanguages } from '../models/content.model.js';
import {
  confirmDeckMapping,
  createDeckFromApkg,
  getDeckMappingInfo,
} from '../models/deckImport.model.js';
import { deckIdForCard, deleteDeck, getDeckById, listDecks } from '../models/deckContent.model.js';
import * as deckContent from '../models/deckContent.model.js';
import * as deckProgress from '../models/deckProgress.model.js';
import { queryOne } from '../db.js';
import { parseApkg, ApkgParseError } from '../services/apkgParser.js';
import { translateDeck, DeckTranslateError } from '../services/deckTranslate.js';
import {
  buildAnkiTsv,
  buildDeckBackup,
  buildUntranslatedDoc,
  DeckExportError,
} from '../services/deckExport.js';

export const decksRouter = Router();

// A deck this large has no business going through per-card MT calls inline; reject
// early rather than let an import silently take minutes.
const MAX_DECK_CARDS = 2000;
const MAX_APKG_BYTES = 30 * 1024 * 1024;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const apkgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_APKG_BYTES },
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
});

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Every deck/deck-card route is owner-scoped: a deck belongs to exactly the user who
 * imported it. Returns the deck's owner id, or null if the deck doesn't exist, so
 * callers can tell "not found" (404) from "found but not yours" (403) apart.
 */
async function deckOwner(deckId: number): Promise<number | null> {
  const deck = await getDeckById(deckId);
  return deck?.owner_user_id ?? null;
}

decksRouter.get(
  '/decks',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const decks = await listDecks(requireUser(req).id);
    res.json(decks);
  }),
);

decksRouter.get(
  '/decks/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const deck = await getDeckById(id);
    if (!deck) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    if (deck.owner_user_id !== requireUser(req).id) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }
    res.json(deck);
  }),
);

decksRouter.delete(
  '/decks/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const owner = await deckOwner(id);
    if (owner === null) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    if (owner !== requireUser(req).id) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    await deleteDeck(id);
    res.json({ message: 'Deck deleted' });
  }),
);

decksRouter.post(
  '/decks/import',
  authenticateToken,
  apkgUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No .apkg file was uploaded' });
      return;
    }

    let parsed;
    try {
      parsed = await parseApkg(req.file.buffer);
    } catch (error) {
      if (error instanceof ApkgParseError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }

    if (parsed.notes.length === 0) {
      res.status(400).json({ error: 'This deck has no notes to import' });
      return;
    }
    if (parsed.notes.length > MAX_DECK_CARDS) {
      res.status(400).json({
        error: `This deck has ${parsed.notes.length} notes, which is more than the ${MAX_DECK_CARDS} supported per import`,
      });
      return;
    }

    const preview = await createDeckFromApkg(
      requireUser(req).id,
      parsed,
      req.file.originalname,
    );
    res.status(201).json({
      ...preview,
      mediaWarning:
        parsed.skippedNoteTypeCount > 0
          ? `${parsed.skippedNoteTypeCount} note(s) used a different note type and were skipped.`
          : null,
    });
  }),
);

const confirmMappingBody = z.object({
  bridgeCode: z.literal('ia'),
  targetLanguageCode: z.string().min(1),
  fieldMapping: z.object({
    englishText: z.string().min(1),
    englishAudio: z.string().min(1).nullable().optional(),
    targetText: z.string().min(1),
    targetAudio: z.string().min(1).nullable().optional(),
  }),
});

decksRouter.post(
  '/decks/:id/confirm-mapping',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }

    const parsed = confirmMappingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid field mapping' });
      return;
    }

    const info = await getDeckMappingInfo(id);
    if (!info) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    if (info.ownerUserId !== requireUser(req).id) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    const bridge = await getBridgeByCode(parsed.data.bridgeCode);
    if (!bridge) {
      res.status(400).json({ error: 'Unknown bridge language' });
      return;
    }
    const targets = await listTargetLanguages();
    const target = targets.find((t) => t.code === parsed.data.targetLanguageCode);
    if (!target) {
      res.status(400).json({ error: 'Unknown target language' });
      return;
    }

    const result = await confirmDeckMapping(id, bridge.id, target.id, parsed.data.fieldMapping);
    res.json(result);
  }),
);

decksRouter.post(
  '/decks/:id/translate',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const owner = await deckOwner(id);
    if (owner === null) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    if (owner !== requireUser(req).id) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    res.status(202).json({ status: 'translating' });

    // Runs after the response is sent; errors are recorded on the deck's own `status`
    // column (see deckTranslate.ts) rather than surfaced on this already-sent response
    // -- the client polls GET /decks/:id to observe the outcome.
    translateDeck(id).catch((error) => {
      console.error(`Deck ${id} translation failed`, error);
    });
  }),
);

decksRouter.get(
  '/decks/:id/export.txt',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const owner = await deckOwner(id);
    if (owner === null) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    if (owner !== requireUser(req).id) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    try {
      const tsv = await buildAnkiTsv(id);
      res
        .type('text/tab-separated-values')
        .attachment('deck.txt')
        .send(tsv);
    } catch (error) {
      if (error instanceof DeckExportError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

decksRouter.get(
  '/decks/:id/export/untranslated.txt',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const owner = await deckOwner(id);
    if (owner === null) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    if (owner !== requireUser(req).id) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    try {
      const doc = await buildUntranslatedDoc(id);
      res.type('text/plain').attachment('untranslated-words.txt').send(doc);
    } catch (error) {
      if (error instanceof DeckExportError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

decksRouter.get(
  '/decks/:id/export/backup.json',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const owner = await deckOwner(id);
    if (owner === null) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    const userId = requireUser(req).id;
    if (owner !== userId) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    const backup = await buildDeckBackup(id, userId);
    res.attachment('deck-backup.json').json(backup);
  }),
);

const deckStudyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  tier_mode: z.enum(['both', 'learn_bridge', 'apply_bridge', 'skip_bridge']).optional(),
});

decksRouter.get(
  '/decks/:id/study',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const owner = await deckOwner(id);
    if (owner === null) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    const userId = requireUser(req).id;
    if (owner !== userId) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    const parsedQuery = deckStudyQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: 'Invalid query parameters' });
      return;
    }

    const tierMode = parsedQuery.data.tier_mode ?? 'both';
    const queue = await deckContent.getDeckStudyQueue(userId, id, {
      limit: parsedQuery.data.limit ?? 20,
      tierMode,
      // A single-tier mode ("Apply bridge"/"Skip bridge") is meant to show that tier's
      // material directly, not gated behind a tier-1 graduation the learner may never
      // have gone through for this deck -- mirrors contentRouter's identical
      // `unlockAllTier2: tierMode !== 'both'` for the built-in bridge-vocabulary queue.
      unlockAllTier2: tierMode !== 'both',
    });
    res.json(queue);
  }),
);

const deckDueQuerySchema = z.object({
  tier_mode: z.enum(['both', 'learn_bridge', 'apply_bridge', 'skip_bridge']).optional(),
});

decksRouter.get(
  '/decks/:id/due',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck id' });
      return;
    }
    const owner = await deckOwner(id);
    if (owner === null) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    const userId = requireUser(req).id;
    if (owner !== userId) {
      res.status(403).json({ error: 'You do not have access to this deck' });
      return;
    }

    const parsedQuery = deckDueQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: 'Invalid query parameters' });
      return;
    }
    const tierMode = parsedQuery.data.tier_mode ?? 'both';

    const counts = await deckContent.getDeckDueCounts(userId, id, {
      tierMode,
      unlockAllTier2: tierMode !== 'both',
    });
    res.json(counts);
  }),
);

async function requireDeckCardOwnership(cardId: number, userId: number): Promise<boolean> {
  const deckId = await deckIdForCard(cardId);
  if (deckId === null) return false;
  const owner = await deckOwner(deckId);
  return owner === userId;
}

const deckCardReviewBody = z.object({
  grade: z.enum(['again', 'hard', 'good', 'easy']),
  tier: z.union([z.literal(1), z.literal(2)]),
});

decksRouter.post(
  '/deck-cards/:id/review',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck card id' });
      return;
    }
    const parsed = deckCardReviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'grade must be again, hard, good, or easy, and tier must be 1 or 2',
      });
      return;
    }
    const userId = requireUser(req).id;
    if (!(await requireDeckCardOwnership(id, userId))) {
      res.status(404).json({ error: 'Deck card not found' });
      return;
    }

    const result = await deckProgress.recordDeckCardReview(
      userId,
      id,
      parsed.data.grade,
      parsed.data.tier,
    );
    res.json({ message: 'Review recorded', ...result });
  }),
);

const deckCardRemovedBody = z.object({
  tier: z.union([z.literal(1), z.literal(2)]),
  removed: z.boolean(),
});

decksRouter.post(
  '/deck-cards/:id/removed',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck card id' });
      return;
    }
    const parsed = deckCardRemovedBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'removed must be a boolean, and tier must be 1 or 2' });
      return;
    }
    const userId = requireUser(req).id;
    if (!(await requireDeckCardOwnership(id, userId))) {
      res.status(404).json({ error: 'Deck card not found' });
      return;
    }

    const result = await deckProgress.setDeckCardRemoved(
      userId,
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

const AUDIO_FIELDS = new Set(['english', 'bridge', 'target']);

decksRouter.get(
  '/deck-cards/:id/audio/:field',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    const field = req.params.field!;
    if (id === null || !AUDIO_FIELDS.has(field)) {
      res.status(400).json({ error: 'Invalid deck card id or audio field' });
      return;
    }
    const userId = requireUser(req).id;
    if (!(await requireDeckCardOwnership(id, userId))) {
      res.status(404).json({ error: 'Deck card not found' });
      return;
    }

    const column = `${field}_audio`;
    const mimeColumn = `${field}_audio_mime`;
    const row = await queryOne<{ audio: Buffer | null; mime: string | null }>(
      `SELECT ${column} AS audio, ${mimeColumn} AS mime FROM deck_cards WHERE id = $1`,
      [id],
    );
    if (!row || !row.audio) {
      res.status(404).json({ error: 'No audio stored for this field' });
      return;
    }

    res.type(row.mime ?? 'audio/webm').send(row.audio);
  }),
);

decksRouter.post(
  '/deck-cards/:id/bridge-audio',
  authenticateToken,
  audioUpload.single('audio'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id!);
    if (id === null) {
      res.status(400).json({ error: 'Invalid deck card id' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No audio file was uploaded' });
      return;
    }
    const userId = requireUser(req).id;
    if (!(await requireDeckCardOwnership(id, userId))) {
      res.status(404).json({ error: 'Deck card not found' });
      return;
    }

    await queryOne(
      `UPDATE deck_cards SET bridge_audio = $2, bridge_audio_mime = $3 WHERE id = $1`,
      [id, req.file.buffer, req.file.mimetype || 'audio/webm'],
    );
    res.json({ saved: true });
  }),
);

decksRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(413).json({ error: `Upload too large or invalid: ${error.message}` });
    return;
  }
  if (error instanceof DeckTranslateError) {
    res.status(400).json({ error: error.message });
    return;
  }
  next(error);
});
