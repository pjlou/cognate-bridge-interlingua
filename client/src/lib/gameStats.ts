/**
 * Client-side matching-game telemetry: per-word averages, session history,
 * and JSON download/upload for persistence across devices.
 */

import type { VocabularyGrade } from '../services/api';

export const GAME_STATS_VERSION = 1;
export const MAX_SESSIONS = 50;
export const APPEARANCES_PER_LEMMA = 2;
export const MIN_LEMMAS = 12;
export const MAX_LEMMAS = 60;

export interface WordGameStats {
  appearances: number;
  incorrect: number;
  avg_match_ms: number;
  match_count: number;
  /**
   * Consecutive finished games where this lemma was answered cleanly (no misses /
   * don’t-know). Used to relax the Good timing threshold by 0.5s per win.
   */
  consecutive_correct_games?: number;
}

export interface GameSessionSummary {
  at: string;
  lemmas: number;
  total_ms: number;
  accuracy: number;
  applied_to_srs: boolean;
}

export interface BridgeGameStats {
  version: number;
  bridge: string;
  updated_at: string;
  words: Record<string, WordGameStats>;
  sessions: GameSessionSummary[];
}

export interface SessionWordResult {
  vocabId: number;
  incorrect: number;
  /** Average successful-match time this session (ms). */
  avg_match_ms: number;
  match_count: number;
  /** Successful removals via “Match is not on the board”. */
  board_absent_count?: number;
  /** Marked with “I don’t know this word”. */
  dont_know?: boolean;
  /** Removed from the study deck during the game. */
  removed_from_deck?: boolean;
}

function storageKey(bridge: string): string {
  return `cb.gameStats.${bridge}`;
}

export function emptyBridgeGameStats(bridge: string): BridgeGameStats {
  return {
    version: GAME_STATS_VERSION,
    bridge,
    updated_at: new Date().toISOString(),
    words: {},
    sessions: [],
  };
}

export function loadGameStats(bridge: string): BridgeGameStats {
  try {
    const raw = localStorage.getItem(storageKey(bridge));
    if (!raw) return emptyBridgeGameStats(bridge);
    const parsed = JSON.parse(raw) as BridgeGameStats;
    if (parsed.bridge !== bridge || parsed.version !== GAME_STATS_VERSION) {
      return emptyBridgeGameStats(bridge);
    }
    return {
      ...emptyBridgeGameStats(bridge),
      ...parsed,
      words: parsed.words ?? {},
      sessions: parsed.sessions ?? [],
    };
  } catch {
    return emptyBridgeGameStats(bridge);
  }
}

