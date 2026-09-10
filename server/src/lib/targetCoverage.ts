/**
 * Target-language vocabulary coverage by bridge cognates.
 *
 * For a selected target (e.g. Spanish), measure how many spoken-frequency lemmas
 * are attested as cognate forms on Interlingua — first closed-class / function
 * words, then content lemmas in bands of 500 up to a ~3200-lemma horizon.
 */

import { query } from '../db.js';
import { BRIDGE_TARGETS } from '../seed/languages.js';
import { FREQUENCY_ATTRIBUTION, loadLanguageRanks } from '../seed/frequency.js';
import { closedClassSet } from './closedClassLemmas.js';

export const COVERAGE_HORIZON = 3200;
export const COVERAGE_BAND_SIZE = 500;

export const BRIDGE_DISPLAY_NAMES: Record<string, string> = {
  ia: 'Interlingua',
  fin: 'Finnish',
};

export type CoverageBandKind = 'closed_class' | 'content';

export interface CoverageBand {
  kind: CoverageBandKind;
  label: string;
  rank_from: number | null;
  rank_to: number | null;
  total: number;
  covered: number;
  pct: number;
}

export interface BridgeCoverage {
  code: string;
  name: string;
  bands: CoverageBand[];
}

export interface TargetCoverage {
  code: string;
  name: string;
  available: boolean;
  bridges: BridgeCoverage[];
}

export interface TargetCoverageReport {
  horizon: number;
  band_size: number;
  frequency_source: string;
  targets: TargetCoverage[];
}

/** Accent-insensitive lowercase for matching frequency lemmas to cognate forms. */
export function normalizeCoverageLemma(form: string): string {
  return form
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function pct(covered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((covered / total) * 1000) / 10;
}

function countCovered(lemmas: string[], covered: Set<string>): number {
  let n = 0;
  for (const lemma of lemmas) {
    if (covered.has(normalizeCoverageLemma(lemma))) n += 1;
  }
  return n;
}

/** Bridges that list this target (experimental Finnish omitted from the assessment). */
export function bridgesForTarget(targetCode: string): string[] {
  const codes: string[] = [];
  for (const [bridge, targets] of Object.entries(BRIDGE_TARGETS)) {
    if (bridge === 'fin') continue;
    if (targets.includes(targetCode)) codes.push(bridge);
  }
  return codes;
}

/**
 * Pure band builder — pass ranked lemmas (rank ascending), closed-class set, and
 * normalized covered forms.
 */
export function buildCoverageBands(
  rankedLemmas: Array<{ lemma: string; rank: number }>,
  closedClass: Set<string>,
  covered: Set<string>,
  horizon: number = COVERAGE_HORIZON,
  bandSize: number = COVERAGE_BAND_SIZE,
): CoverageBand[] {
  const closedNorm = new Set([...closedClass].map((lemma) => normalizeCoverageLemma(lemma)));
  const freqLemmas = new Set(rankedLemmas.map((row) => normalizeCoverageLemma(row.lemma)));
  const functionLemmas = [...closedNorm].filter((lemma) => freqLemmas.has(lemma));
  // Stable order by spoken rank when available
  const rankOf = new Map(rankedLemmas.map((row) => [normalizeCoverageLemma(row.lemma), row.rank]));
  functionLemmas.sort((a, b) => (rankOf.get(a) ?? 1e9) - (rankOf.get(b) ?? 1e9));

  const functionTotal = functionLemmas.length;
  const functionCovered = countCovered(functionLemmas, covered);
  const bands: CoverageBand[] = [
    {
      kind: 'closed_class',
      label: 'Function words',
      rank_from: null,
      rank_to: null,
      total: functionTotal,
      covered: functionCovered,
      pct: pct(functionCovered, functionTotal),
    },
  ];

  const contentBudget = Math.max(0, horizon - functionTotal);
  const contentLemmas = rankedLemmas
    .filter((row) => !closedNorm.has(normalizeCoverageLemma(row.lemma)))
    .slice(0, contentBudget)
    .map((row) => row.lemma);

  for (let start = 0; start < contentLemmas.length; start += bandSize) {
    const chunk = contentLemmas.slice(start, start + bandSize);
    const from = start + 1;
    const to = start + chunk.length;
    const coveredCount = countCovered(chunk, covered);
    bands.push({
      kind: 'content',
      label: `Content ${from}–${to}`,
      rank_from: from,
      rank_to: to,
      total: chunk.length,
      covered: coveredCount,
      pct: pct(coveredCount, chunk.length),
    });
  }

  return bands;
}

export async function loadCoveredForms(bridgeCode: string, targetCode: string): Promise<Set<string>> {
  const rows = await query<{ target_word: string }>(
    `SELECT c.target_word
       FROM cognate_correspondences c
       JOIN bridge_vocabulary v ON v.id = c.bridge_vocabulary_id
       JOIN bridge_languages b ON b.id = v.bridge_language_id
       JOIN target_languages t ON t.id = c.target_language_id
      WHERE b.code = $1 AND t.code = $2`,
    [bridgeCode, targetCode],
  );
  return new Set(rows.map((row) => normalizeCoverageLemma(row.target_word)));
}

function ranksToSortedList(ranks: Map<string, number>): Array<{ lemma: string; rank: number }> {
  return [...ranks.entries()]
    .map(([lemma, rank]) => ({ lemma, rank }))
    .sort((a, b) => a.rank - b.rank || a.lemma.localeCompare(b.lemma));
}

export async function buildTargetCoverage(
  targets: Array<{ code: string; name: string }>,
): Promise<TargetCoverageReport> {
  const result: TargetCoverage[] = [];

  for (const target of targets) {
    const ranks = loadLanguageRanks(target.code);
    const closed = closedClassSet(target.code);
    const bridgeCodes = bridgesForTarget(target.code);

    if (!ranks || !closed) {
      result.push({
        code: target.code,
        name: target.name,
        available: false,
        bridges: bridgeCodes.map((code) => ({
          code,
          name: BRIDGE_DISPLAY_NAMES[code] ?? code,
          bands: [],
        })),
      });
      continue;
    }

    const ranked = ranksToSortedList(ranks);
    const bridges: BridgeCoverage[] = [];
    for (const bridgeCode of bridgeCodes) {
      const covered = await loadCoveredForms(bridgeCode, target.code);
      bridges.push({
        code: bridgeCode,
        name: BRIDGE_DISPLAY_NAMES[bridgeCode] ?? bridgeCode,
        bands: buildCoverageBands(ranked, closed, covered),
      });
    }

    result.push({
      code: target.code,
      name: target.name,
      available: true,
      bridges,
    });
  }

  return {
    horizon: COVERAGE_HORIZON,
    band_size: COVERAGE_BAND_SIZE,
    frequency_source: FREQUENCY_ATTRIBUTION.source,
    targets: result,
  };
}
