import { describe, expect, it } from 'vitest';
import {
  BOARD_SLOT_SIDES,
  createMatchingEngine,
  isBoardAbsentCooldownActive,
  isPair,
  mateMissingFromBoard,
  refillAfterMatch,
  registerBoardAbsentSuccess,
  registerDontKnow,
  registerAutoDontKnow,
  registerIncorrect,
  registerRemoveFromDeck,
  registerSuccess,
  resolveMatch,
  slotAllowsSide,
  type GameLemma,
} from './matchingEngine';

function lemma(id: number): GameLemma {
  return {
    id,
    headword: `h${id}`,
    english: `e${id}`,
    gloss_en: `e${id}`,
    cognatesByCode: {},
    ipa: null,
    bridge_language_code: 'ia',
  };
}

function pool(n: number): GameLemma[] {
  return Array.from({ length: n }, (_, i) => lemma(i + 1));
}

describe('matchingEngine', () => {
  it('builds a 9-tile board with four pairs and one unpaired side', () => {
    const eng = createMatchingEngine(pool(12), () => 0);
    expect(eng.tiles).toHaveLength(9);
    const byLemma = new Map<number, number>();
    for (const tile of eng.tiles) {
      byLemma.set(tile.lemmaId, (byLemma.get(tile.lemmaId) ?? 0) + 1);
    }
    const counts = [...byLemma.values()].sort((a, b) => b - a);
    expect(counts.filter((c) => c === 2)).toHaveLength(4);
    expect(counts.filter((c) => c === 1)).toHaveLength(1);
    expect(eng.targetMatches).toBe(24);
  });

  it('places English and target tiles according to the fixed board layout', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    expect(eng.tiles).toHaveLength(9);
    eng.tiles.forEach((tile, index) => {
      expect(slotAllowsSide(index, tile.side)).toBe(true);
    });
    expect(BOARD_SLOT_SIDES[0]).toBe('en');
    expect(BOARD_SLOT_SIDES[4]).toBe('either');
    expect(BOARD_SLOT_SIDES[8]).toBe('bridge');
  });

  it('randomizes the unmatched tile slot', () => {
    const eng = createMatchingEngine(pool(12), () => 0);
    const unmatchedId = [...new Set(eng.tiles.map((tile) => tile.lemmaId))].find(
      (id) => eng.tiles.filter((tile) => tile.lemmaId === id).length === 1,
    );
    expect(unmatchedId).toBeDefined();
    expect(eng.tiles.findIndex((tile) => tile.lemmaId === unmatchedId)).toBe(0);
  });

  it('detects matching EN/bridge sides of the same lemma', () => {
    const eng = createMatchingEngine(pool(12), () => 0);
    const pair = eng.tiles.filter((tile) => tile.lemmaId === eng.tiles[0]!.lemmaId);
    if (pair.length === 2) {
      expect(isPair(eng, pair[0]!, pair[1]!)).toBe(true);
    } else {
      const full = eng.tiles.find((tile) =>
        eng.tiles.some((other) => other.lemmaId === tile.lemmaId && other.side !== tile.side),
      )!;
      const mate = eng.tiles.find(
        (tile) => tile.lemmaId === full.lemmaId && tile.side !== full.side,
      )!;
      expect(isPair(eng, full, mate)).toBe(true);
      expect(isPair(eng, full, eng.tiles.find((t) => t.lemmaId !== full.lemmaId)!)).toBe(false);
    }
  });

  it('allows either EN tile when two lemmas share the same English gloss', () => {
    const lemmas: GameLemma[] = [
      {
        id: 1,
        headword: 'cosí',
        english: 'so',
        gloss_en: 'so',
        cognatesByCode: {},
        ipa: null,
        bridge_language_code: 'ia',
      },
      {
        id: 2,
        headword: 'accosí',
        english: 'so',
        gloss_en: 'so',
        cognatesByCode: {},
        ipa: null,
        bridge_language_code: 'ia',
      },
      ...pool(10).map((item, index) => ({
        ...item,
        id: index + 3,
        headword: `h${index + 3}`,
        english: `e${index + 3}`,
      })),
    ];
    const eng = createMatchingEngine(lemmas, () => 0.25);

    // Force both gloss-mates onto the board as complete pairs.
    const cosí = eng.lemmas.get(1)!;
    const accosí = eng.lemmas.get(2)!;
    eng.tiles[0] = {
      key: 'en-cosi',
      lemmaId: 1,
      side: 'en',
      text: 'so',
      color: 'yellow',
    };
    eng.tiles[1] = {
      key: 'en-accosi',
      lemmaId: 2,
      side: 'en',
      text: 'so',
      color: 'yellow',
    };
    eng.tiles[2] = {
      key: 'br-cosi',
      lemmaId: 1,
      side: 'bridge',
      text: cosí.headword,
      color: 'yellow',
    };
    eng.tiles[5] = {
      key: 'br-accosi',
      lemmaId: 2,
      side: 'bridge',
      text: accosí.headword,
      color: 'yellow',
    };

    const bridge = eng.tiles.find((tile) => tile.key === 'br-cosi')!;
    const otherSo = eng.tiles.find((tile) => tile.key === 'en-accosi')!;
    expect(isPair(eng, bridge, otherSo)).toBe(true);

    const resolved = resolveMatch(eng, bridge, otherSo)!;
    expect(resolved.lemmaId).toBe(1);
    expect(resolved.keys.sort()).toEqual(['br-cosi', 'en-accosi'].sort());
    // Leftover EN "so" now belongs to accosí so it can still be matched.
    expect(eng.tiles.find((tile) => tile.key === 'en-cosi')!.lemmaId).toBe(2);
  });

  it('does not cross-match distinct glosses that merely share a lemma id mismatch', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const en = eng.tiles.find((tile) => tile.side === 'en')!;
    const bridge = eng.tiles.find(
      (tile) => tile.side === 'bridge' && tile.lemmaId !== en.lemmaId,
    )!;
    expect(isPair(eng, en, bridge)).toBe(false);
  });

  it('refills two tiles after a successful match', () => {
    let flip = 0;
    const random = () => {
      flip += 1;
      return flip % 2 === 0 ? 0.9 : 0.1;
    };
    const eng = createMatchingEngine(pool(12), random);
    const a = eng.tiles.find((tile) => tile.side === 'en')!;
    const b = eng.tiles.find((tile) => tile.lemmaId === a.lemmaId && tile.side === 'bridge')!;
    registerSuccess(eng, a.lemmaId, 500);
    const ok = refillAfterMatch(eng, [a.key, b.key], random);
    expect(ok).toBe(true);
    expect(eng.tiles).toHaveLength(9);
    expect(eng.successfulMatches).toBe(1);
    eng.tiles.forEach((tile, index) => {
      expect(slotAllowsSide(index, tile.side)).toBe(true);
    });
  });

  it('deals every lemma’s first appearance before any second appearance', () => {
    const eng = createMatchingEngine(pool(12), () => 0.15);
    expect([...eng.remaining.values()].filter((left) => left === 2)).toHaveLength(7);

    let guard = 0;
    while ([...eng.remaining.values()].some((left) => left === 2) && guard < 50) {
      guard += 1;
      // While unseen lemmas remain, nobody should have used both appearances.
      expect([...eng.remaining.values()].every((left) => left >= 1)).toBe(true);

      const paired = eng.tiles.find(
        (tile) =>
          tile.side === 'en' &&
          eng.tiles.some(
            (other) => other.lemmaId === tile.lemmaId && other.side === 'bridge',
          ),
      );
      if (!paired) break;
      const mate = eng.tiles.find(
        (tile) => tile.lemmaId === paired.lemmaId && tile.side === 'bridge',
      )!;
      const unseenBefore = new Set(
        [...eng.remaining.entries()].filter(([, left]) => left === 2).map(([id]) => id),
      );
      const onBoardBefore = new Set(
        eng.tiles.filter((tile) => tile.side !== 'empty').map((tile) => tile.lemmaId),
      );
      registerSuccess(eng, paired.lemmaId, 100);
      const ok = refillAfterMatch(eng, [paired.key, mate.key], () => 0.15);
      expect(ok).toBe(true);

      if (unseenBefore.size === 0) break;
      const newlyDealt = eng.tiles
        .filter((tile) => tile.side !== 'empty' && !onBoardBefore.has(tile.lemmaId))
        .map((tile) => tile.lemmaId);
      for (const id of newlyDealt) {
        expect(unseenBefore.has(id)).toBe(true);
        expect(eng.remaining.get(id)).toBe(1);
      }
    }

    expect([...eng.remaining.values()].every((left) => left <= 1)).toBe(true);
  });

  it('keeps unmatched tiles in the same board slots after refill', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const a = eng.tiles.find((tile) => tile.side === 'en')!;
    const b = eng.tiles.find((tile) => tile.lemmaId === a.lemmaId && tile.side === 'bridge')!;
    const beforeKeys = eng.tiles.map((tile) => tile.key);
    const kept = beforeKeys.filter((key) => key !== a.key && key !== b.key);
    registerSuccess(eng, a.lemmaId, 400);
    refillAfterMatch(eng, [a.key, b.key], () => 0.25);
    expect(eng.tiles).toHaveLength(9);
    for (const key of kept) {
      expect(eng.tiles.findIndex((tile) => tile.key === key)).toBe(beforeKeys.indexOf(key));
    }
    expect(eng.tiles.some((tile) => tile.key === a.key)).toBe(false);
    expect(eng.tiles.some((tile) => tile.key === b.key)).toBe(false);
  });

  it('tracks incorrect attempts on both lemmas', () => {
    const eng = createMatchingEngine(pool(12), () => 0);
    const a = eng.tiles[0]!;
    const b = eng.tiles.find((tile) => tile.lemmaId !== a.lemmaId)!;
    expect(registerIncorrect(eng, a, b)).toEqual([]);
    expect(eng.incorrectAttempts).toBe(1);
    expect(eng.sessionIncorrect.get(a.lemmaId)).toBe(1);
    expect(eng.sessionIncorrect.get(b.lemmaId)).toBe(1);
    expect(eng.consecutiveIncorrect.get(a.lemmaId)).toBe(1);
  });

  it('flags a lemma for auto don’t-know after two consecutive misses before any correct pair', () => {
    const eng = createMatchingEngine(pool(12), () => 0);
    const a = eng.tiles[0]!;
    const b = eng.tiles.find((tile) => tile.lemmaId !== a.lemmaId)!;
    const c = eng.tiles.find(
      (tile) => tile.lemmaId !== a.lemmaId && tile.lemmaId !== b.lemmaId,
    )!;
    expect(registerIncorrect(eng, a, b)).toEqual([]);
    expect(registerIncorrect(eng, a, c)).toEqual([a.lemmaId]);
    expect(eng.consecutiveIncorrect.get(a.lemmaId)).toBe(2);
    expect(eng.consecutiveIncorrect.get(b.lemmaId)).toBe(1);
    expect(eng.consecutiveIncorrect.get(c.lemmaId)).toBe(1);
  });

  it('clears the double-miss streak after any correct pair', () => {
    const eng = createMatchingEngine(pool(12), () => 0);
    const a = eng.tiles[0]!;
    const b = eng.tiles.find((tile) => tile.lemmaId !== a.lemmaId)!;
    registerIncorrect(eng, a, b);
    registerSuccess(eng, b.lemmaId, 200);
    expect(eng.consecutiveIncorrect.size).toBe(0);
    const c = eng.tiles.find(
      (tile) => tile.lemmaId !== a.lemmaId && tile.lemmaId !== b.lemmaId,
    )!;
    expect(registerIncorrect(eng, a, c)).toEqual([]);
    expect(eng.consecutiveIncorrect.get(a.lemmaId)).toBe(1);
  });

  it('auto don’t-know bans the lemma without adding another incorrect count', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const paired = eng.tiles.find(
      (tile) => tile.side === 'en' && tile.lemmaId !== eng.unpairedLemmaId,
    )!;
    const other = eng.tiles.find((tile) => tile.lemmaId !== paired.lemmaId)!;
    registerIncorrect(eng, paired, other);
    registerIncorrect(eng, paired, other);
    const beforeIncorrect = eng.incorrectAttempts;
    const keys = registerAutoDontKnow(eng, paired.lemmaId);
    expect(keys).toHaveLength(2);
    expect(eng.sessionDontKnow.has(paired.lemmaId)).toBe(true);
    expect(eng.remaining.get(paired.lemmaId)).toBe(0);
    expect(eng.incorrectAttempts).toBe(beforeIncorrect);
    expect(eng.consecutiveIncorrect.has(paired.lemmaId)).toBe(false);
  });

  it('always completes the unpaired lemma and introduces a new unpaired half', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const unpairedId = eng.unpairedLemmaId!;
    const unpairedSide = eng.unpairedSide!;
    const missingSide = unpairedSide === 'en' ? 'bridge' : 'en';
    const a = eng.tiles.find((tile) => tile.side === 'en' && tile.lemmaId !== unpairedId)!;
    const b = eng.tiles.find((tile) => tile.lemmaId === a.lemmaId && tile.side === 'bridge')!;
    registerSuccess(eng, a.lemmaId, 300);
    refillAfterMatch(eng, [a.key, b.key], () => 0.1);
    expect(eng.tiles.some((tile) => tile.lemmaId === unpairedId && tile.side === missingSide)).toBe(
      true,
    );
    expect(eng.tiles.filter((tile) => tile.lemmaId === unpairedId)).toHaveLength(2);
    expect(eng.unpairedLemmaId).not.toBe(unpairedId);
    expect(eng.unpairedLemmaId).not.toBeNull();
    expect(eng.tiles.filter((tile) => tile.lemmaId === eng.unpairedLemmaId)).toHaveLength(1);
    eng.tiles.forEach((tile, index) => {
      expect(slotAllowsSide(index, tile.side)).toBe(true);
    });
  });

  it('fills vacated slots with empty grey tiles when the pool is exhausted', () => {
    const eng = createMatchingEngine(pool(5), () => 0.25);
    // Burn remaining appearances so refills cannot introduce new lemmas.
    for (const id of eng.remaining.keys()) {
      eng.remaining.set(id, 0);
    }
    const a = eng.tiles.find((tile) => tile.side === 'en' && tile.lemmaId !== eng.unpairedLemmaId)!;
    const b = eng.tiles.find((tile) => tile.lemmaId === a.lemmaId && tile.side === 'bridge')!;
    registerSuccess(eng, a.lemmaId, 200);
    const ok = refillAfterMatch(eng, [a.key, b.key], () => 0.25);
    expect(ok).toBe(true);
    expect(eng.tiles).toHaveLength(9);
    expect(eng.tiles.some((tile) => tile.side === 'empty' && tile.color === 'grey')).toBe(true);
  });

  it('treats unpaired tiles as missing their mate', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const unpaired = eng.tiles.find((tile) => tile.lemmaId === eng.unpairedLemmaId)!;
    expect(mateMissingFromBoard(eng, unpaired)).toBe(true);
    const paired = eng.tiles.find(
      (tile) => tile.side === 'en' && tile.lemmaId !== eng.unpairedLemmaId,
    )!;
    expect(mateMissingFromBoard(eng, paired)).toBe(false);
  });

  it('bans remaining appearances after a board-absent resolution', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const unpaired = eng.tiles.find((tile) => tile.lemmaId === eng.unpairedLemmaId)!;
    eng.remaining.set(unpaired.lemmaId, 2);
    const keys = registerBoardAbsentSuccess(eng, unpaired.lemmaId, 100);
    expect(eng.remaining.get(unpaired.lemmaId)).toBe(0);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => eng.tiles.some((tile) => tile.key === key))).toBe(true);
  });

  it('removes every on-board tile of a banned lemma (both sides of the pair)', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const paired = eng.tiles.find(
      (tile) => tile.side === 'en' && tile.lemmaId !== eng.unpairedLemmaId,
    )!;
    eng.remaining.set(paired.lemmaId, 1);
    const keys = registerDontKnow(eng, paired.lemmaId);
    expect(keys).toHaveLength(2);
    expect(eng.remaining.get(paired.lemmaId)).toBe(0);
    expect(eng.tiles.filter((tile) => keys.includes(tile.key))).toHaveLength(2);
  });

  it('bans a lemma via remove-from-deck without counting an incorrect attempt', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const paired = eng.tiles.find(
      (tile) => tile.side === 'en' && tile.lemmaId !== eng.unpairedLemmaId,
    )!;
    const beforeIncorrect = eng.incorrectAttempts;
    const keys = registerRemoveFromDeck(eng, paired.lemmaId);
    expect(keys).toHaveLength(2);
    expect(eng.remaining.get(paired.lemmaId)).toBe(0);
    expect(eng.sessionRemoved.has(paired.lemmaId)).toBe(true);
    expect(eng.incorrectAttempts).toBe(beforeIncorrect);
    expect(eng.sessionDontKnow.has(paired.lemmaId)).toBe(false);
  });

  it('keeps board-absent cooldown while the replacement lemma is still unpaired', () => {
    const eng = createMatchingEngine(pool(12), () => 0.25);
    const unpairedId = eng.unpairedLemmaId!;
    expect(isBoardAbsentCooldownActive(eng, unpairedId)).toBe(true);
    const mateSide = eng.unpairedSide === 'en' ? 'bridge' : 'en';
    const lemma = eng.lemmas.get(unpairedId)!;
    eng.tiles[0] = {
      key: 'mate',
      lemmaId: unpairedId,
      side: mateSide,
      text: mateSide === 'en' ? lemma.english : lemma.headword,
      color: 'yellow',
    };
    expect(isBoardAbsentCooldownActive(eng, unpairedId)).toBe(false);
  });
});
