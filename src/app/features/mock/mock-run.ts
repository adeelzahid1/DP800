import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Question } from '../../core/models/content.models';
import { LocaleService } from '../../core/services/locale.service';
import { MockExamService } from '../../core/services/mock-exam.service';
import { Response, isAnswered } from '../../core/utils/grade';
import { CodeBlock } from '../../shared/code-block';
import { RichText } from '../../shared/rich-text';
import { QuestionInput } from '../study/questions/question-input';

@Component({
  selector: 'app-mock-run',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeBlock, RichText, QuestionInput],
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    @if (mock.active(); as ex) {
      <div class="exam-bar" role="banner">
        <span class="timer" [class.low]="mock.remainingSec() < 300" role="timer" aria-live="off">
          ⏱ {{ timeLabel() }}
        </span>
        <span class="answered">{{ locale.t('exam.answered') }}: {{ mock.answeredCount() }}/{{ ex.questions.length }}</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" (click)="navOpen.set(!navOpen())" [attr.aria-expanded]="navOpen()">
          {{ locale.t('exam.navigator') }}
        </button>
        <button type="button" class="btn btn-sm btn-primary" (click)="reviewOpen.set(true)">
          {{ locale.t('exam.finish') }}
        </button>
      </div>

      @if (navOpen()) {
        <nav class="qgrid card" [attr.aria-label]="locale.t('exam.navigator')">
          @for (q of ex.questions; track q.id; let i = $index) {
            <button
              type="button"
              class="qcell"
              [class.current]="i === mock.currentIndex()"
              [class.answered]="isQAnswered(q)"
              [class.flagged]="isFlagged(q.id)"
              (click)="go(i); navOpen.set(false)"
              [attr.aria-label]="locale.t('q.question') + ' ' + (i + 1) + (isQAnswered(q) ? ' ✓' : '') + (isFlagged(q.id) ? ' ⚑' : '')"
              [attr.aria-current]="i === mock.currentIndex() ? 'true' : null"
            >{{ i + 1 }}</button>
          }
        </nav>
      }

      @if (current(); as q) {
        <section class="exam-q card" aria-live="polite">
          <header class="q-head">
            <h2>{{ locale.t('q.question') }} {{ mock.currentIndex() + 1 }} / {{ ex.questions.length }}</h2>
            <button
              type="button"
              class="btn btn-sm flag-btn"
              [class.on]="isFlagged(q.id)"
              [attr.aria-pressed]="isFlagged(q.id)"
              (click)="mock.toggleFlag(q.id)"
            >⚑ {{ isFlagged(q.id) ? locale.t('exam.flagged') : locale.t('exam.flag') }}</button>
          </header>

          @if (caseOf(q); as cs) {
            <aside class="case-box">
              <h3>{{ locale.t('q.caseStudy') }}: {{ locale.lt(cs.title) }}</h3>
              <app-rich-text [text]="cs.scenario" />
              @if (cs.code) {
                <app-code-block [code]="cs.code" />
              }
            </aside>
          }

          <app-rich-text [text]="q.text" />
          @if (q.code) {
            <app-code-block [code]="q.code" [lang]="q.codeLang ?? 'sql'" />
          }

          <app-question-input
            [q]="q"
            [value]="responseOf(q.id)"
            [disabled]="false"
            [showCorrect]="false"
            (valueChange)="setResponse(q.id, $event)"
          />

          <footer class="exam-nav">
            <button type="button" class="btn" [disabled]="mock.currentIndex() === 0" (click)="go(mock.currentIndex() - 1)">
              ← {{ locale.t('nav.prev') }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="mock.currentIndex() >= ex.questions.length - 1"
              (click)="go(mock.currentIndex() + 1)"
            >{{ locale.t('nav.next') }} →</button>
          </footer>
        </section>
      }

      <!-- Review screen -->
      @if (reviewOpen()) {
        <div class="dialog-backdrop">
          <div class="dialog card" role="dialog" aria-modal="true" [attr.aria-label]="locale.t('exam.reviewTitle')">
            <h2>{{ locale.t('exam.reviewTitle') }}</h2>
            <p>
              {{ locale.t('exam.reviewSummary')
                  .replace('{answered}', '' + mock.answeredCount())
                  .replace('{total}', '' + ex.questions.length)
                  .replace('{flagged}', '' + flaggedCount()) }}
            </p>
            @if (unanswered().length > 0) {
              <p class="warn-text">{{ locale.t('exam.unansweredWarn') }}</p>
              <div class="review-cells">
                @for (i of unanswered(); track i) {
                  <button type="button" class="qcell" (click)="go(i); reviewOpen.set(false)">{{ i + 1 }}</button>
                }
              </div>
            }
            @if (flagged().length > 0) {
              <p>{{ locale.t('exam.flaggedList') }}</p>
              <div class="review-cells">
                @for (i of flagged(); track i) {
                  <button type="button" class="qcell flagged" (click)="go(i); reviewOpen.set(false)">{{ i + 1 }}</button>
                }
              </div>
            }
            <div class="dialog-actions">
              <button type="button" class="btn" (click)="reviewOpen.set(false)">{{ locale.t('exam.continue') }}</button>
              <button type="button" class="btn btn-primary" (click)="submit()">{{ locale.t('exam.submitFinal') }}</button>
            </div>
          </div>
        </div>
      }
    } @else {
      <p class="card">{{ locale.t('exam.none') }}</p>
    }
  `,
  styles: `
    .exam-bar {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      position: sticky; top: 62px; z-index: 40;
      background: var(--bg-elev); border: 1px solid var(--border);
      border-radius: 12px; padding: 8px 14px; margin-bottom: 14px; box-shadow: var(--shadow);
    }
    .timer { font-weight: 700; font-variant-numeric: tabular-nums; font-size: 1.05rem; }
    .timer.low { color: var(--err); }
    .answered { color: var(--text-dim); font-size: 0.9rem; }
    .spacer { flex: 1; }
    .qgrid, .review-cells {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
      gap: 6px; margin-bottom: 14px;
    }
    .review-cells { margin: 8px 0 14px; }
    .qcell {
      min-height: 40px; border-radius: 8px; border: 1.5px solid var(--border);
      background: var(--bg-elev); color: var(--text); cursor: pointer; font-weight: 600;
      position: relative;
    }
    .qcell.answered { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
    .qcell.current { outline: 3px solid var(--focus); }
    .qcell.flagged::after { content: '⚑'; position: absolute; top: -4px; right: 0; font-size: 0.7rem; color: var(--warn); }
    .exam-q .q-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .exam-q h2 { font-size: 1.05rem; margin: 0; }
    .flag-btn.on { border-color: var(--warn); color: var(--warn); }
    .case-box {
      border-left: 4px solid var(--accent); background: var(--bg-sunken);
      border-radius: 0 10px 10px 0; padding: 10px 14px; margin: 10px 0;
    }
    .case-box h3 { margin: 0 0 6px; color: var(--accent); font-size: 0.9rem; }
    .exam-nav { display: flex; justify-content: space-between; margin-top: 16px; }
    .dialog-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center; z-index: 90; padding: 16px;
    }
    .dialog { max-width: 560px; width: 100%; max-height: 85vh; overflow-y: auto; }
    .warn-text { color: var(--warn); font-weight: 600; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
  `,
})
export class MockRun {
  protected readonly locale = inject(LocaleService);
  protected readonly mock = inject(MockExamService);
  private readonly router = inject(Router);

  protected readonly navOpen = signal(false);
  protected readonly reviewOpen = signal(false);

  protected readonly current = computed<Question | null>(() => {
    const ex = this.mock.active();
    return ex?.questions[this.mock.currentIndex()] ?? null;
  });

  constructor() {
    // No active exam (e.g. page refresh): try resuming, else go to setup.
    if (!this.mock.active()) {
      void this.mock.resume().then((ok) => {
        if (!ok) void this.router.navigate(['/mock']);
      });
    }
    // Auto-submit on time-out.
    effect(() => {
      if (this.mock.timeUp() && this.mock.active() && !this.mock.active()!.attempt.submitted) {
        this.submit(true);
      }
    });
  }

  protected timeLabel(): string {
    const s = this.mock.remainingSec();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  protected responseOf(qid: string): Response {
    const a = this.mock.active()?.attempt.answers[qid];
    return { answer: a?.answer, answerMap: a?.answerMap };
  }

  protected setResponse(qid: string, r: Response): void {
    this.mock.setAnswer(qid, { answer: r.answer, answerMap: r.answerMap });
  }

  protected isQAnswered(q: Question): boolean {
    return isAnswered(q, this.responseOf(q.id));
  }

  protected isFlagged(qid: string): boolean {
    return this.mock.active()?.attempt.answers[qid]?.flagged ?? false;
  }

  protected caseOf(q: Question) {
    if (!q.caseId) return null;
    return this.mock.active()?.cases[q.caseId] ?? null;
  }

  protected flaggedCount(): number {
    return this.flagged().length;
  }

  protected flagged(): number[] {
    const ex = this.mock.active();
    if (!ex) return [];
    return ex.questions.map((q, i) => (this.isFlagged(q.id) ? i : -1)).filter((i) => i >= 0);
  }

  protected unanswered(): number[] {
    const ex = this.mock.active();
    if (!ex) return [];
    return ex.questions.map((q, i) => (this.isQAnswered(q) ? -1 : i)).filter((i) => i >= 0);
  }

  protected go(index: number): void {
    const ex = this.mock.active();
    if (!ex) return;
    this.mock.currentIndex.set(Math.max(0, Math.min(ex.questions.length - 1, index)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected submit(auto = false): void {
    const attempt = this.mock.submit(auto);
    this.reviewOpen.set(false);
    if (attempt) {
      void this.router.navigate(['/mock/results', attempt.id]);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.go(this.mock.currentIndex() + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.go(this.mock.currentIndex() - 1);
        break;
      case 'f':
      case 'F': {
        const q = this.current();
        if (q) this.mock.toggleFlag(q.id);
        break;
      }
      case 'Escape':
        this.navOpen.set(false);
        this.reviewOpen.set(false);
        break;
    }
  }
}
