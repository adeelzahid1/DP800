import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { MockExamService } from '../../core/services/mock-exam.service';
import { ProgressService } from '../../core/services/progress.service';
import { dayNumber } from '../../core/utils/srs';
import {
  CoverageStat,
  dailyPlan,
  parseDateInput,
  streakInfo,
  suggestSubtopics,
  toDateInput,
} from '../../core/utils/study-plan';

/** Days without practice after which the dashboard nudges the learner. */
const NUDGE_AFTER_DAYS = 2;

/** "Today's plan": exam-date countdown, daily new-question target, reviews, streak and suggestions. */
@Component({
  selector: 'app-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  host: { class: 'card' },
  template: `
    <header class="head">
      <h2>{{ locale.t('plan.title') }}</h2>
      @if (streak().streak > 0) {
        <span class="streak" [class.pending]="!streak().activeToday" [title]="locale.t('plan.streakHint')">
          🔥 {{ locale.t('plan.streak').replace('{n}', '' + streak().streak) }}
        </span>
      }
    </header>

    @if (nudgeDays(); as days) {
      <p class="nudge" role="status">{{ locale.t('plan.nudge').replace('{n}', '' + days) }}</p>
    }

    <div class="date-row">
      <label for="exam-date">{{ locale.t('plan.examDate') }}</label>
      <input id="exam-date" type="date" [formControl]="examDate" [min]="todayInput" />
      @if (examDate.value) {
        <button type="button" class="btn btn-sm" (click)="examDate.setValue('')">{{ locale.t('plan.clearDate') }}</button>
      }
    </div>

    @switch (plan().status) {
      @case ('no-date') {
        <p class="dim">{{ locale.t('plan.noDate') }}</p>
      }
      @case ('past') {
        <p class="dim">{{ locale.t('plan.past') }}</p>
      }
      @case ('exam-day') {
        <p class="exam-day">{{ locale.t('plan.examDay') }}</p>
      }
      @case ('active') {
        <p class="countdown">
          <strong>{{ plan().daysLeft }}</strong>
          {{ plan().daysLeft === 1 ? locale.t('plan.dayLeft') : locale.t('plan.daysLeft') }}
        </p>
        <ul class="tasks">
          <li>
            <div class="task-line">
              <span>{{ locale.t('plan.newQuestions') }}</span>
              @if (plan().newPerDay === 0) {
                <span class="ok-text">{{ locale.t('plan.allAttempted') }}</span>
              } @else if (plan().newLeftToday === 0) {
                <span class="ok-text">✓ {{ newToday() }} / {{ plan().newPerDay }}</span>
              } @else {
                <span>{{ newToday() }} / {{ plan().newPerDay }}</span>
              }
            </div>
            @if (plan().newPerDay > 0) {
              <div class="pbar"><span [style.width.%]="newPct()"></span></div>
            }
          </li>
          <li class="task-line">
            <a routerLink="/review">{{ locale.t('plan.reviews') }}</a>
            <span [class.ok-text]="plan().reviewsDue === 0">{{ plan().reviewsDue === 0 ? '✓' : plan().reviewsDue }}</span>
          </li>
          <li class="task-line">
            <a routerLink="/flashcards">{{ locale.t('plan.cards') }}</a>
            <span [class.ok-text]="cardsDue() === 0">{{ cardsDue() === 0 ? '✓' : cardsDue() }}</span>
          </li>
        </ul>
        @if (plan().bufferDays > 0) {
          <p class="dim small">{{ locale.t('plan.buffer').replace('{n}', '' + plan().bufferDays) }}</p>
        }
      }
    }

    @if (suggestions().length > 0) {
      <h3>{{ locale.t('plan.suggested') }}</h3>
      <ul class="suggest">
        @for (s of suggestions(); track s.id) {
          <li>
            <a [routerLink]="['/study', s.id]">{{ s.title }}</a>
            <span class="chip" [class.chip-weak]="s.reason === 'weak'" [class.chip-type]="s.reason !== 'weak'">
              {{ s.label }}
            </span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .head h2 { margin: 0; }
    .streak {
      font-weight: 700; padding: 2px 10px; border-radius: 999px;
      background: var(--warn-soft); color: var(--warn); font-size: 0.9rem;
    }
    .streak.pending { opacity: 0.75; }
    .nudge {
      margin: 10px 0 0; padding: 8px 12px; border-radius: 8px;
      background: var(--warn-soft); color: var(--warn); font-weight: 600;
    }
    .date-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 12px 0; }
    .date-row input {
      min-height: 36px; font: inherit; color: var(--text); background: var(--bg-elev);
      border: 1px solid var(--border); border-radius: 8px; padding: 0 8px;
    }
    .dim { color: var(--text-dim); font-size: 0.9rem; }
    .small { font-size: 0.82rem; margin: 8px 0 0; }
    .ok-text { color: var(--ok); font-weight: 600; }
    .exam-day { font-weight: 700; color: var(--primary); }
    .countdown { margin: 0 0 8px; }
    .countdown strong { font-size: 1.9rem; font-variant-numeric: tabular-nums; margin-right: 4px; }
    .tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; max-width: 520px; }
    .task-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-variant-numeric: tabular-nums; }
    .tasks .pbar { height: 8px; margin-top: 6px; }
    h3 { font-size: 0.95rem; margin: 16px 0 8px; }
    .suggest { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-width: 520px; }
    .suggest li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .suggest a { min-width: 0; overflow-wrap: anywhere; }
    .chip { flex-shrink: 0; }
  `,
})
export class PlanCard {
  protected readonly locale = inject(LocaleService);
  private readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);
  private readonly mock = inject(MockExamService);

  protected readonly todayInput = toDateInput(Date.now());
  protected readonly examDate = new FormControl(this.progress.settings().examDate ?? '', {
    nonNullable: true,
  });

  private readonly today = computed(() => {
    // Re-evaluated with progress changes, so a session past midnight picks up the new day.
    this.progress.activity();
    return dayNumber(Date.now());
  });

  protected readonly streak = computed(() => streakInfo(this.progress.activity(), this.today()));
  protected readonly nudgeDays = computed(() => {
    const d = this.streak().daysSinceActive;
    return d !== undefined && d >= NUDGE_AFTER_DAYS ? d : null;
  });

  protected readonly newToday = computed(
    () => this.progress.activity()[String(this.today())]?.q ?? 0,
  );

  private readonly coverage = computed<CoverageStat[]>(() => {
    const manifest = this.content.manifest();
    if (!manifest) return [];
    const out: CoverageStat[] = [];
    for (const d of manifest.domains) {
      if (d.lessonOnly) continue;
      for (const t of d.topics) {
        for (const s of t.subtopics) {
          const st = this.progress.statsForSubtopic(s.id, s.questionCount);
          out.push({ id: s.id, total: s.questionCount, attempted: st.attempted });
        }
      }
    }
    return out;
  });

  protected readonly plan = computed(() => {
    const cov = this.coverage();
    const unattempted = cov.reduce((sum, c) => sum + Math.max(0, c.total - c.attempted), 0);
    return dailyPlan({
      today: this.today(),
      examDay: parseDateInput(this.progress.settings().examDate),
      unattempted,
      newToday: this.newToday(),
      reviewsDue: this.progress.dueItems(this.today()).length,
    });
  });

  protected readonly newPct = computed(() => {
    const p = this.plan();
    return p.newPerDay > 0 ? Math.min(100, (this.newToday() / p.newPerDay) * 100) : 0;
  });

  protected readonly cardsDue = computed(() => this.progress.cardDueCount(this.today()));

  protected readonly suggestions = computed(() => {
    const cov = this.coverage();
    const byId = new Map(cov.map((c) => [c.id, c]));
    const refs = this.content.refById();
    return suggestSubtopics(cov, this.mock.weakAreas().map((w) => w.subtopicId)).map((s) => {
      const c = byId.get(s.id);
      const pct = c && c.total > 0 ? Math.round((c.attempted / c.total) * 100) : 0;
      const ref = refs.get(s.id);
      return {
        id: s.id,
        reason: s.reason,
        title: ref ? this.locale.lt(ref.subtopic.title) : s.id,
        label:
          s.reason === 'weak'
            ? this.locale.t('plan.weak')
            : pct === 0
              ? this.locale.t('plan.notStarted')
              : this.locale.t('plan.covered').replace('{n}', String(pct)),
      };
    });
  });

  constructor() {
    this.examDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      // Keep only complete, valid dates; an empty field clears the plan.
      if (value === '' || parseDateInput(value) !== undefined) {
        this.progress.updateSettings({ examDate: value || undefined });
      }
    });
    // Reflect changes made elsewhere (e.g. importing a backup) in the input.
    effect(() => {
      const stored = this.progress.settings().examDate ?? '';
      if (this.examDate.value !== stored) this.examDate.setValue(stored, { emitEvent: false });
    });
  }
}
