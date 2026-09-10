import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { query } from '../db.js';
import { hasTestDatabase, migrateTestDatabase, teardown, truncateAll } from '../test/db.js';
import { registerUser } from '../test/fixtures.js';
import { seedDeckFixture, type DeckFixture } from '../test/deckFixtures.js';
import {
  deckIdForCard,
  getDeckById,
  getDeckDueCounts,
  getDeckStudyQueue,
  getDeckStudyQueueItem,
  listDecks,
} from './deckContent.model.js';

const app = createApp();

describe.skipIf(!hasTestDatabase)('deckContent.model', () => {
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

  describe('listDecks / getDeckById', () => {
    it('lists a deck the user owns with joined language codes', async () => {
      const decks = await listDecks(userId);
      expect(decks).toHaveLength(1);
      expect(decks[0]!.id).toBe(fixture.deckId);
      expect(decks[0]!.bridge_language_code).toBe('ia');
      expect(decks[0]!.target_language_code).toBe('de');
      expect(decks[0]!.target_language_name).toBe('German');
      expect(decks[0]!.status).toBe('ready');
      expect(decks[0]!.card_count).toBe(2);
    });

    it("does not list another user's deck", async () => {
      const other = await registerUser(app, 'other@example.com');
      expect(await listDecks(other.id)).toEqual([]);
    });

    it('fetches a deck by id', async () => {
      const deck = await getDeckById(fixture.deckId);
      expect(deck?.id).toBe(fixture.deckId);
      expect(deck?.owner_user_id).toBe(userId);
    });

    it('returns null for a missing deck', async () => {
      expect(await getDeckById(999_999)).toBeNull();
    });

    it('reflects null bridge/target language before mapping is confirmed', async () => {
      const rows = await query<{ id: number }>(
        `INSERT INTO decks (owner_user_id, name, status) VALUES ($1, 'Unmapped', 'mapping') RETURNING id`,
        [userId],
      );
      const deck = await getDeckById(rows[0]!.id);
      expect(deck?.bridge_language_id).toBeNull();
      expect(deck?.bridge_language_code).toBeNull();
      expect(deck?.target_language_id).toBeNull();
      expect(deck?.target_language_code).toBeNull();
      expect(deck?.target_language_name).toBeNull();
    });
  });

  describe('deckIdForCard', () => {
    it('resolves a card to its deck', async () => {
      expect(await deckIdForCard(fixture.cardIds[0]!)).toBe(fixture.deckId);
    });

    it('returns null for an unknown card', async () => {
      expect(await deckIdForCard(999_999)).toBeNull();
    });
  });

  describe('getDeckStudyQueue', () => {
    it('hands out unseen tier-1 cards by default', async () => {
      const queue = await getDeckStudyQueue(userId, fixture.deckId, { limit: 20 });
      expect(queue).toHaveLength(2);
      expect(queue.every((item) => item.tier === 1)).toBe(true);
      expect(queue.every((item) => item.queue_kind === 'new')).toBe(true);
      expect(queue.every((item) => item.progress === null)).toBe(true);
    });

    it('gates tier-1 branches to both/learn_bridge and tier-2 branches to both/apply_bridge/skip_bridge', async () => {
      const both = await getDeckStudyQueue(userId, fixture.deckId, { limit: 20, tierMode: 'both' });
      expect(both).toHaveLength(2);
      expect(both.every((item) => item.tier === 1)).toBe(true);

      const learnBridge = await getDeckStudyQueue(userId, fixture.deckId, {
        limit: 20,
        tierMode: 'learn_bridge',
      });
      expect(learnBridge).toHaveLength(2);
      expect(learnBridge.every((item) => item.tier === 1)).toBe(true);

      // No tier-2 progress rows exist yet and unlockAllTier2 defaults to false, so
      // apply_bridge/skip_bridge modes see nothing until tier 1 has been reviewed.
      const applyBridge = await getDeckStudyQueue(userId, fixture.deckId, {
        limit: 20,
        tierMode: 'apply_bridge',
      });
      expect(applyBridge).toEqual([]);

      const skipBridge = await getDeckStudyQueue(userId, fixture.deckId, {
        limit: 20,
        tierMode: 'skip_bridge',
      });
      expect(skipBridge).toEqual([]);
    });

    it('unlockAllTier2 surfaces tier-2 new cards that have no progress row yet', async () => {
      const applyUnlocked = await getDeckStudyQueue(userId, fixture.deckId, {
        limit: 20,
        tierMode: 'apply_bridge',
        unlockAllTier2: true,
      });
      expect(applyUnlocked).toHaveLength(2);
      expect(applyUnlocked.every((item) => item.tier === 2)).toBe(true);
      expect(applyUnlocked.every((item) => item.queue_kind === 'new')).toBe(true);
    });

    it('excludes a card whose progress row is marked removed', async () => {
      await query(
        `INSERT INTO deck_card_progress (user_id, deck_card_id, tier, removed)
         VALUES ($1, $2, 1, TRUE)`,
        [userId, fixture.cardIds[0]],
      );
      const queue = await getDeckStudyQueue(userId, fixture.deckId, { limit: 20 });
      expect(queue.map((item) => item.deck_card_id)).toEqual([fixture.cardIds[1]]);
    });

    it('surfaces a tier-1 card as review, not new, once it is due again', async () => {
      await query(
        `INSERT INTO deck_card_progress
           (user_id, deck_card_id, tier, card_state, next_review_at)
         VALUES ($1, $2, 1, 'learning', NOW() - INTERVAL '1 second')`,
        [userId, fixture.cardIds[0]],
      );
      const queue = await getDeckStudyQueue(userId, fixture.deckId, { limit: 20 });
      const haus = queue.find((item) => item.deck_card_id === fixture.cardIds[0]);
      expect(haus?.queue_kind).toBe('review');
      expect(haus?.tier).toBe(1);
    });
  });

  describe('getDeckDueCounts', () => {
    it('counts every unseen card as new for a fresh deck', async () => {
      expect(await getDeckDueCounts(userId, fixture.deckId)).toEqual({
        new: 2,
        review: 0,
        vocabulary: 2,
      });
    });

    it('moves a card from new to review once it is scheduled and due', async () => {
      await query(
        `INSERT INTO deck_card_progress
           (user_id, deck_card_id, tier, card_state, next_review_at)
         VALUES ($1, $2, 1, 'learning', NOW() - INTERVAL '1 second')`,
        [userId, fixture.cardIds[0]],
      );
      expect(await getDeckDueCounts(userId, fixture.deckId)).toEqual({
        new: 1,
        review: 1,
        vocabulary: 2,
      });
    });

    it('gates tier-2 counts to apply_bridge/skip_bridge, and hides them until unlocked', async () => {
      // No tier-2 progress exists yet on a fresh deck -- without unlockAllTier2,
      // apply_bridge sees nothing (this was the bug: the deck-study route never sent
      // an unlock signal, so "Apply bridge"/"Skip bridge" always looked empty).
      expect(await getDeckDueCounts(userId, fixture.deckId, { tierMode: 'apply_bridge' })).toEqual({
        new: 0,
        review: 0,
        vocabulary: 0,
      });
      expect(
        await getDeckDueCounts(userId, fixture.deckId, {
          tierMode: 'apply_bridge',
          unlockAllTier2: true,
        }),
      ).toEqual({ new: 2, review: 0, vocabulary: 2 });
      // learn_bridge is tier-1 only, unaffected by unlockAllTier2.
      expect(
        await getDeckDueCounts(userId, fixture.deckId, { tierMode: 'learn_bridge' }),
      ).toEqual({ new: 2, review: 0, vocabulary: 2 });
    });
  });

  describe('getDeckStudyQueueItem / VocabularyItem shaping', () => {
    it('shapes a card into a VocabularyItem with one synthesized cognate and has_audio flags', async () => {
      const item = await getDeckStudyQueueItem(userId, fixture.cardIds[0]!, 1);
      expect(item).not.toBeNull();
      expect(item!.headword).toBe('haus');
      expect(item!.part_of_speech).toBe('');
      expect(item!.gloss_en).toBe('house');
      expect(item!.glosses_en).toEqual(['house']);
      expect(item!.ipa).toBe('/haʊs/');
      expect(item!.ipa_source).toBe('direct_phonology');
      expect(item!.etymology).toBeNull();
      expect(item!.difficulty_level).toBe(1);
      expect(item!.frequency_rank).toBeNull();
      expect(item!.frequency_band).toBeNull();
      expect(item!.has_english_cognate).toBe(true);
      expect(item!.is_core_track).toBe(false);
      expect(item!.source_ref).toBe('Imported deck');
      expect(item!.tier).toBe(1);
      expect(item!.progress).toBeNull();

      expect(item!.cognates).toHaveLength(1);
      const cognate = item!.cognates[0]!;
      expect(cognate.id).toBe(fixture.cardIds[0]);
      expect(cognate.target_word).toBe('Haus');
      expect(cognate.target_language.code).toBe('de');
      expect(cognate.target_language.name).toBe('German');
      expect(cognate.provenance).toBe('curated');
      expect(cognate.confidence).toBe(1);
      expect(cognate.rule).toBeNull();
      expect(cognate.rules).toEqual([]);

      // Additive deck-only fields.
      const additive = item as unknown as {
        source: string;
        deck_id: number;
        deck_card_id: number;
        has_audio: { english: boolean; bridge: boolean; target: boolean };
      };
      expect(additive.source).toBe('deck');
      expect(additive.deck_id).toBe(fixture.deckId);
      expect(additive.deck_card_id).toBe(fixture.cardIds[0]);
      expect(additive.has_audio).toEqual({ english: false, bridge: false, target: false });
    });

    it('reports has_audio truthfully when audio bytes are present', async () => {
      await query(`UPDATE deck_cards SET english_audio = $2 WHERE id = $1`, [
        fixture.cardIds[0],
        Buffer.from([1, 2, 3]),
      ]);
      const item = await getDeckStudyQueueItem(userId, fixture.cardIds[0]!, 1);
      const additive = item as unknown as { has_audio: { english: boolean } };
      expect(additive.has_audio.english).toBe(true);
    });

    it('attaches the tier-1 progress row when one exists', async () => {
      await query(
        `INSERT INTO deck_card_progress (user_id, deck_card_id, tier, card_state, review_count, success_count)
         VALUES ($1, $2, 1, 'learning', 1, 1)`,
        [userId, fixture.cardIds[0]],
      );
      const item = await getDeckStudyQueueItem(userId, fixture.cardIds[0]!, 1);
      expect(item!.progress).not.toBeNull();
      expect(item!.progress!.card_state).toBe('learning');
      expect(item!.progress!.review_count).toBe(1);
      expect(item!.progress!.consecutive_successes).toBeUndefined();
    });

    it('returns null for a missing card', async () => {
      expect(await getDeckStudyQueueItem(userId, 999_999, 1)).toBeNull();
    });
  });
});
