import { describe, expect, it } from 'vitest';
import {
  isExperimentalBridgeEnabled,
  isExperimentalTargetVisible,
  parseExperimentalBridgeAllowlist,
} from './experimentalBridges.js';

describe('experimentalBridges', () => {
  it('hides fin and et when the allowlist is empty', () => {
    const allow = parseExperimentalBridgeAllowlist('');
    expect(isExperimentalBridgeEnabled('fin', allow)).toBe(false);
    expect(isExperimentalBridgeEnabled('ia', allow)).toBe(true);
    expect(isExperimentalTargetVisible('et', allow)).toBe(false);
    expect(isExperimentalTargetVisible('de', allow)).toBe(true);
  });

  it('shows fin and et when ENABLE_EXPERIMENTAL_BRIDGES includes fin', () => {
    const allow = parseExperimentalBridgeAllowlist('fin');
    expect(isExperimentalBridgeEnabled('fin', allow)).toBe(true);
    expect(isExperimentalTargetVisible('et', allow)).toBe(true);
  });

  it('parses comma-separated codes case-insensitively', () => {
    const allow = parseExperimentalBridgeAllowlist(' FIN , other ');
    expect(allow.has('fin')).toBe(true);
    expect(allow.has('other')).toBe(true);
  });
});
