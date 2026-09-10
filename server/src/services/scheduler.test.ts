import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EASE,
  EMPTY_PROGRESS,
  EMPTY_VOCABULARY_PROGRESS,
  LEARNING_STEPS_MS,
  MASTERY_STEP,
  MIN_EASE,
  TWELVE_HOURS,
  applyReview,
  applyVocabularyGrade,
  clampEase,
  clampMastery,
  nextMastery,
  nextReviewAt,
} from './scheduler.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('clampMastery', () => {
  it('holds the value inside 0..100', () => {
    expect(clampMastery(-25)).toBe(0);
    expect(clampMastery(125)).toBe(100);
    expect(clampMastery(50)).toBe(50);
  });
});

describe('nextMastery', () => {
  it('moves one step per review in either direction', () => {
    expect(nextMastery(50, true)).toBe(50 + MASTERY_STEP);
    expect(nextMastery(50, false)).toBe(50 - MASTERY_STEP);
  });

  it('does not run past either end of the scale', () => {
    expect(nextMastery(100, true)).toBe(100);
    expect(nextMastery(0, false)).toBe(0);
  });
});

describe('nextReviewAt', () => {
  it('maps each mastery level to its fixed interval', () => {
    expect(nextReviewAt(0, NOW).getTime()).toBe(NOW.getTime());
    expect(nextReviewAt(25, NOW).getTime()).toBe(NOW.getTime() + TWELVE_HOURS);
    expect(nextReviewAt(50, NOW).getTime()).toBe(NOW.getTime() + DAY);
    expect(nextReviewAt(75, NOW).getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it('pushes fully mastered items out of the due window', () => {
    expect(nextReviewAt(100, NOW).getTime()).toBe(NOW.getTime() + 365 * DAY);
  });
});

describe('applyReview', () => {
  it('counts a success against both counters', () => {
    const result = applyReview(EMPTY_PROGRESS, true, NOW);
    expect(result.masteryLevel).toBe(25);
    expect(result.reviewCount).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.nextReviewAt.getTime()).toBe(NOW.getTime() + TWELVE_HOURS);
  });

  it('counts a failure as a review but not a success', () => {
    const result = applyReview({ masteryLevel: 50, reviewCount: 3, successCount: 2 }, false, NOW);
    expect(result.masteryLevel).toBe(25);
    expect(result.reviewCount).toBe(4);
    expect(result.successCount).toBe(2);
  });

  it('makes a failed item immediately due again once mastery bottoms out', () => {
    const result = applyReview({ masteryLevel: 25, reviewCount: 1, successCount: 1 }, false, NOW);
    expect(result.masteryLevel).toBe(0);
    expect(result.nextReviewAt.getTime()).toBe(NOW.getTime());
  });

  it('reaches mastery after four consecutive successes', () => {
    let state = EMPTY_PROGRESS;
    for (let i = 0; i < 4; i += 1) {
      state = applyReview(state, true, NOW);
    }
    expect(state.masteryLevel).toBe(100);
    expect(state.reviewCount).toBe(4);
  });
});

describe('applyVocabularyGrade (SM-2)', () => {
  it('puts a new card into the first learning step on Good', () => {
    const result = applyVocabularyGrade(EMPTY_VOCABULARY_PROGRESS, 'good', NOW);
    expect(result.cardState).toBe('learning');
    expect(result.learningStep).toBe(0);
    expect(result.unlockTier2).toBe(false);
    expect(result.nextReviewAt.getTime()).toBe(NOW.getTime() + LEARNING_STEPS_MS[0]!);
  });

  it('graduates after completing learning steps with Good', () => {
    const afterFirst = applyVocabularyGrade(EMPTY_VOCABULARY_PROGRESS, 'good', NOW);
    const afterSecond = applyVocabularyGrade(
      {
        ...EMPTY_VOCABULARY_PROGRESS,
        cardState: afterFirst.cardState,
        learningStep: afterFirst.learningStep,
        reviewCount: afterFirst.reviewCount,
        successCount: afterFirst.successCount,
      },
      'good',
      NOW,
    );
    expect(afterSecond.cardState).toBe('learning');
    expect(afterSecond.learningStep).toBe(1);

    const graduated = applyVocabularyGrade(
      {
        ...EMPTY_VOCABULARY_PROGRESS,
        cardState: afterSecond.cardState,
        learningStep: afterSecond.learningStep,
        reviewCount: afterSecond.reviewCount,
        successCount: afterSecond.successCount,
      },
      'good',
      NOW,
    );
    expect(graduated.cardState).toBe('review');
    expect(graduated.intervalDays).toBe(1);
    expect(graduated.unlockTier2).toBe(true);
  });

  it('graduates immediately on Easy and unlocks tier 2', () => {
    const result = applyVocabularyGrade(EMPTY_VOCABULARY_PROGRESS, 'easy', NOW);
    expect(result.cardState).toBe('review');
    expect(result.intervalDays).toBe(4);
    expect(result.unlockTier2).toBe(true);
    expect(result.easeFactor).toBeGreaterThan(DEFAULT_EASE);
  });

  it('sends a review failure into relearning and reduces ease', () => {
    const result = applyVocabularyGrade(
      {
        cardState: 'review',
        easeFactor: 2.5,
        intervalDays: 10,
        repetitions: 3,
        lapses: 0,
        learningStep: 0,
        reviewCount: 5,
        successCount: 4,
      },
      'again',
      NOW,
    );
    expect(result.cardState).toBe('relearning');
    expect(result.lapses).toBe(1);
    expect(result.easeFactor).toBe(2);
    expect(result.repetitions).toBe(0);
    expect(result.unlockTier2).toBe(false);
  });

  it('floors ease at the Anki minimum', () => {
    expect(clampEase(1.0)).toBe(MIN_EASE);
    const result = applyVocabularyGrade(
      {
        cardState: 'review',
        easeFactor: MIN_EASE,
        intervalDays: 5,
        repetitions: 2,
        lapses: 1,
        learningStep: 0,
        reviewCount: 3,
        successCount: 2,
      },
      'again',
      NOW,
    );
    expect(result.easeFactor).toBe(MIN_EASE);
  });

  it('increases review intervals with Good', () => {
    const result = applyVocabularyGrade(
      {
        cardState: 'review',
        easeFactor: 2.5,
        intervalDays: 10,
        repetitions: 3,
        lapses: 0,
        learningStep: 0,
        reviewCount: 4,
        successCount: 4,
      },
      'good',
      NOW,
    );
    expect(result.cardState).toBe('review');
    expect(result.intervalDays).toBe(25);
    expect(result.repetitions).toBe(4);
    expect(result.nextReviewAt.getTime()).toBe(NOW.getTime() + 25 * DAY);
  });
});
