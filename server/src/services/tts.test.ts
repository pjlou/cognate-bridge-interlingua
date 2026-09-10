import { describe, expect, it } from 'vitest';
import { buildSsml, isCloudTtsAvailable } from './tts.js';

describe('isCloudTtsAvailable', () => {
  it('is false when GOOGLE_TTS_API_KEY is unset', () => {
    expect(isCloudTtsAvailable()).toBe(false);
  });
});

describe('buildSsml', () => {
  it('wraps usable IPA in a phoneme tag', () => {
    expect(buildSsml('water', 'ˈʋɑːtər')).toBe(
      '<speak><phoneme alphabet="ipa" ph="ˈʋɑːtər">water</phoneme></speak>',
    );
  });

  it('falls back to plain speak text when IPA is missing', () => {
    expect(buildSsml('haus', null)).toBe('<speak>haus</speak>');
  });

  it('escapes XML in the spoken text', () => {
    expect(buildSsml('a&b', null)).toBe('<speak>a&amp;b</speak>');
  });

  it('skips unsafe IPA and speaks the headword only', () => {
    expect(buildSsml('haus', 'haʊs"><break')).toBe('<speak>haus</speak>');
  });
});
