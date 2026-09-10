/**
 * Loads the parser output into Postgres.
 *
 *   npm run seed                # everything found in parsers/out
 *   npm run seed -- --bridge ia # one bridge only
 *
 * Content is replaced rather than merged. The parsers are deterministic, so a partial
 * update has no advantage over a reload, and merging would need every row to carry a
 * stable key across parser revisions -- which the sources do not provide. The trade is
 * that reloading discards review history, since progress rows reference vocabulary rows;
 * the seed says so before it does it.
 *
 * `users` is never touched.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { closePool, query, withTransaction } from '../db.js';
import { difficultyLevel, isEnglishTransparent } from './difficulty.js';
import { frequencyBand, loadLemmaRanks, lemmaCandidates, rankForEntry } from './frequency.js';
import { BRIDGE_TARGETS, TARGET_LANGUAGES } from './languages.js';
import { meanTransparency, priorityScore } from './scoring.js';

const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../parsers/out',
);

// Postgres allows 65535 bind parameters per statement. A row of bridge_vocabulary binds
// 13, so this stays well inside the limit for every table here.
const CHUNK_ROWS = 500;

interface VocabularyDocument {
  language: {
    code: string;
    name: string;
    family: string;
    description: string | null;
    source_url?: string | null;
    license_note: string;
  };
  rules?: {
    code: string;
    target_language: string | null;
    name?: string | null;
    notation?: string | null;
    description: string;
    source_note: string;
    pattern_from: string | null;
    pattern_to: string | null;
    example_bridge: string | null;
    example_target: string | null;
  }[];
  entries: {
    headword: string;
    homograph_index?: number;
    part_of_speech: string | null;
    gloss_en: string;
    glosses_en: string[];
    ipa?: string | null;
    ipa_source?: "direct_phonology" | "derived_phonology" | "uncertain_phonology" | null;
    etymology?: string | null;
    is_multiword?: boolean;
    source_ref: string;
    // Some parsers group forms one row per language with several forms; others (e.g.
    // Interlingua) provide one row per form.
    cognates: (
      | { language: string; forms: string[]; rule_codes?: string[] }
      | {
          target_language: string;
          target_word: string;
          rule_code: string | null;
          provenance: string;
          confidence: number;
          validated_against: string | null;
        }
    )[];
  }[];
}

interface GrammarDocument {
  bridge_language: string;
  patterns: {
    slug: string;
    name: string;
    family: string;
    summary: string;
    description: string;
    source_note: string;
    difficulty_level: number;
    drill_kind?: 'multiple_choice' | 'word_order';
    position: number;
    examples: {
      position: number;
      bridge_text: string;
      gloss_en: string;
      highlight: string | null;
      prompt: string | null;
      answer: string | null;
      distractors: string[];
      note: string | null;
      parallels: Record<string, string>;
    }[];
  }[];
}

/** A cognate normalised to one row per (language, form), which is what the table stores. */
interface FlatCognate {
  language: string;
  word: string;
  ruleCodes: string[];
  provenance: string;
  confidence: number;
  validatedAgainst: string | null;
  notes?: string | null;
}

interface EtymCognatesDocument {
  by_english: Record<
    string,
    {
      language: string;
      word: string;
      provenance: string;
      confidence: number;
      validated_against?: string | null;
      notes?: string | null;
    }[]
  >;
}

const PROVENANCE_RANK: Record<string, number> = {
  parsed: 4,
  rule_generated: 3,
  curated: 2,
  similarity: 1,
};

/**
 * Spec §10.1 Core Interlingua: closed-class / auxiliary POS tags only.
 * IEDICT short tags (art, prn, …) and long labels both count.
 */
const CORE_TRACK_POS = new Set([
  'art',
  'article',
  'prn',
  'pronoun',
  'prep',
  'preposition',
  'conj',
  'conjunction',
  'aux',
  'auxiliary',
]);

function isCoreTrack(bridgeCode: string, partOfSpeech: string): boolean {
  if (bridgeCode !== 'ia') return false;
  return CORE_TRACK_POS.has(partOfSpeech.trim().toLowerCase());
}

