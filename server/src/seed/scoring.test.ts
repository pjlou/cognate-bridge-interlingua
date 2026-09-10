import { describe, expect, it } from 'vitest';
import { meanTransparency, pairTransparency, priorityScore } from './scoring.js';

describe('scoring', () => {
  it('scores identical forms as fully transparent', () => {
    expect(pairTransparency('water', 'water')).toBe(1);
  });

  it('boosts mean transparency when a sound law applies', () => {
    const plain = meanTransparency('father', ['Vater'], false)!;
    const boosted = meanTransparency('father', ['Vater'], true)!;
    expect(boosted).toBeGreaterThan(plain);
    expect(boosted).toBeLessThanOrEqual(1);
  });

  it('prefers high transparency at the same frequency rank', () => {
    const opaque = priorityScore(100, 0.2)!;
    const clear = priorityScore(100, 0.9)!;
    expect(clear).toBeLessThan(opaque);
  });
});
