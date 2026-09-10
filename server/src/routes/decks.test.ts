import path from 'node:path';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import initSqlJs from 'sql.js';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { queryOne } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from '../test/db.js';
import { auth, registerUser } from '../test/fixtures.js';
import { seedDeckFixture, type DeckFixture } from '../test/deckFixtures.js';
import { query } from '../db.js';

/** confirm-mapping resolves bridge/target codes against the real reference tables. */
async function seedLanguages(): Promise<void> {
  await query(
    `INSERT INTO bridge_languages (code, name, family, license_note)
     VALUES ('ia', 'Interlingua', 'Romance', 'CC BY 3.0')`,
  );
  await query(
    `INSERT INTO target_languages (code, name, family) VALUES ('de', 'German', 'Germanic')`,
  );
}

const app = createApp();
const require = createRequire(import.meta.url);

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
let SQL: SqlJsStatic;

beforeAll(async () => {
  const sqlWasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlWasmDir, file) });
});

/** A minimal, real .apkg buffer: one notetype, two fields, one note. */
function buildFixtureApkg(): Buffer {
  const db = new SQL.Database();
  db.run('CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT)');
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT)');
  const models = {
    '1': {
      name: 'Basic',
      flds: [
        { name: 'English', ord: 0 },
        { name: 'German', ord: 1 },
      ],
    },
  };
  db.run('INSERT INTO col (id, models) VALUES (1, ?)', [JSON.stringify(models)]);
  db.run('INSERT INTO notes (id, mid, flds) VALUES (?, ?, ?)', [
    1,
    1,
    ['house', 'Haus'].join('\x1f'),
  ]);
  const dbBuffer = Buffer.from(db.export());
  db.close();

  const zip = new AdmZip();
  zip.addFile('collection.anki21', dbBuffer);
  return zip.toBuffer();
}

let userCounter = 0;

async function setUpUser(): Promise<{ token: string; userId: number }> {
  userCounter += 1;
  const { token, id } = await registerUser(app, `deck-user-${userCounter}@example.com`);
  return { token, userId: id };
}

