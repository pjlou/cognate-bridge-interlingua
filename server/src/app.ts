import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { getPool } from './db.js';
import { authRouter } from './routes/auth.js';
import { contentRouter } from './routes/content.js';
import { decksRouter } from './routes/decks.js';
import { ttsRouter } from './routes/tts.js';

// Compiled output lives in server/dist, so the licence directory is one level up from
// wherever this module ends up -- true for both `dist/app.js` and `src/app.ts`.
const licensesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'licenses');

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    }),
  );
  app.use(express.json());

  // GFDL section 4 requires a Modified Version to include an unaltered copy of the
  // licence, not merely a link to one. Serving the vendored texts from the API means
  // the deployed instance satisfies that itself rather than relying on gnu.org.
  app.use(
    '/api/licenses',
    express.static(licensesDir, {
      extensions: false,
      setHeaders: (res) => res.type('text/plain; charset=utf-8'),
    }),
  );

  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch {
      res
        .status(503)
        .json({ status: 'degraded', database: 'unreachable', timestamp: new Date().toISOString() });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/tts', ttsRouter);
  app.use('/api', decksRouter);
  app.use('/api', contentRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({
      error: 'Something went wrong',
      // A stack trace is useful locally and is an information leak in production.
      message: config.isProduction ? undefined : error.message,
    });
  });

  return app;
}