function mergeAugmentedCognates(
  existing: FlatCognate[],
  extras: FlatCognate[],
): FlatCognate[] {
  const byKey = new Map<string, FlatCognate>();
  for (const cognate of [...existing, ...extras]) {
    const key = `${cognate.language}\u0000${cognate.word.toLowerCase()}`;
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, cognate);
      continue;
    }
    const priorRank = PROVENANCE_RANK[prior.provenance] ?? 0;
    const nextRank = PROVENANCE_RANK[cognate.provenance] ?? 0;
    if (nextRank > priorRank || (nextRank === priorRank && cognate.confidence > prior.confidence)) {
      byKey.set(key, cognate);
    }
  }
  return [...byKey.values()];
}

function augmentFromEtym(
  entry: VocabularyDocument['entries'][number],
  etym: EtymCognatesDocument | null,
  linkedTargets: Set<string>,
): FlatCognate[] {
  if (!etym) return [];
  const lemmas = new Set([
    ...lemmaCandidates(entry.gloss_en, 'primary'),
    ...entry.glosses_en.flatMap((gloss) => lemmaCandidates(gloss, 'fallback')),
  ]);
  const extras: FlatCognate[] = [];
  for (const lemma of lemmas) {
    for (const row of etym.by_english[lemma] ?? []) {
      if (!linkedTargets.has(row.language)) continue;
      extras.push({
        language: row.language,
        word: row.word,
        ruleCodes: [],
        provenance: row.provenance,
        confidence: row.confidence,
        validatedAgainst: row.validated_against ?? null,
        notes: row.notes ?? null,
      });
    }
  }
  return extras;
}

function flattenCognates(entry: VocabularyDocument['entries'][number]): FlatCognate[] {
  const flat: FlatCognate[] = [];
  // A source dictionary sometimes lists a form twice for one entry, either across two
  // grouped variants for the same language or as a repeated form. The table treats
  // (word, language, form) as unique, and a repeat carries no extra information.
  const seen = new Set<string>();

  const push = (cognate: FlatCognate): void => {
    const key = `${cognate.language}\u0000${cognate.word}`;
    if (seen.has(key)) return;
    seen.add(key);
    flat.push(cognate);
  };

  for (const cognate of entry.cognates) {
    if ('forms' in cognate) {
      // Parsed straight out of the source dictionary's etymological section, so it is
      // attested by the dictionary itself: full confidence, nothing to validate against.
      // Sound-law codes are attached by the parser's cognate matcher when both sides of
      // a substitution are visible in the two spellings.
      for (const form of cognate.forms) {
        push({
          language: cognate.language,
          word: form,
          ruleCodes: cognate.rule_codes ?? [],
          provenance: 'parsed',
          confidence: 1,
          validatedAgainst: null,
        });
      }
    } else {
      push({
        language: cognate.target_language,
        word: cognate.target_word,
        ruleCodes: cognate.rule_code ? [cognate.rule_code] : [],
        provenance: cognate.provenance,
        confidence: cognate.confidence,
        validatedAgainst: cognate.validated_against,
      });
    }
  }

  return flat;
}

async function insertChunked(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  for (let start = 0; start < rows.length; start += CHUNK_ROWS) {
    const chunk = rows.slice(start, start + CHUNK_ROWS);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
      params,
    );
  }
}

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(OUT_DIR, name), 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function seedTargetLanguages(client: PoolClient): Promise<Map<string, number>> {
  const rows = await query<{ id: number; code: string }>(
    `INSERT INTO target_languages (code, name, family)
     SELECT * FROM UNNEST ($1::text[], $2::text[], $3::language_family[])
     RETURNING id, code`,
    [
      TARGET_LANGUAGES.map((target) => target.code),
      TARGET_LANGUAGES.map((target) => target.name),
      TARGET_LANGUAGES.map((target) => target.family),
    ],
    client,
  );
  return new Map(rows.map((row) => [row.code, row.id]));
}

interface BridgeStats {
  vocabulary: number;
  cognates: number;
  rules: number;
  skippedNoPartOfSpeech: number;
  skippedMultiword: number;
  skippedDuplicate: number;
  cognatesInUnlistedLanguages: Record<string, number>;
}

