import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api from '../services/api';
import { ruleCard, ruleCardExample } from '../test/factories';
import RuleCardDrillPage from './RuleCardDrillPage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
});

function renderDrill() {
  return render(
    <MemoryRouter initialEntries={['/rules/grimm-stop-fricative']}>
      <Routes>
        <Route path="/rules/:slug" element={<RuleCardDrillPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RuleCardDrillPage', () => {
  it('drills the prompt and shows the form triad after grading', async () => {
    mock.onGet('/rule-cards/grimm-stop-fricative').reply(
      200,
      ruleCard({
        examples: [
          ruleCardExample({
            prompt: 'Romance / Latin pater. Which English cousin?',
            answer: 'father',
            distractors: ['paper'],
            note: 'pater → father.',
            forms: { la: 'pater', en: 'father', de: 'Vater' },
          }),
        ],
      }),
    );
    mock.onPost(/\/rule-cards\/\d+\/review/).reply(200, { message: 'Review recorded' });

    renderDrill();

    expect(await screen.findByText('Romance / Latin pater. Which English cousin?')).toBeInTheDocument();
    expect(screen.getByText('p ↔ f')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /father/ }));

    expect(screen.getByText('pater → father.')).toBeInTheDocument();
    expect(screen.getByText('Vater')).toBeInTheDocument();
  });

  it('records success when the session passes the threshold', async () => {
    mock.onGet('/rule-cards/grimm-stop-fricative').reply(
      200,
      ruleCard({
        examples: [
          ruleCardExample({
            prompt: 'Romance / Latin pater. Which English cousin?',
            answer: 'father',
            distractors: ['paper'],
          }),
        ],
      }),
    );
    mock.onPost(/\/rule-cards\/\d+\/review/).reply(200, { message: 'Review recorded' });

    renderDrill();
    await screen.findByText('Romance / Latin pater. Which English cousin?');
    await userEvent.click(screen.getByRole('button', { name: /father/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0]!.data)).toEqual({ success: true });
    expect(screen.getByText(/moves to a longer interval/)).toBeInTheDocument();
  });
});
