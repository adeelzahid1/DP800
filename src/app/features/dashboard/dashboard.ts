import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EXAM_CONFIG } from '../../core/models/content.models';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { MockExamService } from '../../core/services/mock-exam.service';
import { ProgressService } from '../../core/services/progress.service';
import { notebookEntries } from '../../core/utils/notebook';
import { BarChart, BarDatum } from '../../shared/bar-chart';
import { TrendChart, TrendPoint } from '../../shared/trend-chart';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BarChart, TrendChart],
  template: `
    <h1>{{ locale.t('dash.title') }}</h1>

    <div class="grid">
      <section class="card stat-card">
        <h2>{{ locale.t('dash.overall') }}</h2>
        @if (overall(); as o) {
          <div class="stats">
            <div class="stat">
              <span class="stat-num">{{ o.total }}</span>
              <span class="stat-label">{{ locale.t('dash.totalQuestions') }}</span>
            </div>
            <div class="stat">
              <span class="stat-num">{{ o.read }}</span>
              <span class="stat-label">{{ locale.t('tree.read') }}</span>
            </div>
            <div class="stat">
              <span class="stat-num">{{ o.attempted }}</span>
              <span class="stat-label">{{ locale.t('tree.attempted') }}</span>
            </div>
            <div class="stat">
              <span class="stat-num ok-text">{{ o.correct }}</span>
              <span class="stat-label">{{ locale.t('tree.correct') }}</span>
            </div>
          </div>
          <div class="overall-bar">
            <div class="pbar big"><span [style.width.%]="o.total ? (o.attempted / o.total) * 100 : 0"></span></div>
            <span class="dim">{{ o.total ? ((o.attempted / o.total) * 100).toFixed(0) : 0 }}% {{ locale.t('tree.attempted') }}</span>
          </div>
        }
        <div class="actions">
          <a routerLink="/study" class="btn btn-primary">{{ locale.t('dash.continueStudy') }}</a>
          <a routerLink="/mock" class="btn">{{ locale.t('dash.takeMock') }}</a>
        </div>
      </section>

      <section class="card due-card">
        <h2>{{ locale.t('dash.due') }}</h2>
        @if (dueCount() > 0) {
          <p class="due-line">
            <span class="stat-num">{{ dueCount() }}</span>
            <span class="dim">{{ locale.t('dash.dueToday') }}</span>
          </p>
        } @else {
          <p class="dim">{{ locale.t('dash.dueNone') }}</p>
        }
        @if (dueWeek() > 0) {
          <p class="dim">{{ locale.t('dash.dueWeek').replace('{n}', '' + dueWeek()) }}</p>
        }
        <div class="actions">
          <a routerLink="/review" class="btn" [class.btn-primary]="dueCount() > 0">{{ locale.t('dash.startReview') }}</a>
        </div>
      </section>

      <section class="card">
        <h2>{{ locale.t('notebook.title') }}</h2>
        @if (notebook().all > 0) {
          <ul class="nb-counts">
            <li><strong>{{ notebook().wrong }}</strong> {{ locale.t('notebook.k.wrong') }}</li>
            <li><strong>{{ notebook().guessed }}</strong> {{ locale.t('notebook.k.guessed') }}</li>
            <li><strong>{{ notebook().note }}</strong> {{ locale.t('notebook.f.note') }}</li>
          </ul>
        } @else {
          <p class="dim">{{ locale.t('notebook.emptyHint') }}</p>
        }
        <div class="actions">
          <a routerLink="/notebook" class="btn">{{ locale.t('dash.openNotebook') }}</a>
        </div>
      </section>

      <section class="card">
        <h2>{{ locale.t('dash.byDomain') }}</h2>
        <app-bar-chart [data]="domainChart()" [caption]="locale.t('dash.byDomain')" />
      </section>

      <section class="card">
        <h2>{{ locale.t('dash.weakAreas') }}</h2>
        @if (weak().length === 0) {
          <p class="dim">{{ locale.t('mock.noWeakYet') }}</p>
        } @else {
          <ul class="weak-list">
            @for (w of weak(); track w.subtopicId) {
              <li>
                <a [routerLink]="['/study', w.subtopicId]">{{ titleOf(w.subtopicId) }}</a>
                <span class="chip chip-weak">{{ (w.accuracy * 100).toFixed(0) }}%</span>
              </li>
            }
          </ul>
        }
      </section>

      <section class="card">
        <h2>{{ locale.t('dash.mockTrend') }}</h2>
        @if (trend().length === 0) {
          <p class="dim">{{ locale.t('dash.noMocks') }}</p>
        } @else {
          <app-trend-chart [data]="trend()" [passLine]="cfg.passingScore" />
          <p class="dim">
            {{ locale.t('dash.lastScore') }}: <strong>{{ lastScore() }}</strong> / {{ cfg.scaleMax }}
          </p>
        }
      </section>

      <section class="card">
        <h2>{{ locale.t('dash.data') }}</h2>
        <p class="dim">{{ locale.t('dash.dataHint') }}</p>
        <div class="actions">
          <button type="button" class="btn" (click)="exportProgress()">{{ locale.t('dash.export') }}</button>
          <label class="btn">
            {{ locale.t('dash.import') }}
            <input type="file" accept=".json,application/json" class="visually-hidden" (change)="importProgress($event)" />
          </label>
        </div>
        @if (importMsg(); as msg) {
          <p [class.ok-text]="msg === 'ok'" [class.err-text]="msg !== 'ok'" role="status">
            {{ msg === 'ok' ? locale.t('dash.importOk') : msg }}
          </p>
        }
      </section>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .stat-card { grid-column: 1 / -1; }
    .stats { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 12px; }
    .stat { display: flex; flex-direction: column; }
    .stat-num { font-size: 1.9rem; font-weight: 800; font-variant-numeric: tabular-nums; }
    .stat-label { color: var(--text-dim); font-size: 0.85rem; }
    .overall-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .overall-bar .pbar { flex: 1; height: 10px; }
    .nb-counts { list-style: none; margin: 0 0 6px; padding: 0; display: flex; gap: 18px; flex-wrap: wrap; }
    .nb-counts strong { font-size: 1.4rem; font-variant-numeric: tabular-nums; margin-right: 4px; }
    .due-line { display: flex; align-items: baseline; gap: 10px; margin: 0 0 6px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
    .dim { color: var(--text-dim); font-size: 0.9rem; }
    .ok-text { color: var(--ok); }
    .err-text { color: var(--err); }
    .weak-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .weak-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  `,
})
export class Dashboard {
  protected readonly locale = inject(LocaleService);
  protected readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);
  private readonly mock = inject(MockExamService);

  protected readonly cfg = EXAM_CONFIG;
  protected readonly weak = this.mock.weakAreas;
  protected readonly importMsg = signal<string | null>(null);

  protected readonly dueCount = computed(() => this.progress.dueItems().length);
  protected readonly notebook = computed(() => {
    const c = { all: 0, wrong: 0, guessed: 0, note: 0 };
    for (const e of notebookEntries(this.progress.progress())) {
      c.all++;
      for (const k of e.kinds) c[k]++;
    }
    return c;
  });
  protected readonly dueWeek = computed(() =>
    this.progress.upcoming(7).reduce((sum, n) => sum + n, 0),
  );

  protected readonly overall = computed(() => {
    const manifest = this.content.manifest();
    if (!manifest) return null;
    let total = 0;
    const agg = { read: 0, attempted: 0, correct: 0 };
    for (const d of manifest.domains) {
      for (const t of d.topics) {
        for (const s of t.subtopics) {
          total += s.questionCount;
          const st = this.progress.statsForSubtopic(s.id, s.questionCount);
          agg.read += st.read;
          agg.attempted += st.attempted;
          agg.correct += st.correct;
        }
      }
    }
    return { total, ...agg };
  });

  protected readonly domainChart = computed<BarDatum[]>(() => {
    const manifest = this.content.manifest();
    if (!manifest) return [];
    return manifest.domains
      .filter((d) => !d.lessonOnly)
      .map((d) => {
        let total = 0;
        let correct = 0;
        let attempted = 0;
        for (const t of d.topics) {
          for (const s of t.subtopics) {
            total += s.questionCount;
            const st = this.progress.statsForSubtopic(s.id, s.questionCount);
            correct += st.correct;
            attempted += st.attempted;
          }
        }
        return {
          label: this.locale.lt(d.title),
          value: total > 0 ? attempted / total : 0,
          detail: `${attempted}/${total} · ${correct} ✓`,
        };
      });
  });

  protected readonly trend = computed<TrendPoint[]>(() =>
    this.progress
      .mockHistory()
      .filter((a) => a.submitted)
      .slice()
      .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
      .map((a) => ({
        label: a.finishedAt ? new Date(a.finishedAt).toLocaleDateString() : '',
        value: a.score ?? 0,
      })),
  );

  protected lastScore(): number {
    const t = this.trend();
    return t.length > 0 ? t[t.length - 1].value : 0;
  }

  protected titleOf(subtopicId: string): string {
    const ref = this.content.refById().get(subtopicId);
    return ref ? this.locale.lt(ref.subtopic.title) : subtopicId;
  }

  protected exportProgress(): void {
    const blob = new Blob([this.progressExport()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dp800-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private progressExport(): string {
    return this.progress.exportAll();
  }

  protected importProgress(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      const err = this.progress.importAll(text);
      this.importMsg.set(err ?? 'ok');
      (event.target as HTMLInputElement).value = '';
    });
  }
}
