import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { query, queryOne } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from '../test/db.js';
import { auth, registerUser, seedFixture, type Fixture } from '../test/fixtures.js';

const app = createApp();

describe.skipIf(!hasTestDatabase)('content routes', () => {
  let fixture: Fixture;
  let token: string;

  beforeAll(async () => {
    await migrateTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await truncateAll();
    fixture = await seedFixture();
    ({ token } = await registerUser(app));
    // Finnish is an experimental bridge; enable it so the fixture behaves like any
    // other bridge for the tests in this file. The dedicated gating test below
    // exercises the default (disabled) state explicitly.
    process.env.ENABLE_EXPERIMENTAL_BRIDGES = 'fin';
  });

  afterEach(() => {
    delete process.env.ENABLE_EXPERIMENTAL_BRIDGES;
  });

  afterAll(async () => {
    await teardown();
  });

  describe('GET /api/bridges', () => {
    it('lists both bridges with their targets and content counts', async () => {
      const response = await request(app).get('/api/bridges');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);

      const finnish = response.body.find((b: { code: string }) => b.code === 'fin');
      expect(finnish.family).toBe('Uralic');
      expect(finnish.vocabulary_count).toBe(2);
      expect(finnish.grammar_pattern_count).toBe(1);
      expect(finnish.target_languages.map((t: { code: string }) => t.code)).toEqual(['et']);
    });

    it('does not multiply the two counts together', async () => {
      // Regression guard: joining vocabulary and grammar to the same bridge and
      // grouping would report 2 vocabulary x 1 pattern as 2 and 2.
      const response = await request(app).get('/api/bridges');
      const interlingua = response.body.find((b: { code: string }) => b.code === 'ia');
      expect(interlingua.vocabulary_count).toBe(1);
      expect(interlingua.grammar_pattern_count).toBe(0);
    });

    it('hides experimental Finnish unless ENABLE_EXPERIMENTAL_BRIDGES includes fin', async () => {
      delete process.env.ENABLE_EXPERIMENTAL_BRIDGES;

      const hidden = await request(app).get('/api/bridges');
      expect(hidden.body.find((b: { code: string }) => b.code === 'fin')).toBeUndefined();

      const targetsHidden = await request(app).get('/api/targets');
      expect(targetsHidden.body.find((t: { code: string }) => t.code === 'et')).toBeUndefined();

      expect((await request(app).get('/api/bridges/fin/vocabulary')).status).toBe(404);

      process.env.ENABLE_EXPERIMENTAL_BRIDGES = 'fin';
      const shown = await request(app).get('/api/bridges');
      expect(shown.body.find((b: { code: string }) => b.code === 'fin')).toBeTruthy();

      const targetsShown = await request(app).get('/api/targets');
      expect(targetsShown.body.find((t: { code: string }) => t.code === 'et')).toBeTruthy();
    });
  });

  describe('GET /api/bridges/:code/vocabulary', () => {
    it('returns each word with its cognates and the rule behind them', async () => {
      const response = await request(app).get('/api/bridges/fin/vocabulary');
      expect(response.status).toBe(200);

      const talo = response.body.items.find((v: { headword: string }) => v.headword === 'talo');
      expect(talo.glosses_en).toEqual(['house', 'building', 'farm']);
      expect(talo.cognates).toHaveLength(2);

      const estonian = talo.cognates.find((c: { target_word: string }) => c.target_word === 'talu');
      expect(estonian.target_language.code).toBe('et');
      expect(estonian.rule.name).toMatch(/Finnic/);
      expect(estonian.rule.source_note).toMatch(/Wikibooks/);
    });

    it('leaves the rule null where the dictionary states no sound law', async () => {
      const response = await request(app).get('/api/bridges/fin/vocabulary');
      const talo = response.body.items.find((v: { headword: string }) => v.headword === 'talo');
      const english = talo.cognates.find((c: { target_word: string }) => c.target_word === 'house');
      expect(english.rule).toBeNull();
    });

    it('filters by headword and by gloss', async () => {
      const byHeadword = await request(app).get('/api/bridges/fin/vocabulary?search=tal');
      expect(byHeadword.body.total).toBe(1);
      expect(byHeadword.body.items[0].headword).toBe('talo');

      const byGloss = await request(app).get('/api/bridges/fin/vocabulary?search=water');
      expect(byGloss.body.total).toBe(1);
    });

    it('sorts by frequency rank when asked', async () => {
      await query(
        `UPDATE bridge_vocabulary SET frequency_rank = 800, frequency_band = 2 WHERE id = $1`,
        [fixture.taloId],
      );
      await query(
        `UPDATE bridge_vocabulary SET frequency_rank = 10, frequency_band = 1
         WHERE bridge_language_id = $1 AND id <> $2`,
        [fixture.finnishId, fixture.taloId],
      );

      const response = await request(app).get('/api/bridges/fin/vocabulary?sort=frequency');
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].frequency_rank).toBe(10);
      expect(response.body.items[1].headword).toBe('talo');
      expect(response.body.items[1].frequency_rank).toBe(800);
    });

    it('filters to words with or without an English cognate', async () => {
      await query(`UPDATE bridge_vocabulary SET has_english_cognate = TRUE WHERE id = $1`, [
        fixture.taloId,
      ]);
      await query(
        `UPDATE bridge_vocabulary SET has_english_cognate = FALSE
         WHERE bridge_language_id = $1 AND id <> $2`,
        [fixture.finnishId, fixture.taloId],
      );

      const withCognate = await request(app).get(
        '/api/bridges/fin/vocabulary?english_cognates=with',
      );
      expect(withCognate.body.total).toBe(1);
      expect(withCognate.body.items[0].headword).toBe('talo');

      const without = await request(app).get(
        '/api/bridges/fin/vocabulary?english_cognates=without',
      );
      expect(without.body.total).toBe(1);
      expect(without.body.items[0].headword).not.toBe('talo');

      const all = await request(app).get('/api/bridges/fin/vocabulary?english_cognates=all');
      expect(all.body.total).toBe(2);
    });

    it('404s on an unknown bridge', async () => {
      expect((await request(app).get('/api/bridges/nope/vocabulary')).status).toBe(404);
    });
  });

  describe('GET /api/bridges/:code/target-vocabulary', () => {
    it('returns ranked target lemmas with bridge coverage and cognates', async () => {
      const response = await request(app)
        .get('/api/bridges/ia/target-vocabulary?target=it&search=cantare')
        .set(...auth(token));

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThan(0);
      const covered = response.body.items.find((item: { cognates: { word: string }[] }) =>
        item.cognates.some((cognate) => cognate.word === 'cantar'),
      );
      expect(covered).toBeDefined();
      expect(covered?.covered).toBe(true);

      const coveredOnly = await request(app)
        .get('/api/bridges/ia/target-vocabulary?target=it&search=cantare&coverage=covered')
        .set(...auth(token));
      expect(coveredOnly.body.items.every((item: { covered: boolean }) => item.covered)).toBe(true);

      const uncovered = await request(app)
        .get('/api/bridges/ia/target-vocabulary?target=it&search=are&coverage=uncovered')
        .set(...auth(token));
      expect(uncovered.body.items.length).toBeGreaterThan(0);
      expect(uncovered.body.items.every((item: { covered: boolean }) => !item.covered)).toBe(true);
    });

    it('does not expose a target that is not linked to the bridge', async () => {
      const response = await request(app)
        .get('/api/bridges/ia/target-vocabulary?target=en')
        .set(...auth(token));

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(0);
      expect(response.body.items).toEqual([]);
    });
  });

  describe('target language preferences', () => {
    it('narrows the cognates shown to the languages the learner tracks', async () => {
      await request(app)
        .put('/api/me/targets')
        .set(...auth(token))
        .send({ target_language_ids: [fixture.estonianId] });

      const response = await request(app)
        .get('/api/bridges/fin/vocabulary')
        .set(...auth(token));

      const talo = response.body.items.find((v: { headword: string }) => v.headword === 'talo');
      expect(talo.cognates).toHaveLength(1);
      expect(talo.cognates[0].target_language.code).toBe('et');
    });

    it('hides every cognate when the learner has chosen no target languages', async () => {
      const response = await request(app)
        .get('/api/bridges/fin/vocabulary')
        .set(...auth(token));
      const talo = response.body.items.find((v: { headword: string }) => v.headword === 'talo');
      expect(talo.cognates).toEqual([]);
    });

    it('still shows every cognate to an anonymous browse', async () => {
      const response = await request(app).get('/api/bridges/fin/vocabulary');
      const talo = response.body.items.find((v: { headword: string }) => v.headword === 'talo');
      expect(talo.cognates).toHaveLength(2);
    });

    it('rejects an unknown target language id', async () => {
      const response = await request(app)
        .put('/api/me/targets')
        .set(...auth(token))
        .send({ target_language_ids: [999_999] });
      expect(response.status).toBe(400);
    });

    it('requires a token', async () => {
      expect((await request(app).get('/api/me/targets')).status).toBe(401);
    });

    it('returns target coverage bands for selected languages', async () => {
      expect((await request(app).get('/api/me/target-coverage')).status).toBe(401);

      const empty = await request(app)
        .get('/api/me/target-coverage')
        .set(...auth(token));
      expect(empty.status).toBe(200);
      expect(empty.body.horizon).toBe(3200);
      expect(empty.body.band_size).toBe(500);
      expect(empty.body.targets).toEqual([]);

      await request(app)
        .put('/api/me/targets')
        .set(...auth(token))
        .send({ target_language_ids: [fixture.italianId] });

      const response = await request(app)
        .get('/api/me/target-coverage')
        .set(...auth(token));
      expect(response.status).toBe(200);
      expect(response.body.targets).toHaveLength(1);
      const italian = response.body.targets[0];
      expect(italian.code).toBe('it');
      expect(italian.available).toBe(true);
      expect(italian.bridges.some((b: { code: string }) => b.code === 'ia')).toBe(true);
      const ia = italian.bridges.find((b: { code: string }) => b.code === 'ia');
      expect(ia.bands[0].kind).toBe('closed_class');
      expect(ia.bands[0].label).toBe('Function words');
      expect(ia.bands[0].total).toBeGreaterThan(0);
      expect(ia.bands.some((b: { kind: string }) => b.kind === 'content')).toBe(true);
      // Fixture cognate "cantare" should cover Italian "cantare" in a content band.
      const contentCovered = ia.bands
        .filter((b: { kind: string }) => b.kind === 'content')
        .reduce((sum: number, b: { covered: number }) => sum + b.covered, 0);
      expect(contentCovered).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/vocabulary/:id', () => {
    it('shows every correspondence regardless of the learner filter', async () => {
      await request(app)
        .put('/api/me/targets')
        .set(...auth(token))
        .send({ target_language_ids: [fixture.estonianId] });

      const response = await request(app)
        .get(`/api/vocabulary/${fixture.taloId}`)
        .set(...auth(token));

      expect(response.status).toBe(200);
      expect(response.body.cognates).toHaveLength(2);
    });

    it('404s on a missing id and 400s on a malformed one', async () => {
      expect((await request(app).get('/api/vocabulary/999999')).status).toBe(404);
      expect((await request(app).get('/api/vocabulary/abc')).status).toBe(400);
    });
  });

  describe('study queue and reviews', () => {
    it('hands out unseen cards', async () => {
      const response = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].progress).toBeNull();
      expect(response.body.every((item: { tier: number }) => item.tier === 1)).toBe(true);
    });

    it('includes the English cognate on study cards even with no targets selected', async () => {
      const response = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      const talo = response.body.find((item: { headword: string }) => item.headword === 'talo');
      expect(talo.cognates.map((cognate: { target_word: string }) => cognate.target_word)).toContain(
        'house',
      );
    });

    it('unlocks a tier-2 card immediately when the learner marks Easy', async () => {
      await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'easy', tier: 1 });

      const response = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      const tiers = response.body
        .filter((item: { headword: string }) => item.headword === 'talo')
        .map((item: { tier: number }) => item.tier);
      expect(tiers).toEqual([2]);
    });

    it('skips words marked as having an English cognate when asked', async () => {
      await query(`UPDATE bridge_vocabulary SET has_english_cognate = TRUE WHERE id = $1`, [
        fixture.taloId,
      ]);

      const skipped = await request(app)
        .get('/api/bridges/fin/study?skip_english_cognates=true')
        .set(...auth(token));
      expect(skipped.body.map((item: { headword: string }) => item.headword)).toEqual(['vesi']);

      const all = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      expect(all.body).toHaveLength(2);
    });

    it('keeps only words with an English cognate when require_english_cognates is set', async () => {
      await query(`UPDATE bridge_vocabulary SET has_english_cognate = TRUE WHERE id = $1`, [
        fixture.taloId,
      ]);
      await query(`UPDATE bridge_vocabulary SET has_english_cognate = FALSE WHERE headword = 'vesi'`, []);

      const only = await request(app)
        .get('/api/bridges/fin/study?require_english_cognates=true')
        .set(...auth(token));
      expect(only.body.map((item: { headword: string }) => item.headword)).toEqual(['talo']);
    });

    it('returns game lemmas in schedule order with cognate and POS filters', async () => {
      const vesi = await queryOne<{ id: number }>(
        `SELECT id FROM bridge_vocabulary WHERE headword = 'vesi' LIMIT 1`,
      );
      expect(vesi).not.toBeNull();

      await query(`UPDATE bridge_vocabulary SET has_english_cognate = TRUE WHERE id = $1`, [
        fixture.taloId,
      ]);
      await query(`UPDATE bridge_vocabulary SET has_english_cognate = FALSE WHERE id = $1`, [
        vesi!.id,
      ]);

      const withCognate = await request(app)
        .get('/api/bridges/fin/game-lemmas?limit=12&english_cognates=with')
        .set(...auth(token));
      expect(withCognate.status).toBe(200);
      expect(withCognate.body.map((item: { headword: string }) => item.headword)).toEqual(['talo']);

      const nouns = await request(app)
        .get('/api/bridges/fin/game-lemmas?limit=12&part_of_speech=n')
        .set(...auth(token));
      expect(nouns.body.map((item: { headword: string }) => item.headword).sort()).toEqual([
        'talo',
        'vesi',
      ]);

      const particles = await request(app)
        .get('/api/bridges/fin/game-lemmas?limit=12&part_of_speech=grammar_particle')
        .set(...auth(token));
      expect(particles.status).toBe(200);
      expect(particles.body).toEqual([]);

      const content = await request(app)
        .get('/api/bridges/fin/game-lemmas?limit=12&part_of_speech=content_words')
        .set(...auth(token));
      expect(content.status).toBe(200);
      expect(content.body.map((item: { headword: string }) => item.headword).sort()).toEqual([
        'talo',
        'vesi',
      ]);

      await query(
        `INSERT INTO bridge_vocabulary
           (bridge_language_id, headword, part_of_speech, gloss_en, difficulty_level, source_ref)
         VALUES ($1, 'voi', 'int', 'oh', 1, 'test')`,
        [fixture.finnishId],
      );

      const particlesWithInt = await request(app)
        .get('/api/bridges/fin/game-lemmas?limit=12&part_of_speech=grammar_particle')
        .set(...auth(token));
      expect(particlesWithInt.body.map((item: { headword: string }) => item.headword)).toEqual([
        'voi',
      ]);

      const contentWithoutInt = await request(app)
        .get('/api/bridges/fin/game-lemmas?limit=12&part_of_speech=content_words')
        .set(...auth(token));
      expect(
        contentWithoutInt.body.map((item: { headword: string }) => item.headword).sort(),
      ).toEqual(['talo', 'vesi']);

      const parts = await request(app).get('/api/bridges/fin/parts-of-speech');
      expect(parts.status).toBe(200);
      expect(parts.body).toContain('n');
      expect(parts.body).toContain('int');
    });

    it('restricts the queue to one frequency band', async () => {
      await query(
        `UPDATE bridge_vocabulary SET frequency_rank = 10, frequency_band = 1 WHERE id = $1`,
        [fixture.taloId],
      );
      await query(
        `UPDATE bridge_vocabulary
            SET frequency_rank = 800, frequency_band = 2
          WHERE bridge_language_id = $1 AND headword = 'vesi'`,
        [fixture.finnishId],
      );

      const band1 = await request(app)
        .get('/api/bridges/fin/study?band=1')
        .set(...auth(token));
      expect(band1.body.map((item: { headword: string }) => item.headword)).toEqual(['talo']);

      const bands = await request(app)
        .get('/api/bridges/fin/frequency-bands')
        .set(...auth(token));
      expect(bands.status).toBe(200);
      expect(bands.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ band: 1, rank_from: 1, rank_to: 500, total: 1, due: 1 }),
          expect.objectContaining({ band: 2, rank_from: 501, rank_to: 1000, total: 1, due: 1 }),
        ]),
      );
    });

    it('advances SM-2 learning state and schedules the next review', async () => {
      const response = await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'good', tier: 1 });

      expect(response.status).toBe(200);
      expect(response.body.card_state).toBe('learning');
      expect(response.body.review_count).toBe(1);
      expect(response.body.ease_factor).toBe(2.5);
      expect(new Date(response.body.next_review_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('drops a reviewed card out of the queue until it is due again', async () => {
      await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'good', tier: 1 });

      const response = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      expect(response.body.map((v: { headword: string }) => v.headword)).toEqual(['vesi']);
    });

    it('schedules Again into learning and returns the card when due', async () => {
      await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'again', tier: 1 });

      const afterAgain = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      expect(afterAgain.body.map((v: { headword: string }) => v.headword)).toEqual(['vesi']);

      await query(
        `UPDATE vocabulary_progress SET next_review_at = NOW() - INTERVAL '1 second'
         WHERE user_id = (SELECT id FROM users WHERE email = 'learner@example.com')
           AND bridge_vocabulary_id = $1 AND tier = 1`,
        [fixture.taloId],
      );

      const dueAgain = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      expect(dueAgain.body).toHaveLength(2);
      expect(
        dueAgain.body.find((item: { headword: string }) => item.headword === 'talo').queue_kind,
      ).toBe('review');
    });

    it('keeps a graduated card out of due until its interval elapses', async () => {
      for (let i = 0; i < 4; i += 1) {
        await request(app)
          .post(`/api/vocabulary/${fixture.taloId}/review`)
          .set(...auth(token))
          .send({ grade: 'good', tier: 1 });
      }

      const due = await request(app)
        .get('/api/bridges/fin/due')
        .set(...auth(token));
      // vesi (new) + unlocked talo tier-2 (new); talo tier-1 is scheduled out
      expect(due.body.new).toBe(2);
      expect(due.body.review).toBe(0);
      expect(due.body.vocabulary).toBe(2);
    });

    it('keeps two learners’ progress separate', async () => {
      const other = await registerUser(app, 'other@example.com');
      await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'good', tier: 1 });

      const response = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(other.token));
      expect(response.body).toHaveLength(2);
    });

    it('rejects a review with an invalid grade and 404s on a missing word', async () => {
      const badBody = await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'yes', tier: 1 });
      expect(badBody.status).toBe(400);

      const missing = await request(app)
        .post('/api/vocabulary/999999/review')
        .set(...auth(token))
        .send({ grade: 'good', tier: 1 });
      expect(missing.status).toBe(404);
    });

    it('requires a token to study or review', async () => {
      expect((await request(app).get('/api/bridges/fin/study')).status).toBe(401);
      expect(
        (await request(app)
          .post(`/api/vocabulary/${fixture.taloId}/review`)
          .send({ grade: 'good', tier: 1 }))
          .status,
      ).toBe(401);
    });

    it('returns vocabulary stats for the bridge', async () => {
      await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'good', tier: 1 });

      const response = await request(app)
        .get('/api/bridges/fin/stats')
        .set(...auth(token));
      expect(response.status).toBe(200);
      expect(response.body.studied).toBe(1);
      expect(response.body.due_new).toBe(1);
      expect(response.body.retention).toBe(1);
      expect(response.body.average_ease).toBeCloseTo(2.5);
    });
  });

  describe('GET /api/me/vocabulary', () => {
    it('lists only words the learner has actually reviewed', async () => {
      const before = await request(app)
        .get('/api/me/vocabulary?bridge=fin')
        .set(...auth(token));
      expect(before.body).toHaveLength(0);

      await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/review`)
        .set(...auth(token))
        .send({ grade: 'good', tier: 1 });

      const after = await request(app)
        .get('/api/me/vocabulary?bridge=fin')
        .set(...auth(token));
      expect(after.body).toHaveLength(1);
      expect(after.body[0].progress.card_state).toBe('learning');
      expect(after.body[0].progress.ease_factor).toBe(2.5);
    });
  });

  describe('POST /api/vocabulary/:id/removed', () => {
    it('removes a card from the study queue and restores it', async () => {
      const removed = await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/removed`)
        .set(...auth(token))
        .send({ tier: 1, removed: true });
      expect(removed.status).toBe(200);
      expect(removed.body.removed).toBe(true);

      const afterRemove = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      expect(afterRemove.body.map((item: { headword: string }) => item.headword)).toEqual([
        'vesi',
      ]);

      const listed = await request(app)
        .get('/api/me/vocabulary?bridge=fin')
        .set(...auth(token));
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0].progress.removed).toBe(true);

      const restored = await request(app)
        .post(`/api/vocabulary/${fixture.taloId}/removed`)
        .set(...auth(token))
        .send({ tier: 1, removed: false });
      expect(restored.status).toBe(200);
      expect(restored.body.removed).toBe(false);

      const afterRestore = await request(app)
        .get('/api/bridges/fin/study')
        .set(...auth(token));
      expect(afterRestore.body).toHaveLength(2);
    });
  });

  describe('grammar', () => {
    it('lists patterns with an example count', async () => {
      const response = await request(app).get('/api/bridges/fin/grammar');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].slug).toBe('vowel-harmony');
      expect(response.body[0].drill_kind).toBe('multiple_choice');
      expect(response.body[0].example_count).toBe(2);
    });

    it('returns examples with their parallel translations', async () => {
      const response = await request(app).get('/api/bridges/fin/grammar/vowel-harmony');
      expect(response.status).toBe(200);
      expect(response.body.examples).toHaveLength(2);

      const [first] = response.body.examples;
      expect(first.answer).toBe('kaunis');
      expect(first.distractors).toEqual(['kaunisä', 'iloinen']);
      expect(first.parallels[0].target_language.code).toBe('et');
      expect(first.parallels[0].target_text).toMatch(/ilus/);
    });

    it('allows an illustrative example with no drill attached', async () => {
      const response = await request(app).get('/api/bridges/fin/grammar/vowel-harmony');
      expect(response.body.examples[1].prompt).toBeNull();
      expect(response.body.examples[1].answer).toBeNull();
    });

    it('schedules grammar reviews on the same algorithm as vocabulary', async () => {
      const response = await request(app)
        .post(`/api/grammar/${fixture.vowelHarmonyPatternId}/review`)
        .set(...auth(token))
        .send({ success: true });

      expect(response.status).toBe(200);
      expect(response.body.mastery_level).toBe(25);

      const patterns = await request(app)
        .get('/api/bridges/fin/grammar')
        .set(...auth(token));
      expect(patterns.body[0].progress.mastery_level).toBe(25);
    });

    it('404s on an unknown slug', async () => {
      expect((await request(app).get('/api/bridges/fin/grammar/nope')).status).toBe(404);
    });
  });

  describe('rule cards', () => {
    it('lists decoder cards with example counts', async () => {
      const response = await request(app).get('/api/rule-cards');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].slug).toBe('kk-k-gradation');
      expect(response.body[0].example_count).toBe(1);
      expect(response.body[0].sound_law_prefixes).toEqual(['fin.grad']);
    });

    it('returns mappings and drill examples on detail', async () => {
      const response = await request(app).get('/api/rule-cards/kk-k-gradation');
      expect(response.status).toBe(200);
      expect(response.body.mappings).toHaveLength(1);
      expect(response.body.mappings[0].notation).toBe('kk ↔ k');
      expect(response.body.examples).toHaveLength(1);
      expect(response.body.examples[0].answer).toBe('pankin');
      expect(response.body.examples[0].forms.fi).toBe('pankin');
    });

    it('schedules rule-card reviews like grammar', async () => {
      const response = await request(app)
        .post(`/api/rule-cards/${fixture.gradationCardId}/review`)
        .set(...auth(token))
        .send({ success: true });

      expect(response.status).toBe(200);
      expect(response.body.mastery_level).toBe(25);

      const cards = await request(app).get('/api/rule-cards').set(...auth(token));
      expect(cards.body[0].progress.mastery_level).toBe(25);
    });

    it('404s on an unknown slug', async () => {
      expect((await request(app).get('/api/rule-cards/nope')).status).toBe(404);
    });
  });

  describe('GET /api/bridges/:code/rules', () => {
    it('exposes rules as first-class objects with citations', async () => {
      const response = await request(app).get('/api/bridges/ia/rules');
      expect(response.status).toBe(200);
      expect(response.body[0].code).toBe('ia.infinitive-ar.ita');
      expect(response.body[0].example_bridge).toBe('cantar');
      expect(response.body[0].example_target).toBe('cantare');
      expect(response.body[0].source_note).toMatch(/IED Introduction/);
    });
  });

  describe('GET /api/attribution', () => {
    it('lists each source with its licence', async () => {
      const response = await request(app).get('/api/attribution');
      expect(response.status).toBe(200);

      const sources: { title: string; author: string; licence: string; notice: string | null }[] =
        response.body.sources;

      const iedict = sources.find((source) => source.title.includes('IEDICT'))!;
      expect(iedict.licence).toMatch(/Creative Commons Attribution 3\.0/);
    });

    it('is reachable without a token', async () => {
      // A licence notice nobody can read is not a notice, so this endpoint must stay
      // outside the auth gate.
      const response = await request(app).get('/api/attribution');
      expect(response.status).toBe(200);
      expect(response.body.sources.length).toBeGreaterThan(0);
    });

    it('serves the licence texts it points at', async () => {
      // A source that names a vendored licence file should actually be able to serve
      // it, so a dead link here is a compliance bug rather than a cosmetic one.
      const { sources } = (await request(app).get('/api/attribution')).body;
      const paths: string[] = sources
        .map((source: { licence_text_path: string | null }) => source.licence_text_path)
        .filter(Boolean);

      expect(paths.length).toBeGreaterThan(0);

      for (const relative of new Set(paths)) {
        const response = await request(app).get(`/api/${relative}`);
        expect(response.status).toBe(200);
        expect(response.text).toMatch(/License|Licence/);
      }
    });
  });
});
