import {
  SRS_INTERVAL_DAYS,
  SRS_MAX_BOX,
  dayNumber,
  dayStart,
  effectiveDueDay,
  isDue,
  scheduleNext,
} from './srs';

describe('srs', () => {
  const morning = new Date(2026, 10, 17, 9, 0).getTime();
  const evening = new Date(2026, 10, 17, 22, 30).getTime();
  const nextMorning = new Date(2026, 10, 18, 8, 0).getTime();
  const today = dayNumber(morning);

  it('uses local calendar days', () => {
    expect(dayNumber(evening)).toBe(today);
    expect(dayNumber(nextMorning)).toBe(today + 1);
    expect(dayNumber(dayStart(today))).toBe(today);
    expect(dayNumber(dayStart(today) - 1)).toBe(today - 1);
  });

  it('puts a first confident correct answer in box 2', () => {
    const next = scheduleNext(undefined, true, false, morning);
    expect(next.box).toBe(2);
    expect(next.dueDay).toBe(today + SRS_INTERVAL_DAYS[2]);
    expect(next.lastAt).toBe(morning);
    expect(next.guessed).toBeFalse();
  });

  it('sends a wrong answer to box 1, due tomorrow', () => {
    const next = scheduleNext({ box: 4, lastCorrect: true }, false, false, morning);
    expect(next.box).toBe(1);
    expect(next.dueDay).toBe(today + 1);
  });

  it('does not promote a correct guess', () => {
    expect(scheduleNext({ box: 3, lastCorrect: true }, true, true, morning).box).toBe(3);
    expect(scheduleNext(undefined, true, true, morning).box).toBe(1);
  });

  it('caps at the top box', () => {
    const next = scheduleNext({ box: SRS_MAX_BOX, lastCorrect: true }, true, false, morning);
    expect(next.box).toBe(SRS_MAX_BOX);
    expect(next.dueDay).toBe(today + 30);
  });

  it('keeps a same-day retry after a wrong answer in box 1', () => {
    const wrong = scheduleNext({ box: 3, lastCorrect: true }, false, false, morning);
    const retry = scheduleNext({ ...wrong, lastCorrect: false }, true, false, evening);
    expect(retry.box).toBe(1);
    expect(retry.dueDay).toBe(today + 1);
  });

  it('promotes a correct answer the day after a wrong one', () => {
    const wrong = scheduleNext(undefined, false, false, morning);
    const next = scheduleNext({ ...wrong, lastCorrect: false }, true, false, nextMorning);
    expect(next.box).toBe(2);
  });

  it('treats legacy wrong answers as due and legacy correct ones as unscheduled', () => {
    expect(effectiveDueDay({ attempts: 2, lastCorrect: false }, today)).toBe(today);
    expect(effectiveDueDay({ attempts: 2, lastCorrect: true }, today)).toBeUndefined();
    expect(effectiveDueDay({}, today)).toBeUndefined();
    expect(effectiveDueDay(undefined, today)).toBeUndefined();
  });

  it('reports due on or after the due day only', () => {
    expect(isDue({ dueDay: today }, today)).toBeTrue();
    expect(isDue({ dueDay: today - 3 }, today)).toBeTrue();
    expect(isDue({ dueDay: today + 1 }, today)).toBeFalse();
  });
});
