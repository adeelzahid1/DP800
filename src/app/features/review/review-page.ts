import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService, LoadedQuestion } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { ProgressService } from '../../core/services/progress.service';
import { createRng, shuffled } from '../../core/utils/rng';
import { SRS_INTERVAL_DAYS } from '../../core/utils/srs';
import { PracticeRunner } from '../practice/practice-runner';

type SizeChoice = '10' | '20' | '50' | 'all';

/** Spaced-repetition review: works through the questions that are due today, one at a time. */
@Component({
  selector: 'app-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PracticeRunner],
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
        <app-practice-runner [items]="items()">
          <ng-container summary-actions>
            @if (dueCount() > 0) {
              <button type="button" class="btn btn-primary" (click)="phase.set('setup')">
                {{ locale.t('review.again') }} ({{ dueCount() }})
              </button>
            }
            <a routerLink="/notebook" class="btn">{{ locale.t('nav.notebook') }}</a>
            <a routerLink="/" class="btn">{{ locale.t('review.backDash') }}</a>
          </ng-container>
        </app-practice-runner>
      }
    }
  `,
  styles: `
    .dim { color: var(--text-dim); font-size: 0.9rem; }
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
  `,
})
export class ReviewPage {
  protected readonly locale = inject(LocaleService);
  protected readonly progress = inject(ProgressService);
  private readonly content = inject(ContentService);

  protected readonly phase = signal<'setup' | 'loading' | 'running'>('setup');
  protected readonly size = signal<SizeChoice>('20');
  protected readonly items = signal<LoadedQuestion[]>([]);
  protected readonly loadError = signal<string | null>(null);

  protected readonly dueCount = computed(() => this.progress.dueItems().length);
  protected readonly upcoming = computed(() => this.progress.upcoming(7));
  protected readonly forecastMax = computed(() => Math.max(0, ...this.upcoming()));
  protected readonly boxMax = computed(() => Math.max(0, ...this.progress.boxCounts()));

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
    try {
      const list = await this.content.loadQuestions(picked);
      if (list.length === 0) {
        this.phase.set('setup');
        return;
      }
      // Interleave subtopics: mixing topics in one session improves retention.
      this.items.set(shuffled(list, createRng(Date.now() % 2 ** 31)));
      this.phase.set('running');
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : String(e));
      this.phase.set('setup');
    }
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
}
