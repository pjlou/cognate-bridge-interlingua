import { Download, Loader2, Mic, RotateCcw, Trash2, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CorrespondencePanel, { SoundLawStack } from '../components/CorrespondencePanel';
import RecordBridgeAudioModal from '../components/RecordBridgeAudioModal';
import { useAsync } from '../hooks/useAsync';
import { errorMessage } from '../lib/errorMessage';
import { familyForBridgeCode } from '../lib/navFamily';
import { cancelCardAudio, playCardAudio } from '../lib/playCardAudio';
import {
  cancelBridgeSpeech,
  fetchTtsStatus,
  readGermanicVoicePref,
  readRomanceVoicePref,
  readTtsEnginePref,
  speakBridgeWord,
  writeGermanicVoicePref,
  writeRomanceVoicePref,
  writeTtsEnginePref,
  type GermanicVoicePref,
  type RomanceVoicePref,
  type TtsEnginePref,
} from '../lib/speakBridgeWord';
import {
  deleteDeck,
  downloadDeckBackup,
  getDeckDueCounts,
  getDeckStudyQueue,
  getDueCounts,
  getFrequencyBands,
  getStudyQueue,
  listDecks,
  recordDeckCardReview,
  recordReview,
  saveBridgeAudio,
  setDeckCardRemoved,
  setVocabularyRemoved,
  type Cognate,
  type CorrespondenceRule,
  type DeckSummary,
  type FrequencyBand,
  type StudyTier,
  type VocabularyGrade,
  type VocabularyItem,
} from '../services/api';
import './StudyPage.css';

const SKIP_KEY = 'cb.skipEnglishCognates';
const ONLY_COGNATES_KEY = 'cb.onlyEnglishCognates';
const SESSION_SIZE_KEY = 'cb.studySessionSize';
const DIRECTION_KEY = 'cb.studyDirection';
const DONT_PLAY_ENGLISH_KEY = 'cb.dontPlayEnglishAudio';
const DEFAULT_SESSION_SIZE = 20;

type StudyDirection = 'en_to_target' | 'target_to_en' | 'both';
type CardFace = 'en_to_target' | 'target_to_en';

function readStoredDeckId(bridgeCode: string): number | null {
  try {
    const stored = localStorage.getItem(`cb.studyDeck.${bridgeCode}`);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredDeckId(bridgeCode: string, deckId: number | null): void {
  try {
    if (deckId === null) localStorage.removeItem(`cb.studyDeck.${bridgeCode}`);
    else localStorage.setItem(`cb.studyDeck.${bridgeCode}`, String(deckId));
  } catch {
    /* private mode */
  }
}

function readSkipPreference(): boolean {
  try {
    const stored = localStorage.getItem(SKIP_KEY);
    if (stored === null) return false;
    return stored === 'true';
  } catch {
    return false;
  }
}

function readOnlyCognatesPreference(): boolean {
  try {
    const stored = localStorage.getItem(ONLY_COGNATES_KEY);
    if (stored === null) return false;
    return stored === 'true';
  } catch {
    return false;
  }
}

function readDontPlayEnglishPreference(): boolean {
  try {
    return localStorage.getItem(DONT_PLAY_ENGLISH_KEY) === 'true';
  } catch {
    return false;
  }
}

function readSessionSize(): number {
  try {
    const stored = Number(localStorage.getItem(SESSION_SIZE_KEY));
    if (Number.isInteger(stored) && stored >= 1 && stored <= 100) return stored;
  } catch {
    /* private mode */
  }
  return DEFAULT_SESSION_SIZE;
}

function readStudyDirection(): StudyDirection {
  try {
    const stored = localStorage.getItem(DIRECTION_KEY);
    if (stored === 'en_to_target' || stored === 'target_to_en' || stored === 'both') {
      return stored;
    }
    // Migrate earlier "bridge"-framed preference values.
    if (stored === 'en_to_bridge') {
      localStorage.setItem(DIRECTION_KEY, 'en_to_target');
      return 'en_to_target';
    }
    if (stored === 'bridge_to_en') {
      localStorage.setItem(DIRECTION_KEY, 'target_to_en');
      return 'target_to_en';
    }
  } catch {
    /* private mode */
  }
  return 'both';
}

function pickCardFace(direction: StudyDirection): CardFace {
  if (direction === 'both') {
    return Math.random() < 0.5 ? 'en_to_target' : 'target_to_en';
  }
  return direction;
}

type BandValue = number | 'unranked';

function bandValue(band: FrequencyBand): BandValue {
  return band.band === null ? 'unranked' : band.band;
}

function bandLabel(band: FrequencyBand): string {
  const due = `${band.due} due`;
  if (band.band === null || band.rank_from === null || band.rank_to === null) {
    return `Unlisted meanings (${due})`;
  }
  return `${band.rank_from}–${band.rank_to} (${due})`;
}

function pickDefaultBand(bands: FrequencyBand[]): BandValue | null {
  const withDue = bands.find((band) => band.due > 0);
  if (withDue) return bandValue(withDue);
  return bands[0] ? bandValue(bands[0]) : null;
}

function englishCognates(card: VocabularyItem): Cognate[] {
  return card.cognates.filter((cognate) => cognate.target_language.code === 'en');
}

function selectedLanguageCognates(card: VocabularyItem): Cognate[] {
  return card.cognates.filter((cognate) => cognate.target_language.code !== 'en');
}

function knownPrompt(card: VocabularyItem): string {
  return englishCognates(card)[0]?.target_word ?? card.gloss_en;
}

function promptText(card: VocabularyItem, face: CardFace): string {
  return face === 'target_to_en' ? card.headword : knownPrompt(card);
}

/**
 * Which of a deck card's audio slots is "being spoken" on reveal/replay. Built-in
 * bridge cards never reach this (they always speak the bridge word directly via
 * `speakBridgeWord`); see `speakCard` in the component body. This mirrors what
 * `promptText`/the revealed-answer JSX actually show for each face -- reveal always
 * pronounces the newly-shown answer, not the prompt the learner already had: the
 * bridge word for `en_to_target`, the English gloss for `target_to_en`. Tier doesn't
 * change which content is shown on this page (it only gates the supplementary
 * cognates panel below the answer), so unlike `main`'s deck-mode this slot picker
 * doesn't need a tier argument.
 */
function audioSlotFor(face: CardFace): 'english' | 'bridge' {
  return face === 'en_to_target' ? 'bridge' : 'english';
}

/**
 * With "Don't play English voices" on, an English-slotted card speaks the bridge word
 * instead -- the bridge word (already shown as the deck's headword) has its own
 * stored/synthesized pronunciation available.
 */
function applyDontPlayEnglish(
  slot: 'english' | 'bridge',
  dontPlayEnglish: boolean,
): 'english' | 'bridge' {
  return slot === 'english' && dontPlayEnglish ? 'bridge' : slot;
}

function faceLabel(face: CardFace): string {
  return face === 'en_to_target' ? 'EN → target' : 'Target → EN';
}

function rulesFrom(cognates: Cognate[]): CorrespondenceRule[] {
  const seen = new Set<number>();
  const rules: CorrespondenceRule[] = [];
  for (const cognate of cognates) {
    const list = cognate.rules?.length ? cognate.rules : cognate.rule ? [cognate.rule] : [];
    for (const rule of list) {
      if (seen.has(rule.id)) continue;
      seen.add(rule.id);
      rules.push(rule);
    }
  }
  return rules;
}

export default function StudyPage() {
  const { bridge = '' } = useParams<{ bridge: string }>();
  const [skipEnglishCognates, setSkipEnglishCognates] = useState(() => {
    const skip = readSkipPreference();
    const only = readOnlyCognatesPreference();
    return skip && !only;
  });
  const [onlyEnglishCognates, setOnlyEnglishCognates] = useState(readOnlyCognatesPreference);
  const [sessionSize, setSessionSize] = useState(readSessionSize);
  const [studyDirection, setStudyDirection] = useState<StudyDirection>(readStudyDirection);
  const [cardFace, setCardFace] = useState<CardFace>(() => pickCardFace(readStudyDirection()));
  const [germanicVoice, setGermanicVoice] = useState<GermanicVoicePref>(readGermanicVoicePref);
  const [interlinguaVoice, setInterlinguaVoice] = useState<RomanceVoicePref>(readRomanceVoicePref);
  const [ttsEngine, setTtsEngine] = useState<TtsEnginePref>(readTtsEnginePref);
  const [localTtsAvailable, setLocalTtsAvailable] = useState(false);
  const [cloudTtsAvailable, setCloudTtsAvailable] = useState(false);
  const [band, setBand] = useState<BandValue | null>(null);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [dontPlayEnglish, setDontPlayEnglish] = useState(readDontPlayEnglishPreference);

  const effectiveSkipEnglish = skipEnglishCognates;
  const showOnlyCognatesOption = bridge === 'ia';
  const effectiveOnlyEnglish = showOnlyCognatesOption ? onlyEnglishCognates : false;

  // Deck picker: which imported deck (if any) the learner is studying instead of the
  // built-in Cognate Bridge content, scoped per bridge (switching bridges shows that
  // bridge's own last-picked deck) and defaulting to unset -- the built-in deck --
  // exactly as specified. `?deck=` in the URL (from DeckDetailPage's "Study this deck"
  // link) wins on first load; after that the picker just writes to localStorage.
  const [searchParams] = useSearchParams();
  const [deckId, setDeckId] = useState<number | null>(() => {
    const fromUrl = Number(searchParams.get('deck'));
    if (Number.isInteger(fromUrl) && fromUrl > 0) return fromUrl;
    return readStoredDeckId(bridge);
  });
  // Re-reads the new bridge's own last-picked deck when the route's :bridge param
  // actually changes (switching families) -- but not on mount, which the useState
  // initializer above already handled from the URL or localStorage. Comparing against
  // a ref of the previous value (rather than a "have I run before" flag) keeps this
  // idempotent under React 18 StrictMode's double-invoked effects in development: a
  // one-shot flag flips permanently on the first of the two invocations, making the
  // second one look like a genuine bridge change and wrongly re-read localStorage,
  // clobbering a deck id that came from the URL.
  const previousBridge = useRef(bridge);
  useEffect(() => {
    if (previousBridge.current === bridge) return;
    previousBridge.current = bridge;
    setDeckId(readStoredDeckId(bridge));
  }, [bridge]);
  const isDeckMode = deckId !== null;

  const decks = useAsync(listDecks, [], 'Could not load your decks.');
  const availableDecks = useMemo(
    () =>
      (decks.data ?? []).filter(
        (item: DeckSummary) => item.status === 'ready' && item.bridge_language_code === bridge,
      ),
    [decks.data, bridge],
  );

  function onDeckChange(next: number | null): void {
    setDeckId(next);
    writeStoredDeckId(bridge, next);
  }

  const selectedDeck = useMemo(
    () => availableDecks.find((item: DeckSummary) => item.id === deckId) ?? null,
    [availableDecks, deckId],
  );
  const [deckActionError, setDeckActionError] = useState<string | null>(null);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);

  async function handleDeleteDeck(): Promise<void> {
    if (!selectedDeck || isDeletingDeck) return;
    const confirmed = window.confirm(
      `Delete "${selectedDeck.name}"? This removes the deck, its cards, and all study progress on it. This cannot be undone.`,
    );
    if (!confirmed) return;

    setIsDeletingDeck(true);
    setDeckActionError(null);
    try {
      await deleteDeck(selectedDeck.id);
      onDeckChange(null);
      decks.reload();
    } catch (caught) {
      setDeckActionError(errorMessage(caught, 'Could not delete this deck.'));
    } finally {
      setIsDeletingDeck(false);
    }
  }

  async function handleDownloadDeck(): Promise<void> {
    if (!selectedDeck) return;
    setDeckActionError(null);
    try {
      await downloadDeckBackup(selectedDeck.id, selectedDeck.name);
    } catch (caught) {
      setDeckActionError(errorMessage(caught, 'Could not download this deck.'));
    }
  }

  const [showRecordModal, setShowRecordModal] = useState(false);

  const bands = useAsync(
    () =>
      isDeckMode
        ? Promise.resolve([{ band: 0, rank_from: null, rank_to: null, total: 0, due: 0 }])
        : getFrequencyBands(bridge, {
            skipEnglishCognates: effectiveSkipEnglish,
            requireEnglishCognates: effectiveOnlyEnglish,
          }),
    [bridge, isDeckMode, effectiveSkipEnglish, effectiveOnlyEnglish],
    'Could not load frequency bands.',
  );

  useEffect(() => {
    let cancelled = false;
    void fetchTtsStatus(true).then((status) => {
      if (cancelled) return;
      setLocalTtsAvailable(status.local);
      setCloudTtsAvailable(status.cloud);
      const preferred = readTtsEnginePref();
      if (preferred === 'local' && !status.local) {
        writeTtsEnginePref('browser');
        setTtsEngine('browser');
      } else if (preferred === 'cloud' && !status.cloud) {
        writeTtsEnginePref('browser');
        setTtsEngine('browser');
      } else {
        setTtsEngine(preferred);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bands.data) return;
    const available = new Set(bands.data.map(bandValue));
    setBand((current) => {
      if (current !== null && available.has(current)) return current;
      return pickDefaultBand(bands.data!);
    });
  }, [bands.data]);

  // `band` only matters to the non-deck branch below, but it's still read here so it
  // must appear in the dependency array -- frozen to a constant while `isDeckMode` is
  // true so the real `band` state settling from `null` to its resolved value (via the
  // effect above) doesn't trigger a spurious extra fetch, which would replace
  // `queue.data` with a new array reference and re-trigger the "reset revealed" effect
  // right out from under whatever the learner was doing.
  const bandDep = isDeckMode ? null : band;

  const due = useAsync(
    () =>
      isDeckMode
        ? getDeckDueCounts(deckId!)
        : band === null
          ? Promise.resolve({ new: 0, review: 0, vocabulary: 0, grammar: 0 })
          : getDueCounts(bridge, {
              band,
              skipEnglishCognates: effectiveSkipEnglish,
              requireEnglishCognates: effectiveOnlyEnglish,
            }),
    [bridge, isDeckMode, deckId, bandDep, effectiveSkipEnglish, effectiveOnlyEnglish],
    'Could not load due counts.',
  );

  const queue = useAsync(
    () =>
      isDeckMode
        ? getDeckStudyQueue(deckId!, { limit: sessionSize })
        : band === null
          ? Promise.resolve([] as VocabularyItem[])
          : getStudyQueue(bridge, {
              limit: sessionSize,
              band,
              skipEnglishCognates: effectiveSkipEnglish,
              requireEnglishCognates: effectiveOnlyEnglish,
            }),
    [bridge, isDeckMode, deckId, bandDep, effectiveSkipEnglish, effectiveOnlyEnglish, sessionSize],
    'Could not load your study queue.',
  );

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scored, setScored] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answeredNew, setAnsweredNew] = useState(0);
  const [answeredReview, setAnsweredReview] = useState(0);
  const [newLeft, setNewLeft] = useState(0);
  const [reviewLeft, setReviewLeft] = useState(0);

  const items = queue.data ?? [];
  const card: VocabularyItem | undefined = items[index];
  const tier: StudyTier = card?.tier === 2 ? 2 : 1;

  useEffect(() => {
    setIndex(0);
    setRevealed(false);
    setScored(0);
    setCorrect(0);
    setAnsweredNew(0);
    setAnsweredReview(0);
    setSpeechNotice(null);
  }, [queue.data]);

  useEffect(() => {
    if (!due.data) return;
    setNewLeft(due.data.new);
    setReviewLeft(due.data.review);
  }, [due.data]);

  // Pick a stable face for the current card (random when direction is "both").
  useEffect(() => {
    if (!card) return;
    setCardFace(pickCardFace(studyDirection));
    setRevealed(false);
    setSpeechNotice(null);
    // Intentionally keyed by card identity, not the whole card object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, card?.tier, studyDirection]);

  const speakCard = useCallback(
    (item: VocabularyItem) => {
      setSpeechNotice(null);
      cancelCardAudio();
      if (item.source === 'deck') {
        const baseSlot = audioSlotFor(cardFace);
        const slot = applyDontPlayEnglish(baseSlot, dontPlayEnglish);
        void playCardAudio(item, slot, item.bridge_language_code || bridge).then((result) => {
          if (!result.spoken) setSpeechNotice(result.message);
        });
        return;
      }
      void speakBridgeWord({
        text: item.headword,
        bridgeCode: item.bridge_language_code || bridge,
        ipa: item.ipa,
        ipaSource: item.ipa_source,
      }).then((result) => {
        if (!result.spoken) setSpeechNotice(result.message);
      });
    },
    [bridge, cardFace, dontPlayEnglish],
  );

  const reveal = useCallback(() => {
    if (!card || revealed) return;
    setRevealed(true);
    speakCard(card);
  }, [card, revealed, speakCard]);

  const replay = useCallback(() => {
    if (!card) return;
    speakCard(card);
  }, [card, speakCard]);

  const grade = useCallback(
    async (nextGrade: VocabularyGrade) => {
      if (!card || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const cardTier = card.tier === 2 ? 2 : 1;
        if (card.source === 'deck') {
          await recordDeckCardReview(card.deck_card_id!, nextGrade, cardTier);
        } else {
          await recordReview(card.id, nextGrade, cardTier);
        }
        cancelBridgeSpeech();
        cancelCardAudio();
        const kind = card.queue_kind ?? 'new';
        if (kind === 'review') {
          setAnsweredReview((value) => value + 1);
          setReviewLeft((value) => Math.max(0, value - 1));
        } else {
          setAnsweredNew((value) => value + 1);
          setNewLeft((value) => Math.max(0, value - 1));
        }
        setScored((value) => value + 1);
        if (nextGrade !== 'again') setCorrect((value) => value + 1);
        setIndex((value) => value + 1);
        setRevealed(false);
      } catch (error) {
        setSaveError(errorMessage(error, 'Could not save that answer. Try again.'));
      } finally {
        setSaving(false);
      }
    },
    [card, saving],
  );

  const removeFromDeck = useCallback(async () => {
    if (!card || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const cardTier = card.tier === 2 ? 2 : 1;
      if (card.source === 'deck') {
        await setDeckCardRemoved(card.deck_card_id!, cardTier, true);
      } else {
        await setVocabularyRemoved(card.id, cardTier, true);
      }
      cancelBridgeSpeech();
      cancelCardAudio();
      const kind = card.queue_kind ?? 'new';
      if (kind === 'review') setReviewLeft((value) => Math.max(0, value - 1));
      else setNewLeft((value) => Math.max(0, value - 1));
      setIndex((value) => value + 1);
      setRevealed(false);
    } catch (error) {
      setSaveError(errorMessage(error, 'Could not remove that card. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [card, saving]);

  useEffect(
    () => () => {
      cancelBridgeSpeech();
      cancelCardAudio();
    },
    [],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!revealed) reveal();
        return;
      }
      if (!revealed) return;
      if (event.key === '1') void grade('again');
      if (event.key === '2') void grade('hard');
      if (event.key === '3') void grade('good');
      if (event.key === '4') void grade('easy');
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed, reveal, grade]);

  const bandOptions = useMemo(() => bands.data ?? [], [bands.data]);

  function onSkipChange(next: boolean): void {
    setSkipEnglishCognates(next);
    if (next) {
      setOnlyEnglishCognates(false);
      try {
        localStorage.setItem(ONLY_COGNATES_KEY, 'false');
      } catch {
        /* private mode */
      }
    }
    try {
      localStorage.setItem(SKIP_KEY, String(next));
    } catch {
      /* private mode */
    }
  }

  function onOnlyCognatesChange(next: boolean): void {
    setOnlyEnglishCognates(next);
    if (next) {
      setSkipEnglishCognates(false);
      try {
        localStorage.setItem(SKIP_KEY, 'false');
      } catch {
        /* private mode */
      }
    }
    try {
      localStorage.setItem(ONLY_COGNATES_KEY, String(next));
    } catch {
      /* private mode */
    }
  }

  function onSessionSizeChange(next: number): void {
    const clamped = Math.min(100, Math.max(1, next));
    setSessionSize(clamped);
    try {
      localStorage.setItem(SESSION_SIZE_KEY, String(clamped));
    } catch {
      /* private mode */
    }
  }

  function onStudyDirectionChange(next: StudyDirection): void {
    setStudyDirection(next);
    try {
      localStorage.setItem(DIRECTION_KEY, next);
    } catch {
      /* private mode */
    }
  }

  function onDontPlayEnglishChange(next: boolean): void {
    setDontPlayEnglish(next);
    try {
      localStorage.setItem(DONT_PLAY_ENGLISH_KEY, String(next));
    } catch {
      /* private mode */
    }
  }

  function onGermanicVoiceChange(next: GermanicVoicePref): void {
    setGermanicVoice(next);
    writeGermanicVoicePref(next);
    setSpeechNotice(null);
  }

  function onRomanceVoiceChange(next: RomanceVoicePref): void {
    setInterlinguaVoice(next);
    writeRomanceVoicePref(next);
    setSpeechNotice(null);
  }

  function onTtsEngineChange(next: TtsEnginePref): void {
    if (next === 'local' && !localTtsAvailable) return;
    if (next === 'cloud' && !cloudTtsAvailable) return;
    setTtsEngine(next);
    writeTtsEnginePref(next);
    setSpeechNotice(null);
  }

  const filters = (
    <div className="study__filters">
      <label className="study__band">
        <span>Deck</span>
        <select
          aria-label="Deck"
          value={deckId ?? ''}
          onChange={(event) => onDeckChange(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">Cognate Bridge</option>
          {availableDecks.map((option: DeckSummary) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {selectedDeck && (
        <div className="study__deck-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void handleDownloadDeck()}
            title="Download this deck (with your edits and study progress) as a backup file"
          >
            <Download size={15} aria-hidden="true" />
            Download deck
          </button>
          <button
            type="button"
            className="btn btn--negative"
            onClick={() => void handleDeleteDeck()}
            disabled={isDeletingDeck}
            title="Delete this imported deck"
          >
            {isDeletingDeck ? (
              <Loader2 size={15} className="spinner-icon" aria-hidden="true" />
            ) : (
              <Trash2 size={15} aria-hidden="true" />
            )}
            Delete deck
          </button>
        </div>
      )}
      {selectedDeck && deckActionError && (
        <p className="notice notice--error study__deck-actions-error" role="alert">
          {deckActionError}
        </p>
      )}
      {!isDeckMode && (
        <label className="study__band">
          <span>Frequency</span>
          <select
            value={band ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setBand(value === 'unranked' ? 'unranked' : Number(value));
            }}
            disabled={bandOptions.length === 0}
          >
            {bandOptions.map((option) => (
              <option key={String(bandValue(option))} value={bandValue(option)}>
                {bandLabel(option)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="study__band">
        <span>Cards this session</span>
        <select
          aria-label="Cards this session"
          value={sessionSize}
          onChange={(event) => onSessionSizeChange(Number(event.target.value))}
        >
          {[10, 20, 30, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <label className="study__band">
        <span>Direction</span>
        <select
          aria-label="Study direction"
          value={studyDirection}
          onChange={(event) => onStudyDirectionChange(event.target.value as StudyDirection)}
        >
          <option value="both">Both directions</option>
          <option value="en_to_target">English → target</option>
          <option value="target_to_en">Target → English</option>
        </select>
      </label>
      <label className="study__band">
        <span>Speech engine</span>
        <select
          aria-label="Speech engine"
          value={ttsEngine}
          onChange={(event) => onTtsEngineChange(event.target.value as TtsEnginePref)}
        >
          <option value="browser">Browser (Recommended)</option>
          {localTtsAvailable ? (
            <option value="local">Local TTS (Piper)</option>
          ) : (
            <option value="local" disabled>
              No local TTS
            </option>
          )}
          {cloudTtsAvailable ? (
            <option value="cloud">Cloud TTS</option>
          ) : (
            <option value="cloud" disabled>
              No cloud TTS
            </option>
          )}
        </select>
      </label>
      {familyForBridgeCode(bridge) === 'Germanic' && (
        <label className="study__band">
          <span>Speech voice</span>
          <select
            value={germanicVoice}
            onChange={(event) => onGermanicVoiceChange(event.target.value as GermanicVoicePref)}
          >
            <option value="de">Prefer German</option>
            <option value="nl">Prefer Dutch</option>
            <option value="da">Prefer Danish</option>
            <option value="no">Prefer Norwegian</option>
            <option value="sv">Prefer Swedish</option>
            <option value="random">Random</option>
          </select>
        </label>
      )}
      {bridge === 'ia' && (
        <label className="study__band">
          <span>Speech voice</span>
          <select
            value={interlinguaVoice}
            onChange={(event) => onRomanceVoiceChange(event.target.value as RomanceVoicePref)}
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
      {!isDeckMode && (
        <label className="study__skip">
          <input
            type="checkbox"
            checked={skipEnglishCognates}
            onChange={(event) => onSkipChange(event.target.checked)}
          />
          Skip words with an English cognate
        </label>
      )}
      {isDeckMode && (
        <label className="study__skip">
          <input
            type="checkbox"
            checked={dontPlayEnglish}
            onChange={(event) => onDontPlayEnglishChange(event.target.checked)}
          />
          Don't play English voices
        </label>
      )}
      {!isDeckMode && showOnlyCognatesOption && (
        <label className="study__skip">
          <input
            type="checkbox"
            checked={onlyEnglishCognates}
            onChange={(event) => onOnlyCognatesChange(event.target.checked)}
          />
          Show only cognates
        </label>
      )}
    </div>
  );

  if (bands.isLoading) {
    return (
      <main className="page page--narrow">
        {filters}
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Building your queue
        </div>
      </main>
    );
  }

  if (bands.error) {
    return (
      <main className="page page--narrow">
        {filters}
        <p className="notice notice--error">{bands.error}</p>
      </main>
    );
  }

  if ((bands.data?.length ?? 0) === 0) {
    return (
      <main className="page page--narrow">
        {filters}
        <div className="empty-state">
          <h3>Nothing to study</h3>
          <p>
            Every word in this dictionary is filtered out. Turn off “Skip words with an English
            cognate” or “Show only cognates”, or pick another bridge.
          </p>
        </div>
      </main>
    );
  }

  if (queue.isLoading || band === null) {
    return (
      <main className="page page--narrow">
        {filters}
        <div className="loading-block">
          <Loader2 className="spinner-icon" size={20} /> Building your queue
        </div>
      </main>
    );
  }

  if (queue.error) {
    return (
      <main className="page page--narrow">
        {filters}
        <p className="notice notice--error">{queue.error}</p>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="page page--narrow">
        {filters}
        <div className="empty-state">
          <h3>Nothing due in this band</h3>
          <p>
            Try another frequency range, or adjust the English-cognate filters. You can also{' '}
            <Link to={`/b/${bridge}/words`}>browse the dictionary</Link> or drill a{' '}
            <Link to={`/b/${bridge}/grammar`}>grammar pattern</Link>.
          </p>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="page page--narrow">
        {filters}
        <div className="empty-state">
          <h3>Session finished</h3>
          <p>
            {correct} of {scored} correct · {answeredNew} new · {answeredReview} review
          </p>
          <button type="button" className="btn" onClick={queue.reload}>
            <RotateCcw size={15} aria-hidden="true" /> Next batch
          </button>
        </div>
      </main>
    );
  }

  const english = englishCognates(card);
  const selected = selectedLanguageCognates(card);
  const prompt = promptText(card, cardFace);
  const knownAnswer = knownPrompt(card);
  const showTargetOnFront = cardFace === 'target_to_en';

  return (
    <main className="page page--narrow">
      {filters}

      <div className="study__meter">
        <span>
          {index + 1} of {items.length}
        </span>
        <div className="study__bar">
          <div
            className="study__bar-fill"
            style={{ width: `${(index / items.length) * 100}%` }}
          />
        </div>
        <span className="study__due-left">
          New left {newLeft} · Reviews left {reviewLeft}
        </span>
        <span>
          {tier === 1 ? 'Meaning' : 'Cognates'} · {faceLabel(cardFace)}
        </span>
      </div>

      <article className="study-card card">
        <div className="study-card__front">
          <span className="tag tag--pos">{card.part_of_speech}</span>
          <h1 className="study-card__headword">{prompt}</h1>
          {showTargetOnFront && card.ipa && <p className="study-card__ipa">[{card.ipa}]</p>}
        </div>

        {speechNotice && <p className="notice notice--error">{speechNotice}</p>}

        {!revealed ? (
          <button type="button" className="btn btn--lg btn--block" onClick={reveal}>
            Reveal
            <kbd className="study-card__kbd">space</kbd>
          </button>
        ) : (
          <>
            <div className="study-card__back">
              {cardFace === 'en_to_target' ? (
                <>
                  <p className="study-card__gloss">{card.headword}</p>
                  {card.ipa && <p className="study-card__ipa">[{card.ipa}]</p>}
                  {knownAnswer !== card.gloss_en && (
                    <p className="study-card__synonyms">{card.gloss_en}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="study-card__gloss">{knownAnswer}</p>
                  {knownAnswer !== card.gloss_en && (
                    <p className="study-card__synonyms">{card.gloss_en}</p>
                  )}
                </>
              )}
              {card.glosses_en.length > 1 && (
                <p className="study-card__synonyms">{card.glosses_en.slice(1).join(', ')}</p>
              )}
              <SoundLawStack rules={rulesFrom(english)} />
              {tier === 2 && (
                <div className="study-card__cognates">
                  {selected.length > 0 ? (
                    <CorrespondencePanel cognates={selected} bare />
                  ) : english.length > 0 ? (
                    <CorrespondencePanel cognates={english} bare />
                  ) : (
                    <p className="study-card__no-cognate">no cognates for selected languages</p>
                  )}
                </div>
              )}
              {card.etymology && (
                <p className="study-card__etymology">
                  <span>from</span> {card.etymology}
                </p>
              )}
            </div>

            <button type="button" className="study-card__replay" onClick={replay}>
              <Volume2 size={15} aria-hidden="true" /> Replay
            </button>

            {card.source === 'deck' && audioSlotFor(cardFace) === 'bridge' && (
              <button
                type="button"
                className="study-card__replay"
                onClick={() => setShowRecordModal(true)}
              >
                <Mic size={15} aria-hidden="true" /> Record bridge audio
              </button>
            )}

            <div className="study-card__grade">
              <button
                type="button"
                className="btn btn--negative"
                onClick={() => void grade('again')}
                disabled={saving}
              >
                Again
                <kbd className="study-card__kbd">1</kbd>
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void grade('hard')}
                disabled={saving}
              >
                Hard
                <kbd className="study-card__kbd">2</kbd>
              </button>
              <button
                type="button"
                className="btn btn--positive"
                onClick={() => void grade('good')}
                disabled={saving}
              >
                Good
                <kbd className="study-card__kbd">3</kbd>
              </button>
              <button
                type="button"
                className="btn btn--accent"
                onClick={() => void grade('easy')}
                disabled={saving}
              >
                Easy
                <kbd className="study-card__kbd">4</kbd>
              </button>
            </div>
          </>
        )}

        {saveError && <p className="notice notice--error">{saveError}</p>}

        <button
          type="button"
          className="study-card__remove"
          onClick={() => void removeFromDeck()}
          disabled={saving}
        >
          Remove from deck
        </button>
      </article>

      <p className="study__source">{card.source_ref}</p>

      {showRecordModal && card.deck_card_id && (
        <RecordBridgeAudioModal
          headword={card.headword}
          onClose={() => setShowRecordModal(false)}
          onConfirm={async (audio) => {
            await saveBridgeAudio(card.deck_card_id!, audio);
            const hasAudio = {
              english: card.has_audio?.english ?? false,
              target: card.has_audio?.target ?? false,
              bridge: true,
            };
            queue.setData(
              items.map((item, itemIndex) =>
                itemIndex === index ? { ...item, has_audio: hasAudio } : item,
              ),
            );
          }}
        />
      )}
    </main>
  );
}
