/**
 * Spoken-register English lemma frequency, used to batch vocabulary into groups of 500.
 *
 * Ranks come from subtitle corpora (OpenSubtitles FrequencyWords; SUBTLEX-US when the
 * builder finds a local export). Multi-language ranks live in the same JSON for later
 * composite scoring; seed still assigns a single English-driven `frequency_rank`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glossStem } from './difficulty.js';

export const FREQUENCY_BAND_SIZE = 500;

export const FREQUENCY_ATTRIBUTION = {
  source: 'OpenSubtitles FrequencyWords (Hermit Dave) / SUBTLEX-US when present',
  sourceUrl: 'https://github.com/hermitdave/FrequencyWords',
  corpus: 'OpenSubtitles subtitle word frequencies (spoken register)',
  notice:
    'Spoken/subtitle lemma ranks for Cognate Bridge. OpenSubtitles FrequencyWords are derived from OpenSubtitles.org.',
} as const;

interface LanguageRanks {
  lemma_count: number;
  max_rank: number;
  lemmas: Record<string, number>;
}

interface SpokenFrequencyDocument {
  source: string;
  source_url: string;
  notice: string;
  coverage_95_rank_en?: number | null;
  languages: Record<string, LanguageRanks>;
}

const DATA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/spoken_frequency.json',
);

let cachedDocument: SpokenFrequencyDocument | null = null;
let cachedEnglish: Map<string, number> | null = null;

function loadDocument(): SpokenFrequencyDocument {
  if (cachedDocument) return cachedDocument;
  const document = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as SpokenFrequencyDocument;
  if (!document.languages?.en?.lemmas) {
    throw new Error('spoken_frequency.json is missing English lemma ranks');
  }
  if (document.source !== FREQUENCY_ATTRIBUTION.source) {
    throw new Error(
      `spoken_frequency.json is missing the required source attribution (${FREQUENCY_ATTRIBUTION.source})`,
    );
  }
  cachedDocument = document;
  return document;
}

/** English spoken ranks (rank 1 = most frequent). */
export function loadLemmaRanks(): Map<string, number> {
  if (cachedEnglish) return cachedEnglish;
  const document = loadDocument();
  cachedEnglish = new Map(
    Object.entries(document.languages.en!.lemmas).map(([lemma, rank]) => [
      lemma.toLowerCase(),
      rank,
    ]),
  );
  return cachedEnglish;
}

/** Optional per-language ranks for cross-linguistic composite scoring. */
export function loadLanguageRanks(code: string): Map<string, number> | null {
  const block = loadDocument().languages[code];
  if (!block) return null;
  return new Map(
    Object.entries(block.lemmas).map(([lemma, rank]) => [lemma.toLowerCase(), rank]),
  );
}

/**
 * Approximate English rank at which cumulative Zipf mass reaches 95% of spoken input.
 * Documented helper for tier-1 coverage; study UI still uses frequency bands.
 */
export function coverage95Rank(): number | null {
  return loadDocument().coverage_95_rank_en ?? null;
}

export function frequencyBand(rank: number | null): number | null {
  if (rank === null || rank <= 0) return null;
  return Math.ceil(rank / FREQUENCY_BAND_SIZE);
}

export function bandRange(band: number): { from: number; to: number } {
  return {
    from: (band - 1) * FREQUENCY_BAND_SIZE + 1,
    to: band * FREQUENCY_BAND_SIZE,
  };
}

function lemmaKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/['\u2019']/g, "'")
    .replace(/[^a-z']+/g, '');
}

const CLOSED_CLASS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'as',
  'or', 'but', 'and', 'nor', 'not', 'no', 'so', 'if', 'than', 'then', 'that', 'this',
  'these', 'those', 'be', 'is', 'are', 'was', 'were', 'been', 'being', 'do', 'did',
  'does', 'done', 'have', 'has', 'had', 'it', 'its', 'i', 'you', 'he', 'she', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their',
  'who', 'what', 'which', 'whom', 'whose', 'how', 'when', 'where', 'why', 'all',
  'any', 'each', 'every', 'either', 'neither', 'both', 'some', 'such', 'can', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'up', 'out', 'off', 'over',
  'into', 'about', 'after', 'before', 'between', 'through', 'without', 'within',
  'onto', 'upon', 'per', 'via', 'vs', 'away', 'back', 'down', 'around', 'along',
  'aside', 'forth', 'together', 'apart', 'across', 'ahead',
]);

function tokensOf(stem: string): string[] {
  return stem
    .split(/\s+/)
    .map(lemmaKey)
    .filter((token) => token.length > 0);
}

export function lemmaCandidates(text: string, kind: 'primary' | 'fallback' = 'primary'): string[] {
  const stem = glossStem(text)
    .replace(/[-\s]+$/g, '')
    .trim();
  if (!stem) return [];
  if (stem.includes('/')) {
    return [
      ...new Set(stem.split('/').flatMap((part) => lemmaCandidates(part.trim(), kind))),
    ];
  }

  const tokens = tokensOf(stem);
  if (tokens.length === 0) return [];
  if (tokens.length === 1) {
    const lemma = tokens[0]!;
    if (kind === 'fallback' && CLOSED_CLASS.has(lemma)) return [];
    return [lemma];
  }
  if (kind === 'fallback') return [];

  const content = tokens.filter((token) => !CLOSED_CLASS.has(token));
  if (content.length === 1) return content;
  if (content.length > 1) return [content[content.length - 1]!];
  return [tokens[tokens.length - 1]!];
}

export function cognateLemmas(form: string): string[] {
  let text = form.trim();
  text = text.replace(/\s+\([^)]*\)\s*$/g, '');
  const optional = text.match(/^([A-Za-z]+)\(([A-Za-z]+)\)$/);
  if (optional) text = `${optional[1]}${optional[2]}`;
  return lemmaCandidates(text, 'fallback');
}

function bestRank(ranks: Map<string, number>, lemmas: Iterable<string>): number | null {
  let best: number | null = null;
  for (const lemma of lemmas) {
    const rank = ranks.get(lemma);
    if (rank !== undefined && (best === null || rank < best)) best = rank;
  }
  return best;
}

/**
 * Spoken-register rank of the English *meaning* a learner is practising.
 */
export function rankForEntry(
  ranks: Map<string, number>,
  glossEn: string,
  glossesEn: string[],
  englishForms: string[] = [],
): number | null {
  const primary = bestRank(ranks, lemmaCandidates(glossEn, 'primary'));
  if (primary !== null) return primary;

  const cognate = bestRank(ranks, englishForms.flatMap(cognateLemmas));
  if (cognate !== null) return cognate;

  const primaryKey = glossEn.trim().toLowerCase();
  const synonyms = glossesEn
    .filter((gloss) => gloss.trim().toLowerCase() !== primaryKey)
    .flatMap((gloss) => lemmaCandidates(gloss, 'fallback'));
  return bestRank(ranks, synonyms);
}
