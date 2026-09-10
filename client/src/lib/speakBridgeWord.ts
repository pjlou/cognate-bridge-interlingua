import { getTtsStatus, synthesizeTts, type TtsStatus } from '../services/api';
import { ipaToSpeakText } from './ipaToSpeakText';
import {
  allStandInPronunciationsFlagged,
  findCorrectionAudioUrl,
  usableStandInLangs,
  type StandInVoiceLang,
} from './ttsPronunciationFlags';
import { cancelWasmSpeech, speakWithWasm, type WasmVoiceLang } from './wasmTts';

export type IpaSource = 'direct_phonology' | 'derived_phonology' | 'uncertain_phonology';

export interface SpeakBridgeWordInput {
  text: string;
  bridgeCode: string;
  ipa?: string | null;
  ipaSource?: IpaSource | null;
}

export type SpeakResult = { spoken: true } | { spoken: false; message: string };

export type GermanicVoicePref = 'de' | 'nl' | 'da' | 'no' | 'sv' | 'random';
/** Shared Romance stand-ins (natural languages with TTS) plus Random. */
export type RomanceVoicePref = 'it' | 'es' | 'fr' | 'pt' | 'ro' | 'ca' | 'random';
export type TtsEnginePref = 'browser' | 'wasm' | 'local' | 'cloud';

const GERMANIC_VOICE_KEY = 'cb.tts.voice.germanic';
const IA_VOICE_KEY = 'cb.tts.voice.ia';
const ENGINE_KEY = 'cb.tts.engine';

const GERMANIC_PREFS = new Set<string>(['de', 'nl', 'da', 'no', 'sv', 'random']);
const ROMANCE_PREFS = new Set<string>(['it', 'es', 'fr', 'pt', 'ro', 'ca', 'random']);

let ttsStatusCache: TtsStatus | null = null;
let cloudAudio: HTMLAudioElement | null = null;
let cloudObjectUrl: string | null = null;
/** Last server TTS clip — Replay reuses it instead of re-synthesizing. */
let lastServerClip: { key: string; blob: Blob } | null = null;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function readGermanicVoicePref(): GermanicVoicePref {
  const stored = readStored(GERMANIC_VOICE_KEY);
  if (stored && GERMANIC_PREFS.has(stored)) return stored as GermanicVoicePref;
  return 'de';
}

export function writeGermanicVoicePref(pref: GermanicVoicePref): void {
  writeStored(GERMANIC_VOICE_KEY, pref);
}

export function readRomanceVoicePref(): RomanceVoicePref {
  const stored = readStored(IA_VOICE_KEY);
  if (stored && ROMANCE_PREFS.has(stored)) return stored as RomanceVoicePref;
  return 'it';
}

export function writeRomanceVoicePref(pref: RomanceVoicePref): void {
  writeStored(IA_VOICE_KEY, pref);
}

export function readTtsEnginePref(): TtsEnginePref {
  const stored = readStored(ENGINE_KEY);
  if (stored === 'local' || stored === 'cloud' || stored === 'browser' || stored === 'wasm') {
    return stored;
  }
  return 'browser';
}

export function writeTtsEnginePref(engine: TtsEnginePref): void {
  writeStored(ENGINE_KEY, engine);
}

function standInChoices(bridgeCode: string): StandInVoiceLang[] {
  if (bridgeCode === 'fin') return ['fi'];
  return ['it', 'es', 'fr', 'pt', 'ro', 'ca'];
}

function tagsForLang(lang: StandInVoiceLang): string[] {
  if (lang === 'de') return ['de-DE', 'de'];
  if (lang === 'nl') return ['nl-NL', 'nl'];
  if (lang === 'da') return ['da-DK', 'da'];
  if (lang === 'no') return ['nb-NO', 'nb', 'no-NO', 'no', 'nn-NO', 'nn'];
  if (lang === 'sv') return ['sv-SE', 'sv'];
  if (lang === 'it') return ['it-IT', 'it'];
  if (lang === 'es') return ['es-ES', 'es'];
  if (lang === 'fr') return ['fr-FR', 'fr'];
  if (lang === 'pt') return ['pt-PT', 'pt-BR', 'pt'];
  if (lang === 'ro') return ['ro-RO', 'ro'];
  if (lang === 'ca') return ['ca-ES', 'ca'];
  return ['fi-FI', 'fi'];
}

function pickRandomLang(langs: StandInVoiceLang[]): StandInVoiceLang | undefined {
  if (langs.length === 0) return undefined;
  return langs[Math.floor(Math.random() * langs.length)]!;
}

