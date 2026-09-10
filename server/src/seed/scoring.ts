/**
 * Cognate transparency and composite study priority.
 *
 * transparency = mean orthographic (1 - normalized edit distance) vs English gloss,
 * boosted when a sound-law rule is attached. priority_score is lower-sooner:
 * geometric mean of spoken rank and 1/max(transparency, ε).
 */

const RULE_BOOST = 0.08;
const EPSILON = 0.05;

export function normalizedLevenshtein(a: string, b: string): number {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left && !right) return 0;
  if (!left || !right) return 1;
  const rows = left.length + 1;
  const cols = right.length + 1;
  let previous = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      const insert = current[j - 1]! + 1;
      const deleteCost = previous[j]! + 1;
      const replace = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1);
      current.push(Math.min(insert, deleteCost, replace));
    }
    previous = current;
  }
  return previous[cols - 1]! / Math.max(left.length, right.length);
}

export function pairTransparency(a: string, b: string): number {
  return Math.max(0, Math.min(1, 1 - normalizedLevenshtein(a, b)));
}

export function meanTransparency(
  glossEn: string,
  cognateWords: string[],
  hasSoundLaw: boolean,
): number | null {
  if (cognateWords.length === 0) return null;
  const mean =
    cognateWords.reduce((sum, word) => sum + pairTransparency(glossEn, word), 0) /
    cognateWords.length;
  const boosted = hasSoundLaw ? Math.min(1, mean + RULE_BOOST) : mean;
  return Math.round(boosted * 1000) / 1000;
}

/** Lower score → study sooner. */
export function priorityScore(
  frequencyRank: number | null,
  transparency: number | null,
): number | null {
  if (frequencyRank === null || frequencyRank <= 0) return null;
  if (transparency === null) return frequencyRank;
  const inverseTransparency = 1 / Math.max(transparency, EPSILON);
  return Math.round(Math.sqrt(frequencyRank * inverseTransparency) * 10000) / 10000;
}
