import { render, screen } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { I18nProvider } from '../i18n/I18nContext';
import api from '../services/api';
import HomePage from './HomePage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
  localStorage.clear();
  mock.onGet('/auth/me').reply(401);
  mock.onGet('/targets').reply(200, []);
  mock.onGet('/me/targets').reply(200, []);
  mock.onGet('/bridges').reply(200, [
    {
      id: 1,
      code: 'ia',
      name: 'Interlingua',
      family: 'Romance',
      vocabulary_count: 10,
      grammar_pattern_count: 2,
      target_languages: [
        { id: 1, code: 'es', name: 'Spanish', family: 'Romance' },
        { id: 2, code: 'fr', name: 'French', family: 'Romance' },
      ],
    },
  ]);
});

afterEach(() => {
  mock.restore();
  localStorage.clear();
});

function renderHome() {
  return render(
    <AuthProvider>
      <I18nProvider locale="en">
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
}

describe('HomePage', () => {
  it('shows the Interlingua bridge card with its target languages', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Interlingua' })).toBeInTheDocument();
    expect(screen.getByText(/Spanish/)).toBeInTheDocument();
    expect(screen.getByText(/French/)).toBeInTheDocument();
  });
});
