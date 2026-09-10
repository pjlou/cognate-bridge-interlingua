/**
 * Experimental bridges (creator testbeds) are seeded into the DB but hidden from the
 * public API unless ENABLE_EXPERIMENTAL_BRIDGES lists their codes.
 *
 * Finnish (`fin`) is the first: Estonian cognates only, pedagogical reference.
 */

/** Bridge codes that stay off Home / targets until explicitly enabled. */
export const EXPERIMENTAL_BRIDGE_CODES = ['fin'] as const;

/** Target language codes that exist only to serve experimental bridges. */
export const EXPERIMENTAL_TARGET_CODES = ['et'] as const;

export type ExperimentalBridgeCode = (typeof EXPERIMENTAL_BRIDGE_CODES)[number];

export function parseExperimentalBridgeAllowlist(
  raw: string | undefined = process.env.ENABLE_EXPERIMENTAL_BRIDGES,
): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isExperimentalBridge(code: string): boolean {
  return (EXPERIMENTAL_BRIDGE_CODES as readonly string[]).includes(code);
}

export function isExperimentalBridgeEnabled(
  code: string,
  allowlist: Set<string> = parseExperimentalBridgeAllowlist(),
): boolean {
  if (!isExperimentalBridge(code)) return true;
  return allowlist.has(code);
}

export function isExperimentalTarget(code: string): boolean {
  return (EXPERIMENTAL_TARGET_CODES as readonly string[]).includes(code);
}

export function isExperimentalTargetVisible(
  code: string,
  allowlist: Set<string> = parseExperimentalBridgeAllowlist(),
): boolean {
  if (!isExperimentalTarget(code)) return true;
  // Estonian is only meaningful with the Finnish module enabled.
  return allowlist.has('fin');
}
