import { config } from '../config.js';
import { synthesizeWithPiper } from './piper.js';

export type TtsEngine = 'cloud' | 'local';

export interface SynthesizeInput {
  text: string;
  ipa?: string | null;
  bridgeCode: string;
  preferredLang?: string | null;
  engine?: TtsEngine | null;
}

const VOICE_BY_LANG: Record<string, { languageCode: string; name: string }> = {
  de: { languageCode: 'de-DE', name: 'de-DE-Standard-A' },
  nl: { languageCode: 'nl-NL', name: 'nl-NL-Standard-A' },
  da: { languageCode: 'da-DK', name: 'da-DK-Standard-A' },
  no: { languageCode: 'nb-NO', name: 'nb-NO-Standard-A' },
  sv: { languageCode: 'sv-SE', name: 'sv-SE-Standard-A' },
  it: { languageCode: 'it-IT', name: 'it-IT-Standard-A' },
  es: { languageCode: 'es-ES', name: 'es-ES-Standard-A' },
  fr: { languageCode: 'fr-FR', name: 'fr-FR-Standard-A' },
  pt: { languageCode: 'pt-PT', name: 'pt-PT-Standard-A' },
  ro: { languageCode: 'ro-RO', name: 'ro-RO-Standard-A' },
  ca: { languageCode: 'ca-ES', name: 'ca-ES-Standard-A' },
  fi: { languageCode: 'fi-FI', name: 'fi-FI-Standard-A' },
};

const DEFAULT_LANG: Record<string, string> = {
  ia: 'it',
  fin: 'fi',
};

const ALLOWED_LANG: Record<string, string[]> = {
  ia: ['it', 'es', 'fr', 'pt', 'ro', 'ca'],
  fin: ['fi'],
};

const IPA_SAFE = /^[\p{L}\p{M}\p{N}\s.ˈˌː\-]+$/u;

export function isCloudTtsAvailable(): boolean {
  return Boolean(config.googleTtsApiKey);
}

export { isLocalTtsAvailable, probeLocalTtsAvailable } from './piper.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function usableIpa(ipa: string | null | undefined): string | null {
  if (!ipa) return null;
  const trimmed = ipa.trim();
  if (!trimmed || !IPA_SAFE.test(trimmed)) return null;
  return trimmed;
}

/** Build SSML; prefer IPA phoneme tags when the transcription is safe to embed. */
export function buildSsml(text: string, ipa?: string | null): string {
  const spoken = text.trim() || ' ';
  const phone = usableIpa(ipa);
  if (phone) {
    return `<speak><phoneme alphabet="ipa" ph="${escapeXml(phone)}">${escapeXml(spoken)}</phoneme></speak>`;
  }
  return `<speak>${escapeXml(spoken)}</speak>`;
}

export function resolvePreferredLang(
  bridgeCode: string,
  preferredLang?: string | null,
): string {
  const allowed = ALLOWED_LANG[bridgeCode] ?? ['it', 'es'];
  if (preferredLang && allowed.includes(preferredLang)) return preferredLang;
  return DEFAULT_LANG[bridgeCode] ?? 'it';
}

function voiceForBridge(
  bridgeCode: string,
  preferredLang?: string | null,
): { languageCode: string; name: string } {
  const chosen = resolvePreferredLang(bridgeCode, preferredLang);
  return VOICE_BY_LANG[chosen] ?? VOICE_BY_LANG.it!;
}

export async function synthesizeWithCloud(input: SynthesizeInput): Promise<Buffer> {
  const apiKey = config.googleTtsApiKey;
  if (!apiKey) {
    throw new Error('Cloud TTS is not configured');
  }

  const text = input.text.trim();
  if (!text) {
    throw new Error('Nothing to synthesize');
  }

  const voice = voiceForBridge(input.bridgeCode, input.preferredLang);
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml: buildSsml(text, input.ipa) },
      voice: {
        languageCode: voice.languageCode,
        name: voice.name,
      },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google TTS failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const payload = (await response.json()) as { audioContent?: string };
  if (!payload.audioContent) {
    throw new Error('Google TTS returned no audio');
  }

  return Buffer.from(payload.audioContent, 'base64');
}

export async function synthesizeWithLocal(input: SynthesizeInput): Promise<Buffer> {
  const text = input.text.trim();
  if (!text) throw new Error('Nothing to synthesize');
  const lang = resolvePreferredLang(input.bridgeCode, input.preferredLang);
  return synthesizeWithPiper(text, lang);
}

/** Alias for cloud synthesis (existing tests spy on this name). */
export async function synthesizeBridgeWord(input: SynthesizeInput): Promise<Buffer> {
  return synthesizeWithCloud(input);
}
