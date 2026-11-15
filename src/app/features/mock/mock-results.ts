import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CaseStudy, EXAM_CONFIG, Question } from '../../core/models/content.models';
import { MockAttempt } from '../../core/models/progress.models';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { ProgressService } from '../../core/services/progress.service';
import { Response } from '../../core/utils/grade';
import { BarChart, BarDatum } from '../../shared/bar-chart';
import { CodeBlock } from '../../shared/code-block';
import { RichText } from '../../shared/rich-text';
import { QuestionInput } from '../study/questions/question-input';

type ReviewFilter = 'all' | 'wrong' | 'flagged' | 'unanswered';

@Component({
  selector: 'app-mock-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BarChart, CodeBlock, RichText, QuestionInput],
  template: `
    @if (attempt(); as a) {
      <header class="result-head card" [class.passed]="a.passed" [class.failed]="!a.passed">
        <div class="score-block">
          <span class="score">{{ a.score }}</span>
          <span class="score-scale">/ {{ cfg.scaleMax }}</span>
        </div>
        <div class="verdict-block">
          <span class="chip" [class.chip-ok]="a.passed" [class.chip-weak]="!a.passed">
            {{ a.passed ? locale.t('mock.pass') : locale.t('mock.fail') }}
          </span>
          <p class="estimate-note">{{ locale.t('mock.estimateNote').replace('{n}', '' + cfg.passingScore) }}</p>
          <p class="meta">
            {{ locale.t('results.correct') }}: {{ a.totalCorrect }}/{{ a.questionIds.length }}
            · {{ locale.t('mock.time') }}: {{ minutesOf(a.timeUsedSec) }}
            @if (a.autoSubmitted) { · {{ locale.t('results.autoSubmitted') }} }
            @if (a.weakFocused) { · {{ locale.t('mock.focused') }} }
          </p>
        </div>
        <a routerLink="/mock" class="btn">{{ locale.t('results.backToMock') }}</a>
      </header>

      <section class="card">
        <h2>{{ locale.t('results.byDomain') }}</h2>
        <app-bar-chart [data]="domainChart()" [caption]="locale.t('results.byDomain')" />
        <h2 class="mt">{{ locale.t('results.byTopic') }}</h2>
        <table class="breakdown">
          <thead>
            <tr>
              <th scope="col">{{ locale.t('results.section') }}</th>
              <th scope="col">{{ locale.t('results.total') }}</th>
              <th scope="col">{{ locale.t('results.correct') }}</th>
              <th scope="col">{{ locale.t('results.wrong') }}</th>
              <th scope="col">{{ locale.t('results.unanswered') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (s of a.byTopic ?? []; track s.id) {
              <tr>
                <td>{{ s.title }}</td>
                <td>{{ s.total }}</td>
                <td class="ok-text">{{ s.correct }}</td>
                <td class="err-text">{{ s.wrong }}</td>
                <td>{{ s.unanswered }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="card">
        <div class="review-head">
          <h2>{{ locale.t('results.review') }}</h2>
          <div class="review-filters" role="group" [attr.aria-label]="locale.t('filter.title')">
            @for (f of filters; track f) {
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-primary]="filter() === f"
                (click)="filter.set(f)"
              >{{ locale.t('results.filter.' + f) }}</button>
            }
          </div>
        </div>

        @if (!questionsLoaded()) {
          <p>{{ locale.t('common.loading') }}</p>
        } @else {
          @for (q of reviewQuestions(); track q.id; let i = $index) {
            <article class="review-q" [class.wrong]="!isRight(a, q.id)">
              <header class="rq-head">
                <strong>{{ locale.t('q.question') }} {{ indexOf(a, q.id) + 1 }}</strong>
                <span class="chip" [class]="'chip chip-' + q.difficulty">{{ locale.t('diff.' + q.difficulty) }}</span>
                @if (a.answers[q.id]?.flagged) {
                  <span class="chip chip-outline">⚑ {{ locale.t('exam.flagged') }}</span>
                }
                @if (isRight(a, q.id)) {
                  <span class="chip chip-ok">{{ locale.t('q.correct') }}</span>
                } @else if (isUnanswered(a, q.id)) {
                  <span class="chip chip-outline">{{ locale.t('results.unanswered') }}</span>
                } @else {
                  <span class="chip chip-weak">{{ locale.t('q.incorrect') }}</span>
                }
              </header>

              @if (caseOf(q); as cs) {
                <aside class="case-box">
                  <h4>{{ locale.t('q.caseStudy') }}: {{ locale.lt(cs.title) }}</h4>
                  <app-rich-text [text]="cs.scenario" />
                </aside>
              }

              <app-rich-text [text]="q.text" />
              @if (q.code) {
                <app-code-block [code]="q.code" [lang]="q.codeLang ?? 'sql'" />
              }

              <app-question-input
                [q]="q"
                [value]="responseOf(a, q.id)"
                [disabled]="true"
                [showCorrect]="true"
                (valueChange)="(0)"
              />

              <div class="rq-explain">
                <h4>{{ locale.t('q.explanation') }}</h4>
                <app-rich-text [text]="q.explanation" />
                @if (q.example) {
                  <h4>{{ locale.t('q.example') }}</h4>
                  <app-rich-text [text]="q.example" />
                }
                @if (q.exampleCode) {
                  <app-code-block [code]="q.exampleCode" />
                }
              </div>
            </article>
          } @empty {
            <p>{{ locale.t('results.noneInFilter') }}</p>
          }
        }
      </section>
    } @else {
      <p class="card">{{ locale.t('results.notFound') }} <a routerLink="/mock">{{ locale.t('results.backToMock') }}</a></p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .result-head { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; border-width: 2px; }
    .result-head.passed { border-color: var(--ok); }
    .result-head.failed { border-color: var(--err); }
    .score-block { display: flex; align-items: baseline; gap: 4px; }
    .score { font-size: 2.6rem; font-weight: 800; }
    .score-scale { color: var(--text-dim); }
    .verdict-block { flex: 1; min-width: 200px; }
    .estimate-note { color: var(--text-dim); font-size: 0.82rem; margin: 4px 0; }
    .meta { font-size: 0.9rem; margin: 2px 0 0; }
    .mt { margin-top: 20px; }
    .breakdown { width: 100%; border-collapse: collapse; }
    .breakdown th, .breakdown td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
    .ok-text { color: var(--ok); font-weight: 600; }
    .err-text { color: var(--err); font-weight: 600; }
    .review-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .review-filters { display: flex; gap: 6px; flex-wrap: wrap; }
    .review-q { border-top: 1px solid var(--border); padding: 16px 0; }
    .review-q.wrong { background: linear-gradient(to right, var(--err-soft), transparent 12%); }
    .rq-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .case-box {
      border-left: 4px solid var(--accent); background: var(--bg-sunken);
      border-radius: 0 10px 10px 0; padding: 10px 14px; margin: 10px 0;
    }
    .case-box h4 { margin: 0 0 6px; color: var(--accent); font-size: 0.85rem; }
    .rq-explain { margin-top: 12px; border-top: 1px dashed var(--border); padding-top: 8px; }
    .rq-explain h4 { font-size: 0.82rem; text-transform: uppercase; color: var(--text-dim); margin: 10px 0 4px; }
  `,
})
export class MockResults {
  protected readonly locale = inject(LocaleService);
  private readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);

  readonly attemptId = input<string>();

  protected readonly cfg = EXAM_CONFIG;
  protected readonly filters: ReviewFilter[] = ['all', 'wrong', 'flagged', 'unanswered'];
  protected readonly filter = signal<ReviewFilter>('all');

  protected readonly attempt = computed<MockAttempt | null>(() => {
    const id = this.attemptId();
    return this.progress.mockHistory().find((a) => a.id === id) ?? null;
  });

  private readonly questionsById = signal<Map<string, Question>>(new Map());
  private readonly casesById = signal<Map<string, CaseStudy>>(new Map());
  protected readonly questionsLoaded = signal(false);

  constructor() {
    effect(() => {
      const a = this.attempt();
      const manifest = this.content.manifest();
      if (!a || !manifest) return;
      this.questionsLoaded.set(false);
      const subIds = [...new Set(Object.values(a.questionSubtopics))];
      void Promise.all(
        subIds.map((id) => {
          const ref = this.content.refById().get(id);
          return ref ? this.content.getBank(ref.subtopic).catch(() => null) : null;
        }),
      ).then((banks) => {
        const qmap = new Map<string, Question>();
        const cmap = new Map<string, CaseStudy>();
        for (const bank of banks) {
          if (!bank) continue;
          for (const q of bank.questions) qmap.set(q.id, q);
          for (const c of bank.cases ?? []) cmap.set(c.id, c);
        }
        this.questionsById.set(qmap);
        this.casesById.set(cmap);
        this.questionsLoaded.set(true);
      });
    });
  }

  protected readonly domainChart = computed<BarDatum[]>(() => {
    const a = this.attempt();
    if (!a) return [];
    return (a.byDomain ?? []).map((s) => ({
      label: s.title,
      value: s.total > 0 ? s.correct / s.total : 0,
      detail: `${s.correct}/${s.total}`,
      tone: s.total > 0 && s.correct / s.total >= 0.7 ? 'ok' : 'err',
    }));
  });

  protected readonly reviewQuestions = computed<Question[]>(() => {
    const a = this.attempt();
    if (!a) return [];
    const qmap = this.questionsById();
    const f = this.filter();
    return a.questionIds
      .map((id) => qmap.get(id))
      .filter((q): q is Question => !!q)
      .filter((q) => {
        const ans = a.answers[q.id];
        switch (f) {
          case 'wrong':
            return !ans?.correct && !this.isUnanswered(a, q.id);
          case 'flagged':
            return ans?.flagged ?? false;
          case 'unanswered':
            return this.isUnanswered(a, q.id);
          default:
            return true;
        }
      });
  });

  protected caseOf(q: Question): CaseStudy | null {
    return q.caseId ? (this.casesById().get(q.caseId) ?? null) : null;
  }

  protected responseOf(a: MockAttempt, qid: string): Response {
    const ans = a.answers[qid];
    return { answer: ans?.answer, answerMap: ans?.answerMap };
  }

  protected isRight(a: MockAttempt, qid: string): boolean {
    return a.answers[qid]?.correct ?? false;
  }

  protected isUnanswered(a: MockAttempt, qid: string): boolean {
    const ans = a.answers[qid];
    return !ans || (!ans.answer?.length && !Object.keys(ans.answerMap ?? {}).length);
  }

  protected indexOf(a: MockAttempt, qid: string): number {
    return a.questionIds.indexOf(qid);
  }

  protected minutesOf(sec: number | undefined): string {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    return `${m} min ${sec % 60} s`;
  }
}
