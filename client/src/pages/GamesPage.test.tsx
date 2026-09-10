import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import api from '../services/api';
import { vocabularyItem } from '../test/factories';
import GamesPage from './GamesPage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
  localStorage.clear();
  mock.onGet('/auth/me').reply(401);
  vi.stubGlobal('speechSynthesis', {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  mock.restore();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderGames(path = '/b/ia/games') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/b/:bridge/games" element={<GamesPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('GamesPage', () => {
  it('shows setup controls and starts a countdown after loading words', async () => {
    const items = Array.from({ length: 24 }, (_, i) =>
      vocabularyItem({
        id: i + 1,
        headword: `w${i}`,
        gloss_en: `g${i}`,
        frequency_rank: i + 1,
      }),
    );
    mock.onGet(/\/bridges\/ia\/parts-of-speech/).reply(200, ['n', 'v']);
    mock.onGet(/\/bridges\/ia\/game-lemmas/).reply(200, items);

    renderGames();
    expect(await screen.findByRole('heading', { name: 'Games' })).toBeInTheDocument();
    expect(screen.getByLabelText('Words this game')).toBeInTheDocument();
    expect(screen.getByLabelText('Hint reveal')).toBeInTheDocument();
    expect(screen.getByLabelText('Hint reveal')).toHaveValue('off');
    expect(screen.getByLabelText('English cognate filter')).toBeInTheDocument();
    const posFilter = screen.getByLabelText('Part of speech filter');
    expect(posFilter).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'content words' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'grammar particle' })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Get Ready')).toBeInTheDocument();
  });

  it('shows remove-from-deck between the other board actions during play', async () => {
    const items = Array.from({ length: 24 }, (_, i) =>
      vocabularyItem({
        id: i + 1,
        headword: `w${i}`,
        gloss_en: `g${i}`,
        frequency_rank: i + 1,
      }),
    );
    mock.onGet(/\/bridges\/ia\/parts-of-speech/).reply(200, ['n', 'v']);
    mock.onGet(/\/bridges\/ia\/game-lemmas/).reply(200, items);
    mock.onPost(/\/vocabulary\/\d+\/removed/).reply(200, { message: 'ok' });

    renderGames();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Get Ready')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: "I don't know this word" })).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    const dontKnow = screen.getByRole('button', { name: "I don't know this word" });
    const remove = screen.getByRole('button', { name: 'Remove this from deck' });
    const notOnBoard = screen.getByRole('button', { name: 'Match is not on the board' });
    expect(dontKnow.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(remove.compareDocumentPosition(notOnBoard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Paused' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Paused' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('shows matching-game aggregates on an empty stats store', async () => {
    mock.onGet(/\/bridges\/ia\/parts-of-speech/).reply(200, []);
    mock.onGet(/\/bridges\/ia\/game-lemmas/).reply(200, []);
    renderGames();
    expect(await screen.findByText(/0 games saved/)).toBeInTheDocument();
    expect(await screen.findByText(/Only 0 words in this category/i)).toBeInTheDocument();
  });
});
