/**
 * Pure matching-board engine for the EN↔bridge games tab.
 * UI owns timers/colors; this module owns pool, tiles, and refill rules.
 */

import { APPEARANCES_PER_LEMMA } from './gameStats';

export type TileSide = 'en' | 'bridge' | 'empty';
export type TileColor = 'yellow' | 'red' | 'blue' | 'grey' | 'white';

export interface GameLemma {
  id: number;
  headword: string;
  english: string;
  /** English gloss / EN cognate for Interlingua peeks. */
  gloss_en: string;
  /** Cognate forms by target language code (for double-click hint reveals). */
  cognatesByCode: Record<string, string>;
  ipa: string | null;
  ipa_source?: 'direct_phonology' | 'derived_phonology' | 'uncertain_phonology' | null;
  bridge_language_code: string;
}

export interface BoardTile {
  key: string;
  lemmaId: number;
  side: TileSide;
  text: string;
  color: TileColor;
}

export interface MatchingEngine {
  lemmas: Map<number, GameLemma>;
  remaining: Map<number, number>;
  tiles: BoardTile[];
  /** Lemma id of the unpaired tile currently on the board, if any. */
  unpairedLemmaId: number | null;
  /** Side already shown for the unpaired lemma. */
  unpairedSide: TileSide | null;
  successfulMatches: number;
  incorrectAttempts: number;
  targetMatches: number;
  /** Per-lemma session telemetry. */
  sessionIncorrect: Map<number, number>;
  sessionMatchTimes: Map<number, number[]>;
  /** Successful removals via “Match is not on the board”. */
  sessionBoardAbsent: Map<number, number>;
  /** Lemmas marked with “I don’t know this word”. */
  sessionDontKnow: Set<number>;
  /** Lemmas removed from the study deck during this session. */
  sessionRemoved: Set<number>;
  /**
   * Incorrect attempts per lemma since the last successful pair anywhere.
   * Hitting 2 triggers the same ban as “I don’t know this word”.
   */
  consecutiveIncorrect: Map<number, number>;
}

/**
 * Fixed 3×3 side layout:
 * left column + top-middle = English; right column + bottom-middle = target;
 * center = either.
 */
export const BOARD_SLOT_SIDES: ReadonlyArray<'en' | 'bridge' | 'either'> = [
  'en',
  'en',
  'bridge',
  'en',
  'either',
  'bridge',
  'en',
  'bridge',
  'bridge',
] as const;

const EN_SLOTS = [0, 1, 3, 6] as const;
const BRIDGE_SLOTS = [2, 5, 7, 8] as const;
const CENTER_SLOT = 4;

function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

let tileSeq = 0;
function nextKey(): string {
  tileSeq += 1;
  return `t${tileSeq}`;
}

function makeTile(lemma: GameLemma, side: Exclude<TileSide, 'empty'>, color: TileColor = 'yellow'): BoardTile {
  return {
    key: nextKey(),
    lemmaId: lemma.id,
    side,
    text: side === 'en' ? lemma.english : lemma.headword,
    color,
  };
}

function makeEmptyTile(): BoardTile {
  return {
    key: nextKey(),
    lemmaId: -1,
    side: 'empty',
    text: '',
    color: 'grey',
  };
}

function pickLemmaWithRemaining(
  remaining: Map<number, number>,
  exclude: Set<number>,
  random: () => number,
): number | null {
  const candidates = [...remaining.entries()].filter(
    ([id, left]) => left > 0 && !exclude.has(id),
  );
  if (candidates.length === 0) return null;

  // Deal every lemma's earlier appearances before any later ones (e.g. all firsts
  // before any seconds), so the board does not collapse into a few repeating pairs.
  const maxLeft = Math.max(...candidates.map(([, left]) => left));
  const preferred = candidates.filter(([, left]) => left === maxLeft);
  return preferred[Math.floor(random() * preferred.length)]![0];
}

function consume(remaining: Map<number, number>, lemmaId: number): void {
  const left = remaining.get(lemmaId) ?? 0;
  remaining.set(lemmaId, Math.max(0, left - 1));
}

export function slotAllowsSide(slot: number, side: TileSide): boolean {
  if (side === 'empty') return true;
  const rule = BOARD_SLOT_SIDES[slot];
  if (!rule) return false;
  return rule === 'either' || rule === side;
}

