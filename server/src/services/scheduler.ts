/**
 * Spaced-repetition scheduling.
 *
 * Vocabulary uses Anki-classic SM-2 (ease factor, learning steps, Again/Hard/Good/Easy).
 * Grammar patterns and rule cards keep the original Leitner fixed-interval boxes with
 * mastery_level in steps of 25.
 */

export const MASTERY_MIN = 0;
export const MASTERY_MAX = 100;
export const MASTERY_STEP = 25;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TWELVE_HOURS = 12 * HOUR;

/** Leitner intervals for grammar / rule cards, keyed by mastery after the review. */
export const REVIEW_INTERVALS_MS: Record<number, number> = {
  0: 0,
  25: TWELVE_HOURS,
  50: 1 * DAY,
  75: 3 * DAY,
  100: 365 * DAY,
};

/** Anki-like learning steps before a card graduates to review. */
export const LEARNING_STEPS_MS = [1 * MINUTE, 10 * MINUTE] as const;

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const EASY_BONUS = 1.3;
export const HARD_INTERVAL_FACTOR = 1.2;

export type VocabularyGrade = 'again' | 'hard' | 'good' | 'easy';
export type StudyTier = 1 | 2;
export type VocabularyCardState = 'new' | 'learning' | 'review' | 'relearning';

export interface ProgressState {
  masteryLevel: number;
  reviewCount: number;
  successCount: number;
}

export interface VocabularyProgressState {
  cardState: VocabularyCardState;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  learningStep: number;
  reviewCount: number;
  successCount: number;
}

export interface ReviewOutcome extends ProgressState {
  nextReviewAt: Date;
  lastReviewedAt: Date;
}

export interface VocabularyReviewOutcome {
  cardState: VocabularyCardState;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  learningStep: number;
  reviewCount: number;
  successCount: number;
  nextReviewAt: Date;
  lastReviewedAt: Date;
  /** True when this review graduates the card into the review state. */
  unlockTier2: boolean;
}

export const EMPTY_PROGRESS: ProgressState = {
  masteryLevel: 0,
  reviewCount: 0,
  successCount: 0,
};

export const EMPTY_VOCABULARY_PROGRESS: VocabularyProgressState = {
  cardState: 'new',
  easeFactor: DEFAULT_EASE,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  learningStep: 0,
  reviewCount: 0,
  successCount: 0,
};

export function clampMastery(value: number): number {
  return Math.max(MASTERY_MIN, Math.min(MASTERY_MAX, value));
}

export function nextMastery(current: number, success: boolean): number {
  return clampMastery(current + (success ? MASTERY_STEP : -MASTERY_STEP));
}

export function nextReviewAt(mastery: number, now: Date = new Date()): Date {
  const interval = REVIEW_INTERVALS_MS[clampMastery(mastery)] ?? 0;
  return new Date(now.getTime() + interval);
}

export function clampEase(value: number): number {
  return Math.max(MIN_EASE, Math.round(value * 100) / 100);
}

function addMs(now: Date, ms: number): Date {
  return new Date(now.getTime() + ms);
}

function daysToMs(days: number): number {
  return days * DAY;
}

function graduatingIntervalDays(grade: 'good' | 'easy'): number {
  return grade === 'easy' ? 4 : 1;
}

function scheduleLearning(
  state: VocabularyProgressState,
  grade: VocabularyGrade,
  now: Date,
  asRelearning: boolean,
): VocabularyReviewOutcome {
  const base = {
    reviewCount: state.reviewCount + 1,
    successCount: state.successCount + (grade === 'again' ? 0 : 1),
    lastReviewedAt: now,
    easeFactor: state.easeFactor,
    lapses: state.lapses,
    repetitions: state.repetitions,
  };

  if (grade === 'again') {
    return {
      ...base,
      cardState: asRelearning ? 'relearning' : 'learning',
      intervalDays: LEARNING_STEPS_MS[0]! / DAY,
      learningStep: 0,
      nextReviewAt: addMs(now, LEARNING_STEPS_MS[0]!),
      unlockTier2: false,
    };
  }

  if (grade === 'hard') {
    const stepMs = LEARNING_STEPS_MS[Math.min(state.learningStep, LEARNING_STEPS_MS.length - 1)]!;
    return {
      ...base,
      cardState: asRelearning ? 'relearning' : 'learning',
      intervalDays: stepMs / DAY,
      learningStep: state.learningStep,
      nextReviewAt: addMs(now, stepMs),
      unlockTier2: false,
    };
  }

  if (grade === 'easy') {
    const intervalDays = graduatingIntervalDays('easy');
    return {
      ...base,
      cardState: 'review',
      easeFactor: clampEase(state.easeFactor + 0.15),
      intervalDays,
      repetitions: Math.max(state.repetitions, 1),
      learningStep: 0,
      nextReviewAt: addMs(now, daysToMs(intervalDays)),
      unlockTier2: !asRelearning || state.cardState === 'learning' || state.cardState === 'new',
    };
  }

  // Good: advance one learning step, or graduate.
  const nextStep = state.learningStep + 1;
  if (nextStep >= LEARNING_STEPS_MS.length) {
    const intervalDays = graduatingIntervalDays('good');
    return {
      ...base,
      cardState: 'review',
      intervalDays,
      repetitions: Math.max(state.repetitions, 1),
      learningStep: 0,
      nextReviewAt: addMs(now, daysToMs(intervalDays)),
      unlockTier2: true,
    };
  }

  return {
    ...base,
    cardState: asRelearning ? 'relearning' : 'learning',
    intervalDays: LEARNING_STEPS_MS[nextStep]! / DAY,
    learningStep: nextStep,
    nextReviewAt: addMs(now, LEARNING_STEPS_MS[nextStep]!),
    unlockTier2: false,
  };
}

