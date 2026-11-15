import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EXAM_CONFIG } from '../../core/models/content.models';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { MockExamService } from '../../core/services/mock-exam.service';
import { ProgressService } from '../../core/services/progress.service';
import { TrendChart, TrendPoint } from '../../shared/trend-chart';

@Component({
  selector: 'app-mock-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TrendChart],
  template: `
    <h1>{{ locale.t('mock.title') }}</h1>

    @if (mock.hasResumable()) {
      <section class="card resume-card">
        <p>{{ locale.t('mock.resumeAvailable') }}</p>
        <button type="button" class="btn btn-primary" (click)="resume()">{{ locale.t('mock.resume') }}</button>
      </section>
    }

    <section class="card">
      <h2>{{ locale.t('mock.structure') }}</h2>
      <ul class="facts">
        <li>{{ locale.t('mock.factDuration').replace('{n}', '' + cfg.durationMinutes) }}</li>
        <li>{{ locale.t('mock.factPass').replace('{n}', '' + cfg.passingScore) }}</li>
        <li>{{ locale.t('mock.factWeights') }}</li>
        <li>{{ locale.t('mock.factEstimate') }}</li>
      </ul>

      <div class="form-row">
        <label>
          {{ locale.t('mock.questionCount') }}
          <input
            type="number"
            [min]="cfg.minQuestionCount"
            [max]="cfg.maxQuestionCount"
            [value]="count()"
            (input)="onCount($event)"
          />
        </label>

        <label class="check" [class.disabled]="weakAreas().length === 0">
          <input
            type="checkbox"
            [checked]="weakFocus()"
            [disabled]="weakAreas().length === 0"
            (change)="weakFocus.set(!weakFocus())"
          />
          {{ locale.t('mock.weakFocus') }}
        </label>
      </div>

      @if (weakAreas().length === 0) {
        <p class="dim">{{ locale.t('mock.noWeakYet') }}</p>
      } @else if (weakFocus()) {
        <div class="boost-info">
          <p>{{ locale.t('mock.boostedTopics') }}</p>
          <ul>
            @for (w of weakAreas(); track w.subtopicId) {
              <li>
                {{ titleOf(w.subtopicId) }}
                <span class="dim">({{ (w.accuracy * 100).toFixed(0) }}% · {{ w.attempts }} {{ locale.t('mock.attempts') }})</span>
              </li>
            }
          </ul>
        </div>
      }

      @if (building()) {
        <p role="status">{{ locale.t('mock.building') }}</p>
      } @else {
        <button type="button" class="btn btn-primary start-btn" (click)="start()" [disabled]="!content.manifest()">
          {{ locale.t('mock.start') }}
        </button>
      }
      @if (error(); as err) {
        <p class="err">{{ err }}</p>
      }
    </section>

    @if (history().length > 0) {
      <section class="card">
        <h2>{{ locale.t('mock.history') }}</h2>
        @if (trend().length > 1) {
          <app-trend-chart [data]="trend()" [passLine]="cfg.passingScore" />
        }
        <table class="history-table">
          <thead>
            <tr>
              <th scope="col">{{ locale.t('mock.date') }}</th>
              <th scope="col">{{ locale.t('mock.score') }}</th>
              <th scope="col">{{ locale.t('mock.result') }}</th>
              <th scope="col">{{ locale.t('mock.time') }}</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            @for (a of history(); track a.id) {
              <tr>
                <td>{{ dateOf(a.finishedAt) }}</td>
                <td>{{ a.score }}</td>
                <td>
                  <span class="chip" [class.chip-ok]="a.passed" [class.chip-weak]="!a.passed">
                    {{ a.passed ? locale.t('mock.pass') : locale.t('mock.fail') }}
                  </span>
                  @if (a.weakFocused) {
                    <span class="chip chip-outline">{{ locale.t('mock.focused') }}</span>
                  }
                </td>
                <td>{{ minutesOf(a.timeUsedSec) }}</td>
                <td><a class="btn btn-sm" [routerLink]="['/mock/results', a.id]">{{ locale.t('mock.review') }}</a></td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .resume-card { border-color: var(--warn); display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .facts { padding-left: 1.2em; }
    .facts li { margin-bottom: 4px; }
    .form-row { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; margin: 14px 0; }
    .form-row label { display: inline-flex; align-items: center; gap: 8px; }
    .form-row input[type='number'] { width: 90px; }
    .check.disabled { opacity: 0.5; }
    .dim { color: var(--text-dim); font-size: 0.9rem; }
    .boost-info { background: var(--primary-soft); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; }
    .boost-info ul { margin: 6px 0 0; padding-left: 1.2em; }
    .start-btn { font-size: 1.05rem; padding: 10px 22px; }
    .err { color: var(--err); }
    .history-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .history-table th, .history-table td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); font-size: 0.92rem; }
    @media (max-width: 600px) {
      .history-table th:nth-child(4), .history-table td:nth-child(4) { display: none; }
    }
  `,
})
export class MockSetup {
  protected readonly locale = inject(LocaleService);
  protected readonly content = inject(ContentService);
  protected readonly mock = inject(MockExamService);
  private readonly progress = inject(ProgressService);
  private readonly router = inject(Router);

  protected readonly cfg = EXAM_CONFIG;
  protected readonly count = signal<number>(EXAM_CONFIG.defaultQuestionCount);
  protected readonly weakFocus = signal(false);
  protected readonly building = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly weakAreas = this.mock.weakAreas;

  protected readonly history = computed(() =>
    this.progress
      .mockHistory()
      .filter((a) => a.submitted)
      .slice()
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)),
  );

  protected readonly trend = computed<TrendPoint[]>(() =>
    this.history()
      .slice()
      .reverse()
      .map((a) => ({ label: this.dateOf(a.finishedAt), value: a.score ?? 0 })),
  );

  protected titleOf(subtopicId: string): string {
    const ref = this.content.refById().get(subtopicId);
    return ref ? this.locale.lt(ref.subtopic.title) : subtopicId;
  }

  protected dateOf(ts: number | undefined): string {
    return ts ? new Date(ts).toLocaleDateString() : '';
  }

  protected minutesOf(sec: number | undefined): string {
    if (!sec) return '';
    return `${Math.floor(sec / 60)} min`;
  }

  protected onCount(event: Event): void {
    const n = Number((event.target as HTMLInputElement).value);
    this.count.set(
      Math.max(this.cfg.minQuestionCount, Math.min(this.cfg.maxQuestionCount, n || this.cfg.defaultQuestionCount)),
    );
  }

  protected async start(): Promise<void> {
    this.building.set(true);
    this.error.set(null);
    try {
      await this.mock.buildExam(this.count(), this.weakFocus());
      await this.router.navigate(['/mock/run']);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.building.set(false);
    }
  }

  protected async resume(): Promise<void> {
    this.building.set(true);
    try {
      if (await this.mock.resume()) {
        await this.router.navigate(['/mock/run']);
      }
    } finally {
      this.building.set(false);
    }
  }
}
