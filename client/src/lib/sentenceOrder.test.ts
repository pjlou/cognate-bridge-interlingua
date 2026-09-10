import { describe, expect, it } from 'vitest';
import {
  displayToken,
  formatAssembled,
  sentencesMatch,
  tokenizeSentence,
} from './sentenceOrder';

describe('tokenizeSentence', () => {
  it('lowercases every word and peels off the final punctuation', () => {
    expect(tokenizeSentence('Gestern visitir’d myn doktor mi.')).toEqual({
      tokens: ['gestern', "visitir'd", 'myn', 'doktor', 'mi'],
      trailingPunct: '.',
    });
  });

  it('keeps a question mark as trailing punctuation', () => {
    expect(tokenizeSentence('At ick en appel?')).toEqual({
      tokens: ['at', 'ick', 'en', 'appel'],
      trailingPunct: '?',
    });
  });
});

describe('display and scoring', () => {
  it('capitalises only the first selected word', () => {
    expect(displayToken('gestern', true)).toBe('Gestern');
    expect(displayToken('doktor', false)).toBe('doktor');
    expect(formatAssembled(['gestern', 'visitir\'d', 'myn'], '.')).toBe("Gestern visitir'd myn.");
  });

  it('scores the whole sentence, ignoring leftover capitalisation', () => {
    expect(sentencesMatch(['at', 'ick', 'en', 'appel'], ['at', 'ick', 'en', 'appel'])).toBe(true);
    expect(sentencesMatch(['ick', 'at', 'en', 'appel'], ['at', 'ick', 'en', 'appel'])).toBe(false);
  });
});
