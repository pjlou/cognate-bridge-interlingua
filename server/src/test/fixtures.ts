import request from 'supertest';
import type { Express } from 'express';
import { query, queryOne } from '../db.js';

/**
 * A miniature version of the real dataset: one bridge per family, a couple of targets
 * each, and enough cognates and grammar content to exercise every join. Small and
 * hand-written so a failing assertion points at the code rather than at seed drift.
 */
export interface Fixture {
  finnishId: number;
  interlinguaId: number;
  estonianId: number;
  englishId: number;
  spanishId: number;
  italianId: number;
  taloId: number;
  cantarId: number;
  vowelHarmonyPatternId: number;
  gradationCardId: number;
  ruleIds: { finTaloTalu: number; italianInfinitive: number };
}

async function insertId(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ id: number }>(sql, params);
  return row!.id;
}

export async function seedFixture(): Promise<Fixture> {
  const finnishId = await insertId(
    `INSERT INTO bridge_languages (code, name, family, description, license_note)
     VALUES ('fin', 'Finnish', 'Uralic', 'An experimental Uralic study bridge', 'Project-authored (experimental)')
     RETURNING id`,
  );
  const interlinguaId = await insertId(
    `INSERT INTO bridge_languages (code, name, family, description, license_note)
     VALUES ('ia', 'Interlingua', 'Romance', 'The IALA international language', 'CC BY 3.0')
     RETURNING id`,
  );

  const estonianId = await insertId(
    `INSERT INTO target_languages (code, name, family) VALUES ('et', 'Estonian', 'Uralic') RETURNING id`,
  );
  const englishId = await insertId(
    `INSERT INTO target_languages (code, name, family) VALUES ('en', 'English', 'Germanic') RETURNING id`,
  );
  const spanishId = await insertId(
    `INSERT INTO target_languages (code, name, family) VALUES ('es', 'Spanish', 'Romance') RETURNING id`,
  );
  const italianId = await insertId(
    `INSERT INTO target_languages (code, name, family) VALUES ('it', 'Italian', 'Romance') RETURNING id`,
  );

  // Finnish targets Estonian only, matching the real seed config (BRIDGE_TARGETS.fin).
  await query(
    `INSERT INTO bridge_target_links (bridge_language_id, target_language_id, position)
     VALUES ($1, $2, 0), ($3, $4, 0), ($3, $5, 1)`,
    [finnishId, estonianId, interlinguaId, spanishId, italianId],
  );

  const finTaloTalu = await insertId(
    `INSERT INTO correspondence_rules
       (bridge_language_id, code, name, notation, description, source_note, example_bridge, example_target)
     VALUES ($1, 'fin.talo-talu', 'Finnic *talo', 'o → u',
             'A word-final -o in Finnish core vocabulary often corresponds to -u in Estonian',
             'Wikibooks: Finnish grammar, Vowel harmony', 'talo', 'talu')
     RETURNING id`,
    [finnishId],
  );

  const italianInfinitive = await insertId(
    `INSERT INTO correspondence_rules
       (bridge_language_id, code, description, source_note,
        target_language_id, pattern_from, pattern_to, example_bridge, example_target)
     VALUES ($1, 'ia.infinitive-ar.ita',
             'Prototype infinitives in -ar keep the Latin final -e in Italian alone',
             'IED Introduction, Termination of Infinitives',
             $2, 'ar$', 'are', 'cantar', 'cantare')
     RETURNING id`,
    [interlinguaId, italianId],
  );

  const taloId = await insertId(
    `INSERT INTO bridge_vocabulary
       (bridge_language_id, headword, part_of_speech, gloss_en, glosses_en, etymology,
        difficulty_level, source_ref)
     VALUES ($1, 'talo', 'n', 'house', ARRAY['house', 'building', 'farm'],
             'Proto-Finnic *talo', 1, 'Wikibooks Finnish grammar, Nouns')
     RETURNING id`,
    [finnishId],
  );

  const cantarId = await insertId(
    `INSERT INTO bridge_vocabulary
       (bridge_language_id, headword, part_of_speech, gloss_en, glosses_en,
        difficulty_level, source_ref)
     VALUES ($1, 'cantar', 'v', 'to sing', ARRAY['to sing'], 2, 'IEDICT 2019')
     RETURNING id`,
    [interlinguaId],
  );

  // A second Finnish word so the study queue has more than one card to hand out.
  await query(
    `INSERT INTO bridge_vocabulary
       (bridge_language_id, headword, part_of_speech, gloss_en, difficulty_level, source_ref)
     VALUES ($1, 'vesi', 'n', 'water', 1, 'Wikibooks Finnish grammar, Nouns')`,
    [finnishId],
  );

  await query(
    `INSERT INTO cognate_correspondences
       (bridge_vocabulary_id, target_language_id, target_word, provenance,
        correspondence_rule_id, confidence)
     VALUES ($1, $2, 'talu', 'parsed', $4, 1.00),
            ($1, $3, 'house', 'parsed', NULL, 1.00)`,
    [taloId, estonianId, englishId, finTaloTalu],
  );

  const cognateIds = await query<{ id: number; target_word: string }>(
    `SELECT id, target_word FROM cognate_correspondences WHERE bridge_vocabulary_id = $1`,
    [taloId],
  );
  const taluCognate = cognateIds.find((row) => row.target_word === 'talu');
  if (taluCognate) {
    await query(
      `INSERT INTO cognate_rule_links (cognate_correspondence_id, correspondence_rule_id)
       VALUES ($1, $2)`,
      [taluCognate.id, finTaloTalu],
    );
  }

  await query(
    `INSERT INTO cognate_correspondences
       (bridge_vocabulary_id, target_language_id, target_word, provenance,
        correspondence_rule_id, confidence, validated_against)
     VALUES ($1, $2, 'cantare', 'rule_generated', $3, 0.95, 'apertium-eng-ita')`,
    [cantarId, italianId, italianInfinitive],
  );

  const vowelHarmonyPatternId = await insertId(
    `INSERT INTO grammar_patterns
       (bridge_language_id, slug, name, family, summary, description, source_note, position)
     VALUES ($1, 'vowel-harmony', 'Vowel harmony', 'Uralic',
             'Suffix vowels agree in frontness or backness with the stem',
             'A Finnish word is either front-vowel or back-vowel throughout; suffixes pick the matching vowel set.',
             'Wikibooks: Finnish grammar, Vowel harmony', 0)
     RETURNING id`,
    [finnishId],
  );

  const exampleId = await insertId(
    `INSERT INTO grammar_pattern_examples
       (grammar_pattern_id, position, bridge_text, gloss_en, highlight, prompt, answer, distractors)
     VALUES ($1, 0, 'Talo on kaunis.', 'The house is beautiful.',
             'kaunis', 'Which word agrees in vowel harmony with talo?', 'kaunis',
             ARRAY['kaunisä', 'iloinen'])
     RETURNING id`,
    [vowelHarmonyPatternId],
  );

  await query(
    `INSERT INTO grammar_pattern_parallels (grammar_pattern_example_id, target_language_id, target_text)
     VALUES ($1, $2, 'Maja on ilus.')`,
    [exampleId, estonianId],
  );

  // An illustrative example with no prompt/answer, to prove the CHECK allows it.
  await query(
    `INSERT INTO grammar_pattern_examples
       (grammar_pattern_id, position, bridge_text, gloss_en, highlight)
     VALUES ($1, 1, 'Vesi on kylmää.', 'The water is cold.', 'kylmää')`,
    [vowelHarmonyPatternId],
  );

  const gradationCardId = await insertId(
    `INSERT INTO rule_cards
       (slug, name, tier, position, teaching_frame, pattern_summary, description,
        caveat, source_note, difficulty_level, sound_law_prefixes)
     VALUES ('kk-k-gradation', 'Consonant gradation: kk ↔ k', 1, 1,
             'A geminate stop weakens to a single consonant in certain case forms.',
             'Strong grade kk alternates with weak grade k.',
             'Strong-grade consonants appear in the nominative; the genitive and other oblique cases trigger weakening.',
             'Some stems show additional alternations (t↔d, p↔v).',
             'Wikibooks: Finnish grammar, Consonant gradation', 2, ARRAY['fin.grad'])
     RETURNING id`,
  );

  await query(
    `INSERT INTO rule_card_mappings
       (rule_card_id, position, from_label, to_label, notation)
     VALUES ($1, 1, 'Strong grade (kk)', 'Weak grade (k)', 'kk ↔ k')`,
    [gradationCardId],
  );

  await query(
    `INSERT INTO rule_card_examples
       (rule_card_id, position, prompt, answer, distractors, note, forms)
     VALUES ($1, 1, 'Nominative "pankki" (bank). Genitive?', 'pankin',
             ARRAY['pankkin', 'pankkia'], 'pankki → pankin (kk → k)',
             '{"fi":"pankin","en":"bank''s"}'::jsonb)`,
    [gradationCardId],
  );

  return {
    finnishId,
    interlinguaId,
    estonianId,
    englishId,
    spanishId,
    italianId,
    taloId,
    cantarId,
    vowelHarmonyPatternId,
    gradationCardId,
    ruleIds: { finTaloTalu, italianInfinitive },
  };
}

export async function registerUser(
  app: Express,
  email = 'learner@example.com',
): Promise<{ token: string; id: number }> {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'correcthorse' });
  return { token: response.body.token, id: response.body.user.id };
}

export function auth(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