/**
 * Resolve which stand-in voice language to prefer for this speak.
 * `random` picks uniformly among the given choices (typically usable stand-ins).
 */
export function resolvePreferredStandIn(
  bridgeCode: string,
  choices: StandInVoiceLang[],
): StandInVoiceLang | undefined {
  if (choices.length === 0) return undefined;
  if (bridgeCode === 'fin') return 'fi';

  if (bridgeCode === 'ia') {
    const pref = readRomanceVoicePref();
    if (pref === 'random') return pickRandomLang(choices);
    return choices.includes(pref) ? pref : choices[0];
  }

  return choices[0];
}

function orderedLangTags(primary: StandInVoiceLang, fallbacks: StandInVoiceLang[]): string[] {
  const rest = fallbacks.filter((lang) => lang !== primary);
  return [...tagsForLang(primary), ...rest.flatMap(tagsForLang)];
}

/** BCP-47 tags for the bridge, ordered by the user's priority preference. */
export function preferredLangTags(bridgeCode: string): string[] {
  const choices = standInChoices(bridgeCode);
  const primary = resolvePreferredStandIn(bridgeCode, choices);
  if (!primary) return [];
  return orderedLangTags(primary, choices);
}

/**
 * Preferred browser voice tags with known-bad pronunciations for this headword removed.
 * Random voice is chosen among usable stand-ins only.
 */
export function preferredLangTagsForWord(bridgeCode: string, headword: string): string[] {
  const usable = usableStandInLangs(bridgeCode, headword);
  const primary = resolvePreferredStandIn(bridgeCode, usable);
  if (!primary) return [];
  return orderedLangTags(primary, usable);
}

export function missingVoiceInstallMessage(bridgeCode: string): string {
  if (bridgeCode === 'fin') return 'Install a Finnish speech voice';
  if (bridgeCode === 'ia') {
    return 'Install an Italian, Spanish, French, Portuguese, Romanian, or Catalan speech voice';
  }
  return 'Install a speech voice for this language';
}

function voiceMatches(voice: SpeechSynthesisVoice, pref: string): boolean {
  const lang = voice.lang.replace('_', '-');
  return (
    lang.toLowerCase() === pref.toLowerCase() ||
    lang.toLowerCase().startsWith(`${pref.toLowerCase()}-`)
  );
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  bridgeCode: string,
  headword?: string,
): SpeechSynthesisVoice | null {
  const tags =
    headword !== undefined && headword.trim() !== ''
      ? preferredLangTagsForWord(bridgeCode, headword)
      : preferredLangTags(bridgeCode);

  for (const pref of tags) {
    const match = voices.find((voice) => voiceMatches(voice, pref));
    if (match) return match;
  }
  return null;
}

export function resolveSpeakText(input: SpeakBridgeWordInput): string {
  // Finnish orthography is close enough for a fi-FI voice; do not Italian-respell IPA.
  if (input.bridgeCode === 'fin') return input.text;

  const usable =
    input.ipa &&
    input.ipaSource !== 'uncertain_phonology' &&
    ipaToSpeakText(input.ipa, input.bridgeCode);

  return usable || input.text;
}

/** Test helper: clear the cached TTS status. */
export function resetCloudTtsCache(): void {
  ttsStatusCache = null;
  lastServerClip = null;
}

export async function fetchTtsStatus(force = false): Promise<TtsStatus> {
  if (!force && ttsStatusCache) return ttsStatusCache;
  try {
    const status = await getTtsStatus();
    ttsStatusCache = {
      cloud: Boolean(status.cloud ?? status.available),
      local: Boolean(status.local),
      available: Boolean(status.cloud ?? status.available),
    };
  } catch {
    ttsStatusCache = { cloud: false, local: false, available: false };
  }
  return ttsStatusCache;
}

function stopCloudAudio(): void {
  if (cloudAudio) {
    cloudAudio.pause();
    cloudAudio.removeAttribute('src');
    cloudAudio.load();
    cloudAudio = null;
  }
  if (cloudObjectUrl) {
    URL.revokeObjectURL(cloudObjectUrl);
    cloudObjectUrl = null;
  }
}

export function cancelBridgeSpeech(): void {
  stopCloudAudio();
  cancelWasmSpeech();
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve([]);

  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, 750);
  });
}

async function playCorrectionClip(url: string): Promise<boolean> {
  stopCloudAudio();
  cloudAudio = new Audio(url);
  cloudObjectUrl = null;
  await cloudAudio.play();
  return true;
}