function sideForSlot(slot: number, random: () => number): Exclude<TileSide, 'empty'> {
  const rule = BOARD_SLOT_SIDES[slot]!;
  if (rule === 'either') return random() < 0.5 ? 'en' : 'bridge';
  return rule;
}

/** Prefer a slot that requires `side`; fall back to center (`either`). */
function pickSlotForSide(
  slots: number[],
  side: Exclude<TileSide, 'empty'>,
  random: () => number,
): number | null {
  const exact = slots.filter((slot) => BOARD_SLOT_SIDES[slot] === side);
  if (exact.length > 0) {
    return exact[Math.floor(random() * exact.length)]!;
  }
  const either = slots.filter((slot) => BOARD_SLOT_SIDES[slot] === 'either');
  if (either.length > 0) {
    return either[Math.floor(random() * either.length)]!;
  }
  return null;
}

function layoutInitialBoard(
  enTiles: BoardTile[],
  bridgeTiles: BoardTile[],
  centerTile: BoardTile,
  random: () => number,
): BoardTile[] {
  const tiles: BoardTile[] = new Array(9);
  const shuffledEn = shuffle(enTiles, random);
  const shuffledBridge = shuffle(bridgeTiles, random);
  EN_SLOTS.forEach((slot, index) => {
    tiles[slot] = shuffledEn[index]!;
  });
  BRIDGE_SLOTS.forEach((slot, index) => {
    tiles[slot] = shuffledBridge[index]!;
  });
  tiles[CENTER_SLOT] = centerTile;
  return tiles;
}

export function createMatchingEngine(
  pool: GameLemma[],
  random: () => number = Math.random,
): MatchingEngine {
  if (pool.length < 5) {
    throw new Error('Matching game needs at least 5 lemmas');
  }

  const lemmas = new Map(pool.map((lemma) => [lemma.id, lemma]));
  const remaining = new Map(pool.map((lemma) => [lemma.id, APPEARANCES_PER_LEMMA]));
  const shuffled = shuffle(pool, random);

  const pairLemmas = shuffled.slice(0, 4);
  const unpaired = shuffled[4]!;

  for (const lemma of pairLemmas) consume(remaining, lemma.id);
  consume(remaining, unpaired.id);

  // Center holds the unpaired half; its side decides whether center is EN or target.
  const unpairedSide: TileSide = random() < 0.5 ? 'en' : 'bridge';
  const enTiles = pairLemmas.map((lemma) => makeTile(lemma, 'en'));
  const bridgeTiles = pairLemmas.map((lemma) => makeTile(lemma, 'bridge'));
  const centerTile = makeTile(unpaired, unpairedSide);

  return {
    lemmas,
    remaining,
    tiles: layoutInitialBoard(enTiles, bridgeTiles, centerTile, random),
    unpairedLemmaId: unpaired.id,
    unpairedSide,
    successfulMatches: 0,
    incorrectAttempts: 0,
    targetMatches: pool.length * APPEARANCES_PER_LEMMA,
    sessionIncorrect: new Map(),
    sessionMatchTimes: new Map(),
    sessionBoardAbsent: new Map(),
    sessionDontKnow: new Set(),
    sessionRemoved: new Set(),
    consecutiveIncorrect: new Map(),
  };
}

export function isPair(engine: MatchingEngine, a: BoardTile, b: BoardTile): boolean {
  return matchCandidate(engine, a, b) !== null;
}

function textsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Lemmas that currently have at least one tile on the board and share this English form. */
export function boardLemmaIdsWithEnglish(engine: MatchingEngine, english: string): number[] {
  const ids = new Set<number>();
  for (const tile of engine.tiles) {
    if (tile.side === 'empty') continue;
    const lemma = engine.lemmas.get(tile.lemmaId);
    if (lemma && textsMatch(lemma.english, english)) ids.add(lemma.id);
  }
  return [...ids];
}

/**
 * When two+ lemmas on the board share an English gloss, EN tiles with that text are
 * indistinguishable — either bridge word may match either EN tile.
 */
