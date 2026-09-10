import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { query } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from '../test/db.js';
import { registerUser } from '../test/fixtures.js';
import { seedDeckFixture, type DeckFixture } from '../test/deckFixtures.js';
import { getDeckStudyQueue } from './deckContent.model.js';
import { recordDeckCardReview, setDeckCardRemoved } from './deckProgress.model.js';

const app = createApp();

describe.skipIf(!hasTestDatabase)('deckProgress.model', () => {
  let userId: number;
  let fixture: DeckFixture;

  beforeAll(async () => {
    await migrateTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await truncateAll();
    const { id } = await registerUser(app);
    userId = id;
    fixture = await seedDeckFixture(userId);
  });

  afterAll(async () => {
    await teardown();
  });

  describe('recordDeckCardReview', () => {
    it('advances SM-2 state on a brand-new card', async () => {
      const result = await recordDeckCardReview(userId, fixture.cardIds[0]!, 'good', 1);
      expect(result.card_state).toBe('learning');
      expect(result.review_count).toBe(1);
      expect(result.success_count).toBe(1);
      expect(result.ease_factor).toBe(2.5);
      expect(result.tier2_unlocked).toBe(false);
      expect(new Date(result.next_review_at!).getTime()).toBeGreaterThan(Date.now());
    });

    it('reuses the exact SM-2 math: Again on a learning card resets repetitions and reschedules to the first learning step', async () => {
      await recordDeckCardReview(userId, fixture.cardIds[0]!, 'good', 1);
      const again = await recordDeckCardReview(userId, fixture.cardIds[0]!, 'again', 1);
      expect(again.card_state).toBe('learning');
      expect(again.repetitions).toBe(0);
      expect(again.interval_days).toBeCloseTo(1 / (24 * 60), 5);
    });

    it('unlocks tier 2 exactly once when a tier-1 card graduates on Easy', async () => {
      const first = await recordDeckCardReview(userId, fixture.cardIds[0]!, 'easy', 1);
      expect(first.card_state).toBe('review');
      expect(first.tier2_unlocked).toBe(true);

      const rowsAfterFirst = await query<{ tier: number }>(
        `SELECT tier FROM deck_card_progress WHERE user_id = $1 AND deck_card_id = $2 ORDER BY tier`,
        [userId, fixture.cardIds[0]],
      );
      expect(rowsAfterFirst.map((r) => r.tier)).toEqual([1, 2]);

      // Reviewing tier 1 again (already graduated) must not re-report an unlock or
      // duplicate the tier-2 row -- the insert is ON CONFLICT DO NOTHING.
      const second = await recordDeckCardReview(userId, fixture.cardIds[0]!, 'good', 1);
      expect(second.tier2_unlocked).toBe(false);

      const rowsAfterSecond = await query<{ tier: number }>(
        `SELECT tier FROM deck_card_progress WHERE user_id = $1 AND deck_card_id = $2 ORDER BY tier`,
        [userId, fixture.cardIds[0]],
      );
      expect(rowsAfterSecond.map((r) => r.tier)).toEqual([1, 2]);
    });

    it('keeps tier-1 and tier-2 progress on the same card independent', async () => {
      await recordDeckCardReview(userId, fixture.cardIds[0]!, 'easy', 1); // unlocks tier 2
      const tier2Result = await recordDeckCardReview(userId, fixture.cardIds[0]!, 'good', 2);
      expect(tier2Result.card_state).toBe('learning');

      const tier1Rows = await query<{ card_state: string }>(
        `SELECT card_state FROM deck_card_progress WHERE user_id = $1 AND deck_card_id = $2 AND tier = 1`,
        [userId, fixture.cardIds[0]],
      );
      expect(tier1Rows[0]!.card_state).toBe('review');
    });

    it('drops a reviewed card out of the study queue until it is due again', async () => {
      await recordDeckCardReview(userId, fixture.cardIds[0]!, 'good', 1);
      const queue = await getDeckStudyQueue(userId, fixture.deckId, { limit: 20 });
      expect(queue.map((item) => item.deck_card_id)).toEqual([fixture.cardIds[1]]);
    });

    it('keeps two users’ progress on the same deck separate', async () => {
      // A deck is owned by one user, but progress rows are still keyed by (user, card,
      // tier), so a review by the owner must not affect anyone else's read of the row.
      const other = await registerUser(app, 'other@example.com');
      await recordDeckCardReview(userId, fixture.cardIds[0]!, 'good', 1);

      const otherQueue = await getDeckStudyQueue(other.id, fixture.deckId, { limit: 20 });
      expect(otherQueue).toHaveLength(2);
    });
  });

  describe('setDeckCardRemoved', () => {
    it('round-trips removed on and off, creating a progress row for a never-seen card', async () => {
      const removed = await setDeckCardRemoved(userId, fixture.cardIds[0]!, 1, true);
      expect(removed.removed).toBe(true);
      expect(removed.card_state).toBe('new');

      const afterRemove = await getDeckStudyQueue(userId, fixture.deckId, { limit: 20 });
      expect(afterRemove.map((item) => item.deck_card_id)).toEqual([fixture.cardIds[1]]);

      const restored = await setDeckCardRemoved(userId, fixture.cardIds[0]!, 1, false);
      expect(restored.removed).toBe(false);

      const afterRestore = await getDeckStudyQueue(userId, fixture.deckId, { limit: 20 });
      expect(afterRestore.map((item) => item.deck_card_id).sort()).toEqual(
        [...fixture.cardIds].sort(),
      );
    });

    it('preserves SM-2 state across a remove/restore cycle', async () => {
      await recordDeckCardReview(userId, fixture.cardIds[0]!, 'good', 1);
      await setDeckCardRemoved(userId, fixture.cardIds[0]!, 1, true);
      const restored = await setDeckCardRemoved(userId, fixture.cardIds[0]!, 1, false);
      expect(restored.card_state).toBe('learning');
      expect(restored.review_count).toBe(1);
    });
  });
});
