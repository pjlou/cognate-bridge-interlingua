/**
 * Approximate Unicode IPA as orthography a browser TTS voice can read.
 *
 * Engines ignore SSML phoneme tags, so we map phones onto Italian-friendly
 * graphemes for the Romance bridge voice.
 */

export type SpeakLocale = 'it';

const STRESS = /[ˈˌ]/g;

/** Longest-first so digraphs like dʒ / aʊ win over single letters. */
const PHONES = [
  'dʒ',
  'tʃ',
  'dz',
  'ts',
  'aʊ',
  'aɪ',
  'eɪ',
  'oʊ',
  'ɔɪ',
  'eu',
  'ai',
  'au',
  'ɑː',
  'ɛː',
  'ɔː',
  'iː',
  'uː',
  'yː',
  'eː',
  'oː',
  'øː',
  'æː',
  'ʃ',
  'ʒ',
  'ŋ',
  'ʋ',
  'θ',
  'ð',
  'ʁ',
  'ç',
  'ɣ',
  'x',
  'ɑ',
  'ɛ',
  'ɔ',
  'ɪ',
  'ʊ',
  'ʏ',
  'ə',
  'æ',
  'ø',
  'ɜ',
  'ɒ',
  'ʌ',
  'ɡ',
  'g',
  'j',
  'w',
  'y',
  'ː',
] as const;

const IT: Record<string, string> = {
  dʒ: 'gi',
  tʃ: 'ci',
  dz: 'z',
  ts: 'z',
  aʊ: 'au',
  aɪ: 'ai',
  eɪ: 'ei',
  oʊ: 'o',
  ɔɪ: 'oi',
  eu: 'eu',
  ai: 'ai',
  au: 'au',
  ɑː: 'a',
  ɛː: 'e',
  ɔː: 'o',
  iː: 'i',
  uː: 'u',
  yː: 'u',
  eː: 'e',
  oː: 'o',
  øː: 'e',
  æː: 'a',
  ʃ: 'sc',
  ʒ: 'j',
  ŋ: 'n',
  ʋ: 'v',
  θ: 't',
  ð: 'd',
  ʁ: 'r',
  ç: 'c',
  ɣ: 'g',
  x: 'c',
  ɑ: 'a',
  ɛ: 'e',
  ɔ: 'o',
  ɪ: 'i',
  ʊ: 'u',
  ʏ: 'u',
  ə: 'e',
  æ: 'a',
  ø: 'e',
  ɜ: 'e',
  ɒ: 'o',
  ʌ: 'a',
  ɡ: 'g',
  g: 'g',
  j: 'j',
  w: 'u',
  y: 'u',
};

function mapPhone(phone: string, previous: string): string {
  const table = IT;

  if (phone === 'ː') {
    // Length mark with no vowel already consumed — double the last letter if any.
    if (!previous) return '';
    const last = previous[previous.length - 1]!;
    return /[aeiouäöüy]/i.test(last) ? last : '';
  }

  return table[phone] ?? phone;
}

/**
 * Convert Unicode IPA to speakable text for the bridge's TTS voice locale.
 * Returns null when there is nothing usable so the caller can fall back to the headword.
 *
 * `_bridgeCode` is kept in the signature for API symmetry with callers even though every
 * remaining bridge (Interlingua, and Finnish which never reaches this function) uses the
 * same Italian-friendly respelling.
 */
export function ipaToSpeakText(ipa: string | null | undefined, _bridgeCode: string): string | null {
  if (!ipa) return null;
  const cleaned = ipa.normalize('NFC').replace(STRESS, '').trim();
  if (!cleaned) return null;

  const parts: string[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i]!;
    if (ch === ' ' || ch === '-') {
      parts.push(ch === '-' ? '-' : ' ');
      i += 1;
      continue;
    }

    let matched: string | null = null;
    for (const phone of PHONES) {
      if (cleaned.startsWith(phone, i)) {
        matched = phone;
        break;
      }
    }

    if (matched) {
      const prev = parts.join('');
      const grapheme = mapPhone(matched, prev);
      if (grapheme) parts.push(grapheme);
      i += matched.length;
      continue;
    }

    // Plain Latin letters and punctuation already readable by TTS.
    if (/[a-zA-Z'’.]/.test(ch)) {
      parts.push(ch.toLowerCase());
      i += 1;
      continue;
    }

    // Unknown IPA symbol — skip rather than feeding garbage to the engine.
    i += 1;
  }

  const text = parts.join('').replace(/\s+/g, ' ').trim();
  return text || null;
}