async function seedBridge(
  client: PoolClient,
  document: VocabularyDocument,
  targetIds: Map<string, number>,
  etym: EtymCognatesDocument | null = null,
): Promise<{ bridgeId: number; stats: BridgeStats }> {
  const { language } = document;

  const bridge = await query<{ id: number }>(
    `INSERT INTO bridge_languages (code, name, family, description, source_url, license_note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      language.code,
      language.name,
      language.family,
      language.description,
      language.source_url ?? null,
      language.license_note,
    ],
    client,
  );
  const bridgeId = bridge[0]!.id;

  const targetCodes = BRIDGE_TARGETS[language.code] ?? [];
  await insertChunked(
    client,
    'bridge_target_links',
    ['bridge_language_id', 'target_language_id', 'position'],
    targetCodes.map((code, index) => [bridgeId, targetIds.get(code)!, index]),
  );
  const linkedTargets = new Set(targetCodes);

  const ruleIds = new Map<string, number>();
  for (const rule of document.rules ?? []) {
    const inserted = await query<{ id: number }>(
      `INSERT INTO correspondence_rules
         (bridge_language_id, code, name, notation, description, source_note, target_language_id,
          pattern_from, pattern_to, example_bridge, example_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        bridgeId,
        rule.code,
        rule.name ?? null,
        rule.notation ?? null,
        rule.description,
        rule.source_note,
        rule.target_language ? (targetIds.get(rule.target_language) ?? null) : null,
        rule.pattern_from,
        rule.pattern_to,
        rule.example_bridge,
        rule.example_target,
      ],
      client,
    );
    ruleIds.set(rule.code, inserted[0]!.id);
  }

  const stats: BridgeStats = {
    vocabulary: 0,
    cognates: 0,
    rules: ruleIds.size,
    skippedNoPartOfSpeech: 0,
    skippedMultiword: 0,
    skippedDuplicate: 0,
    cognatesInUnlistedLanguages: {},
  };

  const lemmaRanks = loadLemmaRanks();
  const vocabularyRows: unknown[][] = [];
  // Keyed the same way as the table's unique index, to catch collisions before Postgres
  // does. Two IEDICT entries can normalise to the same headword and inferred part of
  // speech, and a failed batch insert would abort the whole seed.
  const seen = new Set<string>();
  const cognatesByKey = new Map<string, FlatCognate[]>();

  for (const entry of document.entries) {
    if (entry.part_of_speech === null) {
      // bridge_vocabulary.part_of_speech is NOT NULL, and a flashcard with no part of
      // speech cannot be drilled sensibly anyway. Inferring one for these would mean
      // guessing where the parser already declined to.
      stats.skippedNoPartOfSpeech += 1;
      continue;
    }
    if (entry.is_multiword) {
      // `A quatro hora` is a phrase, not a headword. The correspondence rules operate on
      // single words, so these carry no cognates and would be dead cards.
      stats.skippedMultiword += 1;
      continue;
    }

    const homograph = entry.homograph_index ?? 1;
    const key = `${entry.headword.toLowerCase()}\u0000${entry.part_of_speech}\u0000${homograph}`;
    if (seen.has(key)) {
      stats.skippedDuplicate += 1;
      continue;
    }
    seen.add(key);

    const cognates = mergeAugmentedCognates(
      flattenCognates(entry).filter((cognate) => {
        if (linkedTargets.has(cognate.language)) return true;
        stats.cognatesInUnlistedLanguages[cognate.language] =
          (stats.cognatesInUnlistedLanguages[cognate.language] ?? 0) + 1;
        return false;
      }),
      augmentFromEtym(entry, etym, linkedTargets),
    );
    cognatesByKey.set(key, cognates);

    const englishForms = cognates
      .filter((cognate) => cognate.language === 'en')
      .map((cognate) => cognate.word);
    const rank = rankForEntry(lemmaRanks, entry.gloss_en, entry.glosses_en, englishForms);
    const nonEnglishWords = cognates
      .filter((cognate) => cognate.language !== 'en')
      .map((cognate) => cognate.word);
    const hasSoundLaw = cognates.some((cognate) => cognate.ruleCodes.length > 0);
    const transparency = meanTransparency(entry.gloss_en, nonEnglishWords, hasSoundLaw);
    const priority = priorityScore(rank, transparency);

    vocabularyRows.push([
      bridgeId,
      entry.headword,
      entry.part_of_speech,
      entry.gloss_en,
      entry.glosses_en,
      entry.ipa ?? null,
      entry.ipa_source ?? null,
      entry.etymology ?? null,
      difficultyLevel({
        headword: entry.headword,
        glossEn: entry.gloss_en,
        englishForms,
        coverage: new Set(cognates.map((cognate) => cognate.language)).size,
        targetCount: targetCodes.length,
      }),
      rank,
      frequencyBand(rank),
      englishForms.length > 0 ||
        isEnglishTransparent(entry.headword, entry.gloss_en, englishForms),
      entry.source_ref,
      homograph,
      transparency,
      priority,
      isCoreTrack(language.code, entry.part_of_speech),
    ]);
  }

  await insertChunked(
    client,
    'bridge_vocabulary',
    [
      'bridge_language_id',
      'headword',
      'part_of_speech',
      'gloss_en',
      'glosses_en',
      'ipa',
      'ipa_source',
      'etymology',
      'difficulty_level',
      'frequency_rank',
      'frequency_band',
      'has_english_cognate',
      'source_ref',
      'homograph_index',
      'transparency_score',
      'priority_score',
      'is_core_track',
    ],
    vocabularyRows,
  );
  stats.vocabulary = vocabularyRows.length;

  // Read the ids back rather than inserting row by row with RETURNING: one query beats
  // 30,000 round trips, and the unique index gives a key to join on.
  const inserted = await query<{
    id: number;
    headword: string;
    part_of_speech: string;
    homograph_index: number;
  }>(
    `SELECT id, headword, part_of_speech, homograph_index
       FROM bridge_vocabulary
      WHERE bridge_language_id = $1`,
    [bridgeId],
    client,
  );

  const cognateRows: unknown[][] = [];
  const ruleCodesByKey = new Map<string, string[]>();
  for (const row of inserted) {
    const key = `${row.headword.toLowerCase()}\u0000${row.part_of_speech}\u0000${row.homograph_index}`;
    for (const cognate of cognatesByKey.get(key) ?? []) {
      const targetId = targetIds.get(cognate.language);
      if (targetId === undefined) continue;
      cognateRows.push([
        row.id,
        targetId,
        cognate.word,
        cognate.ruleCodes[0] ? (ruleIds.get(cognate.ruleCodes[0]) ?? null) : null,
        cognate.provenance,
        cognate.confidence,
        cognate.validatedAgainst,
        cognate.notes ?? null,
      ]);
      ruleCodesByKey.set(`${row.id}\u0000${cognate.language}\u0000${cognate.word}`, cognate.ruleCodes);
    }
  }

  await insertChunked(
    client,
    'cognate_correspondences',
    [
      'bridge_vocabulary_id',
      'target_language_id',
      'target_word',
      'correspondence_rule_id',
      'provenance',
      'confidence',
      'validated_against',
      'notes',
    ],
    cognateRows,
  );
  stats.cognates = cognateRows.length;

  const insertedCognates = await query<{
    id: number;
    bridge_vocabulary_id: number;
    language: string;
    target_word: string;
  }>(
    `SELECT c.id, c.bridge_vocabulary_id, t.code AS language, c.target_word
       FROM cognate_correspondences c
       JOIN target_languages t ON t.id = c.target_language_id
       JOIN bridge_vocabulary v ON v.id = c.bridge_vocabulary_id
      WHERE v.bridge_language_id = $1`,
    [bridgeId],
    client,
  );

  const linkRows: unknown[][] = [];
  for (const row of insertedCognates) {
    const codes =
      ruleCodesByKey.get(`${row.bridge_vocabulary_id}\u0000${row.language}\u0000${row.target_word}`) ??
      [];
    for (const code of codes) {
      const ruleId = ruleIds.get(code);
      if (ruleId === undefined) continue;
      linkRows.push([row.id, ruleId]);
    }
  }
  await insertChunked(
    client,
    'cognate_rule_links',
    ['cognate_correspondence_id', 'correspondence_rule_id'],
    linkRows,
  );

  return { bridgeId, stats };
}

