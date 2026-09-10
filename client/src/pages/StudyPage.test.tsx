import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { resetCloudTtsCache } from '../lib/speakBridgeWord';
import api from '../services/api';
import { LANGUAGES, cognate, vocabularyItem } from '../test/factories';
import StudyPage from './StudyPage';

vi.mock('../lib/wasmTts', () => ({
  speakWithWasm: vi.fn(async () => undefined),
  cancelWasmSpeech: vi.fn(),
  probeWasmTtsAvailable: vi.fn(async () => true),
}));

let mock: MockAdapter;

class FakeUtterance {
  text: string;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function mockStudy(items: ReturnType<typeof vocabularyItem>[]) {
  mock.onGet(/\/bridges\/ia\/frequency-bands/).reply(200, [
    { band: 1, rank_from: 1, rank_to: 500, total: Math.max(items.length, 1), due: items.length },
  ]);
  mock.onGet(/\/bridges\/ia\/due/).reply(200, {
    new: items.filter((item) => item.queue_kind !== 'review').length,
    review: items.filter((item) => item.queue_kind === 'review').length,
    vocabulary: items.length,
    grammar: 0,
  });
  // reply(status, []) is ambiguous with the tuple form in axios-mock-adapter; use a callback.
  mock.onGet(/\/bridges\/ia\/study/).reply(() => [200, items]);
}

beforeEach(() => {
  mock = new MockAdapter(api);
  localStorage.clear();
  localStorage.setItem('cb.skipEnglishCognates', 'false');
  localStorage.setItem('cb.tts.voice.ia', 'it');
  localStorage.setItem('cb.studySessionSize', '20');
  localStorage.setItem('cb.studyDirection', 'en_to_target');
  resetCloudTtsCache();
  mock.onGet('/auth/me').reply(401);
  mock.onGet('/tts/status').reply(200, { cloud: false, local: false, available: false });
  // StudyPage always fetches the learner's decks to populate the deck picker; none of
  // these tests exercise deck mode, so an empty list keeps them in the non-deck path.
  mock.onGet('/decks').reply(200, []);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => [
      {
        lang: 'it-IT',
        name: 'Italian',
        default: false,
        localService: true,
        voiceURI: 'it-IT',
      } as SpeechSynthesisVoice,
    ]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  mock.restore();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderStudy(path = '/b/ia/study') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/b/:bridge/study" element={<StudyPage />} />
          <Route path="/targets" element={<div>Targets</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('StudyPage', () => {
  it('hides the answer until the card is revealed', async () => {
    mockStudy([vocabularyItem({ tier: 1, gloss_en: 'apple', headword: 'appel' })]);

    renderStudy();

    expect(await screen.findByText('apple')).toBeInTheDocument();
    // A flashcard that shows its answer is not a flashcard.
    expect(screen.queryByRole('heading', { name: 'appel' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Reveal/ }));
    expect(screen.getByText('appel')).toBeInTheDocument();
  });

  it('speaks an IPA-informed pronunciation when the card is revealed', async () => {
    mockStudy([
      vocabularyItem({
        tier: 1,
        headword: 'aqua',
        gloss_en: 'water',
        ipa: 'ˈʋɑːtər',
        ipa_source: 'derived_phonology',
      }),
    ]);

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));

    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
    const uttered = (window.speechSynthesis.speak as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as FakeUtterance;
    expect(uttered.text).toBe('vater');
  });

  it('shows No local TTS as a disabled speech-engine option', async () => {
    mockStudy([vocabularyItem({ tier: 1, gloss_en: 'apple', headword: 'appel' })]);

    renderStudy();

    expect(await screen.findByText('apple')).toBeInTheDocument();
    const engine = screen.getByLabelText('Speech engine') as HTMLSelectElement;
    const localOption = Array.from(engine.options).find((option) => option.value === 'local');
    expect(localOption?.text).toBe('No local TTS');
    expect(localOption?.disabled).toBe(true);
  });

  it('asks the learner to install a Romance voice when none is available', async () => {
    (window.speechSynthesis.getVoices as ReturnType<typeof vi.fn>).mockReturnValue([]);
    mockStudy([vocabularyItem({ tier: 1, gloss_en: 'apple', headword: 'appel' })]);

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));

    expect(
      await screen.findByText(
        'Install an Italian, Spanish, French, Portuguese, Romanian, or Catalan speech voice',
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('shows selected-language cognates on a revealed tier-2 card', async () => {
    localStorage.setItem('cb.studyDirection', 'target_to_en');
    mockStudy([
      vocabularyItem({
        tier: 2,
        cognates: [
          cognate({ target_language: LANGUAGES.de!, target_word: 'Apfel' }),
          cognate({ target_language: LANGUAGES.nl!, target_word: 'appel' }),
        ],
      }),
    ]);

    renderStudy();
    expect(await screen.findByRole('heading', { name: 'appel' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reveal/ }));

    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByText('Apfel')).toBeInTheDocument();
    expect(screen.getByText('German')).toBeInTheDocument();
    expect(screen.getByText('Dutch')).toBeInTheDocument();
  });

  it('can prompt with the target word and reveal English', async () => {
    localStorage.setItem('cb.studyDirection', 'target_to_en');
    mockStudy([vocabularyItem({ tier: 1, gloss_en: 'apple', headword: 'appel' })]);

    renderStudy();
    expect(await screen.findByRole('heading', { name: 'appel' })).toBeInTheDocument();
    expect(screen.queryByText('apple')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Reveal/ }));
    expect(screen.getByText('apple')).toBeInTheDocument();
  });

  it('applies the chosen direction to tier-2 cards as well', async () => {
    localStorage.setItem('cb.studyDirection', 'en_to_target');
    mockStudy([
      vocabularyItem({
        tier: 2,
        headword: 'appel',
        gloss_en: 'apple',
        cognates: [cognate({ target_language: LANGUAGES.de!, target_word: 'Apfel' })],
      }),
    ]);

    renderStudy();
    expect(await screen.findByRole('heading', { name: 'apple' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reveal/ }));
    expect(screen.getByText('appel')).toBeInTheDocument();
    expect(screen.getByText('Apfel')).toBeInTheDocument();
  });

  it('records Good and advances to the next card', async () => {
    mockStudy([
      vocabularyItem({ id: 1, headword: 'appel', gloss_en: 'apple', tier: 1, queue_kind: 'new' }),
      vocabularyItem({ id: 2, headword: 'boum', gloss_en: 'tree', tier: 1, queue_kind: 'new' }),
    ]);
    mock.onPost('/vocabulary/1/review').reply(200, { message: 'Review recorded' });

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));

    await waitFor(() => expect(screen.getByText('tree')).toBeInTheDocument());
    expect(JSON.parse(mock.history.post[0]!.data)).toEqual({ grade: 'good', tier: 1 });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('sends Easy with the card tier', async () => {
    mockStudy([vocabularyItem({ id: 1, tier: 1 })]);
    mock.onPost('/vocabulary/1/review').reply(200, { message: 'Review recorded' });

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Easy/ }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0]!.data)).toEqual({ grade: 'easy', tier: 1 });
  });

  it('offers a Replay control after reveal', async () => {
    mockStudy([
      vocabularyItem({
        tier: 1,
        headword: 'aqua',
        gloss_en: 'water',
        ipa: 'ˈʋɑːtər',
        ipa_source: 'derived_phonology',
      }),
    ]);

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));
    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
    (window.speechSynthesis.speak as ReturnType<typeof vi.fn>).mockClear();

    await userEvent.click(screen.getByRole('button', { name: /Replay/ }));
    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
  });

  it('honours the session size when requesting the queue', async () => {
    localStorage.setItem('cb.studySessionSize', '10');
    mockStudy([vocabularyItem({ id: 1 })]);

    renderStudy();
    expect(await screen.findByText('apple')).toBeInTheDocument();

    const studyCall = mock.history.get.find((entry) => entry.url?.startsWith('/bridges/ia/study'));
    expect(studyCall?.params).toMatchObject({ limit: 10 });
  });

  it('says so when a tier-2 card has no cognates for selected languages', async () => {
    localStorage.setItem('cb.studyDirection', 'target_to_en');
    mockStudy([vocabularyItem({ tier: 2, cognates: [], gloss_en: 'apple' })]);

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));

    expect(screen.getByText('no cognates for selected languages')).toBeInTheDocument();
    expect(screen.getByText('apple')).toBeInTheDocument();
  });

  it('reports the session score once the queue is exhausted', async () => {
    mockStudy([vocabularyItem({ id: 1, queue_kind: 'new' })]);
    mock.onPost('/vocabulary/1/review').reply(200, { message: 'Review recorded' });

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Again/ }));

    expect(await screen.findByText('Session finished')).toBeInTheDocument();
    expect(screen.getByText(/0 of 1 correct · 1 new · 0 review/)).toBeInTheDocument();
  });

  it('removes the card from the deck without grading it', async () => {
    mockStudy([
      vocabularyItem({ id: 1, headword: 'appel', gloss_en: 'apple', queue_kind: 'new' }),
      vocabularyItem({ id: 2, headword: 'boum', gloss_en: 'tree', queue_kind: 'new' }),
    ]);
    mock.onPost('/vocabulary/1/removed').reply(200, { message: 'Card removed from deck', removed: true });

    renderStudy();
    expect(await screen.findByText('apple')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Remove from deck/ }));

    await waitFor(() => expect(screen.getByText('tree')).toBeInTheDocument());
    expect(JSON.parse(mock.history.post[0]!.data)).toEqual({ tier: 1, removed: true });
    expect(mock.history.post.every((entry) => !entry.url?.includes('/review'))).toBe(true);
  });

  it('offers something else to do when nothing is due', async () => {
    mockStudy([]);

    renderStudy();

    // Re-queries (and re-checks attachment) on every retry rather than resolving once
    // with a node reference that a later, still-settling fetch could detach before the
    // assertion runs -- this page mounts several independent async fetches (bands,
    // decks, due, queue) and they don't all resolve in the same tick.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Nothing due in this band' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /grammar pattern/ })).toBeInTheDocument();
  });

  it('hides the correspondence panel when no cognates are attached on tier 1', async () => {
    mockStudy([vocabularyItem({ cognates: [], tier: 1 })]);

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));

    expect(screen.queryByText('Correspondences')).not.toBeInTheDocument();
    expect(screen.queryByText(/No cognate is recorded/)).not.toBeInTheDocument();
  });

  it('keeps the card on screen when saving the grade fails', async () => {
    mockStudy([vocabularyItem({ id: 1, gloss_en: 'apple' })]);
    mock.onPost('/vocabulary/1/review').reply(500, { error: 'Database unavailable' });

    renderStudy();
    await userEvent.click(await screen.findByRole('button', { name: /Reveal/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));

    // Advancing anyway would lose the review silently, which is worse than showing the
    // error and letting the learner try again.
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
    expect(screen.getByText('apple')).toBeInTheDocument();
  });

  it('offers Show only cognates on Interlingua and passes it to the study APIs', async () => {
    mock.onGet(/\/bridges\/ia\/frequency-bands/).reply((config) => {
      expect(config.params?.require_english_cognates).toBe(true);
      return [
        200,
        [{ band: 1, rank_from: 1, rank_to: 500, total: 1, due: 1 }],
      ];
    });
    mock.onGet(/\/bridges\/ia\/due/).reply((config) => {
      expect(config.params?.require_english_cognates).toBe(true);
      return [200, { new: 1, review: 0, vocabulary: 1, grammar: 0 }];
    });
    mock.onGet(/\/bridges\/ia\/study/).reply((config) => {
      expect(config.params?.require_english_cognates).toBe(true);
      return [
        200,
        [
          vocabularyItem({
            bridge_language_code: 'ia',
            tier: 1,
            headword: 'casa',
            gloss_en: 'house',
            has_english_cognate: true,
          }),
        ],
      ];
    });

    localStorage.setItem('cb.onlyEnglishCognates', 'true');
    renderStudy('/b/ia/study');

    expect(await screen.findByLabelText('Show only cognates')).toBeChecked();
    expect(await screen.findByText('house')).toBeInTheDocument();
  });

  it('does not show Show only cognates on the Finnish bridge', async () => {
    mock.onGet(/\/bridges\/fin\/frequency-bands/).reply(200, [
      { band: 1, rank_from: 1, rank_to: 500, total: 1, due: 1 },
    ]);
    mock.onGet(/\/bridges\/fin\/due/).reply(200, { new: 1, review: 0, vocabulary: 1, grammar: 0 });
    mock.onGet(/\/bridges\/fin\/study/).reply(200, [
      vocabularyItem({ bridge_language_code: 'fin', tier: 1, gloss_en: 'apple', headword: 'omena' }),
    ]);

    renderStudy('/b/fin/study');
    expect(await screen.findByText('apple')).toBeInTheDocument();
    expect(screen.queryByLabelText('Show only cognates')).not.toBeInTheDocument();
  });
});
