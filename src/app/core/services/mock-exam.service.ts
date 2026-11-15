import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CaseStudy,
  DomainMeta,
  EXAM_CONFIG,
  Question,
  WEAK_AREA_CONFIG,
} from '../models/content.models';
import { MockAnswer, MockAttempt, MockSectionStat } from '../models/progress.models';
import { isAnswered, isCorrect } from '../utils/grade';
import { createRng, sample, shuffled } from '../utils/rng';
import { ContentService } from './content.service';
import { ProgressService } from './progress.service';

export interface WeakArea {
  subtopicId: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

interface ActiveExam {
  attempt: MockAttempt;
  questions: Question[];
  cases: Record<string, CaseStudy>;
}

@Injectable({ providedIn: 'root' })
export class MockExamService {
  private readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);

  readonly active = signal<ActiveExam | null>(null);
  readonly currentIndex = signal(0);
  /** Ticks every second while an exam runs. */
  private readonly now = signal(Date.now());
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  readonly remainingSec = computed(() => {
    const ex = this.active();
    if (!ex) return 0;
    const end = ex.attempt.startedAt + ex.attempt.durationMinutes * 60_000;
    return Math.max(0, Math.floor((end - this.now()) / 1000));
  });

  readonly timeUp = computed(() => this.active() !== null && this.remainingSec() <= 0);

  // ----- weak areas --------------------------------------------------------

  /** Accuracy per subtopic across practice AND mock history. */
  readonly combinedAccuracy = computed<Record<string, { attempts: number; correct: number }>>(
    () => {
      const acc: Record<string, { attempts: number; correct: number }> = {};
      const practice = this.progress.practiceAccuracy();
      for (const id of Object.keys(practice)) {
        acc[id] = { ...practice[id] };
      }
      for (const attempt of this.progress.mockHistory()) {
        if (!attempt.submitted) continue;
        for (const qid of attempt.questionIds) {
          const sub = attempt.questionSubtopics[qid];
          if (!sub) continue;
          const ans = attempt.answers[qid];
          const a = (acc[sub] ??= { attempts: 0, correct: 0 });
          a.attempts++;
          if (ans?.correct) a.correct++;
        }
      }
      return acc;
    },
  );

  readonly weakAreas = computed<WeakArea[]>(() => {
    const acc = this.combinedAccuracy();
    const out: WeakArea[] = [];
    for (const id of Object.keys(acc)) {
      const { attempts, correct } = acc[id];
      if (attempts < WEAK_AREA_CONFIG.minAttempts) continue;
      const accuracy = correct / attempts;
      if (accuracy < WEAK_AREA_CONFIG.accuracyThreshold) {
        out.push({ subtopicId: id, attempts, correct, accuracy });
      }
    }
    return out.sort((a, b) => a.accuracy - b.accuracy);
  });

  readonly weakSet = computed(() => new Set(this.weakAreas().map((w) => w.subtopicId)));

  // ----- building an exam --------------------------------------------------

  /**
   * Build a mock exam: question counts per domain proportional to the
   * official weightings; within a domain, subtopics weighted by bank size,
   * ×boostFactor for weak subtopics when `weakFocus` is on.
   */
  async buildExam(questionCount: number, weakFocus: boolean): Promise<void> {
    const manifest = this.content.manifest();
    if (!manifest) throw new Error('Content not loaded yet');
    const rng = createRng(Date.now() % 2 ** 31);

    const domains = manifest.domains.filter((d) => !d.lessonOnly && d.examWeight > 0);
    const totalWeight = domains.reduce((s, d) => s + d.examWeight, 0);

    // Largest-remainder allocation of questionCount across domains.
    const exact = domains.map((d) => (questionCount * d.examWeight) / totalWeight);
    const counts = exact.map(Math.floor);
    let rest = questionCount - counts.reduce((a, b) => a + b, 0);
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < rest; k++) counts[order[k % order.length].i]++;

    const weak = this.weakSet();
    const boosted: string[] = [];
    const picked: { subtopicId: string; count: number }[] = [];

