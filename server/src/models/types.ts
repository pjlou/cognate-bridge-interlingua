export type LanguageFamily = 'Germanic' | 'Romance' | 'Uralic';
export type Provenance = 'parsed' | 'rule_generated' | 'curated' | 'similarity';
export type GrammarDrillKind = 'multiple_choice' | 'word_order';

export interface TargetLanguage {
  id: number;
  code: string;
  name: string;
  family: LanguageFamily;
}

export interface BridgeLanguage {
  id: number;
  code: string;
  name: string;
  family: LanguageFamily;
  description: string | null;
  source_url: string | null;
  license_note: string;
}

export interface BridgeLanguageDetail extends BridgeLanguage {
  target_languages: TargetLanguage[];
  vocabulary_count: number;
  grammar_pattern_count: number;
}

export interface CorrespondenceRule {
  id: number;
  code: string;
  name: string | null;
  notation: string | null;
  description: string;
  source_note: string;
  example_bridge: string | null;
  example_target: string | null;
}

export interface Cognate {
  id: number;
  target_language: TargetLanguage;
  target_word: string;
  provenance: Provenance;
  confidence: number;
  validated_against: string | null;
  notes: string | null;
  rule: CorrespondenceRule | null;
  rules: CorrespondenceRule[];
}

export interface ProgressSummary {
  /** Present for grammar / rule cards (Leitner). Absent on vocabulary SM-2 rows. */
  mastery_level?: number;
  review_count: number;
  success_count: number;
  consecutive_successes?: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  card_state?: 'new' | 'learning' | 'review' | 'relearning';
  ease_factor?: number;
  interval_days?: number;
  repetitions?: number;
  lapses?: number;
  learning_step?: number;
  /** Soft-removed from the study deck; SRS fields are kept for restore. */
  removed?: boolean;
}

export interface VocabularyStats {
  studied: number;
  due_new: number;
  due_review: number;
  retention: number | null;
  average_ease: number | null;
  mature: number;
}

export interface DueCounts {
  new: number;
  review: number;
  vocabulary: number;
  grammar: number;
}

export interface VocabularyItem {
  id: number;
  bridge_language_id: number;
  bridge_language_code: string;
  headword: string;
  part_of_speech: string;
  gloss_en: string;
  glosses_en: string[];
  ipa: string | null;
  ipa_source?: 'direct_phonology' | 'derived_phonology' | 'uncertain_phonology' | null;
  etymology: string | null;
  difficulty_level: number;
  frequency_rank: number | null;
  frequency_band: number | null;
  has_english_cognate: boolean;
  transparency_score: number | null;
  priority_score: number | null;
  /** Spec §10.1: closed-class / auxiliary Interlingua vocabulary. */
  is_core_track: boolean;
  source_ref: string;
  cognates: Cognate[];
  progress: ProgressSummary | null;
  /** 1 = English → bridge; 2 = bridge → selected languages. Present on study cards. */
  tier?: 1 | 2;
  /** Whether this study-queue card is being introduced or re-reviewed. */
  queue_kind?: 'new' | 'review';
}

export interface GrammarParallel {
  target_language: TargetLanguage;
  target_text: string;
}

export interface GrammarExample {
  id: number;
  position: number;
  bridge_text: string;
  gloss_en: string;
  highlight: string | null;
  prompt: string | null;
  answer: string | null;
  distractors: string[];
  note: string | null;
  parallels: GrammarParallel[];
}

export interface GrammarPattern {
  id: number;
  bridge_language_id: number;
  bridge_language_code: string;
  slug: string;
  name: string;
  family: LanguageFamily;
  summary: string;
  description: string;
  source_note: string;
  difficulty_level: number;
  drill_kind: GrammarDrillKind;
  example_count: number;
  examples?: GrammarExample[];
  progress: ProgressSummary | null;
}

export interface FrequencyBand {
  band: number | null;
  rank_from: number | null;
  rank_to: number | null;
  total: number;
  due: number;
}

export interface RuleCardMapping {
  id: number;
  position: number;
  from_label: string;
  to_label: string;
  notation: string | null;
}

export interface RuleCardExample {
  id: number;
  position: number;
  mapping_id: number | null;
  prompt: string | null;
  answer: string | null;
  distractors: string[];
  note: string | null;
  false_friend: boolean;
  forms: Record<string, string>;
}

export interface RuleCard {
  id: number;
  slug: string;
  name: string;
  tier: 1 | 2;
  position: number;
  teaching_frame: string;
  pattern_summary: string;
  description: string;
  caveat: string | null;
  source_note: string;
  difficulty_level: number;
  sound_law_prefixes: string[];
  example_count: number;
  mappings?: RuleCardMapping[];
  examples?: RuleCardExample[];
  progress: ProgressSummary | null;
}
