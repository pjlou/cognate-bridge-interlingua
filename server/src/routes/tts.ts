import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  isCloudTtsAvailable,
  probeLocalTtsAvailable,
  synthesizeWithCloud,
  synthesizeWithLocal,
} from '../services/tts.js';

export const ttsRouter = Router();

const synthesizeBody = z.object({
  text: z.string().min(1).max(200),
  ipa: z.string().max(200).nullable().optional(),
  bridgeCode: z.string().min(1).max(16),
  preferredLang: z
    .enum(['de', 'nl', 'da', 'no', 'sv', 'it', 'es', 'fr', 'pt', 'ro', 'ca', 'fi'])
    .nullable()
    .optional(),
  engine: z.enum(['cloud', 'local']).optional().default('cloud'),
});

ttsRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const cloud = isCloudTtsAvailable();
    const local = await probeLocalTtsAvailable();
    res.json({
      cloud,
      local,
      /** @deprecated Use `cloud`. Kept so older clients keep working. */
      available: cloud,
    });
  }),
);

ttsRouter.post(
  '/synthesize',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const parsed = synthesizeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid synthesize request' });
      return;
    }

    const engine = parsed.data.engine;
    const payload = {
      text: parsed.data.text,
      ipa: parsed.data.ipa,
      bridgeCode: parsed.data.bridgeCode,
      preferredLang: parsed.data.preferredLang,
    };

    if (engine === 'local') {
      if (!(await probeLocalTtsAvailable())) {
        res.status(503).json({
          error: 'Local TTS is not configured',
          local: false,
        });
        return;
      }
      const audio = await synthesizeWithLocal(payload);
      res.type('audio/wav').send(audio);
      return;
    }

    if (!isCloudTtsAvailable()) {
      res.status(503).json({
        error: 'Cloud TTS is not configured',
        available: false,
        cloud: false,
      });
      return;
    }

    const audio = await synthesizeWithCloud(payload);
    res.type('audio/mpeg').send(audio);
  }),
);
