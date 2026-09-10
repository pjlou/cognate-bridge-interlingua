/**
 * Browser TTS stand-in voices sometimes misread bridge headwords. Flag those
 * (bridge + headword + voice language) so speech skips them. When every stand-in
 * for the bridge is flagged, play a corrected clip from
 * `/tts-corrections/{bridge}/{headword}.wav` if present; otherwise stay silent.
 */

export type StandInVoiceLang =
  | 'de'
  | 'nl'
  | 'da'
  | 'no'
  | 'sv'
  | 'it'
  | 'es'
  | 'fr'
  | 'pt'
  | 'ro'
  | 'ca'
  | 'fi';

type FlagKey = `${string}:${string}`;

/** Incorrect browser pronunciations: bridge:headword → flagged voice langs. */
const INCORRECT_PRONUNCIATIONS: Record<FlagKey, readonly StandInVoiceLang[]> = {};

/** Test-only overlay; null means use the built-in table. */
let incorrectPronunciationsForTests: Record<FlagKey, readonly StandInVoiceLang[]> | null = null;

/** Natural-language stand-ins used when a bridge has no native TTS voice. */
const standInsForBridge: Record<string, readonly StandInVoiceLang[]> = {
  // Romance targets that have usable TTS (including Catalan).
  ia: ['it', 'es', 'fr', 'pt', 'ro', 'ca'],
  fin: ['fi'],
};

function flagKey(bridgeCode: string, headword: string): FlagKey {
  return `${bridgeCode}:${headword.trim().toLowerCase()}` as FlagKey;
}

function flaggedLangs(bridgeCode: string, headword: string): readonly StandInVoiceLang[] | undefined {
  const key = flagKey(bridgeCode, headword);
  return incorrectPronunciationsForTests?.[key] ?? INCORRECT_PRONUNCIATIONS[key];
}

/** Test helper: replace or clear the incorrect-pronunciation table. */
export function setIncorrectPronunciationsForTests(
  map: Record<string, readonly StandInVoiceLang[]> | null,
): void {
  incorrectPronunciationsForTests = map as Record<FlagKey, readonly StandInVoiceLang[]> | null;
}

export function correctionAudioUrl(bridgeCode: string, headword: string): string {
  const word = encodeURIComponent(headword.trim().toLowerCase());
  return `/tts-corrections/${bridgeCode}/${word}.wav`;
}

export function isPronunciationFlagged(
  bridgeCode: string,
  headword: string,
  lang: StandInVoiceLang,
): boolean {
  const flagged = flaggedLangs(bridgeCode, headword);
  return Boolean(flagged?.includes(lang));
}

/** Stand-in languages for this bridge that are not flagged for the headword. */
export function usableStandInLangs(bridgeCode: string, headword: string): StandInVoiceLang[] {
  const standIns = standInsForBridge[bridgeCode] ?? [];
  return standIns.filter((lang) => !isPronunciationFlagged(bridgeCode, headword, lang));
}

export function allStandInPronunciationsFlagged(bridgeCode: string, headword: string): boolean {
  const standIns = standInsForBridge[bridgeCode] ?? [];
  if (standIns.length === 0) return false;
  return standIns.every((lang) => isPronunciationFlagged(bridgeCode, headword, lang));
}

export function voiceLangFromTag(tag: string): StandInVoiceLang | null {
  const base = tag.replace('_', '-').split('-')[0]?.toLowerCase();
  if (
    base === 'de' ||
    base === 'nl' ||
    base === 'da' ||
    base === 'no' ||
    base === 'nb' ||
    base === 'nn' ||
    base === 'sv' ||
    base === 'it' ||
    base === 'es' ||
    base === 'fr' ||
    base === 'pt' ||
    base === 'ro' ||
    base === 'ca' ||
    base === 'fi'
  ) {
    if (base === 'nb' || base === 'nn') return 'no';
    return base;
  }
  return null;
}

/** Cache of HEAD probes so we do not re-hit missing corrections every Reveal. */
const correctionProbeCache = new Map<string, boolean>();

/** Test helper. */
export function resetCorrectionProbeCache(): void {
  correctionProbeCache.clear();
}

export async function findCorrectionAudioUrl(
  bridgeCode: string,
  headword: string,
): Promise<string | null> {
  const url = correctionAudioUrl(bridgeCode, headword);
  if (correctionProbeCache.has(url)) {
    return correctionProbeCache.get(url) ? url : null;
  }
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const ok = response.ok;
    correctionProbeCache.set(url, ok);
    return ok ? url : null;
  } catch {
    correctionProbeCache.set(url, false);
    return null;
  }
}
