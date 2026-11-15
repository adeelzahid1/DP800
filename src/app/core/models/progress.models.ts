import { Difficulty, QuestionType } from './content.models';

/** Per-question learner state, persisted in localStorage. */
export interface QuestionProgress {
  /** Subtopic id, denormalized so aggregates don't need the banks loaded. */
  s?: string;
  /** Marked read (auto on view when enabled, or manually). */
  read?: boolean;
  /** Number of practice attempts. */
  attempts?: number;
  /** Number of correct practice attempts. */
  correct?: number;
  /** Result of the most recent attempt. */
  lastCorrect?: boolean;
  bookmarked?: boolean;
}

export type ProgressMap = Record<string, QuestionProgress>;

export interface PortalSettings {
  theme: 'system' | 'light' | 'dark';
  locale: string;
  /** Show answers/explanations by default in study mode. */
  showAnswers: boolean;
  /** Show related examples by default in study mode. */
  showExamples: boolean;
  /** Auto-mark questions read when viewed. */
  autoMarkRead: boolean;
}

export const DEFAULT_SETTINGS: PortalSettings = {
  theme: 'system',
  locale: 'en',
  showAnswers: true,
  showExamples: true,
  autoMarkRead: true,
};

/** Filters for practice sessions. Empty array / undefined = no filter. */
export interface PracticeFilters {
  difficulty: Difficulty[];
  types: QuestionType[];
  read?: boolean;
  attempted?: boolean;
  correct?: boolean;
  bookmarked?: boolean;
}

export interface MockAnswer {
  questionId: string;
  /** Learner response, same shape as Question.answer. */
  answer?: string[];
  /** Learner response, same shape as Question.answerMap. */
  answerMap?: Record<string, string>;
  flagged?: boolean;
  /** Graded on submit. */
  correct?: boolean;
}

export interface MockSectionStat {
  id: string;
  title: string;
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
}

export interface MockAttempt {
  id: string;
  startedAt: number;
  finishedAt?: number;
  /** Seconds the learner actually used. */
  timeUsedSec?: number;
  durationMinutes: number;
  questionIds: string[];
  /** questionId -> subtopicId, so review can lazily reload the banks. */
  questionSubtopics: Record<string, string>;
  answers: Record<string, MockAnswer>;
  /** True when "Focus on my weak areas" boosted sampling. */
  weakFocused?: boolean;
  /** Subtopic ids that received boosted sampling. */
  boostedSubtopics?: string[];
  submitted?: boolean;
  autoSubmitted?: boolean;
  /** Scaled score 100–1000 (estimate). */
  score?: number;
  passed?: boolean;
  totalCorrect?: number;
  byDomain?: MockSectionStat[];
  byTopic?: MockSectionStat[];
  bySubtopic?: MockSectionStat[];
}
