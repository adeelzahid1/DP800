/**
 * Leitner-style spaced repetition.
 *
 * Each attempted question sits in a box (1–5). Box n is reviewed again
 * SRS_INTERVAL_DAYS[n] days after the last attempt. A confident correct answer
 * moves the question up one box; a guessed correct answer keeps it where it is;
 * a wrong answer sends it back to box 1 (review tomorrow).
 */

export const SRS_MAX_BOX = 5;

/** Days until the next review, indexed by box. Index 0 is unused. */
export const SRS_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;

/** The scheduling state stored per question. */
export interface SrsState {
  box?: number;
  /** Local calendar day (see dayNumber) when the question is next due. */
  dueDay?: number;
  /** Timestamp (ms) of the last attempt. */
  lastAt?: number;
  lastCorrect?: boolean;
  /** The last attempt was answered as a guess. */
  guessed?: boolean;
  attempts?: number;
}

const MS_PER_DAY = 86_400_000;

/** Days since the Unix epoch in the user's local time zone. */
export function dayNumber(timestamp: number): number {
  const offsetMs = new Date(timestamp).getTimezoneOffset() * 60_000;
  return Math.floor((timestamp - offsetMs) / MS_PER_DAY);
}

/** Local midnight (ms) of a day number — the inverse of dayNumber. */
export function dayStart(day: number): number {
  const approx = day * MS_PER_DAY;
  const offsetMs = new Date(approx).getTimezoneOffset() * 60_000;
  return approx + offsetMs;
}

/** New scheduling fields after an attempt. */
export function scheduleNext(
  prev: SrsState | undefined,
  correct: boolean,
  guessed: boolean,
  now: number,
): Required<Pick<SrsState, 'box' | 'dueDay' | 'lastAt' | 'guessed'>> {
  const today = dayNumber(now);
  const prevBox = prev?.box;
  const failedEarlierToday =
    prev?.lastCorrect === false && prev.lastAt !== undefined && dayNumber(prev.lastAt) === today;

  let box: number;
  if (!correct || failedEarlierToday) {
    // Wrong answers, and same-day retries of a wrong answer, restart the ladder.
    box = 1;
  } else if (guessed) {
    box = Math.max(1, prevBox ?? 1);
  } else {
    box = Math.min(SRS_MAX_BOX, (prevBox ?? 1) + 1);
  }

  return { box, dueDay: today + SRS_INTERVAL_DAYS[box], lastAt: now, guessed };
}

/**
 * When a question is due, or undefined if it isn't scheduled.
 * Progress saved before spaced repetition existed has no dueDay: wrong answers
 * from that time count as due today; correct ones stay unscheduled.
 */
export function effectiveDueDay(p: SrsState | undefined, today: number): number | undefined {
  if (!p) return undefined;
  if (p.dueDay !== undefined) return p.dueDay;
  if ((p.attempts ?? 0) > 0 && p.lastCorrect === false) return today;
  return undefined;
}

export function isDue(p: SrsState | undefined, today: number): boolean {
  const due = effectiveDueDay(p, today);
  return due !== undefined && due <= today;
}