async function seedGrammar(
  client: PoolClient,
  document: GrammarDocument,
  bridgeId: number,
  targetIds: Map<string, number>,
): Promise<{ patterns: number; examples: number; parallels: number }> {
  let examples = 0;
  let parallels = 0;

  for (const pattern of document.patterns) {
    const rows = await query<{ id: number }>(
      `INSERT INTO grammar_patterns
         (bridge_language_id, slug, name, family, summary, description, source_note,
          difficulty_level, drill_kind, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        bridgeId,
        pattern.slug,
        pattern.name,
        pattern.family,
        pattern.summary,
        pattern.description,
        pattern.source_note,
        pattern.difficulty_level,
        pattern.drill_kind ?? 'multiple_choice',
        pattern.position,
      ],
      client,
    );
    const patternId = rows[0]!.id;

    for (const example of pattern.examples) {
      const inserted = await query<{ id: number }>(
        `INSERT INTO grammar_pattern_examples
           (grammar_pattern_id, position, bridge_text, gloss_en, highlight, prompt, answer,
            distractors, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          patternId,
          example.position,
          example.bridge_text,
          example.gloss_en,
          example.highlight,
          example.prompt,
          example.answer,
          example.distractors,
          example.note,
        ],
        client,
      );
      examples += 1;

      const parallelRows = Object.entries(example.parallels)
        .filter(([code]) => targetIds.has(code))
        .map(([code, text]) => [inserted[0]!.id, targetIds.get(code)!, text]);

      await insertChunked(
        client,
        'grammar_pattern_parallels',
        ['grammar_pattern_example_id', 'target_language_id', 'target_text'],
        parallelRows,
      );
      parallels += parallelRows.length;
    }
  }

  return { patterns: document.patterns.length, examples, parallels };
}

