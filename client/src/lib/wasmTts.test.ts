import { beforeEach, describe, expect, it, vi } from 'vitest';

const createESpeakNg = vi.fn();

vi.mock('espeak-ng', () => ({
  default: createESpeakNg,
}));

vi.mock('espeak-ng/dist/espeak-ng.wasm?url', () => ({
  default: '/fake-espeak.wasm',
}));

describe('wasmTts', () => {
  beforeEach(() => {
    createESpeakNg.mockReset();
    vi.resetModules();
  });

  it('synthesizes a wav buffer for the requested voice', async () => {
    const wav = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
    createESpeakNg.mockResolvedValue({
      FS: { readFile: vi.fn(() => wav) },
    });

    const { synthesizeWasmWav } = await import('./wasmTts');
    const out = await synthesizeWasmWav('täytyä', 'fi');

    expect(out).toEqual(wav);
    expect(createESpeakNg).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: ['-w', 'out.wav', '-b', '1', '-v', 'fi', 'täytyä'],
      }),
    );
  });
});
