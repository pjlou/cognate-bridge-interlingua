/**
 * Matching-game hint reveal preferences.
 * A single per-bridge language choice; `off` (default) disables cognate hints
 * on the Pause button. Pause itself always works.
 */

import type { GameLemma } from './matchingEngine';

export type RomanceHintLang = 'it' | 'es' | 'fr' | 'pt' | 'ro';
/** Stored preference: Off or a concrete hint language. */
export type HintRevealPref = 'off' | RomanceHintLang;

export const ROMANCE_HINT_LANGS: ReadonlyArray<{ code: RomanceHintLang; label: string }> = [
  { code: 'it', label: 'Italian' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ro', label: 'Romanian' },
];

const SIDE_KEY = (bridge: string) => `cb.matchHint.side.${bridge}`;
const LANG_KEY = (bridge: string) => `cb.matchHint.lang.${bridge}`;
const SWAP_KEY = (bridge: string) => `cb.matchHint.swap.${bridge}`;

const ROMANCE_CODES = new Set<string>(ROMANCE_HINT_LANGS.map((l) => l.code));

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

export function hintLangAllowed(bridgeCode: string, lang: string): boolean {
  if (lang === 'off') return true;
  if (bridgeCode === 'ia') return ROMANCE_CODES.has(lang);
  return false;
}

/**
 * Read hint language preference. Default is Off.
 * Migrates legacy side=off (or missing lang with side off) to Off.
 */
export function readHintRevealPref(bridgeCode: string): HintRevealPref {
  const storedLang = readStored(LANG_KEY(bridgeCode));
  const storedSide = readStored(SIDE_KEY(bridgeCode));

  if (storedLang === 'off') return 'off';
  if (storedLang && hintLangAllowed(bridgeCode, storedLang)) {
    // Legacy: language was stored even when side was Off — honor Off.
    if (storedSide === 'off') return 'off';
    return storedLang as RomanceHintLang;
  }
  if (storedSide === 'off' || storedSide === null || storedSide === undefined) {
    return 'off';
  }
  // Legacy side enabled but lang missing/invalid → Off rather than guessing.
  return 'off';
}

export function writeHintRevealPref(bridgeCode: string, pref: HintRevealPref): void {
  writeStored(LANG_KEY(bridgeCode), pref);
  // Clear legacy side key so future reads stay on the single-pref model.
  try {
    localStorage.removeItem(SIDE_KEY(bridgeCode));
  } catch {
    /* private mode */
  }
}

export function readHintRevealSwap(bridgeCode: string): boolean {
  return readStored(SWAP_KEY(bridgeCode)) === 'true';
}

export function writeHintRevealSwap(bridgeCode: string, swap: boolean): void {
  writeStored(SWAP_KEY(bridgeCode), String(swap));
}

export type HintPeekResolution =
  | { kind: 'peek'; text: string }
  | { kind: 'missing' }
  | { kind: 'none' };

/** Cognate text for the Pause button label when a tile is selected. */
export function resolveHintReveal(
  lemma: GameLemma,
  pref: HintRevealPref,
): HintPeekResolution {
  if (pref === 'off') return { kind: 'none' };
  const cognate = lemma.cognatesByCode[pref]?.trim();
  if (!cognate) return { kind: 'missing' };
  return { kind: 'peek', text: cognate };
}
