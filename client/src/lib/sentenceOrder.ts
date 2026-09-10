/** Split a bridge-language sentence into the tokens a word-order drill shuffles. */

export interface TokenizedSentence {
  tokens: string[];
  trailingPunct: string;
}

export function normalizeToken(value: string): string {
  return value.replace(/[\u2018\u2019]/g, "'").toLowerCase();
}

export function tokenizeSentence(text: string): TokenizedSentence {
  const trimmed = text.trim();
  const punct = trimmed.match(/[.!?]+$/)?.[0] ?? '';
  const body = punct ? trimmed.slice(0, -punct.length).trim() : trimmed;
  const tokens = body
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => normalizeToken(token.replace(/^[“”"'(]+|[“”"')]+$/g, '')));
  return { tokens: tokens.filter(Boolean), trailingPunct: punct };
}

/** First selected word is capitalised; the rest stay lowercase. */
export function displayToken(token: string, isFirst: boolean): string {
  if (!token) return token;
  return isFirst ? token.charAt(0).toUpperCase() + token.slice(1) : token;
}

export function formatAssembled(tokens: string[], trailingPunct: string): string {
  return tokens.map((token, index) => displayToken(token, index === 0)).join(' ') + trailingPunct;
}

export function sentencesMatch(assembled: string[], expected: string[]): boolean {
  if (assembled.length !== expected.length) return false;
  return assembled.every((token, index) => normalizeToken(token) === normalizeToken(expected[index]!));
}
