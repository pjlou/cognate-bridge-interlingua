import { describe, expect, it } from 'vitest';
import {
  CONTENT_WORDS_VALUE,
  GRAMMAR_PARTICLE_VALUE,
  groupPartsOfSpeechForGame,
  normalizeGamePosFilter,
  partOfSpeechLabel,
} from './partOfSpeech';

describe('partOfSpeechLabel', () => {
  it('expands common abbreviations', () => {
    expect(partOfSpeechLabel('n')).toBe('noun');
    expect(partOfSpeechLabel('v')).toBe('verb');
    expect(partOfSpeechLabel('adj')).toBe('adjective');
  });

  it('groups particle codes under grammar particle', () => {
    expect(partOfSpeechLabel('pron')).toBe('grammar particle');
    expect(partOfSpeechLabel('prep')).toBe('grammar particle');
    expect(partOfSpeechLabel('art')).toBe('grammar particle');
    expect(partOfSpeechLabel('conj')).toBe('grammar particle');
    expect(partOfSpeechLabel('int')).toBe('grammar particle');
    expect(partOfSpeechLabel('interj')).toBe('grammar particle');
    expect(partOfSpeechLabel(GRAMMAR_PARTICLE_VALUE)).toBe('grammar particle');
  });

  it('labels the content-words group', () => {
    expect(partOfSpeechLabel(CONTENT_WORDS_VALUE)).toBe('content words');
  });

  it('returns the original code when unknown', () => {
    expect(partOfSpeechLabel('xyz')).toBe('xyz');
  });
});

describe('groupPartsOfSpeechForGame', () => {
  it('collapses particle codes and adds content words', () => {
    expect(groupPartsOfSpeechForGame(['n', 'v', 'prep', 'pron', 'art', 'int'])).toEqual([
      'n',
      'v',
      GRAMMAR_PARTICLE_VALUE,
      CONTENT_WORDS_VALUE,
    ]);
  });

  it('omits content words when only particles exist', () => {
    expect(groupPartsOfSpeechForGame(['prep', 'int'])).toEqual([GRAMMAR_PARTICLE_VALUE]);
  });

  it('omits grammar particle when only content POS codes exist', () => {
    expect(groupPartsOfSpeechForGame(['n', 'v'])).toEqual(['n', 'v', CONTENT_WORDS_VALUE]);
  });
});

describe('normalizeGamePosFilter', () => {
  it('maps legacy particle codes to the group value', () => {
    expect(normalizeGamePosFilter('prep')).toBe(GRAMMAR_PARTICLE_VALUE);
    expect(normalizeGamePosFilter('interj')).toBe(GRAMMAR_PARTICLE_VALUE);
    expect(normalizeGamePosFilter('n')).toBe('n');
    expect(normalizeGamePosFilter(CONTENT_WORDS_VALUE)).toBe(CONTENT_WORDS_VALUE);
  });
});