    domains.forEach((domain, di) => {
      const subs = domain.topics.flatMap((t) => t.subtopics).filter((s) => s.questionCount > 0);
      const weights = subs.map((s) => {
        let w = s.questionCount;
        if (weakFocus && weak.has(s.id)) {
          w *= WEAK_AREA_CONFIG.boostFactor;
          boosted.push(s.id);
        }
        return w;
      });
      // Weighted sampling without replacement at subtopic level, one slot at a time.
      const remaining = subs.map((s, i) => ({ id: s.id, cap: s.questionCount, w: weights[i], n: 0 }));
      for (let k = 0; k < counts[di]; k++) {
        const pool = remaining.filter((r) => r.n < r.cap);
        if (pool.length === 0) break;
        const total = pool.reduce((s, r) => s + r.w, 0);
        let roll = rng() * total;
        let chosen = pool[pool.length - 1];
        for (const r of pool) {
          roll -= r.w;
          if (roll <= 0) {
            chosen = r;
            break;
          }
        }
        chosen.n++;
      }
      for (const r of remaining) if (r.n > 0) picked.push({ subtopicId: r.id, count: r.n });
    });

    // Load the needed banks and sample questions.
    const questions: Question[] = [];
    const cases: Record<string, CaseStudy> = {};
    for (const { subtopicId, count } of picked) {
      const ref = this.content.refById().get(subtopicId);
      if (!ref) continue;
      const bank = await this.content.getBank(ref.subtopic);
      const qs = sample(bank.questions, count, rng);
      for (const q of qs) {
        questions.push(q);
        if (q.caseId) {
          const cs = bank.cases?.find((c) => c.id === q.caseId);
          if (cs) cases[cs.id] = cs;
        }
      }
    }

    // Shuffle, but keep case-study questions adjacent (grouped by caseId).
    const groups = new Map<string, Question[]>();
    const singles: Question[] = [];
    for (const q of questions) {
      if (q.caseId) {
        const g = groups.get(q.caseId) ?? [];
        g.push(q);
        groups.set(q.caseId, g);
      } else {
        singles.push(q);
      }
    }
    const units: Question[][] = [...singles.map((q) => [q]), ...groups.values()];
    const ordered = shuffled(units, rng).flat();

    const attempt: MockAttempt = {
      id: `mock-${Date.now().toString(36)}`,
      startedAt: Date.now(),
      durationMinutes: EXAM_CONFIG.durationMinutes,
      questionIds: ordered.map((q) => q.id),
      questionSubtopics: Object.fromEntries(ordered.map((q) => [q.id, q.subtopic])),
      answers: {},
      weakFocused: weakFocus,
      boostedSubtopics: boosted,
    };

