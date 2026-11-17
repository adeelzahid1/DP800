import { ActivityMap } from '../models/progress.models';
import { dayNumber } from './srs';

/** Local day number of a YYYY-MM-DD date string, or undefined if it isn't one. */
export function parseDateInput(value: string | undefined | null): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return undefined;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  if (date.getMonth() !== Number(m[2]) - 1) return undefined;
  return dayNumber(date.getTime());
}

/** YYYY-MM-DD for a timestamp in local time (for date inputs). */
export function toDateInput(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isActive(activity: ActivityMap, day: number): boolean {
  const a = activity[String(day)];
  return !!a && a.n + (a.c ?? 0) > 0;
}

export interface StreakInfo {
  /** Consecutive active days ending today (or yesterday, if today isn't done yet). */
  streak: number;
  activeToday: boolean;
  /** Whole days since the last active day; undefined if there is no activity at all. */
  daysSinceActive?: number;
}

export function streakInfo(activity: ActivityMap, today: number): StreakInfo {
  const activeToday = isActive(activity, today);
  let day = activeToday ? today : today - 1;
  let streak = 0;
  while (isActive(activity, day)) {
    streak++;
    day--;
  }
  let last: number | undefined;
  for (const key of Object.keys(activity)) {
    const d = Number(key);
    if (d <= today && isActive(activity, d) && (last === undefined || d > last)) last = d;
  }
  return { streak, activeToday, daysSinceActive: last === undefined ? undefined : today - last };
}

/** Days kept free of new questions before the exam, for mocks and review. */
export const PLAN_BUFFER_DAYS = 2;

export interface PlanInput {
  today: number;
  examDay: number | undefined;
  /** Questions never attempted, right now. */
  unattempted: number;
  /** Questions attempted for the first time today. */
  newToday: number;
  /** Spaced-review questions due now. */
  reviewsDue: number;
}

export interface DailyPlan {
  status: 'no-date' | 'past' | 'exam-day' | 'active';
  /** Days from today until the exam (0 on exam day). */
  daysLeft: number;
  /** Days over which new questions are spread (today included). */
  studyDays: number;
  bufferDays: number;
  /** New questions per day, fixed for the whole day. */
  newPerDay: number;
  newLeftToday: number;
  reviewsDue: number;
}

/**
 * Spread the unattempted questions evenly over the days left, keeping the last
 * PLAN_BUFFER_DAYS before the exam for mock exams and review when there's room.
 * The target is computed from the count at the start of today, so it doesn't
 * shrink while the learner works through it.
 */
export function dailyPlan(input: PlanInput): DailyPlan {
  const { today, examDay, unattempted, newToday, reviewsDue } = input;
  const empty = { daysLeft: 0, studyDays: 0, bufferDays: 0, newPerDay: 0, newLeftToday: 0, reviewsDue };
  if (examDay === undefined) return { status: 'no-date', ...empty };
  const daysLeft = examDay - today;
  if (daysLeft < 0) return { status: 'past', ...empty, daysLeft };
  if (daysLeft === 0) return { status: 'exam-day', ...empty };

  const bufferDays = daysLeft > PLAN_BUFFER_DAYS + 5 ? PLAN_BUFFER_DAYS : 0;
  const studyDays = daysLeft - bufferDays;
  const atStartOfToday = unattempted + newToday;
  const newPerDay = Math.ceil(atStartOfToday / studyDays);
  return {
    status: 'active',
    daysLeft,
    studyDays,
    bufferDays,
    newPerDay,
    newLeftToday: Math.max(0, newPerDay - newToday),
    reviewsDue,
  };
}

export interface CoverageStat {
  id: string;
  total: number;
  attempted: number;
}

/**
 * Up to `n` subtopics to work on next: weak areas first (in the order given),
 * then the least-covered subtopics that still have unattempted questions.
 */
export function suggestSubtopics(
  stats: readonly CoverageStat[],
  weakIds: readonly string[],
  n = 3,
): { id: string; reason: 'weak' | 'coverage' }[] {
  const out: { id: string; reason: 'weak' | 'coverage' }[] = [];
  const known = new Set(stats.map((s) => s.id));
  for (const id of weakIds) {
    if (out.length >= n) return out;
    if (known.has(id)) out.push({ id, reason: 'weak' });
  }
  const taken = new Set(out.map((o) => o.id));
  const rest = stats
    .map((s, order) => ({ ...s, order }))
    .filter((s) => s.total > 0 && s.attempted < s.total && !taken.has(s.id))
    .sort((a, b) => a.attempted / a.total - b.attempted / b.total || a.order - b.order);
  for (const s of rest) {
    if (out.length >= n) break;
    out.push({ id: s.id, reason: 'coverage' });
  }
  return out;
}
