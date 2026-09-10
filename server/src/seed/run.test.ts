import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, truncateAll } from '../test/db.js';
import { seed } from './run.js';

/**
 * Runs the real seed over the real parser output.
 *
 * The unit tests cover the pieces; this covers the thing that actually breaks, which is
 * the fit between what the parsers emit and what the schema accepts. Both bugs found
 * while writing it were of that kind: a cognate form a source dictionary lists twice
 * within one entry, and IEDICT entries with no inferable part of speech going into a
 * NOT NULL column. Neither is visible from either side alone.
 *
 * Skipped when parsers/out is absent, which is the case in CI unless the parser job has
 * run. The alternative -- committing a trimmed copy of the output as a fixture -- would
 * test the fixture rather than the parsers.
 */

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../parsers/out');
const canRun = hasTestDatabase && existsSync(path.join(OUT_DIR, 'interlingua.json'));

describe.skipIf(!canRun)('seed', () => {
  beforeAll(async () => {
    await migrateTestDatabase();
    await truncateAll();
    await seed();
  }, 120_000);

  it('loads all bridges with their target links', async () => {
    const bridges = await query<{ code: string; targets: number }>(
      `SELECT b.code, COUNT(l.target_language_id)::int AS targets
         FROM bridge_languages b
         LEFT JOIN bridge_target_links l ON l.bridge_language_id = b.id
        GROUP BY b.code
        ORDER BY b.code`,
    );

    expect(bridges).toEqual([
      { code: 'fin', targets: 1 },
      { code: 'ia', targets: 5 },
    ]);
  });

  it('seeds Finnish with Estonian cognates only', async () => {
    const et = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM cognate_correspondences c
         JOIN target_languages t ON t.id = c.target_language_id
         JOIN bridge_vocabulary v ON v.id = c.bridge_vocabulary_id
         JOIN bridge_languages b ON b.id = v.bridge_language_id
        WHERE b.code = 'fin' AND t.code = 'et'`,
    );
    expect(et[0]!.count).toBeGreaterThan(50);

    const stray = await query<{ code: string }>(
      `SELECT DISTINCT t.code
         FROM cognate_correspondences c
         JOIN bridge_vocabulary v ON v.id = c.bridge_vocabulary_id
         JOIN bridge_languages b ON b.id = v.bridge_language_id
         JOIN target_languages t ON t.id = c.target_language_id
        WHERE b.code = 'fin' AND t.code <> 'et'`,
    );
    expect(stray).toEqual([]);
  });

  it('loads required Finnish grammar sections', async () => {
    const slugs = await query<{ slug: string }>(
      `SELECT g.slug
         FROM grammar_patterns g
         JOIN bridge_languages b ON b.id = g.bridge_language_id
        WHERE b.code = 'fin'
        ORDER BY g.slug`,
    );
    const set = new Set(slugs.map((row) => row.slug));
    expect(set.has('consonant-gradation')).toBe(true);
    expect(set.has('verb-rections')).toBe(true);
    expect(set.has('partitive-vs-accusative')).toBe(true);
    expect(set.has('locative-cases')).toBe(true);
    expect(set.has('vowel-harmony')).toBe(true);
    expect(set.has('negation-and-objects')).toBe(true);
  });

  it('marks Interlingua closed-class vocabulary as core track', async () => {
    const sample = await query<{ headword: string; part_of_speech: string; is_core_track: boolean }>(
      `SELECT v.headword, v.part_of_speech, v.is_core_track
         FROM bridge_vocabulary v
         JOIN bridge_languages b ON b.id = v.bridge_language_id
        WHERE b.code = 'ia' AND v.headword IN ('de', 'io', 'e', 'filia', 'cantar')
        ORDER BY v.headword`,
    );

    const byHead = Object.fromEntries(sample.map((row) => [row.headword, row]));
    expect(byHead.de?.is_core_track).toBe(true);
    expect(byHead.io?.is_core_track).toBe(true);
    expect(byHead.e?.is_core_track).toBe(true);
    // Conjugable open-class verbs / nouns stay outside Core Interlingua.
    if (byHead.filia) expect(byHead.filia.is_core_track).toBe(false);
    if (byHead.cantar) expect(byHead.cantar.is_core_track).toBe(false);
  });

  it('attaches Romanian cognates for Interlingua', async () => {
    const counts = await query<{ code: string; count: number }>(
      `SELECT b.code, COUNT(*)::int AS count
         FROM cognate_correspondences c
         JOIN target_languages t ON t.id = c.target_language_id
         JOIN bridge_vocabulary v ON v.id = c.bridge_vocabulary_id
         JOIN bridge_languages b ON b.id = v.bridge_language_id
        WHERE t.code = 'ro'
        GROUP BY b.code
        ORDER BY b.code`,
    );
    expect(counts.find((row) => row.code === 'ia')?.count ?? 0).toBeGreaterThan(0);
  });

  it('loads a substantial vocabulary for each bridge', async () => {
    const counts = await query<{ code: string; words: number }>(
      `SELECT b.code, COUNT(v.id)::int AS words
         FROM bridge_languages b
         JOIN bridge_vocabulary v ON v.bridge_language_id = b.id
        GROUP BY b.code`,
    );

    // Loose bounds on purpose: the point is that the pipeline ran, not that a parser
    // revision has to keep an exact count. Finnish is an experimental curated core.
    for (const row of counts) {
      if (row.code === 'fin') {
        expect(row.words).toBeGreaterThan(200);
      } else {
        expect(row.words).toBeGreaterThan(1000);
      }
    }
  });

  it('loads at least two sound-correspondence rule cards with examples', async () => {
    // Only the two Romance-internal cards (c-palatalization, prosthetic-s) apply to
    // this repo's bridges; the Germanic/Latin-vs-Germanic cards were Frenkisch-specific
    // and were dropped along with it. See docs/sound-correspondence-rule-cards.md.
    const cards = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM rule_cards`,
    );
    expect(cards[0]!.count).toBeGreaterThanOrEqual(2);

    const withExamples = await query<{ count: number }>(
      `SELECT COUNT(DISTINCT rule_card_id)::int AS count FROM rule_card_examples`,
    );
    expect(withExamples[0]!.count).toBeGreaterThanOrEqual(2);
  });

  it('never attaches a cognate in a language its bridge does not target', async () => {
    // Source dictionaries sometimes record cognates in languages beyond what a bridge
    // offers (e.g. Russian loans in an etymological section). They are real data but
    // offering every attested language in a bridge's target picker would misrepresent
    // what the bridge is for.
    const stray = await query<{ code: string }>(
      `SELECT DISTINCT t.code
         FROM cognate_correspondences c
         JOIN bridge_vocabulary v ON v.id = c.bridge_vocabulary_id
         JOIN target_languages t ON t.id = c.target_language_id
        WHERE NOT EXISTS (
          SELECT 1 FROM bridge_target_links l
           WHERE l.bridge_language_id = v.bridge_language_id
             AND l.target_language_id = c.target_language_id
        )`,
    );

    expect(stray).toEqual([]);
  });

  it('marks parsed and generated cognates differently', async () => {
    const provenance = await query<{ code: string; provenance: string }>(
      `SELECT DISTINCT b.code, c.provenance
         FROM cognate_correspondences c
         JOIN bridge_vocabulary v ON v.id = c.bridge_vocabulary_id
         JOIN bridge_languages b ON b.id = v.bridge_language_id
        ORDER BY b.code, c.provenance`,
    );

    // Interlingua cognates were generated by a rule and then checked; collapsing the
    // distinction from curated Finnish data would make the UI claim more than the data
    // supports.
    expect(provenance).toEqual(
      expect.arrayContaining([
        { code: 'fin', provenance: 'curated' },
        { code: 'ia', provenance: 'rule_generated' },
        { code: 'ia', provenance: 'similarity' },
      ]),
    );
  });

  it('links every generated cognate to the rule that generated it', async () => {
    const orphans = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM cognate_correspondences
        WHERE provenance = 'rule_generated' AND correspondence_rule_id IS NULL`,
    );

    // A generated form with no rule is unexplainable, and the correspondence panel exists
    // to explain forms.
    expect(orphans[0]!.count).toBe(0);
  });

  it('loads the grammar patterns with examples and parallels', async () => {
    const patterns = await query<{ code: string; patterns: number; examples: number }>(
      `SELECT b.code,
              COUNT(DISTINCT p.id)::int AS patterns,
              COUNT(e.id)::int          AS examples
         FROM bridge_languages b
         JOIN grammar_patterns p ON p.bridge_language_id = b.id
         JOIN grammar_pattern_examples e ON e.grammar_pattern_id = p.id
        GROUP BY b.code
        ORDER BY b.code`,
    );

    expect(patterns.map((row) => row.code)).toEqual(['fin', 'ia']);
    for (const row of patterns) {
      expect(row.patterns).toBeGreaterThanOrEqual(2);
      expect(row.examples).toBeGreaterThan(row.patterns);
    }

    const parallels = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM grammar_pattern_parallels`,
    );
    expect(parallels[0]!.count).toBeGreaterThan(50);
  });

  it('assigns English frequency ranks used to batch study cards', async () => {
    const ranked = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM bridge_vocabulary WHERE frequency_rank IS NOT NULL`,
    );
    expect(ranked[0]!.count).toBeGreaterThan(100);

    const flagged = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM bridge_vocabulary WHERE has_english_cognate`,
    );
    expect(flagged[0]!.count).toBeGreaterThan(100);
  });

  it('spreads difficulty across the range rather than defaulting everything to one level', async () => {
    const levels = await query<{ difficulty_level: number; count: number }>(
      `SELECT difficulty_level, COUNT(*)::int AS count
         FROM bridge_vocabulary
        GROUP BY difficulty_level
        ORDER BY difficulty_level`,
    );

    // The column has a DEFAULT of 1, so "everything is level 1" is what it looks like
    // when the difficulty calculation is never actually reached.
    expect(levels.length).toBeGreaterThan(2);
  });

  it('stores IPA provenance for Interlingua headwords', async () => {
    const sources = await query<{ ipa_source: string; count: number }>(
      `SELECT ipa_source, COUNT(*)::int AS count
         FROM bridge_vocabulary v
         JOIN bridge_languages b ON b.id = v.bridge_language_id
        WHERE b.code = 'ia' AND ipa_source IS NOT NULL
        GROUP BY ipa_source`,
    );
    const bySource = Object.fromEntries(sources.map((row) => [row.ipa_source, row.count]));
    expect(bySource.derived_phonology).toBeGreaterThan(1000);

    const filia = await query<{ ipa: string; ipa_source: string }>(
      `SELECT v.ipa, v.ipa_source
         FROM bridge_vocabulary v
         JOIN bridge_languages b ON b.id = v.bridge_language_id
        WHERE b.code = 'ia' AND v.headword = 'filia'`,
    );
    expect(filia[0]).toEqual({ ipa: 'ˈfilja', ipa_source: 'derived_phonology' });
  });

  it('is safe to run twice', async () => {
    await seed();

    const bridges = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM bridge_languages`,
    );
    // Content is replaced, not appended, so a second run leaves two bridges rather than
    // four or a unique-violation.
    expect(bridges[0]!.count).toBe(2);
  }, 120_000);
});
