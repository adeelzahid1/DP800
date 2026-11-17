import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dayNumber } from '../utils/srs';
import { ProgressService } from './progress.service';

const KEYS = ['dp800.progress.v1', 'dp800.settings.v1', 'dp800.mocks.v1'];

describe('ProgressService spaced repetition', () => {
  let svc: ProgressService;
  const now = new Date(2026, 10, 17, 10, 0).getTime();
  const today = dayNumber(now);

  beforeEach(() => {
    KEYS.forEach((k) => localStorage.removeItem(k));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    svc = TestBed.inject(ProgressService);
  });

  afterEach(() => KEYS.forEach((k) => localStorage.removeItem(k)));

  it('schedules attempts and lists due items', () => {
    svc.recordAttempt('q-wrong', 'sub-a', false, false, now);
    svc.recordAttempt('q-sure', 'sub-a', true, false, now);
    svc.recordAttempt('q-guess', 'sub-b', true, true, now);

    expect(svc.q('q-wrong')).toEqual(jasmine.objectContaining({ box: 1, dueDay: today + 1, attempts: 1 }));
    expect(svc.q('q-sure')).toEqual(jasmine.objectContaining({ box: 2, dueDay: today + 3 }));
    expect(svc.q('q-guess')).toEqual(jasmine.objectContaining({ box: 1, guessed: true }));

    expect(svc.dueItems(today)).toEqual([]);
    expect(svc.dueItems(today + 1).map((d) => d.id)).toEqual(['q-guess', 'q-wrong']);
    expect(svc.dueItems(today + 3).length).toBe(3);
    expect(svc.upcoming(7, today)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(svc.boxCounts()).toEqual([2, 1, 0, 0, 0]);
  });

  it('counts legacy wrong answers (no dueDay) as due today', () => {
    svc.progress.set({ old: { s: 'sub-a', attempts: 1, correct: 0, lastCorrect: false } });
    expect(svc.dueItems(today).map((d) => d.id)).toEqual(['old']);
  });

  it('exports version 2 and imports versions 1 and 2', () => {
    svc.recordAttempt('q1', 'sub-a', true, false, now);
    const exported = JSON.parse(svc.exportAll()) as { version: number };
    expect(exported.version).toBe(2);

    const v1 = JSON.stringify({
      format: 'dp800-progress',
      version: 1,
      progress: { legacy: { s: 'sub-a', attempts: 1, correct: 1, lastCorrect: true } },
    });
    expect(svc.importAll(v1)).toBeNull();
    expect(svc.q('legacy')?.attempts).toBe(1);
    expect(svc.q('q1')).toBeUndefined();

    expect(svc.importAll(JSON.stringify(exported))).toBeNull();
    expect(svc.q('q1')?.box).toBe(2);
  });

  it('rejects files from a newer version', () => {
    const v3 = JSON.stringify({ format: 'dp800-progress', version: 3, progress: {} });
    expect(svc.importAll(v3)).toContain('newer version');
  });
});
