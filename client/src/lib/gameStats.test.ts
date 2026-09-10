import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  aggregateGameStats,
  averageIn,
  emptyBridgeGameStats,
  gradeFromSessionResult,
  loadGameStats,
  parseGameStatsJson,
  recordGameSession,
  recordIncorrectMatch,
  recordSuccessfulMatch,
  saveGameStats,
} from './gameStats';

describe('averageIn', () => {
  it('starts with the first sample', () => {
    expect(averageIn(0, 0, 800)).toBe(800);
  });

  it('folds later samples', () => {
    expect(averageIn(800, 1, 1200)).toBe(1000);
  });
});

describe('gradeFromSessionResult', () => {
  it('returns again when any incorrect attempt happened', () => {
    expect(
      gradeFromSessionResult({ vocabId: 1, incorrect: 1, avg_match_ms: 200, match_count: 2 }),
    ).toBe('again');
  });

  it('returns hard when average match time is over the Good limit', () => {
    expect(
      gradeFromSessionResult({ vocabId: 1, incorrect: 0, avg_match_ms: 1001, match_count: 1 }),
    ).toBe('hard');
  });

  it('returns good when average match time is at the base limit or less', () => {
    expect(
      gradeFromSessionResult({ vocabId: 1, incorrect: 0, avg_match_ms: 1000, match_count: 1 }),
    ).toBe('good');
  });

  it('extends the Good limit by half a second per consecutive clean game', () => {
    expect(
      gradeFromSessionResult(
        { vocabId: 1, incorrect: 0, avg_match_ms: 1500, match_count: 1 },
        1,
      ),
    ).toBe('good');
    expect(
      gradeFromSessionResult(
        { vocabId: 1, incorrect: 0, avg_match_ms: 1501, match_count: 1 },
        1,
      ),
    ).toBe('hard');
    expect(
      gradeFromSessionResult(
        { vocabId: 1, incorrect: 0, avg_match_ms: 2000, match_count: 1 },
        2,
      ),
    ).toBe('good');
  });

  it('skips lemmas with no successful matches', () => {
    expect(
      gradeFromSessionResult({ vocabId: 1, incorrect: 2, avg_match_ms: 0, match_count: 0 }),
    ).toBeNull();
  });

  it('returns good for clean board-absent resolutions even when slow', () => {
    expect(
      gradeFromSessionResult({
        vocabId: 1,
        incorrect: 0,
        avg_match_ms: 5000,
        match_count: 1,
        board_absent_count: 1,
      }),
    ).toBe('good');
  });

  it('returns again for dont-know lemmas', () => {
    expect(
      gradeFromSessionResult({
        vocabId: 1,
        incorrect: 1,
        avg_match_ms: 0,
        match_count: 1,
        dont_know: true,
      }),
    ).toBe('again');
  });

  it('skips lemmas removed from the study deck', () => {
    expect(
      gradeFromSessionResult({
        vocabId: 1,
        incorrect: 0,
        avg_match_ms: 400,
        match_count: 2,
        removed_from_deck: true,
      }),
    ).toBeNull();
  });
});

describe('consecutive correct games', () => {
  it('increments the streak after clean games and resets after a miss', () => {
    let stats = emptyBridgeGameStats('fin');
    stats = recordGameSession(
      stats,
      { lemmas: 12, total_ms: 10_000, accuracy: 1, applied_to_srs: false },
      [{ vocabId: 1, incorrect: 0, avg_match_ms: 700, match_count: 2 }],
    );
    expect(stats.words['1']?.consecutive_correct_games).toBe(1);

    stats = recordGameSession(
      stats,
      { lemmas: 12, total_ms: 10_000, accuracy: 1, applied_to_srs: false },
      [{ vocabId: 1, incorrect: 0, avg_match_ms: 900, match_count: 2 }],
    );
    expect(stats.words['1']?.consecutive_correct_games).toBe(2);

    stats = recordGameSession(
      stats,
      { lemmas: 12, total_ms: 10_000, accuracy: 0.5, applied_to_srs: false },
      [{ vocabId: 1, incorrect: 1, avg_match_ms: 400, match_count: 2 }],
    );
    expect(stats.words['1']?.consecutive_correct_games).toBe(0);
  });
});

describe('game stats persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('records successful and incorrect matches into word stats', () => {
    let stats = emptyBridgeGameStats('fin');
    stats = recordSuccessfulMatch(stats, 10, 500);
    stats = recordSuccessfulMatch(stats, 10, 1500);
    stats = recordIncorrectMatch(stats, 10, 11);
    expect(stats.words['10']?.match_count).toBe(2);
    expect(stats.words['10']?.avg_match_ms).toBe(1000);
    expect(stats.words['10']?.incorrect).toBe(1);
    expect(stats.words['11']?.incorrect).toBe(1);
  });

  it('saves sessions and aggregates them', () => {
    let stats = emptyBridgeGameStats('fin');
    stats = recordGameSession(
      stats,
      { lemmas: 12, total_ms: 60_000, accuracy: 0.8, applied_to_srs: false },
      [{ vocabId: 1, incorrect: 0, avg_match_ms: 700, match_count: 3 }],
    );
    saveGameStats(stats);
    const loaded = loadGameStats('fin');
    const agg = aggregateGameStats(loaded);
    expect(agg.games_played).toBe(1);
    expect(agg.mean_accuracy).toBeCloseTo(0.8);
    expect(agg.words_with_data).toBe(1);
    expect(loaded.words['1']?.appearances).toBe(3);
  });

  it('parses an uploaded JSON file for the expected bridge', () => {
    const raw = JSON.stringify({
      version: 1,
      bridge: 'fin',
      updated_at: '2026-01-01T00:00:00.000Z',
      words: { '1': { appearances: 1, incorrect: 0, avg_match_ms: 400, match_count: 1 } },
      sessions: [],
    });
    const parsed = parseGameStatsJson(raw, 'fin');
    expect(parsed.words['1']?.avg_match_ms).toBe(400);
    expect(() => parseGameStatsJson(raw, 'ia')).toThrow(/bridge/);
  });
});
