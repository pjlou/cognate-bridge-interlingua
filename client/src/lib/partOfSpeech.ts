/** Display labels for vocabulary part-of-speech codes. */
const POS_LABELS: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  adj: 'adjective',
  adv: 'adverb',
  art: 'article',
  article: 'article',
  conj: 'conjunction',
  conjunction: 'conjunction',
  int: 'interjection',
  interj: 'interjection',
  interjection: 'interjection',
  num: 'numeral',
  phr: 'phrase',
  pref: 'prefix',
  prep: 'preposition',
  preposition: 'preposition',
  prn: 'pronoun',
  pron: 'pronoun',
  pronoun: 'pronoun',
  aux: 'auxiliary',
  auxiliary: 'auxiliary',
  grammar_particle: 'grammar particle',
  content_words: 'content words',
};

/** Function-word codes grouped under “grammar particle” for the matching game. */
export const GRAMMAR_PARTICLE_CODES = [
  'art',
  'article',
  'prep',
  'preposition',
  'conj',
  'conjunction',
  'prn',
  'pron',
  'pronoun',
  'int',
  'interj',
  'interjection',
] as const;

export const GRAMMAR_PARTICLE_VALUE = 'grammar_particle';
export const CONTENT_WORDS_VALUE = 'content_words';

const GRAMMAR_PARTICLE_SET = new Set<string>(GRAMMAR_PARTICLE_CODES);

export function isGrammarParticlePos(code: string): boolean {
  const key = code.trim().toLowerCase();
  return key === GRAMMAR_PARTICLE_VALUE || GRAMMAR_PARTICLE_SET.has(key);
}

export function isContentWordsPos(code: string): boolean {
  return code.trim().toLowerCase() === CONTENT_WORDS_VALUE;
}

export function partOfSpeechLabel(code: string): string {
  const key = code.trim().toLowerCase();
  if (isContentWordsPos(key)) return 'content words';
  if (isGrammarParticlePos(key)) return 'grammar particle';
  return POS_LABELS[key] ?? code;
}

/** Collapse particle POS codes into group options for the games UI. */
export function groupPartsOfSpeechForGame(codes: string[]): string[] {
  let hasParticle = false;
  let hasContent = false;
  const others: string[] = [];
  for (const code of codes) {
    if (isGrammarParticlePos(code)) {
      hasParticle = true;
    } else {
      hasContent = true;
      others.push(code);
    }
  }
  if (hasParticle) others.push(GRAMMAR_PARTICLE_VALUE);
  if (hasContent) others.push(CONTENT_WORDS_VALUE);
  return others;
}

/** Normalize a stored filter value (legacy particle codes → group value). */
export function normalizeGamePosFilter(code: string): string {
  if (!code) return '';
  if (isContentWordsPos(code)) return CONTENT_WORDS_VALUE;
  return isGrammarParticlePos(code) ? GRAMMAR_PARTICLE_VALUE : code;
}