export function englishFormAmbiguousOnBoard(engine: MatchingEngine, english: string): boolean {
  return boardLemmaIdsWithEnglish(engine, english).length > 1;
}

function matchCandidate(
  engine: MatchingEngine,
  a: BoardTile,
  b: BoardTile,
): { lemmaId: number; bridge: BoardTile; en: BoardTile } | null {
  if (a.side === 'empty' || b.side === 'empty') return null;
  if (a.side === b.side) return null;

  if (a.lemmaId === b.lemmaId) {
    const bridge = a.side === 'bridge' ? a : b;
    const en = a.side === 'en' ? a : b;
    return { lemmaId: a.lemmaId, bridge, en };
  }

  const bridge = a.side === 'bridge' ? a : b;
  const en = a.side === 'en' ? a : b;
  const lemma = engine.lemmas.get(bridge.lemmaId);
  if (!lemma || !textsMatch(en.text, lemma.english)) return null;
  if (!englishFormAmbiguousOnBoard(engine, lemma.english)) return null;
  return { lemmaId: bridge.lemmaId, bridge, en };
}

/**
 * Resolve a tap pair into the lemma to score and the tile keys to clear.
 * For ambiguous duplicate glosses, reassigns EN lemma ownership so the clicked
 * tiles are the ones removed and the leftover EN keeps a valid mate.
 */
export function resolveMatch(
  engine: MatchingEngine,
  a: BoardTile,
  b: BoardTile,
): { lemmaId: number; keys: string[] } | null {
  const matched = matchCandidate(engine, a, b);
  if (!matched) return null;

  const { lemmaId, bridge, en } = matched;

  // Point the clicked EN at this bridge lemma; give the displaced EN tile the other id.
  if (en.lemmaId !== bridge.lemmaId) {
    const trueMate = engine.tiles.find(
      (tile) =>
        tile.side === 'en' &&
        tile.lemmaId === bridge.lemmaId &&
        tile.key !== en.key,
    );
    const displacedId = en.lemmaId;
    en.lemmaId = bridge.lemmaId;
    if (trueMate) trueMate.lemmaId = displacedId;
  }

  return { lemmaId, keys: [bridge.key, en.key] };
}

/** True when the other half of this lemma is not currently on the board. */
export function mateMissingFromBoard(engine: MatchingEngine, tile: BoardTile): boolean {
  if (tile.side === 'empty') return false;
  if (
    engine.tiles.some(
      (other) =>
        other.side !== 'empty' &&
        other.lemmaId === tile.lemmaId &&
        other.side !== tile.side,
    )
  ) {
    return false;
  }

  // Indistinguishable duplicate gloss: a bridge word can still match another lemma's EN.
  if (tile.side === 'bridge') {
    const lemma = engine.lemmas.get(tile.lemmaId);
    if (!lemma) return true;
    if (!englishFormAmbiguousOnBoard(engine, lemma.english)) return true;
    return !engine.tiles.some(
      (other) => other.side === 'en' && textsMatch(other.text, lemma.english),
    );
  }

  if (tile.side === 'en') {
    if (!englishFormAmbiguousOnBoard(engine, tile.text)) return true;
    return !engine.tiles.some((other) => {
      if (other.side !== 'bridge') return false;
      const lemma = engine.lemmas.get(other.lemmaId);
      return Boolean(lemma && textsMatch(lemma.english, tile.text));
    });
  }

  return true;
}

export function translationForTile(engine: MatchingEngine, tile: BoardTile): string {
  const lemma = engine.lemmas.get(tile.lemmaId);
  if (!lemma) return '';
  return tile.side === 'en' ? lemma.headword : lemma.english;
}

/**
 * Record a wrong pair. Returns lemma ids that have now been missed twice in a row
 * without an intervening correct pair (callers should treat those like don’t-know).
 */
export function registerIncorrect(engine: MatchingEngine, a: BoardTile, b: BoardTile): number[] {
  engine.incorrectAttempts += 1;
  const dueForDontKnow: number[] = [];
  for (const id of new Set([a.lemmaId, b.lemmaId])) {
    engine.sessionIncorrect.set(id, (engine.sessionIncorrect.get(id) ?? 0) + 1);
    const streak = (engine.consecutiveIncorrect.get(id) ?? 0) + 1;
    engine.consecutiveIncorrect.set(id, streak);
    if (streak >= 2) dueForDontKnow.push(id);
  }
  return dueForDontKnow;
}

