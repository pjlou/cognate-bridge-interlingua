import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type LanguageFamily = 'Germanic' | 'Romance' | 'Uralic';
export type Provenance = 'parsed' | 'rule_generated' | 'curated' | 'similarity';
export type GrammarDrillKind = 'multiple_choice' | 'word_order';

export interface User {
  id: number;
  email: string;
  created_at?: string;
  priority_germanic_target_language_id?: number | null;
  priority_romance_target_language_id?: number | null;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface TargetLanguage {
  id: number;
  code: string;
  name: string;
  family: LanguageFamily;
}

export interface BridgeLanguage {
  id: number;
  code: string;
  name: string;
  family: LanguageFamily;
  description: string | null;
  source_url: string | null;
  license_note: string;
  target_languages: TargetLanguage[];
  vocabulary_count: number;
  grammar_pattern_count: number;
}

export type VocabularyGrade = 'again' | 'hard' | 'good' | 'easy';
export type StudyTier = 1 | 2;
export type VocabularyCardState = 'new' | 'learning' | 'review' | 'relearning';

export interface CorrespondenceRule {
  id: number;
  code: string;
  name: string | null;
  notation: string | null;
  description: string;
  source_note: string;
  example_bridge: string | null;
  example_target: string | null;
}

export interface Cognate {
  id: number;
  target_language: TargetLanguage;
  target_word: string;
  provenance: Provenance;
  confidence: number;
  validated_against: string | null;
  notes: string | null;
  rule: CorrespondenceRule | null;
  rules: CorrespondenceRule[];
}

export interface VocabularyItem {
  id: number;
  bridge_language_id: number;
  bridge_language_code: string;
  headword: string;
  part_of_speech: string;
  gloss_en: string;
  glosses_en: string[];
  ipa: string | null;
  ipa_source?: 'direct_phonology' | 'derived_phonology' | 'uncertain_phonology' | null;
  etymology: string | null;
  difficulty_level: number;
  frequency_rank: number | null;
  frequency_band: number | null;
  has_english_cognate: boolean;
  transparency_score?: number | null;
  priority_score?: number | null;
  is_core_track?: boolean;
  source_ref: string;
  cognates: Cognate[];
  target_cognate_count?: number;
  total_cognate_count?: number;
  progress: ProgressSummary | null;
  tier?: StudyTier;
  queue_kind?: 'new' | 'review';
  /** 'deck' on a card from a user-imported deck rather than the curated bridge content. */
  source?: 'deck';
  deck_id?: number;
  deck_card_id?: number;
  has_audio?: { english: boolean; bridge: boolean; target: boolean };
}

export type TargetCoverageFilter = 'all' | 'covered' | 'uncovered';

export interface TargetVocabularyItem {
  rank: number;
  lemma: string;
  gloss_en: string;
  covered: boolean;
  has_english_cognate: boolean;
  target_cognate_count: number;
  total_cognate_count: number;
  bridge_code: string;
  bridge_name: string;
  bridge_vocabulary_ids: number[];
  cognates: {
    language_code: string;
    language_name: string;
    word: string;
    provenance: Provenance;
    is_bridge: boolean;
  }[];
}

export type DeckStatus = 'mapping' | 'translating' | 'ready' | 'failed';

export interface DeckSummary {
  id: number;
  owner_user_id: number;
  bridge_language_id: number | null;
  bridge_language_code: string | null;
  target_language_id: number | null;
  target_language_code: string | null;
  target_language_name: string | null;
  name: string;
  source_filename: string | null;
  status: DeckStatus;
  card_count: number;
  untranslated_count: number;
  created_at: string;
  translated_at: string | null;
}

export interface ProgressSummary {
  mastery_level?: number;
  review_count: number;
  success_count: number;
  consecutive_successes?: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  card_state?: VocabularyCardState;
  ease_factor?: number;
  interval_days?: number;
  repetitions?: number;
  lapses?: number;
  learning_step?: number;
  /** Soft-removed from the study deck; SRS fields are kept for restore. */
  removed?: boolean;
}

export interface ReviewResult {
  message: string;
  mastery_level?: number;
  review_count: number;
  success_count: number;
  next_review_at: string;
  card_state?: VocabularyCardState;
  ease_factor?: number;
  interval_days?: number;
  repetitions?: number;
  lapses?: number;
  learning_step?: number;
  last_reviewed_at?: string | null;
  tier2_unlocked?: boolean;
}

export interface GrammarParallel {
  target_language: TargetLanguage;
  target_text: string;
}

export interface GrammarExample {
  id: number;
  position: number;
  bridge_text: string;
  gloss_en: string;
  highlight: string | null;
  prompt: string | null;
  answer: string | null;
  distractors: string[];
  note: string | null;
  parallels: GrammarParallel[];
}

export interface GrammarPattern {
  id: number;
  bridge_language_id: number;
  bridge_language_code: string;
  slug: string;
  name: string;
  family: LanguageFamily;
  summary: string;
  description: string;
  source_note: string;
  difficulty_level: number;
  drill_kind: GrammarDrillKind;
  example_count: number;
  examples?: GrammarExample[];
  progress: ProgressSummary | null;
}

export interface FrequencyBand {
  band: number | null;
  rank_from: number | null;
  rank_to: number | null;
  total: number;
  due: number;
}

export interface AttributionSource {
  title: string;
  author: string;
  year: string;
  licence: string;
  licence_url: string | null;
  /** API-relative path to this project's own copy of the licence text, where it has one. */
  licence_text_path: string | null;
  source_url: string | null;
  usage: string;
  notice: string | null;
}

export interface Attribution {
  sources: AttributionSource[];
  modification_notice: string;
}

export interface DueCounts {
  new: number;
  review: number;
  vocabulary: number;
  grammar: number;
}

export interface VocabularyStats {
  studied: number;
  due_new: number;
  due_review: number;
  retention: number | null;
  average_ease: number | null;
  mature: number;
}

export interface RuleCardMapping {
  id: number;
  position: number;
  from_label: string;
  to_label: string;
  notation: string | null;
}

export interface RuleCardForms {
  en?: string;
  de?: string;
  es?: string;
  fr?: string;
  it?: string;
  pt?: string;
  la?: string;
  [code: string]: string | undefined;
}

export interface RuleCardExample {
  id: number;
  position: number;
  prompt: string | null;
  answer: string | null;
  distractors: string[];
  note: string | null;
  false_friend: boolean;
  forms: RuleCardForms;
}

export interface RuleCard {
  id: number;
  slug: string;
  name: string;
  tier: 1 | 2;
  position: number;
  teaching_frame: string;
  pattern_summary: string;
  description: string;
  caveat: string | null;
  source_note: string;
  difficulty_level: number;
  sound_law_prefixes: string[];
  example_count: number;
  mappings?: RuleCardMapping[];
  examples?: RuleCardExample[];
  progress: ProgressSummary | null;
}

export const register = async (email: string, password: string): Promise<AuthResponse> =>
  (await api.post('/auth/register', { email, password })).data;

export const login = async (email: string, password: string): Promise<AuthResponse> =>
  (await api.post('/auth/login', { email, password })).data;

export const getCurrentUser = async (): Promise<User> => (await api.get('/auth/me')).data;

/** Wipe study progress, targets, and preferences (keeps the account). */
export const resetUserData = async (): Promise<User> =>
  (await api.delete<{ message: string; user: User }>('/auth/me/data')).data.user;

export const updatePriorityGermanicTargetLanguage = async (
  priorityTargetLanguageId: number | null,
): Promise<User> =>
  (
    await api.patch('/auth/me', {
      priority_germanic_target_language_id: priorityTargetLanguageId,
    })
  ).data;

export const updatePriorityRomanceTargetLanguage = async (
  priorityTargetLanguageId: number | null,
): Promise<User> =>
  (
    await api.patch('/auth/me', {
      priority_romance_target_language_id: priorityTargetLanguageId,
    })
  ).data;

export const getBridges = async (): Promise<BridgeLanguage[]> => (await api.get('/bridges')).data;

export const getTargetLanguages = async (): Promise<TargetLanguage[]> =>
  (await api.get('/targets')).data;

export const getMyTargets = async (): Promise<TargetLanguage[]> => (await api.get('/me/targets')).data;

export const setMyTargets = async (targetLanguageIds: number[]): Promise<TargetLanguage[]> =>
  (await api.put('/me/targets', { target_language_ids: targetLanguageIds })).data;

export type CoverageBandKind = 'closed_class' | 'content';

export interface CoverageBand {
  kind: CoverageBandKind;
  label: string;
  rank_from: number | null;
  rank_to: number | null;
  total: number;
  covered: number;
  pct: number;
}

export interface BridgeCoverage {
  code: string;
  name: string;
  bands: CoverageBand[];
}

export interface TargetCoverage {
  code: string;
  name: string;
  available: boolean;
  bridges: BridgeCoverage[];
}

export interface TargetCoverageReport {
  horizon: number;
  band_size: number;
  frequency_source: string;
  targets: TargetCoverage[];
}

export const getTargetCoverage = async (): Promise<TargetCoverageReport> =>
  (await api.get('/me/target-coverage')).data;

export const getStudyQueue = async (
  bridgeCode: string,
  options: {
    limit?: number;
    band?: number | 'unranked';
    skipEnglishCognates?: boolean;
    requireEnglishCognates?: boolean;
  } = {},
): Promise<VocabularyItem[]> =>
  (
    await api.get(`/bridges/${bridgeCode}/study`, {
      params: {
        limit: options.limit ?? 20,
        band: options.band,
        skip_english_cognates: options.skipEnglishCognates,
        require_english_cognates: options.requireEnglishCognates,
      },
    })
  ).data;

export const getGameLemmas = async (
  bridgeCode: string,
  options: {
    limit: number;
    englishCognates?: 'all' | 'with' | 'without';
    partOfSpeech?: string | null;
  },
): Promise<VocabularyItem[]> =>
  (
    await api.get(`/bridges/${bridgeCode}/game-lemmas`, {
      params: {
        limit: options.limit,
        english_cognates: options.englishCognates ?? 'all',
        part_of_speech: options.partOfSpeech || undefined,
      },
    })
  ).data;

export const getPartsOfSpeech = async (bridgeCode: string): Promise<string[]> =>
  (await api.get(`/bridges/${bridgeCode}/parts-of-speech`)).data;

export const getFrequencyBands = async (
  bridgeCode: string,
  options: { skipEnglishCognates?: boolean; requireEnglishCognates?: boolean } = {},
): Promise<FrequencyBand[]> =>
  (
    await api.get(`/bridges/${bridgeCode}/frequency-bands`, {
      params: {
        skip_english_cognates: options.skipEnglishCognates ?? false,
        require_english_cognates: options.requireEnglishCognates ?? false,
      },
    })
  ).data;

export const browseVocabulary = async (
  bridgeCode: string,
  params: {
    search?: string;
    limit?: number;
    offset?: number;
    sort?: 'headword' | 'frequency';
    englishCognates?: 'all' | 'with' | 'without';
  } = {},
): Promise<{ items: VocabularyItem[]; total: number }> =>
  (
    await api.get(`/bridges/${bridgeCode}/vocabulary`, {
      params: {
        search: params.search,
        limit: params.limit,
        offset: params.offset,
        sort: params.sort,
        english_cognates: params.englishCognates,
      },
    })
  ).data;

export const browseTargetVocabulary = async (
  bridgeCode: string,
  targetCode: string,
  params: {
    search?: string;
    limit?: number;
    offset?: number;
    coverage?: TargetCoverageFilter;
    sort?: 'headword' | 'frequency';
    englishCognates?: 'all' | 'with' | 'without';
  } = {},
): Promise<{ items: TargetVocabularyItem[]; total: number }> =>
  (
    await api.get(`/bridges/${bridgeCode}/target-vocabulary`, {
      params: {
        target: targetCode,
        search: params.search,
        limit: params.limit,
        offset: params.offset,
        coverage: params.coverage,
        sort: params.sort,
        english_cognates: params.englishCognates,
      },
    })
  ).data;

export const getVocabularyItem = async (id: number): Promise<VocabularyItem> =>
  (await api.get(`/vocabulary/${id}`)).data;

export const recordReview = async (
  id: number,
  grade: VocabularyGrade,
  tier: StudyTier,
): Promise<ReviewResult> =>
  (await api.post(`/vocabulary/${id}/review`, { grade, tier })).data;

export interface SchedulePreviewRow {
  id: number;
  headword: string;
  grade: VocabularyGrade;
  next_review_at: string;
}

/** Dry-run SM-2 outcomes for the games finished-screen schedule preview. */
export const previewScheduleUpdates = async (
  updates: { id: number; grade: VocabularyGrade; tier?: StudyTier }[],
): Promise<SchedulePreviewRow[]> =>
  (await api.post('/vocabulary/preview-schedule', { updates })).data;

export const setVocabularyRemoved = async (
  id: number,
  tier: StudyTier,
  removed: boolean,
): Promise<ProgressSummary & { message: string }> =>
  (await api.post(`/vocabulary/${id}/removed`, { tier, removed })).data;

export const getMyVocabulary = async (bridgeCode: string): Promise<VocabularyItem[]> =>
  (await api.get(`/me/vocabulary`, { params: { bridge: bridgeCode } })).data;

export const getGrammarPatterns = async (bridgeCode: string): Promise<GrammarPattern[]> =>
  (await api.get(`/bridges/${bridgeCode}/grammar`)).data;

export const getGrammarPattern = async (
  bridgeCode: string,
  slug: string,
): Promise<GrammarPattern> => (await api.get(`/bridges/${bridgeCode}/grammar/${slug}`)).data;

export const recordGrammarReview = async (id: number, success: boolean): Promise<ReviewResult> =>
  (await api.post(`/grammar/${id}/review`, { success })).data;

export const getRuleCards = async (): Promise<RuleCard[]> => (await api.get('/rule-cards')).data;

export const getRuleCard = async (slug: string): Promise<RuleCard> =>
  (await api.get(`/rule-cards/${slug}`)).data;

export const recordRuleCardReview = async (id: number, success: boolean): Promise<ReviewResult> =>
  (await api.post(`/rule-cards/${id}/review`, { success })).data;

export const getCorrespondenceRules = async (bridgeCode: string): Promise<CorrespondenceRule[]> =>
  (await api.get(`/bridges/${bridgeCode}/rules`)).data;

export const getAttribution = async (): Promise<Attribution> =>
  (await api.get('/attribution')).data;

/**
 * Turns an API-relative licence path into something an anchor can point at. The licence
 * texts are served by the API, which in production is a different origin from the
 * client, so the base URL has to be prepended rather than assumed.
 */
export const apiUrl = (relativePath: string): string =>
  `${(api.defaults.baseURL ?? '/api').replace(/\/$/, '')}/${relativePath.replace(/^\//, '')}`;

export const getDueCounts = async (
  bridgeCode: string,
  options: {
    band?: number | 'unranked';
    skipEnglishCognates?: boolean;
    requireEnglishCognates?: boolean;
  } = {},
): Promise<DueCounts> =>
  (
    await api.get(`/bridges/${bridgeCode}/due`, {
      params: {
        band: options.band,
        skip_english_cognates: options.skipEnglishCognates,
        require_english_cognates: options.requireEnglishCognates,
      },
    })
  ).data;

export const getVocabularyStats = async (bridgeCode: string): Promise<VocabularyStats> =>
  (await api.get(`/bridges/${bridgeCode}/stats`)).data;

export interface TtsStatus {
  cloud: boolean;
  local: boolean;
  /** @deprecated Use `cloud`. */
  available?: boolean;
}

export const getTtsStatus = async (): Promise<TtsStatus> => (await api.get('/tts/status')).data;

export const synthesizeTts = async (body: {
  text: string;
  ipa?: string | null;
  bridgeCode: string;
  preferredLang?: string | null;
  engine?: 'cloud' | 'local';
}): Promise<Blob> =>
  (
    await api.post('/tts/synthesize', body, {
      responseType: 'blob',
    })
  ).data;

// ---------------------------------------------------------------------------------
// Decks (imported Anki decks) -- see server/src/routes/decks.ts
// ---------------------------------------------------------------------------------

export const listDecks = async (): Promise<DeckSummary[]> => (await api.get('/decks')).data;

export const getDeck = async (deckId: number): Promise<DeckSummary> =>
  (await api.get(`/decks/${deckId}`)).data;

export interface ApkgImportPreview {
  deckId: number;
  noteType: string;
  fieldNames: string[];
  sampleRows: Record<string, string>[];
  noteCount: number;
  skippedNoteTypeCount: number;
  mediaWarning: string | null;
}

export const importApkg = async (file: File): Promise<ApkgImportPreview> => {
  const form = new FormData();
  form.append('file', file);
  return (
    await api.post('/decks/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  ).data;
};

export interface DeckFieldMapping {
  englishText: string;
  englishAudio?: string | null;
  targetText: string;
  targetAudio?: string | null;
}

/**
 * This build supports Interlingua-only deck imports (no bridge picker), so `bridgeCode`
 * is narrowed to the literal 'ia' rather than a multi-bridge union type -- there is no
 * other-bridge (or Finnish) deck-import path here.
 */
export const confirmDeckMapping = async (
  deckId: number,
  bridgeCode: 'ia',
  targetLanguageCode: string,
  fieldMapping: DeckFieldMapping,
): Promise<{ cardCount: number }> =>
  (
    await api.post(`/decks/${deckId}/confirm-mapping`, {
      bridgeCode,
      targetLanguageCode,
      fieldMapping,
    })
  ).data;

/**
 * Kept for API parity with the server route even though nothing in this build's UI
 * calls it -- there is no Interlingua translation engine here, so DeckDetailPage shows
 * the Translate action disabled rather than wiring it up. See TranslatePage.
 */
export const translateDeck = async (deckId: number): Promise<{ status: string }> =>
  (await api.post(`/decks/${deckId}/translate`)).data;

export const deleteDeck = async (deckId: number): Promise<void> => {
  await api.delete(`/decks/${deckId}`);
};

async function downloadAuthed(path: string, filename: string): Promise<void> {
  const response = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const downloadDeckExport = (deckId: number, deckName: string): Promise<void> =>
  downloadAuthed(`/decks/${deckId}/export.txt`, `${deckName || 'deck'}.txt`);

export const downloadUntranslatedWords = (deckId: number, deckName: string): Promise<void> =>
  downloadAuthed(
    `/decks/${deckId}/export/untranslated.txt`,
    `${deckName || 'deck'}-untranslated.txt`,
  );

/**
 * A full JSON backup of the deck -- every card field, its audio, and the caller's own
 * SRS history -- meant for moving the deck (with edits and study progress) to another
 * account or install. See server/src/services/deckExport.ts's `buildDeckBackup`.
 */
export const downloadDeckBackup = (deckId: number, deckName: string): Promise<void> =>
  downloadAuthed(`/decks/${deckId}/export/backup.json`, `${deckName || 'deck'}-backup.json`);

export interface DeckDueCounts {
  new: number;
  review: number;
  vocabulary: number;
}

export const getDeckStudyQueue = async (
  deckId: number,
  options: { limit?: number } = {},
): Promise<VocabularyItem[]> =>
  (
    await api.get(`/decks/${deckId}/study`, {
      params: {
        limit: options.limit ?? 20,
      },
    })
  ).data;

export const getDeckDueCounts = async (deckId: number): Promise<DeckDueCounts> =>
  (await api.get(`/decks/${deckId}/due`)).data;

export const recordDeckCardReview = async (
  deckCardId: number,
  grade: VocabularyGrade,
  tier: StudyTier,
): Promise<ReviewResult> =>
  (await api.post(`/deck-cards/${deckCardId}/review`, { grade, tier })).data;

export const setDeckCardRemoved = async (
  deckCardId: number,
  tier: StudyTier,
  removed: boolean,
): Promise<ProgressSummary & { message: string }> =>
  (await api.post(`/deck-cards/${deckCardId}/removed`, { tier, removed })).data;

export type DeckAudioField = 'english' | 'bridge' | 'target';

export const getDeckCardAudio = async (
  deckCardId: number,
  field: DeckAudioField,
): Promise<Blob> =>
  (await api.get(`/deck-cards/${deckCardId}/audio/${field}`, { responseType: 'blob' })).data;

export const saveBridgeAudio = async (deckCardId: number, audio: Blob): Promise<void> => {
  const form = new FormData();
  form.append('audio', audio, 'recording.webm');
  await api.post(`/deck-cards/${deckCardId}/bridge-audio`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export default api;
