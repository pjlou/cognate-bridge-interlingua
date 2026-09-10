import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import DeckDetailPage from './DeckDetailPage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
  vi.restoreAllMocks();
});

function baseDeck(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    owner_user_id: 1,
    bridge_language_id: 1,
    bridge_language_code: 'ia',
    target_language_id: 3,
    target_language_code: 'de',
    target_language_name: 'German',
    name: 'My Anki Deck',
    source_filename: 'deck.apkg',
    status: 'ready',
    card_count: 2,
    untranslated_count: 0,
    created_at: new Date().toISOString(),
    translated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/decks/7']}>
      <Routes>
        <Route path="/decks/:id" element={<DeckDetailPage />} />
        <Route path="/decks/import" element={<div>Import page</div>} />
        <Route path="/translate" element={<div>Translate page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DeckDetailPage', () => {
  it('only offers Translate once field mapping is complete', async () => {
    mock.onGet('/decks/7').reply(200, baseDeck({ status: 'mapping', bridge_language_code: null, target_language_code: null }));
    renderDetail();

    expect(await screen.findByText(/Field mapping isn't finished/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument();
  });

  it('shows Translate disabled with a notice, since no translation engine is included', async () => {
    mock.onGet('/decks/7').reply(200, baseDeck({ status: 'mapping' }));
    renderDetail();

    const translateButton = await screen.findByRole('button', { name: 'Translate' });
    expect(translateButton).toBeDisabled();
    expect(screen.getByText(/Translation unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Translate page' })).toHaveAttribute(
      'href',
      '/translate',
    );
  });

  it('offers a full backup download alongside the other exports once ready', async () => {
    mock.onGet('/decks/7').reply(200, baseDeck());
    renderDetail();

    expect(
      await screen.findByRole('button', { name: /Download full backup/ }),
    ).toBeInTheDocument();
  });

  it('deletes the deck after confirming, and returns to the import page', async () => {
    mock.onGet('/decks/7').reply(200, baseDeck());
    mock.onDelete('/decks/7').reply(200, { message: 'Deck deleted' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /Delete deck/ }));

    await waitFor(() => expect(mock.history.delete.some((r) => r.url === '/decks/7')).toBe(true));
    expect(await screen.findByText('Import page')).toBeInTheDocument();
  });

  it('does not delete the deck if the confirmation is cancelled', async () => {
    mock.onGet('/decks/7').reply(200, baseDeck());
    const deleteCall = vi.fn();
    mock.onDelete('/decks/7').reply(() => {
      deleteCall();
      return [200, { message: 'Deck deleted' }];
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /Delete deck/ }));

    expect(deleteCall).not.toHaveBeenCalled();
    expect(screen.getByText('My Anki Deck')).toBeInTheDocument();
  });

  it('surfaces a server error without navigating away', async () => {
    mock.onGet('/decks/7').reply(200, baseDeck());
    mock.onDelete('/decks/7').reply(500, { error: 'Database unavailable' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /Delete deck/ }));

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Import page')).not.toBeInTheDocument();
  });
});
