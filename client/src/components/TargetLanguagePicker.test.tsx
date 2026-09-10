import { render, screen } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { I18nProvider } from '../i18n/I18nContext';
import api from '../services/api';
import TargetLanguagePicker from './TargetLanguagePicker';

let mock: MockAdapter;

const ALL_TARGETS = [
  { id: 1, code: 'de', name: 'German', family: 'Germanic' },
  { id: 2, code: 'es', name: 'Spanish', family: 'Romance' },
  { id: 3, code: 'fr', name: 'French', family: 'Romance' },
];

beforeEach(() => {
  mock = new MockAdapter(api);
  localStorage.clear();
  mock.onGet('/targets').reply(200, ALL_TARGETS);
  mock.onGet('/me/targets').reply(200, []);
  mock.onGet('/auth/me').reply(401);
});

afterEach(() => {
  mock.restore();
  localStorage.clear();
});

function renderPicker() {
  return render(
    <AuthProvider>
      <I18nProvider locale="en">
        <MemoryRouter>
          <TargetLanguagePicker />
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
}

describe('TargetLanguagePicker', () => {
  it('shows targets from every family', async () => {
    renderPicker();
    expect(await screen.findByText('German')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();
    expect(screen.getByText('French')).toBeInTheDocument();
  });
});
