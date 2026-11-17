/**
 * Content model for the DP-800 study portal.
 *
 * Every piece of learner-facing text is a LocalizedText so a "roman"
 * (Roman English) locale can be added later without refactoring.
 * Technical terms and code stay English in all locales.
 */

/** Localized text. `en` is mandatory; other locales are optional overlays. */
export interface LocalizedText {
  en: string;
  roman?: string;
  [locale: string]: string | undefined;
}

export type QuestionType =
  | 'single'
  | 'multiple'
  | 'dragdrop-order'
  | 'dragdrop-match'
  | 'yesno'
  | 'dropdown'
  | 'case';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Option {
  id: string;
  text: LocalizedText;
  /** Optional code snippet shown with the option. */
  code?: string;
}

/** A dropdown blank inside a `dropdown` ("complete the code") question. */
export interface DropdownBlank {
  id: string;
  /** Label shown next to the dropdown, e.g. "Blank 1". */
  label?: LocalizedText;
  choices: Option[];
}

export interface CaseStudy {
  id: string;
  title: LocalizedText;
  scenario: LocalizedText;
  /** Optional code/DDL shared by the whole case. */
  code?: string;
}

export interface Question {
  /** Stable unique id, e.g. "d3-vector-search-0012". */
  id: string;
  domain: string;
  topic: string;
  subtopic: string;
  type: QuestionType;
  difficulty: Difficulty;
  text: LocalizedText;
  /** Optional T-SQL / JSON / YAML snippet rendered as a highlighted block. */
  code?: string;
  /** Language of `code` for the highlighter. Defaults to 'sql'. */
  codeLang?: string;

  /** single / multiple: answer options. */
  options?: Option[];
  /** multiple: how many to select ("Select N"). */
  selectCount?: number;

  /** dragdrop-order: items to arrange. dragdrop-match: draggable items. */
  items?: Option[];
  /** dragdrop-match / categorize: drop targets (categories). */
  targets?: Option[];

  /** yesno: the statements to judge. */
  statements?: Option[];

  /** dropdown: blanks to complete. */
  blanks?: DropdownBlank[];

  /**
   * Answer for list-shaped types:
   * - single: ["a"]
   * - multiple: ["a","c"] (order-insensitive)
   * - dragdrop-order: item ids in correct order
   */
  answer?: string[];
  /**
   * Answer for map-shaped types:
   * - dragdrop-match: itemId -> targetId
   * - yesno: statementId -> "yes" | "no"
   * - dropdown: blankId -> choiceId
   */
  answerMap?: Record<string, string>;

  /** Why the right answer is right and each wrong option is wrong. */
  explanation: LocalizedText;
  /** Short related example reinforcing the lesson. */
  example?: LocalizedText;
  /** Optional code for the example. */
  exampleCode?: string;
  sources: string[];

  /** Case-study grouping: id of a CaseStudy in the same bank. */
  caseId?: string;
}

/** A question bank file: one per subtopic, lazily loaded. */
export interface QuestionBank {
  subtopic: string;
  cases?: CaseStudy[];
  questions: Question[];
}

/** One section of a lesson. */
export interface LessonSection {
  heading: LocalizedText;
  /** Markdown-ish body: paragraphs separated by blank lines; supports **bold**, `code`, lists. */
  body: LocalizedText;
  /** Optional highlighted code block following the body. */
  code?: string;
  codeLang?: string;
}

export interface Lesson {
  subtopic: string;
  title: LocalizedText;
  /** Beginner on-ramp shown in a highlighted box, when needed. */
  prerequisiteRecap?: LessonSection[];
  sections: LessonSection[];
  /** Key points / exam tips / common traps. */
  examTips: LocalizedText[];
  sources: string[];
  /** Date (YYYY-MM-DD) the lesson was last checked against Microsoft Learn. */
  lastVerified?: string;
  /** "preview" when the lesson covers features that are in preview somewhere. */
  status?: 'ga' | 'preview';
  /** Which features are in preview, and where. Required when status is "preview". */
  previewNote?: LocalizedText;
}

export interface SubtopicMeta {
  id: string;
  title: LocalizedText;
  /** Relative URL of the lesson JSON under /content/. */
  lessonFile: string;
  /** Relative URL of the question bank JSON under /content/ (absent for lesson-only). */
  questionFile?: string;
  questionCount: number;
}

export interface TopicMeta {
  id: string;
  title: LocalizedText;
  subtopics: SubtopicMeta[];
}

export interface DomainMeta {
  id: string;
  title: LocalizedText;
  /** Official weighting bounds in percent, e.g. 35–40. Zero for Foundations. */
  weightLow: number;
  weightHigh: number;
  /** Normalized sampling weight used by the mock exam (0 for Foundations). */
  examWeight: number;
  /** Lessons only; excluded from mock exams and question stats. */
  lessonOnly?: boolean;
  topics: TopicMeta[];
}

export interface LocaleMeta {
  code: string;
  label: string;
  enabled: boolean;
}

export interface ContentManifest {
  version: number;
  locales: LocaleMeta[];
  domains: DomainMeta[];
}

/** Exam constants (official duration from the DP-800 certification page). */
export const EXAM_CONFIG = {
  durationMinutes: 120,
  defaultQuestionCount: 50,
  minQuestionCount: 30,
  maxQuestionCount: 60,
  passingScore: 700,
  scaleMin: 100,
  scaleMax: 1000,
} as const;

/** Weak-area thresholds. */
export const WEAK_AREA_CONFIG = {
  /** Accuracy below this marks a subtopic weak… */
  accuracyThreshold: 0.6,
  /** …but only once it has at least this many attempts (practice + mock). */
  minAttempts: 8,
  /** Sampling multiplier for weak subtopics in a focused mock. */
  boostFactor: 2,
} as const;
