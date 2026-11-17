import { Injectable, computed, effect, signal } from '@angular/core';
import {
  ActivityMap,
  CardMap,
  DEFAULT_SETTINGS,
  MockAttempt,
  PortalSettings,
  ProgressMap,
  QuestionProgress,
} from '../models/progress.models';
import { dayNumber, effectiveDueDay, scheduleNext } from '../utils/srs';

/** Export format version; files from version 1 (before spaced repetition) still import. */
const EXPORT_VERSION = 2;

const KEY_PROGRESS = 'dp800.progress.v1';
const KEY_SETTINGS = 'dp800.settings.v1';
const KEY_MOCKS = 'dp800.mocks.v1';
const KEY_ACTIVE_MOCK = 'dp800.mock.active.v1';
const KEY_CARDS = 'dp800.cards.v1';
const KEY_ACTIVITY = 'dp800.activity.v1';

/**
 * Activity saved before the log existed: one entry per day that still shows up
 * as some question's or card's last attempt. Older days are unknown.
 */
function seedActivity(progress: ProgressMap, cards: CardMap): ActivityMap {
  const out: ActivityMap = {};
  for (const p of [...Object.values(progress), ...Object.values(cards)]) {
    if (p.lastAt === undefined) continue;
    const day = String(dayNumber(p.lastAt));
    out[day] = { n: (out[day]?.n ?? 0) + 1 };
  }
  return out;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } as T : fallback;
  } catch {
    return fallback;
  }
}

function readJsonRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode / quota) — keep working in memory
  }
}

/** A question that is due for spaced-repetition review. */
export interface DueItem {
  id: string;
  subtopic: string;
  dueDay: number;
}

/** Aggregate stats for a set of questions (a subtopic, topic or domain). */
export interface AggStats {
  total: number;
  read: number;
  attempted: number;
  correct: number;
  /** Sum of attempts / correct attempts across all questions, for accuracy. */
  attemptSum: number;
  correctSum: number;
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  readonly progress = signal<ProgressMap>(readJsonRaw<ProgressMap>(KEY_PROGRESS, {}));
  readonly settings = signal<PortalSettings>(readJson(KEY_SETTINGS, DEFAULT_SETTINGS));
  readonly mockHistory = signal<MockAttempt[]>(readJsonRaw<MockAttempt[]>(KEY_MOCKS, []));
  /** Flashcard review state, kept apart so cards don't affect question stats. */
  readonly cards = signal<CardMap>(readJsonRaw<CardMap>(KEY_CARDS, {}));
  /** Per-day activity, for streaks and the daily plan. */
  readonly activity = signal<ActivityMap>(
    readJsonRaw<ActivityMap | null>(KEY_ACTIVITY, null) ?? seedActivity(this.progress(), this.cards()),
  );

  constructor() {
    effect(() => writeJson(KEY_ACTIVITY, this.activity()));
    effect(() => writeJson(KEY_CARDS, this.cards()));
    effect(() => writeJson(KEY_PROGRESS, this.progress()));
    effect(() => writeJson(KEY_SETTINGS, this.settings()));
    effect(() => writeJson(KEY_MOCKS, this.mockHistory()));
  }

  // ----- settings ---------------------------------------------------------