function scheduleReview(
  state: VocabularyProgressState,
  grade: VocabularyGrade,
  now: Date,
): VocabularyReviewOutcome {
  if (grade === 'again') {
    return {
      cardState: 'relearning',
      easeFactor: clampEase(state.easeFactor * 0.8),
      intervalDays: LEARNING_STEPS_MS[0]! / DAY,
      repetitions: 0,
      lapses: state.lapses + 1,
      learningStep: 0,
      reviewCount: state.reviewCount + 1,
      successCount: state.successCount,
      nextReviewAt: addMs(now, LEARNING_STEPS_MS[0]!),
      lastReviewedAt: now,
      unlockTier2: false,
    };
  }

  let ease = state.easeFactor;
  let intervalDays = state.intervalDays;

  if (grade === 'hard') {
    ease = clampEase(ease - 0.15);
    intervalDays = Math.max(intervalDays * HARD_INTERVAL_FACTOR, intervalDays + 0.5);
  } else if (grade === 'good') {
    intervalDays = Math.max(intervalDays * ease, intervalDays + 1);
  } else {
    ease = clampEase(ease + 0.15);
    intervalDays = Math.max(intervalDays * ease * EASY_BONUS, intervalDays + 1);
  }

  // First review graduation from short intervals uses Anki's classic 1 / 4 day seed
  // when repetitions was still low.
  if (state.repetitions === 0) {
    intervalDays = grade === 'easy' ? 4 : grade === 'hard' ? 1 : 1;
  } else if (state.repetitions === 1 && grade === 'good') {
    intervalDays = Math.max(intervalDays, 6);
  }

  return {
    cardState: 'review',
    easeFactor: ease,
    intervalDays,
    repetitions: state.repetitions + 1,
    lapses: state.lapses,
    learningStep: 0,
    reviewCount: state.reviewCount + 1,
    successCount: state.successCount + 1,
    nextReviewAt: addMs(now, daysToMs(intervalDays)),
    lastReviewedAt: now,
    unlockTier2: false,
  };
}

/**
 * Vocabulary grading: Again / Hard / Good / Easy (Anki SM-2).
 *
 * Graduating from learning (or Easy on a new card) unlocks the cognate tier.
 */
export function applyVocabularyGrade(
  state: VocabularyProgressState,
  grade: VocabularyGrade,
  now: Date = new Date(),
): VocabularyReviewOutcome {
  const phase = state.cardState;

  if (phase === 'new') {
    const entered: VocabularyProgressState = {
      ...state,
      cardState: 'learning',
      learningStep: 0,
    };
    if (grade === 'good') {
      // First Good places the card in the first learning step (1 minute).
      return {
        cardState: 'learning',
        easeFactor: state.easeFactor,
        intervalDays: LEARNING_STEPS_MS[0]! / DAY,
        repetitions: 0,
        lapses: state.lapses,
        learningStep: 0,
        reviewCount: state.reviewCount + 1,
        successCount: state.successCount + 1,
        nextReviewAt: addMs(now, LEARNING_STEPS_MS[0]!),
        lastReviewedAt: now,
        unlockTier2: false,
      };
    }
    return scheduleLearning(entered, grade, now, false);
  }

  if (phase === 'learning') {
    return scheduleLearning(state, grade, now, false);
  }

  if (phase === 'relearning') {
    const outcome = scheduleLearning(state, grade, now, true);
    // Relearning graduation should not re-unlock tier 2.
    return { ...outcome, unlockTier2: false };
  }

  return scheduleReview(state, grade, now);
}

/** Applies one binary review for grammar / rule cards (Leitner). */
export function applyReview(
  state: ProgressState,
  success: boolean,
  now: Date = new Date(),
): ReviewOutcome {
  const masteryLevel = nextMastery(state.masteryLevel, success);
  return {
    masteryLevel,
    reviewCount: state.reviewCount + 1,
    successCount: state.successCount + (success ? 1 : 0),
    nextReviewAt: nextReviewAt(masteryLevel, now),
    lastReviewedAt: now,
  };
}

export type ItemKind = 'vocabulary' | 'grammar' | 'rule_card';

interface ProgressTableShape {
  table: string;
  itemColumn: string;
}

const PROGRESS_TABLES: Record<ItemKind, ProgressTableShape> = {
  vocabulary: { table: 'vocabulary_progress', itemColumn: 'bridge_vocabulary_id' },
  grammar: { table: 'grammar_progress', itemColumn: 'grammar_pattern_id' },
  rule_card: { table: 'rule_card_progress', itemColumn: 'rule_card_id' },
};

export function progressTable(kind: ItemKind): ProgressTableShape {
  return PROGRESS_TABLES[kind];
}