interface RuleCardsDocument {
  cards: {
    slug: string;
    name: string;
    tier: 1 | 2;
    position: number;
    teaching_frame: string;
    pattern_summary: string;
    description: string;
    caveat: string | null;
    source_note: string;
    difficulty_level: number;
    sound_law_prefixes?: string[];
    mappings: {
      position: number;
      from_label: string;
      to_label: string;
      notation: string | null;
    }[];
    examples: {
      position: number;
      mapping_position?: number | null;
      prompt: string | null;
      answer: string | null;
      distractors: string[];
      note?: string | null;
      false_friend?: boolean;
      forms: Record<string, string>;
    }[];
  }[];
}

async function seedRuleCards(
  client: PoolClient,
  document: RuleCardsDocument,
): Promise<{ cards: number; mappings: number; examples: number }> {
  let mappings = 0;
  let examples = 0;

  for (const card of document.cards) {
    const inserted = await query<{ id: number }>(
      `INSERT INTO rule_cards
         (slug, name, tier, position, teaching_frame, pattern_summary, description,
          caveat, source_note, difficulty_level, sound_law_prefixes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        card.slug,
        card.name,
        card.tier,
        card.position,
        card.teaching_frame,
        card.pattern_summary,
        card.description,
        card.caveat,
        card.source_note,
        card.difficulty_level,
        card.sound_law_prefixes ?? [],
      ],
      client,
    );
    const cardId = inserted[0]!.id;

    const mappingIds = new Map<number, number>();
    for (const mapping of card.mappings) {
      const rows = await query<{ id: number }>(
        `INSERT INTO rule_card_mappings
           (rule_card_id, position, from_label, to_label, notation)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [cardId, mapping.position, mapping.from_label, mapping.to_label, mapping.notation],
        client,
      );
      mappingIds.set(mapping.position, rows[0]!.id);
      mappings += 1;
    }

    for (const example of card.examples) {
      const mappingId =
        example.mapping_position != null ? (mappingIds.get(example.mapping_position) ?? null) : null;
      await query(
        `INSERT INTO rule_card_examples
           (rule_card_id, mapping_id, position, prompt, answer, distractors, note,
            false_friend, forms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          cardId,
          mappingId,
          example.position,
          example.prompt,
          example.answer,
          example.distractors,
          example.note ?? null,
          example.false_friend ?? false,
          JSON.stringify(example.forms ?? {}),
        ],
        client,
      );
      examples += 1;
    }
  }

  return { cards: document.cards.length, mappings, examples };
}

const BRIDGES = [
  {
    code: 'ia',
    vocabulary: 'interlingua.json',
    grammar: 'interlingua_grammar.json',
    udGrammar: 'ud_interlingua_grammar.json',
  },
  {
    code: 'fin',
    vocabulary: 'finnish.json',
    grammar: 'finnish_grammar.json',
  },
];

function mergeGrammar(
  hand: GrammarDocument | null,
  ud: GrammarDocument | null,
): GrammarDocument | null {
  if (!hand && !ud) return null;
  if (!hand) return ud;
  if (!ud) return hand;
  return {
    ...hand,
    patterns: [...hand.patterns, ...ud.patterns],
  };
}
export async function seed(only?: string): Promise<void> {
  const wanted = BRIDGES.filter((bridge) => !only || bridge.code === only);
  if (wanted.length === 0) {
    throw new Error(`Unknown bridge ${only}. Known: ${BRIDGES.map((b) => b.code).join(', ')}`);
  }

  const documents: { code: string; vocabulary: VocabularyDocument; grammar: GrammarDocument | null }[] =
    [];

  for (const bridge of wanted) {
    const vocabulary = await readJson<VocabularyDocument>(bridge.vocabulary);
    if (!vocabulary) {
      console.warn(
        `Skipping ${bridge.code}: ${bridge.vocabulary} not found in parsers/out. ` +
          'Run the parsers first (see README).',
      );
      continue;
    }
    documents.push({
      code: bridge.code,
      vocabulary,
      grammar: mergeGrammar(
        await readJson<GrammarDocument>(bridge.grammar),
        bridge.udGrammar ? await readJson<GrammarDocument>(bridge.udGrammar) : null,
      ),
    });
  }

  const ruleCards = await readJson<RuleCardsDocument>('rule_cards.json');
  const etymCognates = await readJson<EtymCognatesDocument>('etym_cognates.json');

  if (documents.length === 0 && !ruleCards) {
    throw new Error('No parser output found in parsers/out. Nothing to seed.');
  }

  await withTransaction(async (client) => {
    // CASCADE reaches vocabulary_progress and grammar_progress, which is the point: a
    // progress row pointing at a vocabulary row that no longer exists is worse than no
    // progress row. RESTART IDENTITY keeps ids stable between reloads, which makes the
    // seeded fixtures easier to reason about in development.
    await client.query(`
      TRUNCATE bridge_languages, target_languages, rule_cards
      RESTART IDENTITY CASCADE
    `);

    if (documents.length > 0) {
      const targetIds = await seedTargetLanguages(client);
      console.log(`target languages: ${targetIds.size}`);
      if (etymCognates) {
        console.log(
          `etym/similarity patches: ${Object.keys(etymCognates.by_english).length} English lemmas`,
        );
      }

      for (const document of documents) {
        const { bridgeId, stats } = await seedBridge(
          client,
          document.vocabulary,
          targetIds,
          etymCognates,
        );
        console.log(
          `${document.code}: ${stats.vocabulary} words, ${stats.cognates} cognates, ` +
            `${stats.rules} correspondence rules`,
        );

        const skipped = [
          stats.skippedNoPartOfSpeech && `${stats.skippedNoPartOfSpeech} without a part of speech`,
          stats.skippedMultiword && `${stats.skippedMultiword} multiword`,
          stats.skippedDuplicate && `${stats.skippedDuplicate} duplicate`,
        ].filter(Boolean);
        if (skipped.length > 0) {
          console.log(`${document.code}:   skipped ${skipped.join(', ')}`);
        }

        const unlisted = Object.entries(stats.cognatesInUnlistedLanguages);
        if (unlisted.length > 0) {
          console.log(
            `${document.code}:   ignored cognates in languages this bridge does not target: ` +
              unlisted.map(([code, count]) => `${code} ${count}`).join(', '),
          );
        }

        if (document.grammar) {
          const grammar = await seedGrammar(client, document.grammar, bridgeId, targetIds);
          console.log(
            `${document.code}: ${grammar.patterns} grammar patterns, ${grammar.examples} examples, ` +
              `${grammar.parallels} parallel translations`,
          );
        } else {
          console.warn(`${document.code}: no grammar file found; patterns not seeded`);
        }
      }
    }

    if (ruleCards) {
      const seeded = await seedRuleCards(client, ruleCards);
      console.log(
        `rule cards: ${seeded.cards} cards, ${seeded.mappings} mappings, ${seeded.examples} examples`,
      );
    } else {
      console.warn('rule_cards.json not found; decoder cards not seeded');
    }
  });
}

async function main(): Promise<void> {
  const bridgeFlag = process.argv.indexOf('--bridge');
  const only = bridgeFlag === -1 ? undefined : process.argv[bridgeFlag + 1];

  console.log('Replacing all content. User accounts are kept; review history is not.');
  const started = Date.now();
  await seed(only);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

// Only run when invoked directly, so the integration tests can import `seed`.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePool);
}