    this.active.set({ attempt, questions: ordered, cases });
    this.currentIndex.set(0);
    this.progress.setActiveMock(attempt);
    this.startTimer();
  }

  /** Resume an unfinished attempt found in localStorage. Returns success. */
  async resume(): Promise<boolean> {
    const saved = this.progress.getActiveMock();
    if (!saved || saved.submitted) return false;
    const end = saved.startedAt + saved.durationMinutes * 60_000;
    const questions: Question[] = [];
    const cases: Record<string, CaseStudy> = {};
    const bySub = new Map<string, string[]>();
    for (const qid of saved.questionIds) {
      const sub = saved.questionSubtopics[qid];
      const list = bySub.get(sub) ?? [];
      list.push(qid);
      bySub.set(sub, list);
    }
    const byId = new Map<string, Question>();
    for (const [subId] of bySub) {
      const ref = this.content.refById().get(subId);
      if (!ref) continue;
      const bank = await this.content.getBank(ref.subtopic);
      for (const q of bank.questions) byId.set(q.id, q);
      for (const c of bank.cases ?? []) cases[c.id] = c;
    }
    for (const qid of saved.questionIds) {
      const q = byId.get(qid);
      if (q) questions.push(q);
    }
    if (questions.length !== saved.questionIds.length) return false;
    this.active.set({ attempt: saved, questions, cases });
    this.currentIndex.set(0);
    if (Date.now() >= end) {
      this.submit(true);
    } else {
      this.startTimer();
    }
    return true;
  }

  hasResumable(): boolean {
    const saved = this.progress.getActiveMock();
    return !!saved && !saved.submitted;
  }

  // ----- answering ---------------------------------------------------------

  setAnswer(questionId: string, patch: Partial<MockAnswer>): void {
    const ex = this.active();
    if (!ex || ex.attempt.submitted) return;
    const prev = ex.attempt.answers[questionId] ?? { questionId };
    const attempt: MockAttempt = {
      ...ex.attempt,
      answers: { ...ex.attempt.answers, [questionId]: { ...prev, ...patch } },
    };
    this.active.set({ ...ex, attempt });
    this.progress.setActiveMock(attempt);
  }

  toggleFlag(questionId: string): void {
    const ex = this.active();
    if (!ex) return;
    const cur = ex.attempt.answers[questionId]?.flagged ?? false;
    this.setAnswer(questionId, { flagged: !cur });
  }

  answeredCount(): number {
    const ex = this.active();
    if (!ex) return 0;
    return ex.questions.filter((q) => isAnswered(q, ex.attempt.answers[q.id])).length;
  }

  // ----- submit & score ----------------------------------------------------

  submit(auto = false): MockAttempt | null {
    const ex = this.active();
    if (!ex || ex.attempt.submitted) return ex?.attempt ?? null;
    const manifest = this.content.manifest();
    const refById = this.content.refById();

    const answers: Record<string, MockAnswer> = {};
    let totalCorrect = 0;
    const domStats = new Map<string, MockSectionStat>();
    const topStats = new Map<string, MockSectionStat>();
    const subStats = new Map<string, MockSectionStat>();

    const stat = (map: Map<string, MockSectionStat>, id: string, title: string) => {
      let s = map.get(id);
      if (!s) {
        s = { id, title, total: 0, correct: 0, wrong: 0, unanswered: 0 };
        map.set(id, s);
      }
      return s;
    };

    for (const q of ex.questions) {
      const r = ex.attempt.answers[q.id] ?? { questionId: q.id };
      const answered = isAnswered(q, r);
      const correct = answered && isCorrect(q, r);
      answers[q.id] = { ...r, correct };
      if (correct) totalCorrect++;

      const ref = refById.get(q.subtopic);
      const dTitle = ref?.domain.title.en ?? q.domain;
      const tTitle = ref?.topic.title.en ?? q.topic;
      const sTitle = ref?.subtopic.title.en ?? q.subtopic;
      for (const s of [
        stat(domStats, q.domain, dTitle),
        stat(topStats, q.topic, tTitle),
        stat(subStats, q.subtopic, sTitle),
      ]) {
        s.total++;
        if (!answered) s.unanswered++;
        else if (correct) s.correct++;
        else s.wrong++;
      }
    }

    const ratio = ex.questions.length > 0 ? totalCorrect / ex.questions.length : 0;
    const score = Math.round(
      EXAM_CONFIG.scaleMin + (EXAM_CONFIG.scaleMax - EXAM_CONFIG.scaleMin) * ratio,
    );
    const domainOrder = (manifest?.domains ?? []).map((d: DomainMeta) => d.id);
    const sortByDomain = (a: MockSectionStat, b: MockSectionStat) =>
      domainOrder.indexOf(a.id) - domainOrder.indexOf(b.id);

    const attempt: MockAttempt = {
      ...ex.attempt,
      answers,
      submitted: true,
      autoSubmitted: auto,
      finishedAt: Date.now(),
      timeUsedSec: Math.min(
        ex.attempt.durationMinutes * 60,
        Math.round((Date.now() - ex.attempt.startedAt) / 1000),
      ),
      totalCorrect,
      score,
      passed: score >= EXAM_CONFIG.passingScore,
      byDomain: [...domStats.values()].sort(sortByDomain),
      byTopic: [...topStats.values()],
      bySubtopic: [...subStats.values()],
    };

    this.active.set({ ...ex, attempt });
    this.progress.saveMockAttempt(attempt);
    this.progress.setActiveMock(null);
    this.stopTimer();
    return attempt;
  }

  abandon(): void {
    this.active.set(null);
    this.progress.setActiveMock(null);
    this.stopTimer();
  }

  // ----- timer -------------------------------------------------------------

  private startTimer(): void {
    this.stopTimer();
    this.now.set(Date.now());
    this.timerHandle = setInterval(() => this.now.set(Date.now()), 1000);
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
