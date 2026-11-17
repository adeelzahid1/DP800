import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CaseStudy, Question } from '../../core/models/content.models';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { ProgressService } from '../../core/services/progress.service';
import { createRng, shuffled } from '../../core/utils/rng';
import { SRS_INTERVAL_DAYS } from '../../core/utils/srs';
import { QuestionCard } from '../study/questions/question-card';

type SizeChoice = '10' | '20' | '50' | 'all';

interface ReviewItem {
  q: Question;
  caseStudy: CaseStudy | null;
}

/** Spaced-repetition review: works through the questions that are due today, one at a time. */
@Component({
  selector: 'app-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, QuestionCard],
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    <h1>{{ locale.t('review.title') }}</h1>

    @switch (phase()) {
      @case ('setup') {
        <section class="card setup">
          @if (dueCount() === 0) {
            <h2>{{ locale.t('review.none') }}</h2>
            <p class="dim">{{ locale.t('review.noneHint') }}</p>
            <div class="actions">
              <a routerLink="/study" class="btn btn-primary">{{ locale.t('dash.continueStudy') }}</a>
            </div>
          } @else {
            <p class="due-line">
              <span class="due-num">{{ dueCount() }}</span>
              {{ locale.t('review.dueNow') }}
            </p>
            <div class="row">
              <label for="review-size">{{ locale.t('review.size') }}</label>
              <select id="review-size" [value]="size()" (change)="onSize($event)">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="all">{{ locale.t('review.all') }} ({{ dueCount() }})</option>
              </select>
              <button type="button" class="btn btn-primary" (click)="start()">
                {{ locale.t('review.start') }}
              </button>
            </div>
          }
          @if (loadError()) {
            <p class="err-text" role="alert">{{ loadError() }}</p>
          }
        </section>

        <div class="grid">
          <section class="card">
            <h2>{{ locale.t('review.upcoming') }}</h2>
            <ol class="forecast">
              @for (n of upcoming(); track $index) {
                <li>
                  <span class="dim">{{ dayLabel($index + 1) }}</span>
                  <span class="bar"><span [style.width.%]="forecastMax() ? (n / forecastMax()) * 100 : 0"></span></span>
                  <strong>{{ n }}</strong>
                </li>
              }
            </ol>
          </section>

          <section class="card">
            <h2>{{ locale.t('review.boxes') }}</h2>
            <ol class="forecast">
              @for (n of progress.boxCounts(); track $index) {
                <li>
                  <span class="dim">{{ boxLabel($index + 1) }}</span>
                  <span class="bar"><span [style.width.%]="boxMax() ? (n / boxMax()) * 100 : 0"></span></span>
                  <strong>{{ n }}</strong>
                </li>
              }
            </ol>
          </section>

          <section class="card how">
            <h2>{{ locale.t('review.how') }}</h2>
            <ul>
              <li>{{ locale.t('review.howWrong') }}</li>
              <li>{{ locale.t('review.howSure') }}</li>
              <li>{{ locale.t('review.howGuess') }}</li>
            </ul>
          </section>
        </div>
      }

      @case ('loading') {
        <p class="card" role="status">{{ locale.t('review.loading') }}</p>
      }

      @case ('running') {
        <div class="run-head">
          <span class="counter" aria-live="polite">
            {{ locale.t('review.progress').replace('{i}', '' + (index() + 1)).replace('{n}', '' + items().length) }}
          </span>
          <div class="pbar"><span [style.width.%]="((index() + (currentAnswered() ? 1 : 0)) / items().length) * 100"></span></div>
          <button type="button" class="btn btn-sm" (click)="finish()">{{ locale.t('review.end') }}</button>
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
      }

      @case ('done') {
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
            @if (dueCount() > 0) {
              <button type="button" class="btn btn-primary" (click)="phase.set('setup')">
                {{ locale.t('review.again') }} ({{ dueCount() }})
              </button>
            }
            <a routerLink="/" class="btn">{{ locale.t('review.backDash') }}</a>
          </div>
        </section>
      }
    }
  `,
  styles: `
    .dim { color: var(--text-dim); font-size: 0.9rem; }
    .ok-text { color: var(--ok); }
    .err-text { color: var(--err); }
    .setup { margin-bottom: 16px; }
    .setup h2 { margin-top: 0; }
    .due-line { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; }
    .due-num { font-size: 2.2rem; font-weight: 800; font-variant-numeric: tabular-nums; }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .row select { min-height: 36px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .grid h2 { margin-top: 0; font-size: 1.05rem; }
    .forecast { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .forecast li { display: grid; grid-template-columns: 6.5rem 1fr 2.5rem; align-items: center; gap: 8px; }
    .forecast strong { text-align: right; font-variant-numeric: tabular-nums; }
    .bar { height: 8px; background: var(--bg-sunken); border-radius: 4px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--primary); }
    .how ul { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 6px; }
    .run-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .counter { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .run-head .pbar { flex: 1; height: 8px; }
    .subtopic { margin: 8px 0 0; }
    .run-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
    .stats { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 12px; }
    .stat { display: flex; flex-direction: column; }
    .stat-num { font-size: 1.9rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  `,
})
export class ReviewPage {
  protected readonly locale = inject(LocaleService);
  protected readonly progress = inject(ProgressService);
  private readonly content = inject(ContentService);

  protected readonly phase = signal<'setup' | 'loading' | 'running' | 'done'>('setup');
  protected readonly size = signal<SizeChoice>('20');
  protected readonly items = signal<ReviewItem[]>([]);
  protected readonly index = signal(0);
  /** questionId -> correct, for answered questions in this session. */
  private readonly results = signal<Record<string, boolean>>({});
  protected readonly loadError = signal<string | null>(null);

  private readonly card = viewChild(QuestionCard);

  protected readonly dueCount = computed(() => this.progress.dueItems().length);
  protected readonly upcoming = computed(() => this.progress.upcoming(7));
  protected readonly forecastMax = computed(() => Math.max(0, ...this.upcoming()));
  protected readonly boxMax = computed(() => Math.max(0, ...this.progress.boxCounts()));

  protected readonly current = computed<ReviewItem | null>(
    () => this.items()[this.index()] ?? null,
  );
  protected readonly currentAnswered = computed(() => {
    const cur = this.current();
    return cur ? cur.q.id in this.results() : false;
  });

  protected readonly summary = computed(() => {
    const r = this.results();
    const values = Object.values(r);
    const correct = values.filter((v) => v).length;
    return {
      correct,
      wrong: values.length - correct,
      skipped: this.items().length - values.length,
    };
  });

  protected onSize(event: Event): void {
    this.size.set((event.target as HTMLSelectElement).value as SizeChoice);
  }

  protected async start(): Promise<void> {
    const due = this.progress.dueItems();
    const choice = this.size();
    const picked = choice === 'all' ? due : due.slice(0, Number(choice));
    if (picked.length === 0) return;

    this.phase.set('loading');
    this.loadError.set(null);
    const refs = this.content.refById();
    const subtopics = [...new Set(picked.map((d) => d.subtopic))];
    try {
      const banks = await Promise.all(
        subtopics.map((s) => {
          const ref = refs.get(s);
          return ref ? this.content.getBank(ref.subtopic) : Promise.resolve(null);
        }),
      );
      const byId = new Map<string, ReviewItem>();
      for (const bank of banks) {
        if (!bank) continue;
        for (const q of bank.questions) {
          const caseStudy = q.caseId ? (bank.cases?.find((c) => c.id === q.caseId) ?? null) : null;
          byId.set(q.id, { q, caseStudy });
        }
      }
      // Questions removed from the bank since they were attempted are skipped.
      const list = picked.map((d) => byId.get(d.id)).filter((x): x is ReviewItem => !!x);
      if (list.length === 0) {
        this.phase.set('setup');
        return;
      }
      // Interleave subtopics: mixing topics in one session improves retention.
      this.items.set(shuffled(list, createRng(Date.now() % 2 ** 31)));
      this.index.set(0);
      this.results.set({});
      this.phase.set('running');
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : String(e));
      this.phase.set('setup');
    }
  }

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
      this.finish();
    }
  }

  protected finish(): void {
    this.phase.set('done');
  }

  protected subtopicTitle(id: string): string {
    const ref = this.content.refById().get(id);
    return ref ? this.locale.lt(ref.subtopic.title) : id;
  }

  protected dayLabel(offset: number): string {
    if (offset === 1) return this.locale.t('review.tomorrow');
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  }

  protected boxLabel(box: number): string {
    return this.locale
      .t('review.box')
      .replace('{n}', String(box))
      .replace('{d}', String(SRS_INTERVAL_DAYS[box]));
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.phase() !== 'running') return;
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
