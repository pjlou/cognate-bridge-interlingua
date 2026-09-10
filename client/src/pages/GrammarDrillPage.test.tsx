import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api from '../services/api';
import { LANGUAGES, grammarExample, grammarPattern } from '../test/factories';
import GrammarDrillPage from './GrammarDrillPage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
});

function renderDrill() {
  return render(
    <MemoryRouter initialEntries={['/b/ia/grammar/v2-word-order']}>
      <Routes>
        <Route path="/b/:bridge/grammar/:slug" element={<GrammarDrillPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GrammarDrillPage', () => {
  it('drills the prompt and scores the chosen option', async () => {
    mock.onGet('/bridges/ia/grammar/v2-word-order').reply(
      200,
      grammarPattern({
        examples: [
          grammarExample({
            prompt: 'My doctor examined me yesterday.',
            answer: 'Gestern visitir\u2019d myn doktor mi.',
            distractors: ['Gestern myn doktor visitir\u2019d mi.'],
            note: 'The subject moves behind the verb.',
          }),
        ],
      }),
    );
    mock.onPost(/\/grammar\/\d+\/review/).reply(200, { message: 'Review recorded' });

    renderDrill();

    expect(await screen.findByText('My doctor examined me yesterday.')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /Gestern visitir\u2019d myn doktor mi\./ }),
    );

    expect(screen.getByText('The subject moves behind the verb.')).toBeInTheDocument();
  });

  it('shows the parallel translations after answering', async () => {
    mock.onGet('/bridges/ia/grammar/v2-word-order').reply(
      200,
      grammarPattern({
        examples: [
          grammarExample({
            parallels: [
              { target_language: LANGUAGES.de!, target_text: 'Ich a\u00df einen Apfel.' },
              { target_language: LANGUAGES.nl!, target_text: 'Ik at een appel.' },
            ],
          }),
        ],
      }),
    );
    mock.onPost(/\/grammar\/\d+\/review/).reply(200, { message: 'Review recorded' });

    renderDrill();
    await screen.findByText('I ate an apple.');
    await userEvent.click(screen.getByRole('button', { name: /Ick at en appel\./ }));

    // The parallels are the reason a grammar drill exists here rather than in any other
    // flashcard app, so they are the thing worth asserting on.
    expect(screen.getByText('Ich a\u00df einen Apfel.')).toBeInTheDocument();
    expect(screen.getByText('Ik at een appel.')).toBeInTheDocument();
  });

  it('sends success only when enough answers were right', async () => {
    mock.onGet('/bridges/ia/grammar/v2-word-order').reply(
      200,
      grammarPattern({
        examples: [
          grammarExample({
            prompt: 'I ate an apple.',
            answer: 'Ick at en appel.',
            distractors: ['At ick en appel?'],
          }),
        ],
      }),
    );
    mock.onPost(/\/grammar\/\d+\/review/).reply(200, { message: 'Review recorded' });

    renderDrill();
    await screen.findByText('I ate an apple.');
    await userEvent.click(screen.getByRole('button', { name: /At ick en appel\?/ }));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0]!.data)).toEqual({ success: false });

    // The feedback for the last question is shown before the summary, so the learner sees
    // the right answer rather than being dropped straight onto a score.
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByText(/comes back sooner/)).toBeInTheDocument();
  });

  it('shows an ungrammatical example as a counter-example and never as an option', async () => {
    mock.onGet('/bridges/ia/grammar/v2-word-order').reply(
      200,
      grammarPattern({
        examples: [
          grammarExample(),
          grammarExample({
            bridge_text: 'De fisch et de mann',
            gloss_en: 'The man is eating the fish.',
            prompt: null,
            answer: null,
            distractors: [],
            note: 'Not grammatical.',
          }),
        ],
      }),
    );
    mock.onPost(/\/grammar\/\d+\/review/).reply(200, { message: 'Review recorded' });

    renderDrill();
    await screen.findByText('Counter-examples');

    // Present as an illustration...
    expect(screen.getByText('De fisch et de mann')).toBeInTheDocument();
    // ...but not as something the learner can pick as correct.
    expect(
      screen.queryByRole('button', { name: /De fisch et de mann/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the options in a stable order across re-renders', async () => {
    mock.onGet('/bridges/ia/grammar/v2-word-order').reply(
      200,
      grammarPattern({
        examples: [
          grammarExample({
            id: 77,
            distractors: ['At ick en appel?', 'Ick en appel at.', 'En appel ick at.'],
          }),
        ],
      }),
    );

    const { rerender } = renderDrill();
    await screen.findByText('I ate an apple.');

    const order = () =>
      screen
        .getAllByRole('button')
        .map((button) => button.textContent)
        .filter((text) => text?.includes('appel'));

    const before = order();
    rerender(
      <MemoryRouter initialEntries={['/b/ia/grammar/v2-word-order']}>
        <Routes>
          <Route path="/b/:bridge/grammar/:slug" element={<GrammarDrillPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('I ate an apple.');

    expect(order()).toEqual(before);
  });

  it('does not mark a word-order answer until Confirm', async () => {
    mock.onGet('/bridges/ia/grammar/v2-word-order').reply(
      200,
      grammarPattern({
        drill_kind: 'word_order',
        examples: [
          grammarExample({
            id: 12,
            prompt: 'Did I eat an apple?',
            answer: 'At ick en appel?',
            distractors: [],
          }),
        ],
      }),
    );
    mock.onPost(/\/grammar\/\d+\/review/).reply(200, { message: 'Review recorded' });

    renderDrill();
    expect(await screen.findByText('Did I eat an apple?')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'at' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'At' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'at' }));
    expect(screen.getByRole('button', { name: 'At' })).toBeInTheDocument();
    expect(screen.queryByText(/Correct/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ick' }));
    await userEvent.click(screen.getByRole('button', { name: 'en' }));
    await userEvent.click(screen.getByRole('button', { name: 'appel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(screen.getByText('Correct.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByText(/moves to a longer interval/)).toBeInTheDocument();
  });
});
