import { render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { I18nProvider } from '../i18n/I18nContext';
import api from '../services/api';
import TargetsPage from './TargetsPage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
  localStorage.clear();
  mock.onGet('/targets').reply(200, [
    { id: 1, code: 'de', name: 'German', family: 'Germanic' },
    { id: 2, code: 'da', name: 'Danish', family: 'Germanic' },
  ]);
  mock.onGet('/me/targets').reply(200, []);
  mock.onGet('/auth/me').reply(401);
});

afterEach(() => {
  mock.restore();
  localStorage.clear();
});

function renderTargets() {
  return render(
    <AuthProvider>
      <I18nProvider locale="en">
        <MemoryRouter>
          <TargetsPage />
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
}

describe('TargetsPage coverage', () => {
  it('asks signed-out visitors to sign in for coverage', async () => {
    renderTargets();
    expect(await screen.findByRole('heading', { name: 'Bridge coverage' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows empty hint when signed in with no targets selected', async () => {
    localStorage.setItem('token', 'test-token');
    mock.onGet('/auth/me').reply(200, { id: 1, email: 'learner@example.com' });
    mock.onGet('/me/target-coverage').reply(200, {
      horizon: 3200,
      band_size: 500,
      frequency_source: 'OpenSubtitles FrequencyWords (Hermit Dave) / SUBTLEX-US when present',
      targets: [],
    });

    renderTargets();

    await waitFor(() => {
      expect(
        screen.getByText(/Select one or more target languages above to see how far each bridge covers them/),
      ).toBeInTheDocument();
    });
  });

  it('renders function-word and content bands for available targets', async () => {
    localStorage.setItem('token', 'test-token');
    mock.onGet('/auth/me').reply(200, { id: 1, email: 'learner@example.com' });
    mock.onGet('/me/targets').reply(200, [
      { id: 1, code: 'de', name: 'German', family: 'Germanic' },
    ]);
    mock.onGet('/me/target-coverage').reply(200, {
      horizon: 3200,
      band_size: 500,
      frequency_source: 'OpenSubtitles FrequencyWords (Hermit Dave) / SUBTLEX-US when present',
      targets: [
        {
          code: 'de',
          name: 'German',
          available: true,
          bridges: [
            {
              code: 'fin',
              name: 'Finnish',
              bands: [
                {
                  kind: 'closed_class',
                  label: 'Function words',
                  rank_from: null,
                  rank_to: null,
                  total: 120,
                  covered: 40,
                  pct: 33.3,
                },
                {
                  kind: 'content',
                  label: 'Content 1–500',
                  rank_from: 1,
                  rank_to: 500,
                  total: 500,
                  covered: 180,
                  pct: 36,
                },
              ],
            },
          ],
        },
      ],
    });

    renderTargets();

    expect(await screen.findByRole('heading', { name: 'German' })).toBeInTheDocument();
    expect(screen.getByText('Finnish')).toBeInTheDocument();
    expect(screen.getByText('Function words')).toBeInTheDocument();
    expect(screen.getByText('40 / 120')).toBeInTheDocument();
    expect(screen.getByText('Content 1–500')).toBeInTheDocument();
    expect(screen.getByLabelText('Function words: 33.3% covered')).toBeInTheDocument();
  });

  it('notes when a target has no spoken frequency list', async () => {
    localStorage.setItem('token', 'test-token');
    mock.onGet('/auth/me').reply(200, { id: 1, email: 'learner@example.com' });
    mock.onGet('/me/targets').reply(200, [
      { id: 2, code: 'da', name: 'Danish', family: 'Germanic' },
    ]);
    mock.onGet('/me/target-coverage').reply(200, {
      horizon: 3200,
      band_size: 500,
      frequency_source: 'OpenSubtitles FrequencyWords (Hermit Dave) / SUBTLEX-US when present',
      targets: [
        {
          code: 'da',
          name: 'Danish',
          available: false,
          bridges: [{ code: 'fin', name: 'Finnish', bands: [] }],
        },
      ],
    });

    renderTargets();

    expect(
      await screen.findByText(/No spoken frequency list is available for Danish/),
    ).toBeInTheDocument();
  });

  it('loads coverage for the signed-in user', async () => {
    localStorage.setItem('token', 'test-token');
    mock.onGet('/auth/me').reply(200, { id: 1, email: 'learner@example.com' });
    mock.onGet('/me/target-coverage').reply(200, {
      horizon: 3200,
      band_size: 500,
      frequency_source: 'test',
      targets: [],
    });

    renderTargets();

    await waitFor(() => {
      expect(mock.history.get.some((req) => req.url === '/me/target-coverage')).toBe(true);
    });
  });
});
