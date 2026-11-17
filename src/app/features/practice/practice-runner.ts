import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ContentService, LoadedQuestion } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { QuestionCard } from '../study/questions/question-card';

/**
 * Runs a fixed list of questions one at a time (answers hidden until checked),
 * then shows a summary. Used by the review and notebook pages; the parent
 * projects its own buttons into the summary with the `summary-actions` attribute.
 */
@Component({
  selector: 'app-practice-runner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QuestionCard],
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    @if (!done()) {
      <div class="run-head">
        <span class="counter" aria-live="polite">
          {{ locale.t('review.progress').replace('{i}', '' + (index() + 1)).replace('{n}', '' + items().length) }}
        </span>
        <div class="pbar"><span [style.width.%]="((index() + (currentAnswered() ? 1 : 0)) / items().length) * 100"></span></div>
        <button type="button" class="btn btn-sm" (click)="done.set(true)">{{ locale.t('review.end') }}</button>
      </div>

      @if (current(); as item) {
        @for (it of [item]; track it.q.id) {
          <app-question-card
            [q]="it.q"
            [index]="index()"
            [caseStudy]="it.caseStudy"
            [globalShowAnswer]="false"
            [globalShowExample]="false"
            [current]="true"
            (answeredChange)="onAnswered($event)"
          />
        }
        <p class="subtopic dim">{{ subtopicTitle(item.q.subtopic) }}</p>
      }

      <div class="run-actions">
        <button type="button" class="btn btn-primary" (click)="next()">
          @if (index() + 1 < items().length) {
            {{ currentAnswered() ? locale.t('review.next') : locale.t('review.skip') }}
          } @else {
            {{ locale.t('review.finish') }}
          }
        </button>
      </div>
    } @else {
      <section class="card summary">
        <h2>{{ locale.t('review.summary') }}</h2>
        <div class="stats">
          <div class="stat">
            <span class="stat-num ok-text">{{ summary().correct }}</span>
            <span class="dim">{{ locale.t('review.correct') }}</span>
          </div>
          <div class="stat">
            <span class="stat-num err-text">{{ summary().wrong }}</span>
            <span class="dim">{{ locale.t('review.wrong') }}</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ summary().skipped }}</span>
            <span class="dim">{{ locale.t('review.skipped') }}</span>
          </div>
        </div>
        @if (summary().wrong > 0) {
          <p class="dim">{{ locale.t('review.wrongHint') }}</p>
        }
        <div class="actions">
          <ng-content select="[summary-actions]" />
        </div>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .dim { color: var(--text-dim); font-size: 0.9rem; }
    .ok-text { color: var(--ok); }
    .err-text { color: var(--err); }
    .run-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .counter { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .run-head .pbar { flex: 1; height: 8px; }
    .subtopic { margin: 8px 0 0; }
    .run-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
    .summary h2 { margin-top: 0; }
    .stats { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 12px; }
    .stat { display: flex; flex-direction: column; }
    .stat-num { font-size: 1.9rem; font-weight: 800; font-variant-numeric: tabular-nums; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  `,
})
export class PracticeRunner {
  protected readonly locale = inject(LocaleService);
  private readonly content = inject(ContentService);

  readonly items = input.required<LoadedQuestion[]>();

  protected readonly index = signal(0);
  protected readonly done = signal(false);
  /** questionId -> correct, first attempt only. */
  private readonly results = signal<Record<string, boolean>>({});

  private readonly card = viewChild(QuestionCard);

  protected readonly current = computed<LoadedQuestion | null>(
    () => this.items()[this.index()] ?? null,
  );
  protected readonly currentAnswered = computed(() => {
    const cur = this.current();
    return cur ? cur.q.id in this.results() : false;
  });

  protected readonly summary = computed(() => {
    const values = Object.values(this.results());
    const correct = values.filter((v) => v).length;
    return {
      correct,
      wrong: values.length - correct,
      skipped: this.items().length - values.length,
    };
  });

  protected onAnswered(correct: boolean): void {
    const cur = this.current();
    if (!cur) return;
    // Keep the first result: a retry after seeing the explanation isn't a fair recall test.
    this.results.update((r) => (cur.q.id in r ? r : { ...r, [cur.q.id]: correct }));
  }

  protected next(): void {
    if (this.index() + 1 < this.items().length) {
      this.index.update((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.done.set(true);
    }
  }

  protected subtopicTitle(id: string): string {
    const ref = this.content.refById().get(id);
    return ref ? this.locale.lt(ref.subtopic.title) : id;
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.done()) return;
    const target = event.target as HTMLElement;
    const tag = target.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      target.isContentEditable ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    const card = this.card();
    switch (event.key) {
      case '1': case '2': case '3': case '4': case '5':
      case '6': case '7': case '8': case '9':
        card?.selectOption(Number(event.key) - 1);
        break;
      case 'a': case 'b': case 'c': case 'd': case 'e': case 'f':
      case 'A': case 'B': case 'C': case 'D': case 'E': case 'F':
        card?.selectOption(event.key.toLowerCase().charCodeAt(0) - 97);
        break;
      case 'Enter':
        if (tag !== 'BUTTON' && tag !== 'A' && !target.closest('.dd-row')) {
          event.preventDefault();
          if (this.currentAnswered()) this.next();
          else card?.submitFromKeyboard();
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.next();
        break;
      case 's':
      case 'S':
        card?.setConfidence('sure');
        break;
      case 'g':
      case 'G':
        card?.setConfidence('guess');
        break;
      case 't':
      case 'T':
        event.preventDefault();
        card?.openNote();
        break;
      case 'h':
      case 'H':
        card?.toggleAnswer();
        break;
      case 'x':
      case 'X':
        card?.toggleExample();
        break;
    }
  }
}
