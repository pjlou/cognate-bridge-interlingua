import { describe, expect, it } from 'vitest';
import { pickPiperOnnxFile, sanitizePiperText } from './piper.js';

describe('pickPiperOnnxFile', () => {
  it('prefers medium quality and sorts stably', () => {
    const entries = [
      'de_DE-thorsten-high.onnx',
      'de_DE-thorsten-high.onnx.json',
      'de_DE-ramona-low.onnx',
      'de_DE-ramona-low.onnx.json',
      'de_DE-thorsten-medium.onnx',
      'de_DE-thorsten-medium.onnx.json',
      'fi_FI-harri-medium.onnx',
      'fi_FI-harri-medium.onnx.json',
    ];

    expect(pickPiperOnnxFile(entries, 'de')).toBe('de_DE-thorsten-medium.onnx');
    expect(pickPiperOnnxFile(entries, 'fi')).toBe('fi_FI-harri-medium.onnx');
  });

  it('falls back alphabetically when quality tags match', () => {
    const entries = [
      'de_DE-kerstin-low.onnx',
      'de_DE-kerstin-low.onnx.json',
      'de_DE-ramona-low.onnx',
      'de_DE-ramona-low.onnx.json',
    ];
    expect(pickPiperOnnxFile(entries, 'de')).toBe('de_DE-kerstin-low.onnx');
  });
});

describe('sanitizePiperText', () => {
  it('keeps orthographic letters including Finnish vowels', () => {
    expect(sanitizePiperText('  täytyä  ')).toBe('täytyä');
  });

  it('strips IPA stress and length marks that confuse G2P', () => {
    expect(sanitizePiperText('ˈhausː')).toBe('haus');
  });
});
