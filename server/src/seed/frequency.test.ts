import { describe, expect, it } from 'vitest';
import {
  FREQUENCY_BAND_SIZE,
  bandRange,
  cognateLemmas,
  frequencyBand,
  lemmaCandidates,
  loadLemmaRanks,
  rankForEntry,
} from './frequency.js';

describe('frequency bands', () => {
  it('groups ranks into closed ranges of 500', () => {
    expect(FREQUENCY_BAND_SIZE).toBe(500);
    expect(frequencyBand(1)).toBe(1);
    expect(frequencyBand(500)).toBe(1);
    expect(frequencyBand(501)).toBe(2);
    expect(frequencyBand(1000)).toBe(2);
    expect(frequencyBand(null)).toBeNull();
    expect(bandRange(1)).toEqual({ from: 1, to: 500 });
    expect(bandRange(2)).toEqual({ from: 501, to: 1000 });
  });

  it('strips a leading particle before matching a gloss', () => {
    expect(lemmaCandidates('to see')).toEqual(['see']);
    expect(lemmaCandidates('a house')).toEqual(['house']);
    expect(lemmaCandidates('apple, Malus domestica')).toEqual(['apple']);
  });

  it('keeps the content head of a short primary phrase', () => {
    expect(lemmaCandidates('pay off')).toEqual(['pay']);
    expect(lemmaCandidates('give away')).toEqual(['give']);
    expect(lemmaCandidates('depend on')).toEqual(['depend']);
    expect(lemmaCandidates('advertising poster')).toEqual(['poster']);
    expect(lemmaCandidates('come to an agreement')).toEqual(['agreement']);
  });

  it('ignores paraphrases used only as later synonyms', () => {
    expect(lemmaCandidates('of Africa', 'fallback')).toEqual([]);
    expect(lemmaCandidates('take in', 'fallback')).toEqual([]);
    expect(lemmaCandidates('on time', 'fallback')).toEqual([]);
    expect(lemmaCandidates('any of a number of animals', 'fallback')).toEqual([]);
  });

  it('flattens Wordbouk optional endings on cognates', () => {
    expect(cognateLemmas('even(ing)')).toEqual(['evening']);
    expect(cognateLemmas('hold out')).toEqual([]);
    expect(cognateLemmas('or archaic)')).toEqual([]);
  });

  it('assigns the best rank among several primary senses, not later paraphrases', () => {
    const ranks = new Map([
      ['house', 54],
      ['building', 900],
    ]);
    expect(rankForEntry(ranks, 'house', ['house', 'building'])).toBe(54);
    expect(rankForEntry(ranks, 'absorb', ['absorb', 'take in'])).toBeNull();
    expect(rankForEntry(ranks, 'dwelling', ['dwelling'])).toBeNull();
  });

  it('does not let a frequent word in a paraphrase outrank the primary gloss', () => {
    const ranks = loadLemmaRanks();
    expect(rankForEntry(ranks, 'absorb', ['absorb', 'take in'])).toBe(ranks.get('absorb'));
    expect(rankForEntry(ranks, 'Africa', ['Africa', 'of Africa'])).not.toBe(ranks.get('of'));
    expect(rankForEntry(ranks, 'exactly', ['exactly', 'on time'])).toBe(ranks.get('exactly'));
    expect(rankForEntry(ranks, 'exactly', ['exactly', 'on time'])).not.toBe(ranks.get('on'));
    expect(rankForEntry(ranks, 'off', ['off', 'of'])).toBe(ranks.get('off'));
    expect(rankForEntry(ranks, 'off', ['off', 'of'])).not.toBe(ranks.get('of'));
  });

  it('falls back to an English cognate when the gloss is missing from spoken ranks', () => {
    const ranks = new Map([
      ['house', 54],
      ['but', 24],
    ]);
    expect(rankForEntry(ranks, 'dwelling', ['dwelling'], ['house'])).toBe(54);
    expect(rankForEntry(ranks, 'lizard', ['lizard'], ['or archaic)'])).toBeNull();
  });

  it('loads the attributed spoken-frequency list', () => {
    const ranks = loadLemmaRanks();
    expect(ranks.get('the')).toBeGreaterThan(0);
    expect(ranks.get('the')).toBeLessThan(20);
    expect(ranks.get('house')).toBeGreaterThan(0);
    expect(ranks.size).toBeGreaterThan(4000);
  });
});