export function registerSuccess(engine: MatchingEngine, lemmaId: number, matchMs: number): void {
  engine.successfulMatches += 1;
  const times = engine.sessionMatchTimes.get(lemmaId) ?? [];
  times.push(matchMs);
  engine.sessionMatchTimes.set(lemmaId, times);
  // Any correct pair clears the double-miss streak for every lemma.
  engine.consecutiveIncorrect.clear();
}

/**
 * Ban a lemma for the rest of the game: zero remaining appearances and return every
 * on-board tile key for that lemma (both sides of the pair).
 * `alreadyCountedMatch` means the current board appearance was already added to
 * successfulMatches (e.g. via registerSuccess).
 */
export function banLemmaFromGame(
  engine: MatchingEngine,
  lemmaId: number,
  options: { alreadyCountedMatch: boolean },
): string[] {
  const keys = engine.tiles
    .filter((tile) => tile.side !== 'empty' && tile.lemmaId === lemmaId)
    .map((tile) => tile.key);

  const leftover = engine.remaining.get(lemmaId) ?? 0;
  engine.remaining.set(lemmaId, 0);

  // One on-board presence (one or both halves) equals one appearance still to clear,
  // unless the caller already counted it.
  const onBoardAppearance = keys.length > 0 ? 1 : 0;
  if (options.alreadyCountedMatch) {
    engine.successfulMatches += leftover;
  } else {
    engine.successfulMatches += onBoardAppearance + leftover;
  }

  if (engine.unpairedLemmaId === lemmaId) {
    engine.unpairedLemmaId = null;
    engine.unpairedSide = null;
  }

  engine.consecutiveIncorrect.delete(lemmaId);

  return keys;
}

/** Ban a lemma for the rest of the game and count its remaining appearances as cleared. */
export function registerDontKnow(engine: MatchingEngine, lemmaId: number): string[] {
  engine.incorrectAttempts += 1;
  engine.sessionIncorrect.set(lemmaId, (engine.sessionIncorrect.get(lemmaId) ?? 0) + 1);
  engine.sessionDontKnow.add(lemmaId);
  return banLemmaFromGame(engine, lemmaId, { alreadyCountedMatch: false });
}

/**
 * After a second consecutive miss on a lemma, ban it like don’t-know without adding
 * another incorrect count (the miss that triggered this already called registerIncorrect).
 */
export function registerAutoDontKnow(engine: MatchingEngine, lemmaId: number): string[] {
  engine.sessionDontKnow.add(lemmaId);
  return banLemmaFromGame(engine, lemmaId, { alreadyCountedMatch: false });
}

/**
 * Ban a lemma for the rest of the game after the player removes it from the study deck.
 * Does not count as an incorrect attempt.
 */
export function registerRemoveFromDeck(engine: MatchingEngine, lemmaId: number): string[] {
  engine.sessionRemoved.add(lemmaId);
  return banLemmaFromGame(engine, lemmaId, { alreadyCountedMatch: false });
}

/**
 * Resolve an unpaired half as correct and ban the lemma for the rest of the game
 * (no future appearances of either side of the pair).
 */
export function registerBoardAbsentSuccess(
  engine: MatchingEngine,
  lemmaId: number,
  matchMs: number,
): string[] {
  registerSuccess(engine, lemmaId, matchMs);
  engine.sessionBoardAbsent.set(
    lemmaId,
    (engine.sessionBoardAbsent.get(lemmaId) ?? 0) + 1,
  );
  return banLemmaFromGame(engine, lemmaId, { alreadyCountedMatch: true });
}

/**
 * Whether “Match is not on the board” is still cooling down for a replacement lemma.
 * Cooldown clears once that lemma leaves the board or both halves are on the board.
 */
export function isBoardAbsentCooldownActive(
  engine: MatchingEngine,
  cooldownLemmaId: number | null,
): boolean {
  if (cooldownLemmaId === null) return false;
  const onBoard = engine.tiles.filter(
    (tile) => tile.side !== 'empty' && tile.lemmaId === cooldownLemmaId,
  );
  if (onBoard.length === 0) return false;
  if (onBoard.length >= 2) return false;
  return true;
}

