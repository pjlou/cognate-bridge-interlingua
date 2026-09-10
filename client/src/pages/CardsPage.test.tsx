import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api from '../services/api';
import { vocabularyItem } from '../test/factories';
import CardsPage from './CardsPage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
});

function renderCards() {
  return render(
    <MemoryRouter initialEntries={['/b/ia/cards']}>
      <Routes>
        <Route path="/b/:bridge/cards" element={<CardsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CardsPage', () => {
  it('lists learner cards with SM-2 fields', async () => {
    mock.onGet('/me/vocabulary').reply(200, [
      vocabularyItem({
        headword: 'appel',
        gloss_en: 'apple',
        progress: {
          card_state: 'learning',
          ease_factor: 2.5,
          interval_days: 0.007,
          repetitions: 0,
          lapses: 0,
          learning_step: 0,
          review_count: 1,
          success_count: 1,
          last_reviewed_at: new Date().toISOString(),
          next_review_at: new Date(Date.now() + 60_000).toISOString(),
          removed: false,
        },
      }),
    ]);

    renderCards();

    expect(await screen.findByText('appel')).toBeInTheDocument();
    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByText('learning')).toBeInTheDocument();
    expect(screen.getByText('2.50')).toBeInTheDocument();
  });

  it('shows removed cards and re-adds the selected ones', async () => {
    mock.onGet('/me/vocabulary').reply(200, [
      vocabularyItem({
        id: 1,
        headword: 'appel',
        gloss_en: 'apple',
        tier: 1,
        progress: {
          card_state: 'learning',
          ease_factor: 2.5,
          interval_days: 0.007,
          repetitions: 0,
          lapses: 0,
          learning_step: 0,
          review_count: 1,
          success_count: 1,
          last_reviewed_at: new Date().toISOString(),
          next_review_at: new Date(Date.now() + 60_000).toISOString(),
          removed: true,
        },
      }),
    ]);
    mock.onPost('/vocabulary/1/removed').reply(200, { message: 'Card restored to deck', removed: false });

    renderCards();

    await userEvent.selectOptions(await screen.findByLabelText('Filter by state'), 'removed');
    expect(await screen.findByText('appel')).toBeInTheDocument();
    expect(screen.getByText('removed')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Select appel'));
    await userEvent.click(screen.getByRole('button', { name: /Re-add selected/ }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0]!.data)).toEqual({ tier: 1, removed: false });
    expect(await screen.findByText('No removed cards')).toBeInTheDocument();
  });
});