export function saveGameStats(stats: BridgeGameStats): void {
  const next = { ...stats, updated_at: new Date().toISOString() };
  try {
    localStorage.setItem(storageKey(stats.bridge), JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
}

/** Incremental average: fold `sampleMs` into existing average. */
export function averageIn(currentAvg: number, count: number, sampleMs: number): number {
  if (count <= 0) return sampleMs;
  return (currentAvg * count + sampleMs) / (count + 1);
}

export function recordSuccessfulMatch(
  stats: BridgeGameStats,
  vocabId: number,
  matchMs: number,
): BridgeGameStats {
  const key = String(vocabId);
  const prev = stats.words[key] ?? {
    appearances: 0,
    incorrect: 0,
    avg_match_ms: 0,
    match_count: 0,
  };
  const nextWord: WordGameStats = {
    ...prev,
    appearances: prev.appearances + 1,
    avg_match_ms: averageIn(prev.avg_match_ms, prev.match_count, matchMs),
    match_count: prev.match_count + 1,
  };
  return {
    ...stats,
    words: { ...stats.words, [key]: nextWord },
  };
}

export function recordIncorrectMatch(
  stats: BridgeGameStats,
  vocabIdA: number,
  vocabIdB: number,
): BridgeGameStats {
  let next = stats;
  for (const id of new Set([vocabIdA, vocabIdB])) {
    const key = String(id);
    const prev = next.words[key] ?? {
      appearances: 0,
      incorrect: 0,
      avg_match_ms: 0,
      match_count: 0,
    };
    next = {
      ...next,
      words: {
        ...next.words,
        [key]: { ...prev, incorrect: prev.incorrect + 1 },
      },
    };
  }
  return next;
}

export function recordGameSession(
  stats: BridgeGameStats,
  session: Omit<GameSessionSummary, 'at'> & { at?: string },
  wordResults: SessionWordResult[],
): BridgeGameStats {
  let next = { ...stats, words: { ...stats.words } };

  for (const result of wordResults) {
    const key = String(result.vocabId);
    const prev = next.words[key] ?? {
      appearances: 0,
      incorrect: 0,
      avg_match_ms: 0,
      match_count: 0,
      consecutive_correct_games: 0,
    };
    let avg = prev.avg_match_ms;
    let count = prev.match_count;
    // Session results already averaged per word this game; fold as one sample if matches > 0,
    // or fold each appearance individually for fairness. Prefer folding each match once:
    // callers should pass match_count and avg for the session; we fold session avg weighted.
    if (result.match_count > 0) {
      // Weighted merge of prior lifetime average with this session's average.
      const totalCount = count + result.match_count;
      avg =
        totalCount === 0
          ? 0
          : (avg * count + result.avg_match_ms * result.match_count) / totalCount;
      count = totalCount;
    }

    const prevStreak = prev.consecutive_correct_games ?? 0;
    let consecutive = prevStreak;
    if (!result.removed_from_deck && (result.match_count > 0 || result.dont_know)) {
      consecutive = sessionWasCleanCorrect(result) ? prevStreak + 1 : 0;
    }

    next.words[key] = {
      appearances: prev.appearances + result.match_count,
      incorrect: prev.incorrect + result.incorrect,
      avg_match_ms: avg,
      match_count: count,
      consecutive_correct_games: consecutive,
    };
  }

  const entry: GameSessionSummary = {
    at: session.at ?? new Date().toISOString(),
    lemmas: session.lemmas,
    total_ms: session.total_ms,
    accuracy: session.accuracy,
    applied_to_srs: session.applied_to_srs,
  };
  next.sessions = [entry, ...next.sessions].slice(0, MAX_SESSIONS);
  return next;
}

/** Base Good ceiling (ms); each consecutive clean game adds half a second. */
export const GOOD_MATCH_BASE_MS = 1000;
export const GOOD_MATCH_STREAK_BONUS_MS = 500;

export function goodMatchLimitMs(consecutiveCorrectGames: number): number {
  return GOOD_MATCH_BASE_MS + Math.max(0, consecutiveCorrectGames) * GOOD_MATCH_STREAK_BONUS_MS;
}

/** True when the lemma was answered cleanly this game (eligible to extend the streak). */
export function sessionWasCleanCorrect(result: SessionWordResult): boolean {
  if (result.removed_from_deck) return false;
  if (result.dont_know || result.incorrect >= 1) return false;
  return result.match_count > 0 || (result.board_absent_count ?? 0) > 0;
}

/** Map one lemma's session performance to an SM-2 grade (tier 1). */
export function gradeFromSessionResult(
  result: SessionWordResult,
  consecutiveCorrectGames = 0,
): VocabularyGrade | null {
  if (result.removed_from_deck) return null;
  if (result.match_count <= 0 && !result.dont_know) return null;
  if (result.incorrect >= 1 || result.dont_know) return 'again';
  // “Match is not on the board” counts as Good when the lemma was never missed.
  if ((result.board_absent_count ?? 0) > 0) return 'good';
  if (result.avg_match_ms > goodMatchLimitMs(consecutiveCorrectGames)) return 'hard';
  return 'good';
}

export interface GameAggregateStats {
  games_played: number;
  mean_accuracy: number | null;
  mean_total_ms: number | null;
  words_with_data: number;
  mean_avg_match_ms: number | null;
}

export function aggregateGameStats(stats: BridgeGameStats): GameAggregateStats {
  const sessions = stats.sessions;
  const wordList = Object.values(stats.words);
  const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

  return {
    games_played: sessions.length,
    mean_accuracy: mean(sessions.map((s) => s.accuracy)),
    mean_total_ms: mean(sessions.map((s) => s.total_ms)),
    words_with_data: wordList.filter((w) => w.match_count > 0 || w.incorrect > 0).length,
    mean_avg_match_ms: mean(wordList.filter((w) => w.match_count > 0).map((w) => w.avg_match_ms)),
  };
}

export function exportGameStatsJson(stats: BridgeGameStats): string {
  return JSON.stringify(stats, null, 2);
}

export function parseGameStatsJson(raw: string, expectedBridge: string): BridgeGameStats {
  const parsed = JSON.parse(raw) as BridgeGameStats;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid game stats file');
  }
  if (parsed.version !== GAME_STATS_VERSION) {
    throw new Error(`Unsupported game stats version: ${String(parsed.version)}`);
  }
  if (parsed.bridge && parsed.bridge !== expectedBridge) {
    throw new Error(`Stats file is for bridge "${parsed.bridge}", not "${expectedBridge}"`);
  }
  return {
    version: GAME_STATS_VERSION,
    bridge: expectedBridge,
    updated_at: parsed.updated_at ?? new Date().toISOString(),
    words: parsed.words ?? {},
    sessions: parsed.sessions ?? [],
  };
}

export function downloadGameStats(stats: BridgeGameStats): void {
  const blob = new Blob([exportGameStatsJson(stats)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cognate-bridge-game-stats-${stats.bridge}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Clear matching-game telemetry for every bridge stored in this browser. */
export function clearAllGameStats(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('cb.gameStats.')) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

export const SHOW_GAME_STATS_KEY = 'cb.showGameStats';

export function readShowGameStats(): boolean {
  try {
    return localStorage.getItem(SHOW_GAME_STATS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeShowGameStats(value: boolean): void {
  try {
    localStorage.setItem(SHOW_GAME_STATS_KEY, String(value));
  } catch {
    /* private mode */
  }
}
