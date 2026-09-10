import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speakWithWasm, cancelWasmSpeech } = vi.hoisted(() => ({
  speakWithWasm: vi.fn(async () => undefined),
  cancelWasmSpeech: vi.fn(),
}));

vi.mock('./wasmTts', () => ({
  speakWithWasm,
  cancelWasmSpeech,
  probeWasmTtsAvailable: vi.fn(async () => true),
}));

vi.mock('../services/api', () => ({
  getTtsStatus: vi.fn(async () => ({ cloud: false, local: false, available: false })),
  synthesizeTts: vi.fn(),
}));

import { getTtsStatus, synthesizeTts } from '../services/api';
import {
  cancelBridgeSpeech,
  missingVoiceInstallMessage,
  pickVoice,
  preferredLangTags,
  preferredLangTagsForWord,
  resetCloudTtsCache,
  resolveSpeakText,
  speakBridgeWord,
  writeRomanceVoicePref,
  writeTtsEnginePref,
} from './speakBridgeWord';
import {
  resetCorrectionProbeCache,
  setIncorrectPronunciationsForTests,
} from './ttsPronunciationFlags';

class FakeUtterance {
  text: string;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function fakeVoice(lang: string, name = lang): SpeechSynthesisVoice {
  return { lang, name, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

describe('resolveSpeakText', () => {
  it('uses IPA respelling when phonology is confident', () => {
    expect(
      resolveSpeakText({
        text: 'filia',
        bridgeCode: 'ia',
        ipa: 'ˈfilja',
        ipaSource: 'derived_phonology',
      }),
    ).toBe('filja');
  });

  it('speaks Finnish headwords as written for a fi-FI voice', () => {
    expect(
      resolveSpeakText({
        text: 'kukka',
        bridgeCode: 'fin',
        ipa: 'ˈkukːɑ',
        ipaSource: 'derived_phonology',
      }),
    ).toBe('kukka');
  });
});

describe('preferredLangTags', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks randomly among Romance stand-ins when Random is selected', () => {
    writeRomanceVoicePref('random');
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    // floor(0.9 * 6) = 5 → 'ca' in [it, es, fr, pt, ro, ca]
    expect(preferredLangTags('ia')[0]).toBe('ca-ES');
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(preferredLangTags('ia')[0]).toBe('it-IT');
  });

  it('orders French before other Interlingua stand-ins when preferred', () => {
    writeRomanceVoicePref('fr');
    expect(preferredLangTags('ia')[0]).toBe('fr-FR');
  });

  it('orders Catalan before other Romance stand-ins when preferred', () => {
    writeRomanceVoicePref('ca');
    expect(preferredLangTags('ia')[0]).toBe('ca-ES');
  });

  it('chooses Random only among usable stand-ins for a flagged headword', () => {
    writeRomanceVoicePref('random');
    setIncorrectPronunciationsForTests({ 'ia:aqua': ['it'] });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(preferredLangTagsForWord('ia', 'aqua')[0]).toBe('es-ES');
    setIncorrectPronunciationsForTests(null);
  });
});

describe('pickVoice', () => {
  beforeEach(() => {
    localStorage.clear();
    writeRomanceVoicePref('it');
    setIncorrectPronunciationsForTests(null);
  });

  afterEach(() => {
    setIncorrectPronunciationsForTests(null);
  });

  it('prefers an Italian voice for Interlingua by default', () => {
    const voices = [fakeVoice('en-US'), fakeVoice('it-IT'), fakeVoice('es-ES')];
    expect(pickVoice(voices, 'ia')?.lang).toBe('it-IT');
  });

  it('skips a flagged Italian voice for a word and uses Spanish', () => {
    const voices = [fakeVoice('en-US'), fakeVoice('it-IT'), fakeVoice('es-ES')];
    setIncorrectPronunciationsForTests({ 'ia:aqua': ['it'] });
    expect(pickVoice(voices, 'ia', 'aqua')?.lang).toBe('es-ES');
  });

  it('does not substitute an unrelated voice when Finnish is unavailable', () => {
    const voices = [fakeVoice('en-US'), fakeVoice('it-IT')];
    expect(pickVoice(voices, 'fin')).toBeNull();
  });
});

describe('missingVoiceInstallMessage', () => {
  it('names the voices to install for each bridge', () => {
    expect(missingVoiceInstallMessage('fin')).toBe('Install a Finnish speech voice');
    expect(missingVoiceInstallMessage('ia')).toBe(
      'Install an Italian, Spanish, French, Portuguese, Romanian, or Catalan speech voice',
    );
  });
});

