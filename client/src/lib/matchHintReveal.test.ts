import { afterEach, describe, expect, it } from 'vitest';
import type { GameLemma } from './matchingEngine';
import {
  hintLangAllowed,
  readHintRevealPref,
  resolveHintReveal,
  writeHintRevealPref,
} from './matchHintReveal';

function lemma(overrides: Partial<GameLemma> = {}): GameLemma {
  return {
    id: 1,
    headword: 'casa',
    english: 'house',
    gloss_en: 'house',
    cognatesByCode: { it: 'casa', es: 'casa', fr: 'maison' },
    ipa: null,
    bridge_language_code: 'ia',
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe('matchHintReveal', () => {
  it('defaults to off', () => {
    expect(readHintRevealPref('ia')).toBe('off');
    expect(readHintRevealPref('fin')).toBe('off');
  });

  it('persists language prefs per bridge', () => {
    writeHintRevealPref('ia', 'fr');
    expect(readHintRevealPref('ia')).toBe('fr');
    expect(readHintRevealPref('fin')).toBe('off');
  });

  it('allows Romance hint languages only for Interlingua', () => {
    expect(hintLangAllowed('ia', 'pt')).toBe(true);
    expect(hintLangAllowed('fin', 'pt')).toBe(false);
    expect(hintLangAllowed('ia', 'off')).toBe(true);
    expect(hintLangAllowed('fin', 'off')).toBe(true);
  });

  it('migrates legacy side=off to off even if a language was stored', () => {
    localStorage.setItem('cb.matchHint.lang.ia', 'fr');
    localStorage.setItem('cb.matchHint.side.ia', 'off');
    expect(readHintRevealPref('ia')).toBe('off');
  });

  it('resolves cognates, missing forms, and off', () => {
    expect(resolveHintReveal(lemma(), 'off')).toEqual({ kind: 'none' });
    expect(resolveHintReveal(lemma(), 'it')).toEqual({ kind: 'peek', text: 'casa' });
    expect(resolveHintReveal(lemma(), 'fr')).toEqual({ kind: 'peek', text: 'maison' });
    expect(resolveHintReveal(lemma(), 'pt')).toEqual({ kind: 'missing' });
  });
});
