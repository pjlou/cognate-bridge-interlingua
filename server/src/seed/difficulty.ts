/**
 * Assigns each vocabulary row a difficulty from 1 to 5.
 *
 * The sources do not grade their entries, and nothing in this project can measure real
 * learner difficulty, so the level is a stated proxy rather than a claim: how much help a
 * learner gets from words they already know. That is worth computing because it drives
 * the order words are introduced in, and introducing `nation` (English *nation*)
 * before `ubique` is better than introducing them in alphabetical order.
 *
 * Two inputs, both available for every row:
 *
 *   Transparency -- how close the headword looks to something the learner already reads,
 *   which means the English gloss or an attested English cognate. `nation` glossed
 *   "nation" is free; `seje` glossed "to see" is not, even though it is the same word
 *   underneath.
 *
 *   Coverage -- how many target languages have an attested cognate. A word attested
 *   across the family is worth learning early because it pays off in every target; a
 *   word attested nowhere is unique to this bridge, which for a bridge language is the
 *   least useful kind of word there is.
 */

/** Longest common subsequence length, normalised by the longer string. */
function similarity(left: string, right: string): number {
  const a = left.toLowerCase().replace(/[^a-z]/g, '');
  const b = right.toLowerCase().replace(/[^a-z]/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;

  // Rolling two-row LCS: the full matrix is unnecessary and this runs once per row over
  // tens of thousands of rows.
  let previous = new Array<number>(b.length + 1).fill(0);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }

  return previous[b.length]! / Math.max(a.length, b.length);
}

/** A gloss like "to see" or "a house" carries function words the headword will not match. */
export function glossStem(gloss: string): string {
  return gloss.replace(/^(to|a|an|the)\s+/i, '').split(/[,;(]/)[0]!.trim();
}

/**
 * True when an English speaker can read the headword on sight.
 *
 * Same threshold the difficulty proxy uses for "free" words. Used at seed time to mark
 * Interlingua entries that have no English cognate row but are still immediately
 * recognisable from the gloss (`nation` / "nation").
 */
export function isEnglishTransparent(
  headword: string,
  glossEn: string,
  englishForms: string[] = [],
): boolean {
  const transparency = Math.max(
    similarity(headword, glossStem(glossEn)),
    ...englishForms.map((form) => similarity(headword, form)),
    0,
  );
  return transparency >= TRANSPARENT;
}

export interface DifficultyInput {
  headword: string;
  glossEn: string;
  /**
   * Attested English cognates only.
   *
   * Deliberately not every cognate. Transparency is about what *this* learner already
   * has, and the learner's known language is English. Interlingua `vider` scores 0.6
   * against Spanish `ver`, but an English speaker reading `vider` for the first time
   * gets no help from that; scoring against the whole cognate list would rate half the
   * Romance dictionary as free on the strength of resemblances the learner cannot see.
   */
  englishForms: string[];
  /** Distinct target languages with an attested cognate, all of them. */
  coverage: number;
  /** How many targets this bridge offers at all, so coverage can be read as a fraction. */
  targetCount: number;
}

/**
 * Above this, treat the word as readable on sight.
 *
 * Set from the cases it has to get right. Interlingua `possibile` against English
 * `possible` scores 0.89: one letter apart, and nobody who reads English has to learn
 * it. `nation` against `nation` and `natural` against `natural` both score 1.0.
 * Meanwhile `vider` against `see` scores well under this and does need learning, so
 * the boundary has a wide margin on both sides and is not balanced on any single case.
 */
const TRANSPARENT = 0.75;
/** Above this, the shape is suggestive but not enough on its own. */
const SUGGESTIVE = 0.55;

export function difficultyLevel(input: DifficultyInput): number {
  const { headword, glossEn, englishForms, coverage, targetCount } = input;

  const transparency = Math.max(
    similarity(headword, glossStem(glossEn)),
    ...englishForms.map((form) => similarity(headword, form)),
    0,
  );

  // Level 1 regardless of coverage: a word you can already read is not hard, however few
  // languages share it.
  if (transparency >= TRANSPARENT) return 1;

  const broad = coverage >= Math.max(Math.ceil(targetCount / 2), 2);

  // Suggestive plus broadly attested is as good as transparent: the shape gets you close
  // and the spread means the guess is reinforced in every target.
  if (transparency >= SUGGESTIVE) return broad ? 1 : 2;
  if (broad) return 2;
  if (coverage > 0) return 3;

  // No attested cognate anywhere. Long forms are harder still, and past about a dozen
  // characters a bridge word is usually a compound or a technical borrowing.
  return headword.length > 12 ? 5 : 4;
}
