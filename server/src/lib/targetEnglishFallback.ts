import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GERMAN_TO_ENGLISH: Record<string, string> = {
  aber: 'but',
  alle: 'all',
  alles: 'everything',
};

const FALLBACKS: Record<string, Record<string, string>> = {
  de: GERMAN_TO_ENGLISH,
};

let cachedGeneratedFallbacks: Record<string, Record<string, string>> | null = null;

function generatedFallbacks(): Record<string, Record<string, string>> {
  if (cachedGeneratedFallbacks) return cachedGeneratedFallbacks;
  const dataPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/target_english_glosses.json');
  if (!existsSync(dataPath)) {
    cachedGeneratedFallbacks = {};
    return cachedGeneratedFallbacks;
  }
  try {
    cachedGeneratedFallbacks = JSON.parse(readFileSync(dataPath, 'utf8')) as Record<string, Record<string, string>>;
    return cachedGeneratedFallbacks;
  } catch {
    cachedGeneratedFallbacks = {};
    return cachedGeneratedFallbacks;
  }
}

/** Verified English glosses for target lemmas without a bridge-derived gloss. */
export function targetEnglishFallback(targetCode: string, lemma: string): string | null {
  const key = lemma.toLocaleLowerCase();
  return FALLBACKS[targetCode]?.[key] ?? generatedFallbacks()[targetCode]?.[key] ?? null;
}
