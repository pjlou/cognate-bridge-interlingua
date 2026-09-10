import { render, screen } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { I18nProvider } from '../i18n/I18nContext';
import api from '../services/api';
import AppShell from './AppShell';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
  localStorage.clear();
  mock.onGet('/auth/me').reply(401);
});

afterEach(() => {
  mock.restore();
  localStorage.clear();
});

function renderShell(initialEntry: string) {
  return render(
    <AuthProvider>
      <I18nProvider locale="en">
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/b/:bridge/*" element={<AppShell />}>
              <Route path="*" element={<div>child</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
}

describe('AppShell family navigation', () => {
  it('shows the Romance family and hides Germanic when no Germanic bridge is available', async () => {
    mock.onGet('/bridges').reply(200, [
      {
        id: 1,
        code: 'ia',
        name: 'Interlingua',
        family: 'Romance',
        vocabulary_count: 1,
        grammar_pattern_count: 1,
        target_languages: [],
      },
    ]);

    renderShell('/b/ia/study');

    expect(await screen.findByRole('button', { name: 'Romance' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Germanic' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Study' })).toBeInTheDocument();
  });

  it('shows the Uralic family button when the Finnish bridge is available', async () => {
    mock.onGet('/bridges').reply(200, [
      {
        id: 1,
        code: 'ia',
        name: 'Interlingua',
        family: 'Romance',
        vocabulary_count: 1,
        grammar_pattern_count: 1,
        target_languages: [],
      },
      {
        id: 2,
        code: 'fin',
        name: 'Finnish',
        family: 'Uralic',
        vocabulary_count: 1,
        grammar_pattern_count: 1,
        target_languages: [],
      },
    ]);

    renderShell('/b/fin/study');

    expect(await screen.findByRole('button', { name: 'Uralic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Romance' })).toBeInTheDocument();
  });
});
