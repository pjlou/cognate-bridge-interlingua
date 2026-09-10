import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  aggregateGameStats,
  downloadGameStats,
  gradeFromSessionResult,
  loadGameStats,
  parseGameStatsJson,
  recordGameSession,
  saveGameStats,
  type BridgeGameStats,
  type SessionWordResult,
  MAX_LEMMAS,
  MIN_LEMMAS,
} from '../lib/gameStats';
import {
  createMatchingEngine,
  markTiles,
  mateMissingFromBoard,
  refillAfterMatch,
  registerBoardAbsentSuccess,
  registerDontKnow,
  registerAutoDontKnow,
  registerIncorrect,
  registerRemoveFromDeck,
  registerSuccess,
  resolveMatch,
  sessionResults,
  setTileTexts,
  translationForTile,
  isBoardAbsentCooldownActive,
  type BoardTile,
  type GameLemma,
  type MatchingEngine,
} from '../lib/matchingEngine';
import CorrespondencePanel, { SoundLawStack } from '../components/CorrespondencePanel';
import {
  ROMANCE_HINT_LANGS,
  readHintRevealPref,
  readHintRevealSwap,
  resolveHintReveal,
  writeHintRevealPref,
  writeHintRevealSwap,
  type HintRevealPref,
} from '../lib/matchHintReveal';
import { partOfSpeechLabel, groupPartsOfSpeechForGame, normalizeGamePosFilter } from '../lib/partOfSpeech';
import { formatDelayUntil } from '../lib/scheduleFormat';
import {
  cancelBridgeSpeech,
  readRomanceVoicePref,
  speakBridgeWord,
  writeRomanceVoicePref,
  type RomanceVoicePref,
} from '../lib/speakBridgeWord';
import {
  getGameLemmas,
  getPartsOfSpeech,
  previewScheduleUpdates,
  recordReview,
  setVocabularyRemoved,
  type Cognate,
  type CorrespondenceRule,
  type SchedulePreviewRow,
  type VocabularyItem,
} from '../services/api';
import { errorMessage } from '../lib/errorMessage';
import './GamesPage.css';

type Phase = 'setup' | 'countdown' | 'play' | 'summary';
type EnglishCognateFilter = 'all' | 'with' | 'without';

const GAME_COGNATE_KEY = 'cb.gameEnglishCognates';
const GAME_POS_KEY = 'cb.gamePartOfSpeech';

function readCognateFilter(): EnglishCognateFilter {
  try {
    const stored = localStorage.getItem(GAME_COGNATE_KEY);
    if (stored === 'with' || stored === 'without' || stored === 'all') return stored;
  } catch {
    /* private mode */
  }
  return 'all';
}

function readPosFilter(): string {
  try {
    return normalizeGamePosFilter(localStorage.getItem(GAME_POS_KEY) ?? '');
  } catch {
    return '';
  }
}

function englishLabel(item: VocabularyItem): string {
  const en = item.cognates.find((c) => c.target_language.code === 'en');
  return en?.target_word ?? item.gloss_en;
}

function toLemma(item: VocabularyItem): GameLemma {
  const cognatesByCode: Record<string, string> = {};
  for (const cognate of item.cognates) {
    const code = cognate.target_language.code;
    if (!cognatesByCode[code]) cognatesByCode[code] = cognate.target_word;
  }
  return {
    id: item.id,
    headword: item.headword,
    english: englishLabel(item),
    gloss_en: englishLabel(item),
    cognatesByCode,
    ipa: item.ipa,
    ipa_source: item.ipa_source,
    bridge_language_code: item.bridge_language_code,
  };
}

function englishCognatesOf(card: VocabularyItem): Cognate[] {
  return card.cognates.filter((cognate) => cognate.target_language.code === 'en');
}

function selectedLanguageCognatesOf(card: VocabularyItem): Cognate[] {
  return card.cognates.filter((cognate) => cognate.target_language.code !== 'en');
}

function knownPromptOf(card: VocabularyItem): string {
  return englishCognatesOf(card)[0]?.target_word ?? card.gloss_en;
}

function rulesFromCognates(cognates: Cognate[]): CorrespondenceRule[] {
  const seen = new Set<number>();
  const rules: CorrespondenceRule[] = [];
  for (const cognate of cognates) {
    const list = cognate.rules?.length ? cognate.rules : cognate.rule ? [cognate.rule] : [];
    for (const rule of list) {
      if (!rule || seen.has(rule.id)) continue;
      seen.add(rule.id);
      rules.push(rule);
    }
  }
  return rules;
}

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function loadLemmaPool(
  bridge: string,
  count: number,
  englishCognates: EnglishCognateFilter,
  partOfSpeech: string,
): Promise<{ lemmas: GameLemma[]; itemsById: Map<number, VocabularyItem> }> {
  const items = await getGameLemmas(bridge, {
    limit: count,
    englishCognates,
    partOfSpeech: partOfSpeech || null,
  });
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const lemmas = items
    .map((item) => toLemma(item))
    .filter((lemma) => Boolean(lemma.english.trim()));
  return { lemmas, itemsById };
}

