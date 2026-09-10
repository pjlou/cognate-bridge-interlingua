import { describe, expect, it } from 'vitest';
import { ipaToSpeakText } from './ipaToSpeakText';

describe('ipaToSpeakText', () => {
  it('returns null for missing or empty IPA', () => {
    expect(ipaToSpeakText(null, 'ia')).toBeNull();
    expect(ipaToSpeakText(undefined, 'ia')).toBeNull();
    expect(ipaToSpeakText('', 'ia')).toBeNull();
    expect(ipaToSpeakText('ˈˌ', 'ia')).toBeNull();
  });

  it('respells Interlingua IPA for an Italian voice', () => {
    expect(ipaToSpeakText('ˈfilja', 'ia')).toBe('filja');
    expect(ipaToSpeakText('ˈliŋgwa', 'ia')).toBe('lingua');
  });

  it('keeps spaces in multi-word IPA', () => {
    expect(ipaToSpeakText('ˈfilo de ˈauro', 'ia')).toBe('filo de auro');
  });
});