describe('speakBridgeWord', () => {
  const speak = vi.fn();
  const cancel = vi.fn();
  const getVoices = vi.fn(() => [fakeVoice('it-IT')]);
  const play = vi.fn(async () => undefined);

  beforeEach(() => {
    speak.mockClear();
    cancel.mockClear();
    play.mockClear();
    speakWithWasm.mockClear();
    cancelWasmSpeech.mockClear();
    localStorage.clear();
    writeRomanceVoicePref('it');
    writeTtsEnginePref('browser');
    resetCloudTtsCache();
    resetCorrectionProbeCache();
    setIncorrectPronunciationsForTests(null);
    getVoices.mockReset();
    getVoices.mockReturnValue([fakeVoice('it-IT')]);
    vi.mocked(getTtsStatus).mockResolvedValue({ cloud: false, local: false, available: false });
    vi.mocked(synthesizeTts).mockReset();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      speak,
      cancel,
      getVoices,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal(
      'Audio',
      vi.fn(function FakeAudio(this: {
        play: typeof play;
        pause: () => void;
        load: () => void;
        removeAttribute: (name: string) => void;
      }) {
        this.play = play;
        this.pause = vi.fn();
        this.load = vi.fn();
        this.removeAttribute = vi.fn();
      }),
    );
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:tts'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as Response),
    );
  });

  afterEach(() => {
    setIncorrectPronunciationsForTests(null);
    vi.unstubAllGlobals();
  });

  it('uses browser Web Speech when browser engine is selected', async () => {
    const result = await speakBridgeWord({
      text: 'aqua',
      bridgeCode: 'ia',
      ipa: 'ˈakwa',
      ipaSource: 'derived_phonology',
    });

    expect(result).toEqual({ spoken: true });
    expect(speak).toHaveBeenCalledOnce();
    expect(speakWithWasm).not.toHaveBeenCalled();
  });

  it('speaks a flagged word with the next usable stand-in voice', async () => {
    getVoices.mockReturnValue([fakeVoice('it-IT'), fakeVoice('es-ES')]);
    setIncorrectPronunciationsForTests({ 'ia:aqua': ['it'] });

    const result = await speakBridgeWord({ text: 'aqua', bridgeCode: 'ia' });

    expect(result).toEqual({ spoken: true });
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0]![0] as FakeUtterance;
    expect(utterance.voice?.lang).toBe('es-ES');
  });

  it('stays silent when every stand-in voice is flagged and no correction exists', async () => {
    setIncorrectPronunciationsForTests({
      'ia:aqua': ['it', 'es', 'fr', 'pt', 'ro', 'ca'],
    });
    getVoices.mockReturnValue([
      fakeVoice('it-IT'),
      fakeVoice('es-ES'),
      fakeVoice('fr-FR'),
      fakeVoice('pt-PT'),
      fakeVoice('ro-RO'),
      fakeVoice('ca-ES'),
    ]);

    const result = await speakBridgeWord({ text: 'aqua', bridgeCode: 'ia' });

    expect(result).toEqual({ spoken: true });
    expect(speak).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('plays a correction clip when every stand-in voice is flagged', async () => {
    setIncorrectPronunciationsForTests({
      'ia:aqua': ['it', 'es', 'fr', 'pt', 'ro', 'ca'],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }) as Response),
    );

    const result = await speakBridgeWord({ text: 'aqua', bridgeCode: 'ia' });

    expect(result).toEqual({ spoken: true });
    expect(speak).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledOnce();
    expect(Audio).toHaveBeenCalledWith('/tts-corrections/ia/aqua.wav');
  });

  it('uses WASM eSpeak-NG when wasm engine is selected', async () => {
    writeTtsEnginePref('wasm');

    const result = await speakBridgeWord({ text: 'täytyä', bridgeCode: 'fin' });

    expect(result).toEqual({ spoken: true });
    expect(speakWithWasm).toHaveBeenCalledWith('täytyä', 'fi');
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not speak Finnish without a Finnish voice on the browser engine', async () => {
    getVoices.mockReturnValue([fakeVoice('en-US'), fakeVoice('it-IT')]);

    const result = await speakBridgeWord({ text: 'täytyä', bridgeCode: 'fin' });

    expect(result).toEqual({
      spoken: false,
      message: 'Install a Finnish speech voice',
    });
    expect(speak).not.toHaveBeenCalled();
  });

  it('plays local Piper audio when local engine is selected', async () => {
    writeTtsEnginePref('local');
    vi.mocked(getTtsStatus).mockResolvedValue({ cloud: false, local: true, available: false });
    vi.mocked(synthesizeTts).mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }));

    const result = await speakBridgeWord({ text: 'kukka', bridgeCode: 'fin' });

    expect(result).toEqual({ spoken: true });
    expect(synthesizeTts).toHaveBeenCalledWith({
      text: 'kukka',
      ipa: undefined,
      bridgeCode: 'fin',
      preferredLang: 'fi',
      engine: 'local',
    });
  });

  it('reuses the cached local clip on Replay instead of re-synthesizing', async () => {
    writeTtsEnginePref('local');
    vi.mocked(getTtsStatus).mockResolvedValue({ cloud: false, local: true, available: false });
    vi.mocked(synthesizeTts).mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }));

    await speakBridgeWord({ text: 'kukka', bridgeCode: 'fin' });
    await speakBridgeWord({ text: 'kukka', bridgeCode: 'fin' });

    expect(synthesizeTts).toHaveBeenCalledOnce();
  });

  it('cancelBridgeSpeech cancels browser and WASM audio', () => {
    cancelBridgeSpeech();
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelWasmSpeech).toHaveBeenCalledOnce();
  });
});
