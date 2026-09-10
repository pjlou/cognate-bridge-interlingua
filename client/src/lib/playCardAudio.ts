/**
 * Plays a deck card's stored audio (a recording the user made, or one pulled in from
 * an imported Anki deck) when one exists for the field being spoken, falling back to
 * speech synthesis otherwise. Built-in bridge cards (no `deck_card_id`) never have
 * stored audio, so this always takes the synthesis fallback path for them -- callers
 * only need this for deck cards.
 *
 * The bridge slot reuses `speakBridgeWord` (the IPA-respelling pipeline built for
 * pronouncing Interlingua on a Romance-language browser voice) exactly as StudyPage
 * already does for built-in cards. The english/target slots are ordinary English or
 * target-language text -- routing those through the bridge-specific IPA respelling
 * would be wrong, so they speak directly via the Web Speech API with the matching
 * language tag instead.
 */
import { getDeckCardAudio, type DeckAudioField, type VocabularyItem } from '../services/api';
import { speakBridgeWord, type SpeakResult } from './speakBridgeWord';

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

/** Stops any stored clip currently playing. Companion to `cancelBridgeSpeech` for the TTS path. */
export function cancelCardAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

async function playStoredClip(deckCardId: number, slot: DeckAudioField): Promise<boolean> {
  try {
    const blob = await getDeckCardAudio(deckCardId, slot);
    cancelCardAudio();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentObjectUrl = url;
    currentAudio = audio;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function speakPlainText(text: string, langCode: string): SpeakResult {
  if (!text.trim()) return { spoken: true };
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { spoken: false, message: 'No speech voice is available in this browser.' };
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langCode;
  window.speechSynthesis.speak(utterance);
  return { spoken: true };
}

export async function playCardAudio(
  card: VocabularyItem,
  slot: DeckAudioField,
  bridgeCode: string,
): Promise<SpeakResult> {
  if (card.has_audio?.[slot] && card.deck_card_id) {
    if (await playStoredClip(card.deck_card_id, slot)) return { spoken: true };
  }

  if (slot === 'bridge') {
    return speakBridgeWord({
      text: card.headword,
      bridgeCode,
      ipa: card.ipa,
      ipaSource: card.ipa_source,
    });
  }
  if (slot === 'english') {
    return speakPlainText(card.gloss_en, 'en');
  }
  const targetCognate = card.cognates[0];
  return speakPlainText(
    targetCognate?.target_word ?? card.headword,
    targetCognate?.target_language.code ?? 'en',
  );
}
