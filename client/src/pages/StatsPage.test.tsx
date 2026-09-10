import { render, screen } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import StatsPage from './StatsPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'ada@example.com' },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    resetUserData: vi.fn(),
    setPriorityTargetLanguage: vi.fn(),
  }),
}));

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
});

describe('StatsPage', () => {
  it('shows due, retention, and mature counts', async () => {
    mock.onGet('/bridges/ia/stats').reply(200, {
      studied: 12,
      due_new: 3,
      due_review: 5,
      retention: 0.8,
      average_ease: 2.45,
      mature: 2,
    });

    render(
      <MemoryRouter initialEntries={['/b/ia/stats']}>
        <Routes>
          <Route path="/b/:bridge/stats" element={<StatsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('2.45')).toBeInTheDocument();
    expect(screen.getByText('Matching games')).toBeInTheDocument();
    expect(screen.getByText('Games played')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset all user data/i })).toBeInTheDocument();
  });
});
