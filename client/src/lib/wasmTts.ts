/**
 * In-browser eSpeak-NG (WASM) TTS. Robotic but phonetically reliable for Finnish
 * and the European voices used as stand-ins for the constructed bridges.
 */

import createESpeakNg from 'espeak-ng';
import wasmUrl from 'espeak-ng/dist/espeak-ng.wasm?url';

export type WasmVoiceLang =
  | 'fi'
  | 'de'
  | 'nl'
  | 'da'
  | 'nb'
  | 'sv'
  | 'it'
  | 'es'
  | 'fr'
  | 'pt'
  | 'ro'
  | 'ca';

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let ready: Promise<boolean> | null = null;

function stopAudio(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

export function cancelWasmSpeech(): void {
  stopAudio();
}

/** Probe that the WASM module loads (cached after first success). */
export async function probeWasmTtsAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!ready) {
    ready = (async () => {
      try {
        await createESpeakNg({
          locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file),
          arguments: ['-w', 'probe.wav', '-b', '1', '-v', 'en', 'ok'],
        });
        return true;
      } catch {
        return false;
      }
    })();
  }
  return ready;
}

export async function synthesizeWasmWav(
  text: string,
  voice: WasmVoiceLang,
): Promise<Uint8Array> {
  const spoken = text.trim();
  if (!spoken) throw new Error('Nothing to synthesize');

  const module = await createESpeakNg({
    locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file),
    arguments: ['-w', 'out.wav', '-b', '1', '-v', voice, spoken],
  });

  const wav = module.FS.readFile('out.wav') as Uint8Array;
  if (!wav?.length) throw new Error('WASM TTS produced no audio');
  return wav;
}

export async function speakWithWasm(text: string, voice: WasmVoiceLang): Promise<void> {
  const wav = await synthesizeWasmWav(text, voice);
  stopAudio();
  // Copy into a plain ArrayBuffer — Uint8Array may be a SharedArrayBuffer view.
  const copy = new Uint8Array(wav.byteLength);
  copy.set(wav);
  const blob = new Blob([copy.buffer], { type: 'audio/wav' });
  objectUrl = URL.createObjectURL(blob);
  audio = new Audio(objectUrl);
  await audio.play();
}
