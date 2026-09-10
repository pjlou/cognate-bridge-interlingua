import type { LanguageFamily } from '../models/types.js';

export interface TargetSeed {
  code: string;
  name: string;
  family: LanguageFamily;
}

/**
 * The target languages a bridge can open onto.
 *
 * English appears as a Germanic target rather than being left out as the metalanguage.
 * The gloss already gives the meaning, but the English *cognate* is separate information
 * and it is the strongest signal there is: a learner who sees that Interlingua `abundantia`
 * corresponds to English `abundance` has the word for free.
 */
export const TARGET_LANGUAGES: TargetSeed[] = [
  { code: 'en', name: 'English', family: 'Germanic' },
  { code: 'nl', name: 'Dutch', family: 'Germanic' },
  { code: 'de', name: 'German', family: 'Germanic' },
  { code: 'da', name: 'Danish', family: 'Germanic' },
  { code: 'no', name: 'Norwegian', family: 'Germanic' },
  { code: 'sv', name: 'Swedish', family: 'Germanic' },
  { code: 'es', name: 'Spanish', family: 'Romance' },
  { code: 'fr', name: 'French', family: 'Romance' },
  { code: 'it', name: 'Italian', family: 'Romance' },
  { code: 'pt', name: 'Portuguese', family: 'Romance' },
  { code: 'ca', name: 'Catalan', family: 'Romance' },
  { code: 'ro', name: 'Romanian', family: 'Romance' },
  { code: 'ia', name: 'Interlingua', family: 'Romance' },
  { code: 'et', name: 'Estonian', family: 'Uralic' },
];

/**
 * Which targets each bridge opens onto, in the order they are offered.
 *
 * Deliberately narrower than the data. Source dictionaries often record cognates in
 * languages beyond this list, and those are real data, but offering every attested
 * language in a bridge's target picker would misrepresent what the bridge is for.
 * Cognates in unlisted languages are counted and reported by the seed rather than
 * dropped silently.
 *
 * Finnish (`fin`) is experimental and Estonian-only; see ENABLE_EXPERIMENTAL_BRIDGES.
 */
export const BRIDGE_TARGETS: Record<string, string[]> = {
  ia: ['es', 'fr', 'it', 'pt', 'ro'],
  fin: ['et'],
};
