import type {
  Attribution,
  AttributionSource,
  Cognate,
  GrammarExample,
  GrammarPattern,
  RuleCard,
  RuleCardExample,
  TargetLanguage,
  VocabularyItem,
} from '../services/api';

/** Builders for API shapes, so a test only states the fields it is actually about. */

export const LANGUAGES: Record<string, TargetLanguage> = {
  en: { id: 1, code: 'en', name: 'English', family: 'Germanic' },
  nl: { id: 2, code: 'nl', name: 'Dutch', family: 'Germanic' },
  de: { id: 3, code: 'de', name: 'German', family: 'Germanic' },
  es: { id: 7, code: 'es', name: 'Spanish', family: 'Romance' },
  it: { id: 9, code: 'it', name: 'Italian', family: 'Romance' },
  ia: { id: 12, code: 'ia', name: 'Interlingua', family: 'Romance' },
  fi: { id: 14, code: 'fi', name: 'Finnish', family: 'Uralic' },
};

let nextId = 1000;

export function cognate(overrides: Partial<Cognate> = {}): Cognate {
  return {
    id: (nextId += 1),
    target_language: LANGUAGES.de!,
    target_word: 'Apfel',
    provenance: 'parsed',
    confidence: 1,
    validated_against: null,
    notes: null,
    rule: null,
    rules: [],
    ...overrides,
  };
}

export function vocabularyItem(overrides: Partial<VocabularyItem> = {}): VocabularyItem {
  return {
    id: (nextId += 1),
    bridge_language_id: 1,
    bridge_language_code: 'ia',
    headword: 'appel',
    part_of_speech: 'n',
    gloss_en: 'apple',
    glosses_en: ['apple'],
    ipa: null,
    ipa_source: null,
    etymology: null,
    difficulty_level: 1,
    frequency_rank: 54,
    frequency_band: 1,
    has_english_cognate: false,
    transparency_score: null,
    priority_score: null,
    source_ref: 'IEDICT 2019',
    cognates: [],
    progress: null,
    tier: 1,
    ...overrides,
  };
}

export function grammarExample(overrides: Partial<GrammarExample> = {}): GrammarExample {
  return {
    id: (nextId += 1),
    position: 1,
    bridge_text: 'Ick at en appel.',
    gloss_en: 'I ate an apple.',
    highlight: null,
    prompt: 'I ate an apple.',
    answer: 'Ick at en appel.',
    distractors: ['At ick en appel?'],
    note: null,
    parallels: [],
    ...overrides,
  };
}

export function grammarPattern(overrides: Partial<GrammarPattern> = {}): GrammarPattern {
  return {
    id: (nextId += 1),
    bridge_language_id: 1,
    bridge_language_code: 'ia',
    slug: 'v2-word-order',
    name: 'Verb-second word order',
    family: 'Romance',
    summary: 'The finite verb takes the second slot.',
    description: 'This bridge is verb-second.',
    source_note: 'Cognate Bridge grammar reference v2.01',
    difficulty_level: 3,
    drill_kind: 'multiple_choice',
    example_count: 1,
    examples: [grammarExample()],
    progress: null,
    ...overrides,
  };
}

export function ruleCardExample(overrides: Partial<RuleCardExample> = {}): RuleCardExample {
  return {
    id: (nextId += 1),
    position: 1,
    prompt: 'Romance / Latin pater. Which English cousin?',
    answer: 'father',
    distractors: ['paper', 'path'],
    note: 'pater → father / Vater.',
    false_friend: false,
    forms: { la: 'pater', en: 'father', de: 'Vater' },
    ...overrides,
  };
}

export function ruleCard(overrides: Partial<RuleCard> = {}): RuleCard {
  return {
    id: (nextId += 1),
    slug: 'grimm-stop-fricative',
    name: "Grimm's law: stop ↔ fricative",
    tier: 1,
    position: 1,
    teaching_frame: 'A Romance word starting with p- may have an English cousin starting with f-.',
    pattern_summary: 'Romance p- ↔ Germanic f-.',
    description: 'Try substituting f- when you hear Romance p-.',
    caveat: null,
    source_note: 'Cognate Bridge rule cards',
    difficulty_level: 2,
    sound_law_prefixes: ['ia.grimm'],
    example_count: 1,
    mappings: [
      {
        id: (nextId += 1),
        position: 1,
        from_label: 'Romance / Latin p-',
        to_label: 'Germanic f-',
        notation: 'p ↔ f',
      },
    ],
    examples: [ruleCardExample()],
    progress: null,
    ...overrides,
  };
}

export function attributionSource(overrides: Partial<AttributionSource> = {}): AttributionSource {
  return {
    title: 'IEDICT — Interlingua-English Dictionary',
    author: 'Paul Denisowski',
    year: '2019',
    licence: 'Creative Commons Attribution 3.0 Unported',
    licence_url: 'https://creativecommons.org/licenses/by/3.0/',
    licence_text_path: 'licenses/CC-BY-3.0.txt',
    source_url: 'http://www.denisowski.org/Interlingua/IEDICT/iedict.txt',
    usage: 'Parsed in bulk.',
    notice: null,
    ...overrides,
  };
}

export function attribution(overrides: Partial<Attribution> = {}): Attribution {
  return {
    sources: [attributionSource()],
    modification_notice: 'Cognate Bridge is a Modified Version in the sense of GFDL section 4.',
    ...overrides,
  };
}
