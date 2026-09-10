import { describe, expect, it } from 'vitest';
import { formatDelayUntil } from './scheduleFormat';

describe('formatDelayUntil', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('formats short delays in minutes', () => {
    expect(formatDelayUntil(new Date(now.getTime() + 60_000), now)).toBe('1 minute from now');
    expect(formatDelayUntil(new Date(now.getTime() + 10 * 60_000), now)).toBe(
      '10 minutes from now',
    );
  });

  it('formats medium delays in hours', () => {
    expect(formatDelayUntil(new Date(now.getTime() + 2 * 60 * 60_000), now)).toBe(
      '2 hours from now',
    );
  });

  it('formats long delays in days', () => {
    expect(formatDelayUntil(new Date(now.getTime() + 3 * 24 * 60 * 60_000), now)).toBe(
      '3 days from now',
    );
  });
});
