import { dayNumber } from './srs';
import {
  PLAN_BUFFER_DAYS,
  dailyPlan,
  parseDateInput,
  streakInfo,
  suggestSubtopics,
  toDateInput,
} from './study-plan';

describe('study plan', () => {
  const today = dayNumber(new Date(2026, 10, 17, 9).getTime());

  it('parses and formats local dates', () => {
    expect(parseDateInput('2026-11-17')).toBe(today);
    expect(parseDateInput('2026-11-18')).toBe(today + 1);
    expect(parseDateInput('2026-02-30')).toBeUndefined();
    expect(parseDateInput('')).toBeUndefined();
    expect(parseDateInput(undefined)).toBeUndefined();
    expect(toDateInput(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });

  it('handles missing, past and same-day exam dates', () => {
    const base = { today, unattempted: 100, newToday: 0, reviewsDue: 4 };
    expect(dailyPlan({ ...base, examDay: undefined }).status).toBe('no-date');
    expect(dailyPlan({ ...base, examDay: today - 1 }).status).toBe('past');
    const examDay = dailyPlan({ ...base, examDay: today });
    expect(examDay.status).toBe('exam-day');
    expect(examDay.newPerDay).toBe(0);
    expect(examDay.reviewsDue).toBe(4);
  });

  it('spreads new questions over the days left, keeping buffer days when there is room', () => {
    const plan = dailyPlan({ today, examDay: today + 30, unattempted: 1000, newToday: 0, reviewsDue: 0 });
    expect(plan.bufferDays).toBe(PLAN_BUFFER_DAYS);
    expect(plan.studyDays).toBe(28);
    expect(plan.newPerDay).toBe(36); // ceil(1000 / 28)
    expect(plan.newLeftToday).toBe(36);

    const short = dailyPlan({ today, examDay: today + 4, unattempted: 10, newToday: 0, reviewsDue: 0 });
    expect(short.bufferDays).toBe(0);
    expect(short.newPerDay).toBe(3);
  });

  it('keeps the daily target fixed while working through it', () => {
    const start = dailyPlan({ today, examDay: today + 10, unattempted: 100, newToday: 0, reviewsDue: 0 });
    const later = dailyPlan({ today, examDay: today + 10, unattempted: 90, newToday: 10, reviewsDue: 0 });
    expect(later.newPerDay).toBe(start.newPerDay);
    expect(later.newLeftToday).toBe(start.newPerDay - 10);
    const over = dailyPlan({ today, examDay: today + 10, unattempted: 50, newToday: 50, reviewsDue: 0 });
    expect(over.newLeftToday).toBe(0);
  });

  it('counts streaks ending today or yesterday', () => {
    const t = String(today);
    const y = String(today - 1);
    const y2 = String(today - 2);
    const y4 = String(today - 4);
    expect(streakInfo({}, today)).toEqual({ streak: 0, activeToday: false, daysSinceActive: undefined });
    expect(streakInfo({ [t]: { n: 1 }, [y]: { n: 0, c: 3 }, [y2]: { n: 2 }, [y4]: { n: 1 } }, today)).toEqual({
      streak: 3,
      activeToday: true,
      daysSinceActive: 0,
    });
    expect(streakInfo({ [y]: { n: 1 }, [y2]: { n: 1 } }, today)).toEqual({
      streak: 2,
      activeToday: false,
      daysSinceActive: 1,
    });
    expect(streakInfo({ [y4]: { n: 1 }, [t]: { n: 0 } }, today)).toEqual({
      streak: 0,
      activeToday: false,
      daysSinceActive: 4,
    });
  });

  it('suggests weak areas first, then the least-covered subtopics', () => {
    const stats = [
      { id: 'a', total: 50, attempted: 50 },
      { id: 'b', total: 50, attempted: 10 },
      { id: 'c', total: 50, attempted: 0 },
      { id: 'd', total: 50, attempted: 40 },
      { id: 'e', total: 50, attempted: 0 },
    ];
    expect(suggestSubtopics(stats, ['d', 'zzz'])).toEqual([
      { id: 'd', reason: 'weak' },
      { id: 'c', reason: 'coverage' },
      { id: 'e', reason: 'coverage' },
    ]);
    expect(suggestSubtopics(stats, [], 5).map((s) => s.id)).toEqual(['c', 'e', 'b', 'd']);
  });
});