async function speakWithBrowser(input: SpeakBridgeWordInput): Promise<SpeakResult> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return { spoken: false, message: missingVoiceInstallMessage(input.bridgeCode) };
  }

  const headword = input.text.trim();
  const text = resolveSpeakText(input).trim();
  if (!text) return { spoken: true };

  // Every stand-in voice is known-bad: corrected file or silence (no wrong TTS).
  if (allStandInPronunciationsFlagged(input.bridgeCode, headword)) {
    const correction = await findCorrectionAudioUrl(input.bridgeCode, headword);
    if (correction) {
      try {
        await playCorrectionClip(correction);
        return { spoken: true };
      } catch {
        return { spoken: true };
      }
    }
    return { spoken: true };
  }

  const voices = await loadVoices();
  const voice = pickVoice(voices, input.bridgeCode, headword);
  if (!voice) {
    // Preferred voice(s) flagged and no fallback voice installed — still try a clip.
    const correction = await findCorrectionAudioUrl(input.bridgeCode, headword);
    if (correction) {
      try {
        await playCorrectionClip(correction);
        return { spoken: true };
      } catch {
        /* fall through */
      }
    }
    return { spoken: false, message: missingVoiceInstallMessage(input.bridgeCode) };
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  window.speechSynthesis.speak(utterance);
  return { spoken: true };
}

function preferredServerLang(bridgeCode: string, headword?: string): string | undefined {
  const choices =
    headword !== undefined && headword.trim() !== ''
      ? usableStandInLangs(bridgeCode, headword)
      : standInChoices(bridgeCode);
  return resolvePreferredStandIn(bridgeCode, choices);
}

function wasmVoiceForBridge(bridgeCode: string, headword?: string): WasmVoiceLang {
  const lang = preferredServerLang(bridgeCode, headword);
  if (lang === 'no') return 'nb';
  if (
    lang === 'nl' ||
    lang === 'de' ||
    lang === 'da' ||
    lang === 'sv' ||
    lang === 'it' ||
    lang === 'es' ||
    lang === 'fr' ||
    lang === 'pt' ||
    lang === 'ro' ||
    lang === 'ca' ||
    lang === 'fi'
  ) {
    return lang;
  }
  return 'it';
}

async function speakWithServer(
  input: SpeakBridgeWordInput,
  engine: 'cloud' | 'local',
): Promise<boolean> {
  const preferredLang = preferredServerLang(input.bridgeCode, input.text);
  const cacheKey = JSON.stringify({
    engine,
    text: input.text,
    ipa: input.ipa ?? null,
    bridgeCode: input.bridgeCode,
    preferredLang: preferredLang ?? null,
  });

  let blob = lastServerClip?.key === cacheKey ? lastServerClip.blob : null;
  if (!blob) {
    blob = await synthesizeTts({
      text: input.text,
      ipa: input.ipa,
      bridgeCode: input.bridgeCode,
      preferredLang,
      engine,
    });
    if (!(blob instanceof Blob) || blob.size === 0) return false;
    lastServerClip = { key: cacheKey, blob };
  }

  stopCloudAudio();
  cloudObjectUrl = URL.createObjectURL(blob);
  cloudAudio = new Audio(cloudObjectUrl);
  await cloudAudio.play();
  return true;
}

async function speakWithWasmEngine(input: SpeakBridgeWordInput): Promise<SpeakResult> {
  const text = resolveSpeakText(input).trim();
  if (!text) return { spoken: true };
  try {
    await speakWithWasm(text, wasmVoiceForBridge(input.bridgeCode, input.text));
    return { spoken: true };
  } catch {
    return { spoken: false, message: 'WASM TTS failed to load' };
  }
}

export async function speakBridgeWord(input: SpeakBridgeWordInput): Promise<SpeakResult> {
  cancelBridgeSpeech();

  const text = input.text.trim();
  if (!text) return { spoken: true };

  const status = await fetchTtsStatus();
  let engine = readTtsEnginePref();

  // A stored "local" choice is invalid when Piper is not installed.
  if (engine === 'local' && !status.local) {
    engine = 'browser';
    writeTtsEnginePref('browser');
  }
  if (engine === 'cloud' && !status.cloud) {
    engine = 'browser';
    writeTtsEnginePref('browser');
  }

  if (engine === 'wasm') {
    const result = await speakWithWasmEngine(input);
    if (result.spoken) return result;
    // Fall through to browser if WASM failed and a browser voice exists.
  }

  if (engine === 'local' || engine === 'cloud') {
    try {
      if (await speakWithServer(input, engine)) return { spoken: true };
    } catch {
      // Fall through to browser Web Speech.
    }
  }

  return speakWithBrowser(input);
}