export default function GamesPage() {
  const { bridge = '' } = useParams<{ bridge: string }>();
  const [hintRevealPref, setHintRevealPref] = useState<HintRevealPref>(() =>
    readHintRevealPref(bridge),
  );
  const [hintRevealSwap, setHintRevealSwap] = useState(() => readHintRevealSwap(bridge));
  const [lemmaCount, setLemmaCount] = useState(18);
  const [englishCognates, setEnglishCognates] = useState<EnglishCognateFilter>(readCognateFilter);
  const [partOfSpeech, setPartOfSpeech] = useState(readPosFilter);
  const [partsOfSpeech, setPartsOfSpeech] = useState<string[]>([]);
  const [categoryCount, setCategoryCount] = useState<number | null>(null);
  const [checkingCategory, setCheckingCategory] = useState(false);
  const [sessionPool, setSessionPool] = useState<GameLemma[]>([]);
  const [vocabById, setVocabById] = useState<Map<number, VocabularyItem>>(() => new Map());
  const [phase, setPhase] = useState<Phase>('setup');
  const [countdownFading, setCountdownFading] = useState(false);
  const [engine, setEngine] = useState<MatchingEngine | null>(null);
  const [selected, setSelected] = useState<BoardTile[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedLemmaId, setPausedLemmaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [romanceVoice, setRomanceVoice] = useState<RomanceVoicePref>(readRomanceVoicePref);
  const [stats, setStats] = useState<BridgeGameStats>(() => loadGameStats(bridge));
  const [summary, setSummary] = useState<{
    totalMs: number;
    accuracy: number;
    results: SessionWordResult[];
    missed: Array<{ id: number; headword: string; english: string }>;
    scheduleUpdates: Array<{ id: number; grade: NonNullable<ReturnType<typeof gradeFromSessionResult>>; tier: 1 }>;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreviewRow[]>([]);
  const [schedulePreviewLoading, setSchedulePreviewLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [boardAbsentCooldownLemmaId, setBoardAbsentCooldownLemmaId] = useState<number | null>(
    null,
  );

  const playStartedAt = useRef(0);
  const lastMatchAt = useRef(0);
  const pausedMsAccum = useRef(0);
  const pauseStartedAt = useRef<number | null>(null);
  const engineRef = useRef<MatchingEngine | null>(null);
  const selectedRef = useRef<BoardTile[]>([]);
  const blueHoldTimers = useRef<number[]>([]);
  const refillChain = useRef(Promise.resolve());
  const [fadingKeys, setFadingKeys] = useState<Set<string>>(() => new Set());
  const redFadeTimers = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    setHintRevealPref(readHintRevealPref(bridge));
    setHintRevealSwap(readHintRevealSwap(bridge));
  }, [bridge]);

  function activePausedMs(now = performance.now()): number {
    let paused = pausedMsAccum.current;
    if (pauseStartedAt.current !== null) {
      paused += now - pauseStartedAt.current;
    }
    return paused;
  }

  function elapsedPlayMs(now = performance.now()): number {
    return Math.max(0, now - playStartedAt.current - activePausedMs(now));
  }

  function matchIntervalMs(now = performance.now()): number {
    return Math.max(0, now - lastMatchAt.current);
  }

  function resetPauseClock(): void {
    pausedMsAccum.current = 0;
    pauseStartedAt.current = null;
    setIsPaused(false);
    setPausedLemmaId(null);
  }

  function clearRedFadeTimers(keys?: string[]): void {
    const entries = keys
      ? keys.map((key) => [key, redFadeTimers.current.get(key)] as const)
      : [...redFadeTimers.current.entries()];
    for (const [key, timers] of entries) {
      timers?.forEach((id) => window.clearTimeout(id));
      redFadeTimers.current.delete(key);
    }
    if (!keys) {
      setFadingKeys(new Set());
      return;
    }
    setFadingKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
  }

  function scheduleRedFade(keys: string[]): void {
    clearRedFadeTimers(keys);
    for (const key of keys) {
      const startFade = window.setTimeout(() => {
        setFadingKeys((prev) => new Set(prev).add(key));
      }, 1000);
      const finishFade = window.setTimeout(() => {
        setEngine((current) => {
          if (!current) return current;
          const tile = current.tiles.find((t) => t.key === key);
          if (!tile || tile.color !== 'red') return current;
          markTiles(current, [key], 'yellow');
          return { ...current, tiles: [...current.tiles] };
        });
        setFadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        redFadeTimers.current.delete(key);
      }, 3000);
      redFadeTimers.current.set(key, [startFade, finishFade]);
    }
  }

  function snapAllRedToYellow(eng: MatchingEngine): void {
    clearRedFadeTimers();
    const redKeys = eng.tiles.filter((t) => t.color === 'red').map((t) => t.key);
    if (redKeys.length === 0) return;
    markTiles(eng, redKeys, 'yellow');
  }

  useEffect(() => {
    setStats(loadGameStats(bridge));
    setRomanceVoice(readRomanceVoicePref());
    setPhase('setup');
    setEngine(null);
    setSummary(null);
    setApplied(false);
    setApplyMessage(null);
    setSchedulePreview([]);
    setError(null);
    clearRedFadeTimers();
    blueHoldTimers.current.forEach((id) => window.clearTimeout(id));
    blueHoldTimers.current = [];
    void getPartsOfSpeech(bridge)
      .then((codes) => setPartsOfSpeech(groupPartsOfSpeechForGame(codes)))
      .catch(() => setPartsOfSpeech([]));
  }, [bridge]);

  useEffect(() => {
    let cancelled = false;
    setCheckingCategory(true);
    setCategoryCount(null);
    void loadLemmaPool(bridge, lemmaCount, englishCognates, partOfSpeech)
      .then((result) => {
        if (!cancelled) setCategoryCount(result.lemmas.length);
      })
      .catch(() => {
        if (!cancelled) setCategoryCount(0);
      })
      .finally(() => {
        if (!cancelled) setCheckingCategory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, lemmaCount, englishCognates, partOfSpeech]);

  useEffect(
    () => () => {
      cancelBridgeSpeech();
      clearRedFadeTimers();
      blueHoldTimers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'countdown') return;
    setCountdownFading(false);
    const fadeId = window.setTimeout(() => setCountdownFading(true), 500);
    const playId = window.setTimeout(() => {
      playStartedAt.current = performance.now();
      lastMatchAt.current = playStartedAt.current;
      pausedMsAccum.current = 0;
      pauseStartedAt.current = null;
      setIsPaused(false);
      setPausedLemmaId(null);
      setPhase('play');
      setCountdownFading(false);
    }, 1000);
    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(playId);
    };
  }, [phase]);

  const finishGame = useCallback(
    (eng: MatchingEngine) => {
      const totalMs = elapsedPlayMs();
      const attempts = eng.successfulMatches + eng.incorrectAttempts;
      const accuracy = attempts === 0 ? 1 : eng.successfulMatches / attempts;
      const results = sessionResults(eng);
      const missed = [...eng.sessionDontKnow]
        .map((id) => {
          const lemma = eng.lemmas.get(id);
          if (!lemma) return null;
          return { id, headword: lemma.headword, english: lemma.english };
        })
        .filter((row): row is { id: number; headword: string; english: string } => row !== null)
        .sort((a, b) => a.headword.localeCompare(b.headword));

      const statsBefore = loadGameStats(bridge);
      const scheduleUpdates = results
        .map((result) => {
          const streak = statsBefore.words[String(result.vocabId)]?.consecutive_correct_games ?? 0;
          const grade = gradeFromSessionResult(result, streak);
          if (!grade) return null;
          return { id: result.vocabId, grade, tier: 1 as const };
        })
        .filter(
          (
            row,
          ): row is {
            id: number;
            grade: NonNullable<ReturnType<typeof gradeFromSessionResult>>;
            tier: 1;
          } => row !== null,
        );

      setSummary({ totalMs, accuracy, results, missed, scheduleUpdates });
      setPhase('summary');
      setSelected([]);
      selectedRef.current = [];
      setActionNotice(null);
      setActionBusy(false);
      setBoardAbsentCooldownLemmaId(null);
      resetPauseClock();
      clearRedFadeTimers();
      blueHoldTimers.current.forEach((id) => window.clearTimeout(id));
      blueHoldTimers.current = [];

      const next = recordGameSession(
        statsBefore,
        {
          lemmas: eng.lemmas.size,
          total_ms: totalMs,
          accuracy,
          applied_to_srs: false,
        },
        results,
      );
      saveGameStats(next);
      setStats(next);

      setSchedulePreview([]);
      if (scheduleUpdates.length === 0) {
        setSchedulePreviewLoading(false);
        return;
      }
      setSchedulePreviewLoading(true);
      void previewScheduleUpdates(scheduleUpdates)
        .then((preview) => setSchedulePreview(preview))
        .catch(() => setSchedulePreview([]))
        .finally(() => setSchedulePreviewLoading(false));
    },
    [bridge],
  );

  const categoryHasEnough =
    categoryCount !== null && categoryCount >= lemmaCount && categoryCount >= 5;
  const categoryShortageMessage =
    categoryCount === null
      ? 'Not enough words in this category'
      : categoryCount === 1
        ? 'Only 1 word in this category'
        : `Only ${categoryCount} words in this category`;

  function beginWithPool(
    pool: GameLemma[],
    itemsById: Map<number, VocabularyItem> = new Map(),
  ): void {
    const eng = createMatchingEngine(pool);
    engineRef.current = eng;
    setSessionPool(pool);
    setVocabById(itemsById);
    setEngine(eng);
    setSelected([]);
    selectedRef.current = [];
    setSummary(null);
    setApplied(false);
    setApplyMessage(null);
    setSchedulePreview([]);
    setError(null);
    setActionNotice(null);
    setActionBusy(false);
    setBoardAbsentCooldownLemmaId(null);
    resetPauseClock();
    clearRedFadeTimers();
    blueHoldTimers.current.forEach((id) => window.clearTimeout(id));
    blueHoldTimers.current = [];
    setPhase('countdown');
  }

  async function startGame(): Promise<void> {
    setError(null);
    setLoading(true);
    setApplied(false);
    setApplyMessage(null);
    setSchedulePreview([]);
    setSummary(null);
    try {
      const { lemmas, itemsById } = await loadLemmaPool(
        bridge,
        lemmaCount,
        englishCognates,
        partOfSpeech,
      );
      if (lemmas.length < lemmaCount || lemmas.length < 5) {
        setCategoryCount(lemmas.length);
        setError(
          lemmas.length === 1
            ? 'Only 1 word in this category'
            : `Only ${lemmas.length} words in this category`,
        );
        return;
      }
      const pool = lemmas.slice(0, lemmaCount);
      const poolIds = new Set(pool.map((lemma) => lemma.id));
      const scopedItems = new Map(
        [...itemsById.entries()].filter(([id]) => poolIds.has(id)),
      );
      beginWithPool(pool, scopedItems);
    } catch (caught) {
      const message = errorMessage(caught, 'Could not start the game.');
      if (/not enough|at least 5/i.test(message)) {
        setError(categoryShortageMessage);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  function replaySameLemmas(): void {
    if (sessionPool.length < 5) return;
    beginWithPool(sessionPool, vocabById);
  }

  async function playNextBatch(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const exclude = new Set(sessionPool.map((lemma) => lemma.id));
      const fetchCount = Math.min(MAX_LEMMAS, lemmaCount + exclude.size);
      const { lemmas, itemsById } = await loadLemmaPool(
        bridge,
        fetchCount,
        englishCognates,
        partOfSpeech,
      );
      const next = lemmas.filter((lemma) => !exclude.has(lemma.id)).slice(0, lemmaCount);
      if (next.length < lemmaCount || next.length < 5) {
        setError(
          next.length === 1
            ? 'Only 1 word in this category'
            : `Only ${next.length} words in this category`,
        );
        setPhase('setup');
        setEngine(null);
        setSummary(null);
        setCategoryCount(next.length);
        return;
      }
      const nextIds = new Set(next.map((lemma) => lemma.id));
      const scopedItems = new Map(
        [...itemsById.entries()].filter(([id]) => nextIds.has(id)),
      );
      beginWithPool(next, scopedItems);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not start the game.'));
    } finally {
      setLoading(false);
    }
  }

  function syncBoardAbsentCooldown(eng: MatchingEngine, nextCooldownId?: number | null): void {
    setBoardAbsentCooldownLemmaId((prev) => {
      const candidate = nextCooldownId !== undefined ? nextCooldownId : prev;
      if (!isBoardAbsentCooldownActive(eng, candidate)) return null;
      return candidate;
    });
  }

  function completeRemovalHold(
    matchedKeys: string[],
    options: { armBoardAbsentCooldown?: boolean } = {},
  ): void {
    refillChain.current = refillChain.current.then(() => {
      const eng = engineRef.current;
      if (!eng) return;
      snapAllRedToYellow(eng);
      const stillGoing = refillAfterMatch(eng, matchedKeys);
      setSelected((prev) =>
        prev.filter((tile) => eng.tiles.some((board) => board.key === tile.key)),
      );
      setActionBusy(false);
      if (options.armBoardAbsentCooldown) {
        // Replacement unpaired half (if any) must be paired before board-absent can be used again.
        syncBoardAbsentCooldown(eng, eng.unpairedLemmaId);
      } else {
        syncBoardAbsentCooldown(eng);
      }
      if (!stillGoing || eng.successfulMatches >= eng.targetMatches) {
        clearRedFadeTimers();
        setBoardAbsentCooldownLemmaId(null);
        finishGame(eng);
        return;
      }
      setEngine({
        ...eng,
        tiles: [...eng.tiles],
        remaining: new Map(eng.remaining),
        sessionDontKnow: new Set(eng.sessionDontKnow),
        sessionRemoved: new Set(eng.sessionRemoved),
        sessionBoardAbsent: new Map(eng.sessionBoardAbsent),
      });
    });
  }

  function completeBlueHold(matchedKeys: string[]): void {
    refillChain.current = refillChain.current.then(() => {
      const eng = engineRef.current;
      if (!eng) return;
      const stillBlue = matchedKeys.every((key) =>
        eng.tiles.some((tile) => tile.key === key && tile.color === 'blue'),
      );
      if (!stillBlue) return;

      snapAllRedToYellow(eng);
      const stillGoing = refillAfterMatch(eng, matchedKeys);
      setSelected((prev) =>
        prev.filter((tile) => eng.tiles.some((board) => board.key === tile.key)),
      );
      syncBoardAbsentCooldown(eng);
      if (!stillGoing || eng.successfulMatches >= eng.targetMatches) {
        clearRedFadeTimers();
        setBoardAbsentCooldownLemmaId(null);
        finishGame(eng);
        return;
      }
      setEngine({
        ...eng,
        tiles: [...eng.tiles],
        remaining: new Map(eng.remaining),
        sessionDontKnow: new Set(eng.sessionDontKnow),
        sessionRemoved: new Set(eng.sessionRemoved),
        sessionBoardAbsent: new Map(eng.sessionBoardAbsent),
      });
    });
  }

  function onDontKnowWord(): void {
    const eng = engineRef.current;
    if (!eng || phase !== 'play' || actionBusy || isPaused) return;
    const currentSelected = selectedRef.current.filter(
      (tile) => tile.side !== 'empty' && tile.color !== 'blue' && tile.color !== 'grey',
    );
    if (currentSelected.length === 0) {
      setActionNotice('No card selected');
      return;
    }
    const tile = currentSelected[0]!;
    if (!eng.tiles.some((t) => t.key === tile.key && t.color !== 'blue')) {
      setActionNotice('No card selected');
      return;
    }

    setActionNotice(null);
    setActionBusy(true);
    selectedRef.current = [];
    setSelected([]);

    const translation = translationForTile(eng, tile);
    const removeKeys = registerDontKnow(eng, tile.lemmaId);
    clearRedFadeTimers(removeKeys);
    setTileTexts(eng, [{ key: tile.key, text: translation }]);
    markTiles(eng, removeKeys, 'red');
    lastMatchAt.current = performance.now();
    setEngine({
      ...eng,
      tiles: [...eng.tiles],
      remaining: new Map(eng.remaining),
      sessionDontKnow: new Set(eng.sessionDontKnow),
      sessionRemoved: new Set(eng.sessionRemoved),
      sessionIncorrect: new Map(eng.sessionIncorrect),
    });

    const timerId = window.setTimeout(() => {
      blueHoldTimers.current = blueHoldTimers.current.filter((id) => id !== timerId);
      completeRemovalHold(removeKeys);
    }, 1000);
    blueHoldTimers.current.push(timerId);
  }

  async function onRemoveFromDeck(): Promise<void> {
    const eng = engineRef.current;
    if (!eng || phase !== 'play' || actionBusy || isPaused) return;
    const currentSelected = selectedRef.current.filter(
      (tile) => tile.side !== 'empty' && tile.color !== 'blue' && tile.color !== 'grey',
    );
    if (currentSelected.length === 0) {
      setActionNotice('No card selected');
      return;
    }
    const tile = currentSelected[0]!;
    if (!eng.tiles.some((t) => t.key === tile.key && t.color !== 'blue')) {
      setActionNotice('No card selected');
      return;
    }

    setActionNotice(null);
    setActionBusy(true);
    selectedRef.current = [];
    setSelected([]);

    try {
      await setVocabularyRemoved(tile.lemmaId, 1, true);
    } catch (caught) {
      setActionBusy(false);
      setActionNotice(errorMessage(caught, 'Could not remove from deck'));
      return;
    }

    const translation = translationForTile(eng, tile);
    const removeKeys = registerRemoveFromDeck(eng, tile.lemmaId);
    clearRedFadeTimers(removeKeys);
    setTileTexts(eng, [{ key: tile.key, text: translation }]);
    markTiles(eng, removeKeys, 'grey');
    lastMatchAt.current = performance.now();
    setEngine({
      ...eng,
      tiles: [...eng.tiles],
      remaining: new Map(eng.remaining),
      sessionRemoved: new Set(eng.sessionRemoved),
      sessionDontKnow: new Set(eng.sessionDontKnow),
    });

    const timerId = window.setTimeout(() => {
      blueHoldTimers.current = blueHoldTimers.current.filter((id) => id !== timerId);
      completeRemovalHold(removeKeys);
    }, 500);
    blueHoldTimers.current.push(timerId);
  }

  function onMatchNotOnBoard(): void {
    const eng = engineRef.current;
    if (!eng || phase !== 'play' || actionBusy || isPaused) return;
    if (isBoardAbsentCooldownActive(eng, boardAbsentCooldownLemmaId)) {
      setActionNotice('Match the new word before using this again');
      return;
    }
    const currentSelected = selectedRef.current.filter(
      (tile) => tile.side !== 'empty' && tile.color !== 'blue' && tile.color !== 'grey',
    );
    if (currentSelected.length === 0) {
      setActionNotice('No card selected');
      return;
    }
    const tile = currentSelected[0]!;
    if (!eng.tiles.some((t) => t.key === tile.key && t.color !== 'blue')) {
      setActionNotice('No card selected');
      return;
    }
    if (!mateMissingFromBoard(eng, tile)) {
      setActionNotice('Match is on the board');
      return;
    }

    setActionNotice(null);
    selectedRef.current = [];
    setSelected([]);
    const translation = translationForTile(eng, tile);
    const matchMs = matchIntervalMs();
    const removeKeys = registerBoardAbsentSuccess(eng, tile.lemmaId, matchMs);
    clearRedFadeTimers(removeKeys);
    setTileTexts(eng, [{ key: tile.key, text: translation }]);
    markTiles(eng, removeKeys, 'blue');
    lastMatchAt.current = performance.now();
    setEngine({
      ...eng,
      tiles: [...eng.tiles],
      remaining: new Map(eng.remaining),
      sessionBoardAbsent: new Map(eng.sessionBoardAbsent),
      sessionMatchTimes: new Map(eng.sessionMatchTimes),
    });

    const timerId = window.setTimeout(() => {
      blueHoldTimers.current = blueHoldTimers.current.filter((id) => id !== timerId);
      completeRemovalHold(removeKeys, { armBoardAbsentCooldown: true });
    }, 1000);
    blueHoldTimers.current.push(timerId);
  }

  async function onTileClick(tile: BoardTile): Promise<void> {
    const eng = engineRef.current;
    if (!eng || phase !== 'play' || actionBusy || isPaused) return;
    if (tile.color === 'blue' || tile.color === 'grey' || tile.color === 'white' || tile.side === 'empty')
      return;
    setActionNotice(null);

    const currentSelected = selectedRef.current;
    if (currentSelected.some((s) => s.key === tile.key)) {
      const next = currentSelected.filter((s) => s.key !== tile.key);
      selectedRef.current = next;
      setSelected(next);
      return;
    }

    // Ignore clicks on tiles that are no longer on the board (stale after refill).
    if (!eng.tiles.some((board) => board.key === tile.key)) return;

    if (tile.side === 'bridge') {
      const lemma = eng.lemmas.get(tile.lemmaId);
      if (lemma) {
        let speechText = lemma.headword;
        let speechVoiceLang: HintRevealPref = 'off';
        if (hintRevealSwap && hintRevealPref !== 'off') {
          const resolution = resolveHintReveal(lemma, hintRevealPref);
          if (resolution.kind === 'peek') {
            speechText = resolution.text;
            speechVoiceLang = hintRevealPref;
          }
        }
        void speakBridgeWord({
          text: speechText,
          bridgeCode: lemma.bridge_language_code || bridge,
          voiceLang: speechVoiceLang === 'off' ? undefined : speechVoiceLang,
          ipa: speechVoiceLang === 'off' ? lemma.ipa : undefined,
          ipaSource: speechVoiceLang === 'off' ? lemma.ipa_source : undefined,
        });
      }
    }

    // English↔English or target↔target is not a valid attempt — switch selection.
    if (currentSelected.length === 1 && currentSelected[0]!.side === tile.side) {
      selectedRef.current = [tile];
      setSelected([tile]);
      return;
    }

    const nextSelected = [...currentSelected, tile];
    selectedRef.current = nextSelected;
    setSelected(nextSelected);
    if (nextSelected.length < 2) return;

    const [a, b] = nextSelected as [BoardTile, BoardTile];
    selectedRef.current = [];
    setSelected([]);

    // Either tile may have turned blue or been replaced since selection started.
    if (
      !eng.tiles.some((t) => t.key === a.key && t.color !== 'blue') ||
      !eng.tiles.some((t) => t.key === b.key && t.color !== 'blue')
    ) {
      return;
    }

    const resolved = resolveMatch(eng, a, b);
    if (resolved) {
      clearRedFadeTimers(resolved.keys);
      markTiles(eng, resolved.keys, 'blue');
      const matchMs = matchIntervalMs();
      registerSuccess(eng, resolved.lemmaId, matchMs);
      lastMatchAt.current = performance.now();
      setEngine({ ...eng, tiles: [...eng.tiles] });

      const timerId = window.setTimeout(() => {
        blueHoldTimers.current = blueHoldTimers.current.filter((id) => id !== timerId);
        completeBlueHold(resolved.keys);
      }, 1000);
      blueHoldTimers.current.push(timerId);
      return;
    }

    const autoDontKnowIds = registerIncorrect(eng, a, b);
    if (autoDontKnowIds.length === 0) {
      markTiles(eng, [a.key, b.key], 'red');
      setEngine({
        ...eng,
        tiles: [...eng.tiles],
        sessionIncorrect: new Map(eng.sessionIncorrect),
        consecutiveIncorrect: new Map(eng.consecutiveIncorrect),
      });
      scheduleRedFade([a.key, b.key]);
      return;
    }

    // Same lemma missed twice before any correct pair → treat like “I don’t know this word”.
    // Only that lemma’s pair goes red — not the wrong-match partner — so at most two reds.
    setActionBusy(true);
    const textUpdates: Array<{ key: string; text: string }> = [];
    const removeKeys: string[] = [];
    for (const lemmaId of autoDontKnowIds) {
      const showTile =
        eng.tiles.find(
          (tile) =>
            tile.side !== 'empty' &&
            tile.lemmaId === lemmaId &&
            tile.key !== b.key,
        ) ??
        [a, b].find((tile) => tile.lemmaId === lemmaId) ??
        eng.tiles.find((tile) => tile.side !== 'empty' && tile.lemmaId === lemmaId);
      if (showTile) {
        textUpdates.push({ key: showTile.key, text: translationForTile(eng, showTile) });
      }
      removeKeys.push(...registerAutoDontKnow(eng, lemmaId));
    }
    const uniqueRemoveKeys = [...new Set(removeKeys)];
    clearRedFadeTimers(uniqueRemoveKeys);
    setTileTexts(eng, textUpdates);
    markTiles(eng, uniqueRemoveKeys, 'red');
    lastMatchAt.current = performance.now();
    setEngine({
      ...eng,
      tiles: [...eng.tiles],
      remaining: new Map(eng.remaining),
      sessionDontKnow: new Set(eng.sessionDontKnow),
      sessionIncorrect: new Map(eng.sessionIncorrect),
      consecutiveIncorrect: new Map(eng.consecutiveIncorrect),
    });

    const timerId = window.setTimeout(() => {
      blueHoldTimers.current = blueHoldTimers.current.filter((id) => id !== timerId);
      completeRemovalHold(uniqueRemoveKeys);
    }, 1000);
    blueHoldTimers.current.push(timerId);
  }

  async function applyToSrs(): Promise<void> {
    if (!summary || applying || applied) return;
    setApplying(true);
    setApplyMessage(null);
    try {
      for (const update of summary.scheduleUpdates) {
        await recordReview(update.id, update.grade, update.tier);
      }
      const current = loadGameStats(bridge);
      if (current.sessions[0]) {
        current.sessions[0] = { ...current.sessions[0], applied_to_srs: true };
        saveGameStats(current);
        setStats(current);
      }
      setApplied(true);
      setApplyMessage('Scores added to your study schedule (tier 1).');
    } catch (caught) {
      setApplyMessage(errorMessage(caught, 'Could not update the study schedule.'));
    } finally {
      setApplying(false);
    }
  }

  function onDownload(): void {
    downloadGameStats(loadGameStats(bridge));
  }

  async function onUpload(file: File): Promise<void> {
    try {
      const text = await file.text();
      const parsed = parseGameStatsJson(text, bridge);
      saveGameStats(parsed);
      setStats(parsed);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not import game stats.'));
    }
  }

  function onPauseToggle(): void {
    if (phase !== 'play' || actionBusy) return;
    const now = performance.now();
    if (isPaused) {
      if (pauseStartedAt.current !== null) {
        const span = now - pauseStartedAt.current;
        pausedMsAccum.current += span;
        lastMatchAt.current += span;
        pauseStartedAt.current = null;
      }
      setIsPaused(false);
      setPausedLemmaId(null);
      return;
    }

    pauseStartedAt.current = now;
    const currentSelected = selectedRef.current.filter(
      (tile) => tile.side !== 'empty' && tile.color !== 'blue' && tile.color !== 'grey',
    );
    const lemmaId = currentSelected[0]?.lemmaId ?? null;
    selectedRef.current = [];
    setSelected([]);
    setPausedLemmaId(lemmaId);
    setIsPaused(true);
    setActionNotice(null);
  }

  function pauseButtonLabel(): string {
    if (isPaused) return 'Paused';
    if (hintRevealPref === 'off') return 'Pause';
    const tile = selected.find(
      (t) => t.side !== 'empty' && t.color !== 'blue' && t.color !== 'grey',
    );
    if (!tile || !engine) return 'Pause';
    const lemma = engine.lemmas.get(tile.lemmaId);
    if (!lemma) return 'Pause';
    if (hintRevealSwap) return lemma.headword;
    const resolution = resolveHintReveal(lemma, hintRevealPref);
    if (resolution.kind === 'peek') return resolution.text;
    if (resolution.kind === 'missing') return 'no cognate';
    return 'Pause';
  }

  function tileDisplayText(tile: BoardTile): string {
    if (hintRevealSwap && hintRevealPref !== 'off' && tile.side === 'bridge' && engine) {
      const lemma = engine.lemmas.get(tile.lemmaId);
      if (lemma) {
        const resolution = resolveHintReveal(lemma, hintRevealPref);
        if (resolution.kind === 'peek') return resolution.text;
      }
    }
    return tile.text;
  }

  const aggregates = aggregateGameStats(stats);
  const progress =
    engine && engine.targetMatches > 0
      ? Math.min(100, (engine.successfulMatches / engine.targetMatches) * 100)
      : 0;
  const boardAbsentOnCooldown =
    engine !== null && isBoardAbsentCooldownActive(engine, boardAbsentCooldownLemmaId);
  const pausedCard = pausedLemmaId !== null ? vocabById.get(pausedLemmaId) ?? null : null;
  const pausedKnownAnswer = pausedCard ? knownPromptOf(pausedCard) : '';
  const pausedSelectedCognates = pausedCard ? selectedLanguageCognatesOf(pausedCard) : [];
  const pausedEnglishCognates = pausedCard ? englishCognatesOf(pausedCard) : [];
  const pausedSoundRules = rulesFromCognates(pausedEnglishCognates);

  return (
    <main className="page page--narrow">
      <header className="page__header">
        <h1 className="page__title">Games</h1>
        <p className="page__lede">
          Match English meanings to bridge words on a 3×3 board. Words come from your study
          schedule; timing and accuracy feed optional study updates and live in your game stats.
        </p>
      </header>

      <div className="games__persist">
        <button type="button" className="btn" onClick={onDownload}>
          Download stats
        </button>
        <label className="games__upload btn">
          Upload stats
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onUpload(file);
              event.target.value = '';
            }}
          />
        </label>
        <span className="games__persist-meta">
          {aggregates.games_played} games saved · {aggregates.words_with_data} words tracked
        </span>
      </div>

      {error && <p className="notice notice--error">{error}</p>}

      {phase === 'setup' && (
        <section className="games-setup card">
          {bridge === 'ia' && (
            <label className="games-setup__field">
              <span>Speech voice</span>
              <select
                aria-label="Speech voice"
                value={romanceVoice}
                onChange={(event) => {
                  const next = event.target.value as RomanceVoicePref;
                  setRomanceVoice(next);
                  writeRomanceVoicePref(next);
                }}
              >
                <option value="it">Prefer Italian</option>
                <option value="es">Prefer Spanish</option>
                <option value="fr">Prefer French</option>
                <option value="pt">Prefer Portuguese</option>
                <option value="ro">Prefer Romanian</option>
                <option value="ca">Prefer Catalan</option>
                <option value="random">Random</option>
              </select>
            </label>
          )}
          {bridge === 'ia' && (
            <label className="games-setup__field">
              <span>Hint reveal</span>
              <select
                aria-label="Hint reveal"
                value={hintRevealPref}
                onChange={(event) => {
                  const next = event.target.value as HintRevealPref;
                  setHintRevealPref(next);
                  writeHintRevealPref(bridge, next);
                }}
              >
                <option value="off">Off</option>
                {ROMANCE_HINT_LANGS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {bridge === 'ia' && hintRevealPref !== 'off' && (
            <label className="games-setup__check">
              <input
                type="checkbox"
                aria-label="Swap hint reveal with bridge language"
                checked={hintRevealSwap}
                onChange={(event) => {
                  const next = event.target.checked;
                  setHintRevealSwap(next);
                  writeHintRevealSwap(bridge, next);
                }}
              />
              <span>Swap hint reveal with bridge language</span>
            </label>
          )}
          <label className="games-setup__field">
            <span>Words this game</span>
            <select
              aria-label="Words this game"
              value={lemmaCount}
              onChange={(event) => setLemmaCount(Number(event.target.value))}
            >
              {[12, 18, 24, 30, 36, 48, 60].map((n) => (
                <option key={n} value={n} disabled={n < MIN_LEMMAS || n > MAX_LEMMAS}>
                  {n} lemmas ({n * 2} matches)
                </option>
              ))}
            </select>
          </label>
          <label className="games-setup__field">
            <span>English cognate</span>
            <select
              aria-label="English cognate filter"
              value={englishCognates}
              onChange={(event) => {
                const next = event.target.value as EnglishCognateFilter;
                setEnglishCognates(next);
                try {
                  localStorage.setItem(GAME_COGNATE_KEY, next);
                } catch {
                  /* private mode */
                }
              }}
            >
              <option value="all">With or without cognate</option>
              <option value="with">Only with English cognate</option>
              <option value="without">Only without English cognate</option>
            </select>
          </label>
          <label className="games-setup__field">
            <span>Part of speech</span>
            <select
              aria-label="Part of speech filter"
              value={partOfSpeech}
              onChange={(event) => {
                const next = normalizeGamePosFilter(event.target.value);
                setPartOfSpeech(next);
                try {
                  localStorage.setItem(GAME_POS_KEY, next);
                } catch {
                  /* private mode */
                }
              }}
            >
              <option value="">All parts of speech</option>
              {[...partsOfSpeech]
                .sort((a, b) => partOfSpeechLabel(a).localeCompare(partOfSpeechLabel(b)))
                .map((pos) => (
                <option key={pos} value={pos}>
                  {partOfSpeechLabel(pos)}
                </option>
              ))}
            </select>
          </label>
          <p className="games-setup__note">
            Words are taken in study order from your next scheduled cards (due reviews first, then
            new), then filled by priority if needed. Non-English tiles speak with your current
            speech engine when clicked.
          </p>
          {checkingCategory ? (
            <p className="games-setup__note">Checking word count…</p>
          ) : categoryCount !== null && !categoryHasEnough ? (
            <p className="notice notice--error">{categoryShortageMessage}</p>
          ) : null}
          <button
            type="button"
            className="btn btn--lg"
            disabled={loading || checkingCategory || !categoryHasEnough}
            onClick={() => void startGame()}
          >
            {loading ? (
              <>
                <Loader2 className="spinner-icon" size={18} /> Loading words
              </>
            ) : (
              'Start'
            )}
          </button>
        </section>
      )}

      {phase === 'countdown' && (
        <div className="games-countdown card" aria-live="polite">
          <p className={`games-countdown__ready${countdownFading ? ' is-fading' : ''}`}>
            Get Ready
          </p>
        </div>
      )}

      {phase === 'play' && engine && (
        <section className="games-play">
          <div className="games-play__meter">
            <span>
              {engine.successfulMatches} / {engine.targetMatches} matches
            </span>
            <div className="games-play__bar">
              <div className="games-play__bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span>
              {engine.incorrectAttempts} miss{engine.incorrectAttempts === 1 ? '' : 'es'}
            </span>
            <button
              type="button"
              className="btn games-play__pause"
              aria-label={pauseButtonLabel()}
              onClick={onPauseToggle}
              disabled={actionBusy}
            >
              {pauseButtonLabel()}
            </button>
          </div>
          {isPaused && pausedCard ? (
            <article className="games-pause-card card" aria-label="Paused word">
              <h2 className="games-pause-card__headword">{pausedCard.headword}</h2>
              {pausedCard.ipa && <p className="games-pause-card__ipa">[{pausedCard.ipa}]</p>}
              <p className="games-pause-card__gloss">{pausedKnownAnswer}</p>
              {pausedKnownAnswer !== pausedCard.gloss_en && pausedCard.gloss_en && (
                <p className="games-pause-card__synonyms">{pausedCard.gloss_en}</p>
              )}
              {pausedCard.glosses_en.length > 1 && (
                <p className="games-pause-card__synonyms">
                  {pausedCard.glosses_en.slice(1).join(', ')}
                </p>
              )}
              <SoundLawStack rules={pausedSoundRules} />
              <div className="games-pause-card__cognates">
                {pausedSelectedCognates.length > 0 ? (
                  <CorrespondencePanel cognates={pausedSelectedCognates} bare />
                ) : pausedEnglishCognates.length > 0 ? (
                  <CorrespondencePanel cognates={pausedEnglishCognates} bare />
                ) : (
                  <p className="games-pause-card__empty">no cognates for selected languages</p>
                )}
              </div>
            </article>
          ) : (
            <div className="games-grid" role="grid" aria-label="Matching board">
              {engine.tiles.map((tile) => {
                const isVacant = tile.side === 'empty';
                const isInactive =
                  isVacant ||
                  tile.color === 'blue' ||
                  tile.color === 'grey' ||
                  tile.color === 'white';
                const isSelected = !isInactive && selected.some((s) => s.key === tile.key);
                const isFading = fadingKeys.has(tile.key);
                return (
                  <button
                    key={tile.key}
                    type="button"
                    role="gridcell"
                    className={`games-tile games-tile--${tile.color}${tile.side !== 'empty' ? ` games-tile--side-${tile.side}` : ''}${isSelected ? ' is-selected' : ''}${isFading ? ' is-fading' : ''}`}
                    onClick={() => void onTileClick(tile)}
                    disabled={isInactive || actionBusy || isPaused}
                    aria-hidden={isVacant || undefined}
                  >
                    {!isVacant && <span className="games-tile__text">{tileDisplayText(tile)}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="games-play__actions">
            <button
              type="button"
              className="btn"
              disabled={actionBusy || isPaused}
              onClick={onDontKnowWord}
            >
              I don&apos;t know this word
            </button>
            <button
              type="button"
              className="btn"
              disabled={actionBusy || isPaused}
              onClick={() => void onRemoveFromDeck()}
            >
              Remove this from deck
            </button>
            <button
              type="button"
              className="btn"
              disabled={actionBusy || isPaused || boardAbsentOnCooldown}
              onClick={onMatchNotOnBoard}
              title={
                boardAbsentOnCooldown
                  ? 'Match the new word before using this again'
                  : undefined
              }
            >
              Match is not on the board
            </button>
          </div>
          {actionNotice && (
            <p
              className={`games-play__notice${
                actionNotice === 'Match the new word before using this again'
                  ? ' games-play__notice--end'
                  : ''
              }`}
            >
              {actionNotice}
            </p>
          )}
          {boardAbsentOnCooldown && !actionNotice && (
            <p className="games-play__notice games-play__notice--end">
              Match the new word before using this again
            </p>
          )}
        </section>
      )}

      {phase === 'summary' && summary && (
        <section className="games-summary card">
          <h2 className="games-summary__title">Game finished</h2>
          <dl className="games-summary__stats">
            <div>
              <dt>Total time</dt>
              <dd>{formatMs(summary.totalMs)}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{Math.round(summary.accuracy * 100)}%</dd>
            </div>
          </dl>
          <p className="games-summary__ask">
            Add this score to the learning algorithm? Incorrect matches become Again; slow matches
            Hard; fast matches Good — all on Meaning (tier 1) cards. The Good timing ceiling starts
            at 1s and grows by 0.5s for each consecutive clean game on that word.
          </p>
          <div className="games-summary__actions">
            <button
              type="button"
              className="btn btn--positive"
              disabled={applying || applied}
              onClick={() => void applyToSrs()}
            >
              {applying ? 'Updating…' : applied ? 'Added' : 'Yes to study schedule'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={loading || (!applied && sessionPool.length < 5)}
              onClick={() => {
                if (applied) void playNextBatch();
                else replaySameLemmas();
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="spinner-icon" size={18} /> Loading
                </>
              ) : applied ? (
                `Play the next ${lemmaCount} words`
              ) : (
                'Replay'
              )}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPhase('setup');
                setEngine(null);
                setSummary(null);
                setSchedulePreview([]);
              }}
            >
              Change settings
            </button>
          </div>
          {applyMessage && <p className="notice">{applyMessage}</p>}
          {summary.missed.length > 0 && (
            <div className="games-summary__missed">
              <h3 className="games-summary__missed-title">Missed words</h3>
              <ul className="games-summary__missed-list">
                {summary.missed.map((word) => (
                  <li key={word.id}>
                    <span className="games-summary__missed-headword">{word.headword}</span>
                    <span className="games-summary__missed-gloss">{word.english}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(schedulePreviewLoading || schedulePreview.length > 0) && (
            <div className="games-summary__schedule">
              <h3 className="games-summary__schedule-title">If you update the study schedule</h3>
              {schedulePreviewLoading ? (
                <p className="games-summary__schedule-loading">
                  <Loader2 className="spinner-icon" size={16} /> Loading schedule preview
                </p>
              ) : (
                <ul className="games-summary__schedule-list">
                  {schedulePreview.map((row) => (
                    <li key={row.id}>
                      <span className="games-summary__schedule-headword">{row.headword}</span>
                      <span className="games-summary__schedule-arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="games-summary__schedule-when">
                        {formatDelayUntil(row.next_review_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