describe.skipIf(!hasTestDatabase)('deck routes', () => {
  beforeAll(async () => {
    await migrateTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await teardown();
  });

  describe('POST /api/decks/import', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/decks/import')
        .attach('file', buildFixtureApkg(), 'deck.apkg');
      expect(response.status).toBe(401);
    });

    it('parses a real .apkg and creates a deck with raw field data', async () => {
      const { token } = await setUpUser();
      const response = await request(app)
        .post('/api/decks/import')
        .set(...auth(token))
        .attach('file', buildFixtureApkg(), 'deck.apkg');

      expect(response.status).toBe(201);
      expect(response.body.noteType).toBe('Basic');
      expect(response.body.fieldNames).toEqual(['English', 'German']);
      expect(response.body.noteCount).toBe(1);
      expect(response.body.sampleRows[0]).toEqual({ English: 'house', German: 'Haus' });

      const deck = await queryOne<{ status: string; card_count: number }>(
        `SELECT status, card_count FROM decks WHERE id = $1`,
        [response.body.deckId],
      );
      expect(deck!.status).toBe('mapping');
      expect(deck!.card_count).toBe(1);
    });

    it('rejects a file that is not a valid .apkg', async () => {
      const { token } = await setUpUser();
      const response = await request(app)
        .post('/api/decks/import')
        .set(...auth(token))
        .attach('file', Buffer.from('not a zip'), 'deck.apkg');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/decks/:id/confirm-mapping', () => {
    it('copies the mapped fields into english_written/target_written', async () => {
      const { token } = await setUpUser();
      await seedLanguages();
      const imported = await request(app)
        .post('/api/decks/import')
        .set(...auth(token))
        .attach('file', buildFixtureApkg(), 'deck.apkg');
      const deckId = imported.body.deckId;

      const response = await request(app)
        .post(`/api/decks/${deckId}/confirm-mapping`)
        .set(...auth(token))
        .send({
          bridgeCode: 'ia',
          targetLanguageCode: 'de',
          fieldMapping: { englishText: 'English', targetText: 'German' },
        });

      expect(response.status).toBe(200);
      expect(response.body.cardCount).toBe(1);

      const card = await queryOne<{ english_written: string; target_written: string }>(
        `SELECT english_written, target_written FROM deck_cards WHERE deck_id = $1`,
        [deckId],
      );
      expect(card).toEqual({ english_written: 'house', target_written: 'Haus' });
    });

    it('403s a mapping request for a deck owned by another user', async () => {
      const owner = await setUpUser();
      const other = await setUpUser();
      const imported = await request(app)
        .post('/api/decks/import')
        .set(...auth(owner.token))
        .attach('file', buildFixtureApkg(), 'deck.apkg');

      const response = await request(app)
        .post(`/api/decks/${imported.body.deckId}/confirm-mapping`)
        .set(...auth(other.token))
        .send({
          bridgeCode: 'ia',
          targetLanguageCode: 'de',
          fieldMapping: { englishText: 'English', targetText: 'German' },
        });
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/decks and /api/decks/:id', () => {
    it('lists only the requesting user\'s decks', async () => {
      const owner = await setUpUser();
      const other = await setUpUser();
      await seedDeckFixture(owner.userId);

      const ownerList = await request(app).get('/api/decks').set(...auth(owner.token));
      expect(ownerList.body).toHaveLength(1);

      const otherList = await request(app).get('/api/decks').set(...auth(other.token));
      expect(otherList.body).toHaveLength(0);
    });

    it('404s a deck that does not exist and 403s one owned by someone else', async () => {
      const owner = await setUpUser();
      const other = await setUpUser();
      const fixture = await seedDeckFixture(owner.userId);

      const missing = await request(app).get('/api/decks/999999').set(...auth(owner.token));
      expect(missing.status).toBe(404);

      const forbidden = await request(app)
        .get(`/api/decks/${fixture.deckId}`)
        .set(...auth(other.token));
      expect(forbidden.status).toBe(403);
    });
  });

  describe('deck study queue and reviews', () => {
    let fixture: DeckFixture;
    let token: string;

    beforeEach(async () => {
      const user = await setUpUser();
      token = user.token;
      fixture = await seedDeckFixture(user.userId);
    });

    it('serves tier-1 cards shaped as VocabularyItem, English<->bridge', async () => {
      const response = await request(app)
        .get(`/api/decks/${fixture.deckId}/study`)
        .query({ tier_mode: 'learn_bridge' })
        .set(...auth(token));

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      const haus = response.body.find((c: { headword: string }) => c.headword === 'haus');
      expect(haus.tier).toBe(1);
      expect(haus.gloss_en).toBe('house');
      expect(haus.source).toBe('deck');
      expect(haus.deck_id).toBe(fixture.deckId);
      expect(haus.cognates[0].target_word).toBe('Haus');
    });

    it('only surfaces tier-2 cards in apply_bridge mode', async () => {
      const response = await request(app)
        .get(`/api/decks/${fixture.deckId}/study`)
        .query({ tier_mode: 'apply_bridge', unlock_all_tier2: 'true' })
        .set(...auth(token));

      expect(response.status).toBe(200);
      expect(response.body.every((c: { tier: number }) => c.tier === 2)).toBe(true);
    });

    it('unlocks tier-2 cards for apply_bridge/skip_bridge without an explicit unlock flag', async () => {
      // Regression: the client never sent unlock_all_tier2, so before the route computed
      // it from tier_mode itself, an imported deck's "Apply bridge"/"Skip bridge" modes
      // always looked empty until tier 1 had been graduated once.
      const apply = await request(app)
        .get(`/api/decks/${fixture.deckId}/study`)
        .query({ tier_mode: 'apply_bridge' })
        .set(...auth(token));
      expect(apply.status).toBe(200);
      expect(apply.body).toHaveLength(2);
      expect(apply.body.every((c: { tier: number }) => c.tier === 2)).toBe(true);

      const skip = await request(app)
        .get(`/api/decks/${fixture.deckId}/study`)
        .query({ tier_mode: 'skip_bridge' })
        .set(...auth(token));
      expect(skip.status).toBe(200);
      expect(skip.body).toHaveLength(2);
      expect(skip.body.every((c: { tier: number }) => c.tier === 2)).toBe(true);
    });

    it('due counts reflect tier_mode the same way the study queue does', async () => {
      const bothDue = await request(app)
        .get(`/api/decks/${fixture.deckId}/due`)
        .set(...auth(token));
      expect(bothDue.status).toBe(200);
      expect(bothDue.body).toEqual({ new: 2, review: 0, vocabulary: 2 });

      const applyDue = await request(app)
        .get(`/api/decks/${fixture.deckId}/due`)
        .query({ tier_mode: 'apply_bridge' })
        .set(...auth(token));
      expect(applyDue.status).toBe(200);
      expect(applyDue.body).toEqual({ new: 2, review: 0, vocabulary: 2 });
    });

    it('records a review and unlocks tier 2 on graduation', async () => {
      const cardId = fixture.cardIds[0]!;
      let result: request.Response | null = null;
      for (let i = 0; i < 5; i += 1) {
        result = await request(app)
          .post(`/api/deck-cards/${cardId}/review`)
          .set(...auth(token))
          .send({ grade: 'good', tier: 1 });
        expect(result.status).toBe(200);
        if (result.body.tier2_unlocked) break;
      }
      expect(result!.body.card_state).toBeTruthy();
    });

    it('removes and restores a card', async () => {
      const cardId = fixture.cardIds[0]!;
      const removed = await request(app)
        .post(`/api/deck-cards/${cardId}/removed`)
        .set(...auth(token))
        .send({ tier: 1, removed: true });
      expect(removed.status).toBe(200);
      expect(removed.body.removed).toBe(true);

      const restored = await request(app)
        .post(`/api/deck-cards/${cardId}/removed`)
        .set(...auth(token))
        .send({ tier: 1, removed: false });
      expect(restored.body.removed).toBe(false);
    });

    it('404s a review for a deck card owned by another user', async () => {
      const other = await setUpUser();
      const response = await request(app)
        .post(`/api/deck-cards/${fixture.cardIds[0]}/review`)
        .set(...auth(other.token))
        .send({ grade: 'good', tier: 1 });
      expect(response.status).toBe(404);
    });
  });

  describe('deck-card audio', () => {
    it('404s when no audio is stored, and round-trips an uploaded bridge recording', async () => {
      const user = await setUpUser();
      const fixture = await seedDeckFixture(user.userId);
      const cardId = fixture.cardIds[0]!;

      const missing = await request(app)
        .get(`/api/deck-cards/${cardId}/audio/bridge`)
        .set(...auth(user.token));
      expect(missing.status).toBe(404);

      const audioBytes = Buffer.from([1, 2, 3, 4]);
      const uploaded = await request(app)
        .post(`/api/deck-cards/${cardId}/bridge-audio`)
        .set(...auth(user.token))
        .attach('audio', audioBytes, { filename: 'take.webm', contentType: 'audio/webm' });
      expect(uploaded.status).toBe(200);

      const fetched = await request(app)
        .get(`/api/deck-cards/${cardId}/audio/bridge`)
        .set(...auth(user.token));
      expect(fetched.status).toBe(200);
      expect(Buffer.compare(fetched.body, audioBytes)).toBe(0);
    });
  });

  describe('export', () => {
    it('400s an export request for a deck that is not ready', async () => {
      const user = await setUpUser();
      const imported = await request(app)
        .post('/api/decks/import')
        .set(...auth(user.token))
        .attach('file', buildFixtureApkg(), 'deck.apkg');

      const response = await request(app)
        .get(`/api/decks/${imported.body.deckId}/export.txt`)
        .set(...auth(user.token));
      expect(response.status).toBe(400);
    });

    it('serves a tab-separated export for a ready deck', async () => {
      const user = await setUpUser();
      const fixture = await seedDeckFixture(user.userId);
      const response = await request(app)
        .get(`/api/decks/${fixture.deckId}/export.txt`)
        .set(...auth(user.token));
      expect(response.status).toBe(200);
      expect(response.text).toContain('#separator:tab');
      expect(response.text).toContain('haus');
    });

    it('backs up every card field, audio, and the caller\'s own SRS history as JSON', async () => {
      const user = await setUpUser();
      const fixture = await seedDeckFixture(user.userId);
      const cardId = fixture.cardIds[0]!;

      await request(app)
        .post(`/api/deck-cards/${cardId}/review`)
        .set(...auth(user.token))
        .send({ grade: 'good', tier: 1 });
      await request(app)
        .post(`/api/deck-cards/${cardId}/bridge-audio`)
        .set(...auth(user.token))
        .attach('audio', Buffer.from('clip-bytes'), 'clip.webm');

      const response = await request(app)
        .get(`/api/decks/${fixture.deckId}/export/backup.json`)
        .set(...auth(user.token));

      expect(response.status).toBe(200);
      expect(response.body.format).toBe('cognate-bridge-deck-backup');
      expect(response.body.deck).toMatchObject({
        name: 'My Anki Deck',
        bridge_language_code: 'ia',
        target_language_code: 'de',
      });
      expect(response.body.cards).toHaveLength(2);

      const haus = response.body.cards.find((c: { bridge_written: string }) => c.bridge_written === 'haus');
      expect(haus.english_written).toBe('house');
      expect(haus.target_written).toBe('Haus');
      expect(Buffer.from(haus.bridge_audio, 'base64').toString()).toBe('clip-bytes');
      expect(haus.progress.tier1.review_count).toBe(1);
      expect(haus.progress.tier2).toBeNull();

      // A never-reviewed, never-recorded card carries no progress/audio at all.
      const wasser = response.body.cards.find((c: { bridge_written: string }) => c.bridge_written === 'wasser');
      expect(wasser.bridge_audio).toBeNull();
      expect(wasser.progress.tier1).toBeNull();
    });

    it('404s a backup for a deck that does not exist, 403s one owned by someone else', async () => {
      const owner = await setUpUser();
      const other = await setUpUser();
      const fixture = await seedDeckFixture(owner.userId);

      const missing = await request(app)
        .get('/api/decks/999999/export/backup.json')
        .set(...auth(owner.token));
      expect(missing.status).toBe(404);

      const forbidden = await request(app)
        .get(`/api/decks/${fixture.deckId}/export/backup.json`)
        .set(...auth(other.token));
      expect(forbidden.status).toBe(403);
    });
  });

  describe('DELETE /api/decks/:id', () => {
    it('404s a deck that does not exist and 403s one owned by someone else', async () => {
      const owner = await setUpUser();
      const other = await setUpUser();
      const fixture = await seedDeckFixture(owner.userId);

      const missing = await request(app).delete('/api/decks/999999').set(...auth(owner.token));
      expect(missing.status).toBe(404);

      const forbidden = await request(app)
        .delete(`/api/decks/${fixture.deckId}`)
        .set(...auth(other.token));
      expect(forbidden.status).toBe(403);

      // Neither attempt actually removed the deck.
      const stillThere = await request(app).get(`/api/decks/${fixture.deckId}`).set(...auth(owner.token));
      expect(stillThere.status).toBe(200);
    });

    it('deletes the deck and everything under it -- cards, progress, and audio', async () => {
      const user = await setUpUser();
      const fixture = await seedDeckFixture(user.userId);
      const cardId = fixture.cardIds[0]!;

      await request(app)
        .post(`/api/deck-cards/${cardId}/review`)
        .set(...auth(user.token))
        .send({ grade: 'good', tier: 1 });

      const response = await request(app).delete(`/api/decks/${fixture.deckId}`).set(...auth(user.token));
      expect(response.status).toBe(200);

      const list = await request(app).get('/api/decks').set(...auth(user.token));
      expect(list.body).toHaveLength(0);

      const gone = await request(app).get(`/api/decks/${fixture.deckId}`).set(...auth(user.token));
      expect(gone.status).toBe(404);

      const cardGone = await request(app)
        .post(`/api/deck-cards/${cardId}/review`)
        .set(...auth(user.token))
        .send({ grade: 'good', tier: 1 });
      expect(cardGone.status).toBe(404);
    });
  });
});
