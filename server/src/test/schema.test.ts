import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from './db.js';

/**
 * The schema carries a fair amount of logic in CHECK constraints and partial unique
 * indexes. These tests exist so that logic is actually verified rather than assumed --
 * a constraint nobody exercises is a comment with extra syntax.
 */
describe.skipIf(!hasTestDatabase)('schema constraints', () => {
  let bridgeId: number;
  let targetId: number;
  let vocabId: number;
  let ruleId: number;

  beforeAll(async () => {
    await migrateTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await truncateAll();

    bridgeId = (await queryOne<{ id: number }>(
      `INSERT INTO bridge_languages (code, name, family, license_note)
       VALUES ('ia', 'Interlingua', 'Romance', 'CC BY 3.0') RETURNING id`,
    ))!.id;

    targetId = (await queryOne<{ id: number }>(
      `INSERT INTO target_languages (code, name, family)
       VALUES ('es', 'Spanish', 'Romance') RETURNING id`,
    ))!.id;

    vocabId = (await queryOne<{ id: number }>(
      `INSERT INTO bridge_vocabulary
         (bridge_language_id, headword, part_of_speech, gloss_en, source_ref)
       VALUES ($1, 'domo', 'n', 'house', 'IEDICT 2019') RETURNING id`,
      [bridgeId],
    ))!.id;

    ruleId = (await queryOne<{ id: number }>(
      `INSERT INTO correspondence_rules (bridge_language_id, code, description, source_note)
       VALUES ($1, 'pg-long-u', 'Proto-Germanic long u surfaces as a diphthong', 'Grammar p. 5')
       RETURNING id`,
      [bridgeId],
    ))!.id;
  });

  afterAll(async () => {
    await teardown();
  });

  describe('cognate_correspondences', () => {
    it('accepts a parsed cognate with no rule, because a dictionary may just list it', async () => {
      const rows = await query(
        `INSERT INTO cognate_correspondences
           (bridge_vocabulary_id, target_language_id, target_word, provenance)
         VALUES ($1, $2, 'Haus', 'parsed') RETURNING id`,
        [vocabId, targetId],
      );
      expect(rows).toHaveLength(1);
    });

    it('refuses a rule_generated cognate with no rule attached', async () => {
      await expect(
        query(
          `INSERT INTO cognate_correspondences
             (bridge_vocabulary_id, target_language_id, target_word, provenance)
           VALUES ($1, $2, 'Haus', 'rule_generated')`,
          [vocabId, targetId],
        ),
      ).rejects.toThrow(/cognate_generated_requires_rule/);
    });

    it('accepts a rule_generated cognate that cites its rule', async () => {
      const rows = await query(
        `INSERT INTO cognate_correspondences
           (bridge_vocabulary_id, target_language_id, target_word,
            provenance, correspondence_rule_id, confidence, validated_against)
         VALUES ($1, $2, 'Haus', 'rule_generated', $3, 0.9, 'apertium-eng-deu') RETURNING id`,
        [vocabId, targetId, ruleId],
      );
      expect(rows).toHaveLength(1);
    });

    it('rejects a confidence outside 0..1', async () => {
      await expect(
        query(
          `INSERT INTO cognate_correspondences
             (bridge_vocabulary_id, target_language_id, target_word, provenance, confidence)
           VALUES ($1, $2, 'Haus', 'parsed', 1.5)`,
          [vocabId, targetId],
        ),
      ).rejects.toThrow();
    });

    it('keeps the cognate but drops the citation when a rule is deleted', async () => {
      await query(
        `INSERT INTO cognate_correspondences
           (bridge_vocabulary_id, target_language_id, target_word, provenance, correspondence_rule_id)
         VALUES ($1, $2, 'Haus', 'parsed', $3)`,
        [vocabId, targetId, ruleId],
      );
      await query('DELETE FROM correspondence_rules WHERE id = $1', [ruleId]);

      const row = await queryOne<{ correspondence_rule_id: number | null }>(
        'SELECT correspondence_rule_id FROM cognate_correspondences',
      );
      expect(row?.correspondence_rule_id).toBeNull();
    });
  });

  describe('correspondence_rules', () => {
    it('refuses a half-specified transformation', async () => {
      await expect(
        query(
          `INSERT INTO correspondence_rules
             (bridge_language_id, code, description, source_note, pattern_from)
           VALUES ($1, 'half', 'Only one half given', 'IED intro', 'ar$')`,
          [bridgeId],
        ),
      ).rejects.toThrow(/correspondence_rules_pattern_pairing/);
    });

    it('accepts a complete transformation', async () => {
      const rows = await query(
        `INSERT INTO correspondence_rules
           (bridge_language_id, code, description, source_note, pattern_from, pattern_to)
         VALUES ($1, 'ia.infinitive-ar.ita', 'Italian keeps the final -e', 'IED intro',
                 'ar$', 'are') RETURNING id`,
        [bridgeId],
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('bridge_vocabulary', () => {
    it('lets homographs coexist under the same headword and part of speech', async () => {
      await query(
        `INSERT INTO bridge_vocabulary
           (bridge_language_id, headword, part_of_speech, gloss_en, source_ref, homograph_index)
         VALUES ($1, 'arm', 'a', 'poor', 'Wordbouk p. 4', 1),
                ($1, 'arm', 'n', 'arm', 'Wordbouk p. 4', 1)`,
        [bridgeId],
      );
      const rows = await query(`SELECT id FROM bridge_vocabulary WHERE headword = 'arm'`);
      expect(rows).toHaveLength(2);
    });

    it('still rejects a genuine duplicate', async () => {
      // 'domo'/'n' is already seeded by beforeEach (as vocabId) with the default
      // homograph_index -- inserting the same headword/part-of-speech/homograph_index
      // combination again should collide with it.
      await expect(
        query(
          `INSERT INTO bridge_vocabulary
             (bridge_language_id, headword, part_of_speech, gloss_en, source_ref)
           VALUES ($1, 'domo', 'n', 'house', 'IEDICT 2019')`,
          [bridgeId],
        ),
      ).rejects.toThrow();
    });
  });

  describe('progress tables', () => {
    let userId: number;

    beforeEach(async () => {
      userId = (await queryOne<{ id: number }>(
        `INSERT INTO users (email, password_hash) VALUES ('a@b.co', 'x') RETURNING id`,
      ))!.id;
    });

    it('rejects an ease factor below the SM-2 minimum', async () => {
      await expect(
        query(
          `INSERT INTO vocabulary_progress (user_id, bridge_vocabulary_id, ease_factor)
           VALUES ($1, $2, 1.0)`,
          [userId, vocabId],
        ),
      ).rejects.toThrow();
    });

    it('rejects more successes than reviews', async () => {
      await expect(
        query(
          `INSERT INTO vocabulary_progress
             (user_id, bridge_vocabulary_id, review_count, success_count)
           VALUES ($1, $2, 1, 5)`,
          [userId, vocabId],
        ),
      ).rejects.toThrow(/vocabulary_progress_counts/);
    });

    it('removes progress when the account is deleted', async () => {
      await query(
        `INSERT INTO vocabulary_progress (user_id, bridge_vocabulary_id) VALUES ($1, $2)`,
        [userId, vocabId],
      );
      await query('DELETE FROM users WHERE id = $1', [userId]);
      expect(await query('SELECT 1 FROM vocabulary_progress')).toHaveLength(0);
    });
  });

  describe('rule_cards', () => {
    it('pairs prompt and answer on examples', async () => {
      const cardId = (
        await queryOne<{ id: number }>(
          `INSERT INTO rule_cards
             (slug, name, tier, position, teaching_frame, pattern_summary, description, source_note)
           VALUES ('grimm', 'Grimm', 1, 1, 'frame', 'summary', 'desc', 'note')
           RETURNING id`,
        )
      )!.id;

      await expect(
        query(
          `INSERT INTO rule_card_examples (rule_card_id, position, prompt)
           VALUES ($1, 1, 'orphan prompt')`,
          [cardId],
        ),
      ).rejects.toThrow(/rule_card_example_drill_pairing/);

      const rows = await query(
        `INSERT INTO rule_card_examples
           (rule_card_id, position, prompt, answer, distractors, forms)
         VALUES ($1, 1, 'q?', 'a', ARRAY['b'], '{}'::jsonb) RETURNING id`,
        [cardId],
      );
      expect(rows).toHaveLength(1);
    });
  });
});