function remainingAppearancesSum(engine: MatchingEngine): number {
  let total = 0;
  for (const left of engine.remaining.values()) total += left;
  return total;
}

function boardHasCompletePair(_engine: MatchingEngine, tiles: BoardTile[]): boolean {
  const sides = new Map<number, Set<TileSide>>();
  for (const tile of tiles) {
    if (tile.side === 'empty') continue;
    const set = sides.get(tile.lemmaId) ?? new Set();
    set.add(tile.side);
    sides.set(tile.lemmaId, set);
  }
  for (const set of sides.values()) {
    if (set.has('en') && set.has('bridge')) return true;
  }
  return false;
}

/** If nothing left to deal and nothing left to match, clear shortfall and end. */
function finalizeIfNoProgressLeft(engine: MatchingEngine, tiles: BoardTile[]): boolean {
  if (engine.successfulMatches >= engine.targetMatches) {
    engine.tiles = [];
    engine.unpairedLemmaId = null;
    engine.unpairedSide = null;
    return true;
  }

  const live = tiles.filter((tile) => tile.side !== 'empty');
  const canDeal = remainingAppearancesSum(engine) > 0;
  const canMatch = boardHasCompletePair(engine, live);
  // An unpaired half can still be completed when two slots free up later — only treat as
  // stuck when there are no complete pairs and nothing left to deal, and every live tile
  // is an orphan half whose remaining is already 0 (mate will never be dealt from pool).
  if (canDeal || canMatch) return false;

  const orphansOnly = live.every((tile) => {
    const hasMate = live.some(
      (other) =>
        other.key !== tile.key &&
        other.lemmaId === tile.lemmaId &&
        other.side !== tile.side,
    );
    return !hasMate;
  });
  if (!orphansOnly && live.length > 0) return false;

  engine.successfulMatches = engine.targetMatches;
  engine.tiles = [];
  engine.unpairedLemmaId = null;
  engine.unpairedSide = null;
  return true;
}

export function markTiles(
  engine: MatchingEngine,
  keys: string[],
  color: TileColor,
): void {
  for (const tile of engine.tiles) {
    if (keys.includes(tile.key)) tile.color = color;
  }
}

export function setTileTexts(
  engine: MatchingEngine,
  updates: Array<{ key: string; text: string }>,
): void {
  for (const update of updates) {
    const tile = engine.tiles.find((t) => t.key === update.key);
    if (tile) tile.text = update.text;
  }
}


/**
 * After tiles are removed, refill vacated slots.
 * With two slots and an unpaired half still on the board: complete it + add a new unpaired.
 * With one slot (or no unpaired left): introduce a new unpaired half, else empty greys.
 * Returns false when the game is finished (no refill).
 */
