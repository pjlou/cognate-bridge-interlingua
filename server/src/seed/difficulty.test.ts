import { describe, expect, it } from 'vitest';
import { difficultyLevel, isEnglishTransparent } from './difficulty.js';

/**
 * The level is a stated proxy, not a measurement, so these tests pin down what the proxy
 * claims: a word you can already read is easy, a word shared across the family is next,
 * and a word attested nowhere is last.
 */

const base = { englishForms: [], coverage: 0, targetCount: 4 };

describe('difficultyLevel', () => {
  it('rates a word transparent from its own gloss as easiest', () => {
    expect(difficultyLevel({ ...base, headword: 'nation', glossEn: 'nation' })).toBe(1);
  });

  it('ignores the leading particle in a verb or article gloss', () => {
    // `cantar` glossed "to sing" is not transparent, but `dormir` glossed "to sleep" is
    // no more transparent either -- what matters is that the "to" does not shift the
    // comparison and make an obvious word look opaque.
    expect(difficultyLevel({ ...base, headword: 'documentar', glossEn: 'to document' })).toBe(1);
  });

  it('rates a word transparent from a cognate as easiest, however narrow its spread', () => {
    // One vowel and a final -e apart from English `abundance`. Attested in one language
    // only, and still nothing to learn.
    expect(
      difficultyLevel({
        ...base,
        headword: 'abondanc',
        glossEn: 'abundance',
        englishForms: ['abundance'],
        coverage: 1,
      }),
    ).toBe(1);
  });

  it('does not count a resemblance the learner cannot read', () => {
    // `beseuke` is transparent against German `besuchen` and opaque against English
    // `visit`. It is the English reading that decides, so this must not come out as free:
    // measuring transparency against the whole cognate list would rate much of the
    // Germanic dictionary easy on the strength of resemblances an English speaker has no
    // access to.
    expect(
      difficultyLevel({
        headword: 'beseuke',
        glossEn: 'to visit',
        englishForms: [],
        coverage: 3,
        targetCount: 6,
      }),
    ).toBeGreaterThan(1);
  });

  it('rates an opaque word attested across the family above one attested in a corner', () => {
    const shared = difficultyLevel({
      headword: 'hwarfor',
      glossEn: 'why',
      englishForms: ['warum', 'waarom', 'hvorfor'],
      coverage: 3,
      targetCount: 4,
    });
    const narrow = difficultyLevel({
      headword: 'hwarfor',
      glossEn: 'why',
      englishForms: ['warum'],
      coverage: 1,
      targetCount: 4,
    });

    expect(shared).toBeLessThan(narrow);
  });

  it('rates a word with no attested cognate hardest', () => {
    expect(difficultyLevel({ ...base, headword: 'sleutel', glossEn: 'key' })).toBe(4);
  });

  it('rates a long word with no attested cognate hardest of all', () => {
    expect(
      difficultyLevel({ ...base, headword: 'ongeluckigheid', glossEn: 'misfortune' }),
    ).toBe(5);
  });

  it('treats a transparent gloss as an English cognate for the study filter', () => {
    expect(isEnglishTransparent('nation', 'nation')).toBe(true);
    expect(isEnglishTransparent('beseuke', 'to visit')).toBe(false);
  });

  it('stays within the range the schema allows', () => {
    // bridge_vocabulary.difficulty_level has a CHECK between 1 and 5, so an out-of-range
    // return would fail the whole seed rather than one row.
    const cases = [
      { headword: '', glossEn: '', englishForms: [], coverage: 0, targetCount: 0 },
      { headword: 'a', glossEn: 'a', englishForms: ['a'], coverage: 9, targetCount: 1 },
      { headword: 'x'.repeat(60), glossEn: '', englishForms: [], coverage: 0, targetCount: 4 },
    ];

    for (const input of cases) {
      const level = difficultyLevel(input);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(5);
    }
  });
});