  updateSettings(patch: Partial<PortalSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  // ----- per-question progress -------------------------------------------

  q(id: string): QuestionProgress | undefined {
    return this.progress()[id];
  }

  private patch(id: string, subtopic: string, patch: Partial<QuestionProgress>): void {
    this.progress.update((map) => ({
      ...map,
      [id]: { ...map[id], s: subtopic, ...patch },
    }));
  }

  markRead(id: string, subtopic: string, read: boolean): void {
    this.patch(id, subtopic, { read });
  }

  toggleBookmark(id: string, subtopic: string): void {
    const cur = this.progress()[id]?.bookmarked ?? false;
    this.patch(id, subtopic, { bookmarked: !cur });
  }

  /** Maximum length of a question note. */
  static readonly NOTE_MAX = 2000;

  /** Save (or, when blank, remove) the learner's note on a question. */
  setNote(id: string, subtopic: string, note: string): void {
    const text = note.trim().slice(0, ProgressService.NOTE_MAX);
    if (text) {
      this.patch(id, subtopic, { note: text });
      return;
    }
    this.progress.update((map) => {
      if (!map[id]?.note) return map;
      const { note: _removed, ...rest } = map[id];
      return { ...map, [id]: rest };
    });
  }

  recordAttempt(
    id: string,
    subtopic: string,
    correct: boolean,
    guessed = false,
    now: number = Date.now(),
  ): void {
    const cur = this.progress()[id];
    this.logActivity(now, (cur?.attempts ?? 0) === 0 ? 'new' : 'repeat');
    this.patch(id, subtopic, {
      attempts: (cur?.attempts ?? 0) + 1,
      correct: (cur?.correct ?? 0) + (correct ? 1 : 0),
      lastCorrect: correct,
      ...scheduleNext(cur, correct, guessed, now),
    });
  }

  private logActivity(now: number, kind: 'new' | 'repeat' | 'card'): void {
    const day = String(dayNumber(now));
    this.activity.update((map) => {
      const cur = map[day] ?? { n: 0 };
      const next =
        kind === 'card'
          ? { ...cur, c: (cur.c ?? 0) + 1 }
          : { ...cur, n: cur.n + 1, ...(kind === 'new' ? { q: (cur.q ?? 0) + 1 } : {}) };
      return { ...map, [day]: next };
    });
  }

  // ----- spaced repetition -------------------------------------------------

  /** Questions due for review on `today` (a local day number), oldest first. */
  dueItems(today: number = dayNumber(Date.now())): DueItem[] {
    const items: DueItem[] = [];
    const map = this.progress();
    for (const id of Object.keys(map)) {
      const p = map[id];
      if (!p.s) continue;
      const due = effectiveDueDay(p, today);
      if (due !== undefined && due <= today) items.push({ id, subtopic: p.s, dueDay: due });
    }
    return items.sort((a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id));
  }

  /** How many scheduled questions fall due on each of the next `days` days (index 0 = tomorrow). */
  upcoming(days: number, today: number = dayNumber(Date.now())): number[] {
    const counts = new Array<number>(days).fill(0);
    const map = this.progress();
    for (const id of Object.keys(map)) {
      const due = effectiveDueDay(map[id], today);
      if (due === undefined) continue;
      const offset = due - today - 1;
      if (offset >= 0 && offset < days) counts[offset]++;
    }
    return counts;
  }

  /** Count of questions in each box 1–5 (index 0 = box 1). */
  readonly boxCounts = computed(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const p of Object.values(this.progress())) {
      if (p.box && p.box >= 1 && p.box <= 5) counts[p.box - 1]++;
    }
    return counts;
  });

  /** Clears read/attempt/bookmark/review state; the learner's own note is kept. */
  resetQuestion(id: string): void {
    this.resetQuestions([id]);
  }

  resetQuestions(ids: readonly string[]): void {
    this.progress.update((map) => {
      const next = { ...map };
      for (const id of ids) {
        const p = next[id];
        if (!p) continue;
        if (p.note) next[id] = { s: p.s, note: p.note };
        else delete next[id];
      }
      return next;
    });
  }

  // ----- flashcards --------------------------------------------------------

  /** Record a flashcard review: "knew it" promotes the card, "didn't know" resets it to box 1. */
  recordCard(id: string, subtopic: string, knew: boolean, now: number = Date.now()): void {
    this.logActivity(now, 'card');
    this.cards.update((map) => {
      const cur = map[id];
      const { box, dueDay } = scheduleNext(cur, knew, false, now);
      return {
        ...map,
        [id]: { s: subtopic, attempts: (cur?.attempts ?? 0) + 1, lastCorrect: knew, box, dueDay, lastAt: now },
      };
    });
  }

  /** Number of seen flashcards due on `today`. */
  cardDueCount(today: number = dayNumber(Date.now())): number {
    let n = 0;
    for (const c of Object.values(this.cards())) {
      if (c.dueDay !== undefined && c.dueDay <= today) n++;
    }
    return n;
  }

  // ----- aggregates --------------------------------------------------------

  /** Stats for one subtopic. `total` comes from the manifest question count. */
  statsForSubtopic(subtopicId: string, total: number): AggStats {
    const agg: AggStats = { total, read: 0, attempted: 0, correct: 0, attemptSum: 0, correctSum: 0 };
    const map = this.progress();
    for (const id of Object.keys(map)) {
      const p = map[id];
      if (p.s !== subtopicId) continue;
      if (p.read) agg.read++;
      if ((p.attempts ?? 0) > 0) agg.attempted++;
      if (p.lastCorrect) agg.correct++;
      agg.attemptSum += p.attempts ?? 0;
      agg.correctSum += p.correct ?? 0;
    }
    return agg;
  }

  /** Practice accuracy per subtopic: subtopicId -> {attempts, correct}. */
  readonly practiceAccuracy = computed(() => {
    const acc: Record<string, { attempts: number; correct: number }> = {};
    const map = this.progress();
    for (const id of Object.keys(map)) {
      const p = map[id];
      if (!p.s || !(p.attempts ?? 0)) continue;
      const a = (acc[p.s] ??= { attempts: 0, correct: 0 });
      a.attempts += p.attempts ?? 0;
      a.correct += p.correct ?? 0;
    }
    return acc;
  });

  // ----- mock history ------------------------------------------------------

  saveMockAttempt(attempt: MockAttempt): void {
    this.mockHistory.update((h) => {
      const i = h.findIndex((a) => a.id === attempt.id);
      if (i >= 0) {
        const next = h.slice();
        next[i] = attempt;
        return next;
      }
      return [...h, attempt];
    });
  }

  getActiveMock(): MockAttempt | null {
    return readJsonRaw<MockAttempt | null>(KEY_ACTIVE_MOCK, null);
  }

  setActiveMock(attempt: MockAttempt | null): void {
    if (attempt === null) {
      try {
        localStorage.removeItem(KEY_ACTIVE_MOCK);
      } catch {
        /* ignore */
      }
    } else {
      writeJson(KEY_ACTIVE_MOCK, attempt);
    }
  }

  // ----- export / import ---------------------------------------------------

  exportAll(): string {
    return JSON.stringify(
      {
        format: 'dp800-progress',
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        progress: this.progress(),
        settings: this.settings(),
        mockHistory: this.mockHistory(),
        cards: this.cards(),
        activity: this.activity(),
      },
      null,
      2,
    );
  }

  /** Returns an error message, or null on success. */
  importAll(json: string): string | null {
    try {
      const data = JSON.parse(json) as {
        format?: string;
        version?: number;
        progress?: ProgressMap;
        settings?: PortalSettings;
        mockHistory?: MockAttempt[];
        cards?: CardMap;
        activity?: ActivityMap;
      };
      if (data.format !== 'dp800-progress') return 'Not a DP-800 progress export file.';
      if ((data.version ?? 1) > EXPORT_VERSION) {
        return 'This file was exported by a newer version of the portal. Update the portal and try again.';
      }
      if (data.progress) this.progress.set(data.progress);
      if (data.settings) this.settings.set({ ...DEFAULT_SETTINGS, ...data.settings });
      if (data.mockHistory) this.mockHistory.set(data.mockHistory);
      if (data.cards) this.cards.set(data.cards);
      if (data.activity) this.activity.set(data.activity);
      return null;
    } catch {
      return 'The file is not valid JSON.';
    }
  }
}
