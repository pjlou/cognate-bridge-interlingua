import { afterEach, describe, expect, it } from 'vitest';
import {
  allStandInPronunciationsFlagged,
  correctionAudioUrl,
  isPronunciationFlagged,
  setIncorrectPronunciationsForTests,
  usableStandInLangs,
} from './ttsPronunciationFlags';

describe('ttsPronunciationFlags', () => {
  afterEach(() => {
    setIncorrectPronunciationsForTests(null);
  });

  it('flags a word as wrong on one stand-in but not another', () => {
    setIncorrectPronunciationsForTests({ 'ia:aqua': ['it'] });
    expect(isPronunciationFlagged('ia', 'aqua', 'it')).toBe(true);
    expect(isPronunciationFlagged('ia', 'Aqua', 'it')).toBe(true);
    expect(isPronunciationFlagged('ia', 'aqua', 'es')).toBe(false);
    expect(usableStandInLangs('ia', 'aqua')).toEqual(['es', 'fr', 'pt', 'ro', 'ca']);
    expect(allStandInPronunciationsFlagged('ia', 'aqua')).toBe(false);
  });

  it('treats a word as fully blocked when every stand-in is flagged', () => {
    setIncorrectPronunciationsForTests({
      'ia:aqua': ['it', 'es', 'fr', 'pt', 'ro', 'ca'],
    });
    expect(usableStandInLangs('ia', 'aqua')).toEqual([]);
    expect(allStandInPronunciationsFlagged('ia', 'aqua')).toBe(true);
  });

  it('exposes Romance stand-ins including Catalan for Interlingua', () => {
    expect(usableStandInLangs('ia', 'casa')).toEqual(['it', 'es', 'fr', 'pt', 'ro', 'ca']);
  });

  it('exposes the Finnish stand-in', () => {
    expect(usableStandInLangs('fin', 'kukka')).toEqual(['fi']);
  });

  it('builds a stable correction clip URL', () => {
    expect(correctionAudioUrl('ia', 'Aqua')).toBe('/tts-corrections/ia/aqua.wav');
  });
});
