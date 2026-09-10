import { describe, expect, it } from 'vitest';
import {
  buildCoverageBands,
  bridgesForTarget,
  normalizeCoverageLemma,
  COVERAGE_HORIZON,
} from './targetCoverage.js';

describe('normalizeCoverageLemma', () => {
  it('strips accents and lowercases', () => {
    expect(normalizeCoverageLemma('Café')).toBe('cafe');
    expect(normalizeCoverageLemma('  TIERRA ')).toBe('tierra');
  });
});

describe('bridgesForTarget', () => {
  it('returns every non-experimental bridge that lists the target', () => {
    expect(bridgesForTarget('es')).toEqual(['ia']);
    expect(bridgesForTarget('fr')).toEqual(['ia']);
    expect(bridgesForTarget('ro')).toEqual(['ia']);
    expect(bridgesForTarget('de')).toEqual([]);
    expect(bridgesForTarget('ca')).toEqual([]);
  });
});

describe('buildCoverageBands', () => {
  it('reports function words separately and bands content in 500s up to the horizon', () => {
    const closed = new Set(['de', 'el', 'la', 'y', 'en']);
    const ranked = [
      { lemma: 'de', rank: 1 },
      { lemma: 'el', rank: 2 },
      { lemma: 'la', rank: 3 },
      { lemma: 'y', rank: 4 },
      { lemma: 'en', rank: 5 },
      ...Array.from({ length: 1200 }, (_, i) => ({
        lemma: `word${i}`,
        rank: 100 + i,
      })),
    ];
    const covered = new Set(['de', 'el', 'word0', 'word1', 'word499']);

    const bands = buildCoverageBands(ranked, closed, covered, 1005, 500);
    expect(bands[0]).toMatchObject({
      kind: 'closed_class',
      label: 'Function words',
      total: 5,
      covered: 2,
      pct: 40,
    });
    expect(bands.filter((b) => b.kind === 'content')).toHaveLength(2);
    expect(bands[1]).toMatchObject({
      kind: 'content',
      label: 'Content 1–500',
      total: 500,
      covered: 3,
    });
    expect(bands[2]).toMatchObject({
      kind: 'content',
      label: 'Content 501–1000',
      total: 500,
    });
    const contentTotal = bands
      .filter((b) => b.kind === 'content')
      .reduce((sum, b) => sum + b.total, 0);
    expect(bands[0]!.total + contentTotal).toBe(1005);
  });

  it('uses the default horizon when content is plentiful', () => {
    const closed = new Set(['a']);
    const ranked = [
      { lemma: 'a', rank: 1 },
      ...Array.from({ length: 5000 }, (_, i) => ({ lemma: `c${i}`, rank: i + 2 })),
    ];
    const bands = buildCoverageBands(ranked, closed, new Set(), COVERAGE_HORIZON, 500);
    const contentTotal = bands
      .filter((b) => b.kind === 'content')
      .reduce((sum, b) => sum + b.total, 0);
    expect(bands[0]!.total + contentTotal).toBe(COVERAGE_HORIZON);
  });

  it('matches covered forms accent-insensitively', () => {
    const closed = new Set(['que']);
    const ranked = [
      { lemma: 'que', rank: 1 },
      { lemma: 'café', rank: 2 },
    ];
    const bands = buildCoverageBands(ranked, closed, new Set(['cafe']), 2, 500);
    expect(bands[1]?.covered).toBe(1);
  });
});
