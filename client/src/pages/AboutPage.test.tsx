import { render, screen } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api from '../services/api';
import { attribution, attributionSource } from '../test/factories';
import AboutPage from './AboutPage';

/**
 * These assertions track licence obligations rather than layout preferences, so a
 * refactor that drops the copyright notice or the licence link should fail the build.
 */

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
});

function renderAbout() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  );
}

describe('AboutPage', () => {
  it('preserves a source notice verbatim', async () => {
    mock.onGet('/attribution').reply(200, {
      ...attribution(),
      sources: [
        attributionSource({
          notice: 'OpenSubtitles FrequencyWords are derived from OpenSubtitles.org.',
          licence_text_path: 'licenses/CC-BY-3.0.txt',
        }),
      ],
    });

    renderAbout();

    expect(
      await screen.findByText(/OpenSubtitles FrequencyWords are derived from OpenSubtitles\.org/),
    ).toBeInTheDocument();
    // Credited as the author of the source, separately from the notice.
    expect(screen.getByText(/Paul Denisowski · 2019/)).toBeInTheDocument();
  });

  it('states what this project changed', async () => {
    mock.onGet('/attribution').reply(200, attribution());

    renderAbout();

    expect(
      await screen.findByText(/Modified Version in the sense of GFDL section 4/),
    ).toBeInTheDocument();
  });

  it('links this project’s own copy of the licence, not just the upstream one', async () => {
    mock.onGet('/attribution').reply(200, attribution());

    renderAbout();

    const vendored = await screen.findByRole('link', { name: 'full text' });
    // Relative to the API base, because in production the API is a separate origin.
    expect(vendored).toHaveAttribute('href', '/api/licenses/CC-BY-3.0.txt');

    expect(
      screen.getByRole('link', { name: /Creative Commons Attribution 3\.0 Unported/ }),
    ).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/3.0/');
  });

  it('omits the vendored-copy link for sources it only cites', async () => {
    mock.onGet('/attribution').reply(200, {
      ...attribution(),
      sources: [
        attributionSource({
          title: 'Interlingua: A Grammar of the International Language',
          licence: 'Cited, not reproduced',
          licence_url: null,
          licence_text_path: null,
          notice: null,
        }),
      ],
    });

    renderAbout();

    expect(await screen.findByText('Cited, not reproduced')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'full text' })).not.toBeInTheDocument();
  });

  it('surfaces the failure rather than silently showing no credits', async () => {
    mock.onGet('/attribution').reply(500, { error: 'Attribution unavailable' });

    renderAbout();

    expect(await screen.findByText('Attribution unavailable')).toBeInTheDocument();
  });
});
