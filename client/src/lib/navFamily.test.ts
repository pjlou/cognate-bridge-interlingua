import { describe, expect, it } from 'vitest';
import { bridgeCodeForFamily, familyForBridgeCode } from './navFamily';

describe('navFamily', () => {
  it('resolves bridge codes per family', () => {
    const codes = new Set(['ia', 'fin']);
    expect(bridgeCodeForFamily('Germanic', codes)).toBeNull();
    expect(bridgeCodeForFamily('Romance', codes)).toBe('ia');
    expect(bridgeCodeForFamily('Uralic', codes)).toBe('fin');
    expect(bridgeCodeForFamily('Uralic', new Set(['ia']))).toBeNull();
  });

  it('maps bridge codes back to families', () => {
    expect(familyForBridgeCode('ia')).toBe('Romance');
    expect(familyForBridgeCode('fin')).toBe('Uralic');
    expect(familyForBridgeCode('unknown')).toBeNull();
  });
});
