import type { LanguageFamily } from '../services/api';

export type NavFamily = Extract<LanguageFamily, 'Germanic' | 'Romance' | 'Uralic'>;

export const NAV_FAMILY_STORAGE_KEY = 'cognate-bridge-nav-family';

export function familyForBridgeCode(code: string): NavFamily | null {
  if (code === 'ia') return 'Romance';
  if (code === 'fin') return 'Uralic';
  return null;
}

/** Bridge code the Study/Games/… tabs should open for a family, given what's available. */
export function bridgeCodeForFamily(
  family: NavFamily,
  availableCodes: ReadonlySet<string>,
): string | null {
  if (family === 'Germanic') return null;
  if (family === 'Uralic') return availableCodes.has('fin') ? 'fin' : null;
  return availableCodes.has('ia') ? 'ia' : null;
}

export function readStoredNavFamily(): NavFamily {
  try {
    const raw = localStorage.getItem(NAV_FAMILY_STORAGE_KEY);
    if (raw === 'Germanic' || raw === 'Romance' || raw === 'Uralic') return raw;
  } catch {
    /* ignore */
  }
  return 'Romance';
}

export function writeStoredNavFamily(family: NavFamily): void {
  try {
    localStorage.setItem(NAV_FAMILY_STORAGE_KEY, family);
  } catch {
    /* ignore */
  }
}