export function refillAfterMatch(
  engine: MatchingEngine,
  matchedKeys: string[],
  random: () => number = Math.random,
): boolean {
  const slotIndices = matchedKeys
    .map((key) => engine.tiles.findIndex((tile) => tile.key === key))
    .filter((index) => index >= 0);

  const removedUnpaired = matchedKeys.some((key) => {
    const tile = engine.tiles.find((t) => t.key === key);
    return tile && tile.lemmaId === engine.unpairedLemmaId;
  });
  if (removedUnpaired) {
    engine.unpairedLemmaId = null;
    engine.unpairedSide = null;
  }

  if (engine.successfulMatches >= engine.targetMatches) {
    engine.tiles = [];
    engine.unpairedLemmaId = null;
    engine.unpairedSide = null;
    return false;
  }

  const remainingTiles = engine.tiles.filter((tile) => !matchedKeys.includes(tile.key));
  const onBoard = new Set(
    remainingTiles.filter((tile) => tile.side !== 'empty').map((tile) => tile.lemmaId),
  );
  const next = [...engine.tiles];
  const freeSlots = [...slotIndices];

  const placeAt = (slot: number, tile: BoardTile): void => {
    next[slot] = tile;
    const idx = freeSlots.indexOf(slot);
    if (idx >= 0) freeSlots.splice(idx, 1);
  };

  const fillEmpties = (): void => {
    while (freeSlots.length > 0) {
      placeAt(freeSlots[0]!, makeEmptyTile());
    }
  };

  const placeNewUnpaired = (openSlot: number): boolean => {
    const newUnpairedId = pickLemmaWithRemaining(engine.remaining, onBoard, random);
    if (newUnpairedId === null) return false;
    const newLemma = engine.lemmas.get(newUnpairedId)!;
    consume(engine.remaining, newUnpairedId);
    onBoard.add(newUnpairedId);
    const newSide = sideForSlot(openSlot, random);
    placeAt(openSlot, makeTile(newLemma, newSide));
    engine.unpairedLemmaId = newUnpairedId;
    engine.unpairedSide = newSide;
    return true;
  };

  if (
    freeSlots.length >= 2 &&
    engine.unpairedLemmaId !== null &&
    engine.unpairedSide !== null
  ) {
    const unpairedId = engine.unpairedLemmaId;
    const missingSide: Exclude<TileSide, 'empty'> =
      engine.unpairedSide === 'en' ? 'bridge' : 'en';
    const unpairedLemma = engine.lemmas.get(unpairedId);
    if (unpairedLemma) {
      const missingSlot = pickSlotForSide(freeSlots, missingSide, random);
      if (missingSlot !== null) {
        placeAt(missingSlot, makeTile(unpairedLemma, missingSide));
      }

      if (freeSlots.length > 0) {
        const openSlot = freeSlots[0]!;
        const newUnpairedId = pickLemmaWithRemaining(
          engine.remaining,
          new Set([unpairedId, ...onBoard]),
          random,
        );
        if (newUnpairedId !== null) {
          const newLemma = engine.lemmas.get(newUnpairedId)!;
          consume(engine.remaining, newUnpairedId);
          const newSide = sideForSlot(openSlot, random);
          placeAt(openSlot, makeTile(newLemma, newSide));
          engine.unpairedLemmaId = newUnpairedId;
          engine.unpairedSide = newSide;
        } else {
          const fillerId = pickLemmaWithRemaining(engine.remaining, new Set([unpairedId]), random);
          if (fillerId !== null) {
            consume(engine.remaining, fillerId);
            const filler = engine.lemmas.get(fillerId)!;
            const side = sideForSlot(openSlot, random);
            placeAt(openSlot, makeTile(filler, side));
            engine.unpairedLemmaId = fillerId;
            engine.unpairedSide = side;
          } else {
            engine.unpairedLemmaId = null;
            engine.unpairedSide = null;
            fillEmpties();
          }
        }
      }
    }
  } else {
    while (freeSlots.length > 0) {
      const openSlot = freeSlots[0]!;
      if (!placeNewUnpaired(openSlot)) break;
      // Only one unpaired half should exist on the board.
      break;
    }
    fillEmpties();
  }

  fillEmpties();
  engine.tiles = next;
  if (finalizeIfNoProgressLeft(engine, engine.tiles)) {
    return false;
  }
  return engine.successfulMatches < engine.targetMatches;
}

export function sessionResults(engine: MatchingEngine): Array<{
  vocabId: number;
  incorrect: number;
  avg_match_ms: number;
  match_count: number;
  board_absent_count: number;
  dont_know: boolean;
}> {
  const ids = new Set([
    ...engine.sessionIncorrect.keys(),
    ...engine.sessionMatchTimes.keys(),
    ...engine.sessionDontKnow,
    ...engine.sessionRemoved,
  ]);
  return [...ids].map((vocabId) => {
    const times = engine.sessionMatchTimes.get(vocabId) ?? [];
    const avg =
      times.length === 0 ? 0 : times.reduce((sum, ms) => sum + ms, 0) / times.length;
    const dontKnow = engine.sessionDontKnow.has(vocabId);
    const removed = engine.sessionRemoved.has(vocabId);
    return {
      vocabId,
      incorrect: engine.sessionIncorrect.get(vocabId) ?? 0,
      avg_match_ms: avg,
      match_count: times.length + (dontKnow || removed ? 1 : 0),
      board_absent_count: engine.sessionBoardAbsent.get(vocabId) ?? 0,
      dont_know: dontKnow,
      removed_from_deck: removed,
    };
  });
}
