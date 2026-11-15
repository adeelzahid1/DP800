import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { MockExamService } from '../../core/services/mock-exam.service';
import { ProgressService } from '../../core/services/progress.service';

interface SubtopicRow {
  id: string;
  title: string;
  lessonOnly: boolean;
  readPct: number;
  attemptedPct: number;
  correctPct: number;
  weak: boolean;
}

interface TopicRow {
  id: string;
  title: string;
  subtopics: SubtopicRow[];
}

interface DomainRow {
  id: string;
  title: string;
  weightLabel: string;
  lessonOnly: boolean;
  topics: TopicRow[];
}

@Component({
  selector: 'app-topic-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <nav class="tree" [attr.aria-label]="locale.t('tree.label')">
      @for (domain of rows(); track domain.id) {
        <details class="domain" open>
          <summary>
            <span class="d-title">{{ domain.title }}</span>
            @if (domain.weightLabel) {
              <span class="d-weight">{{ domain.weightLabel }}</span>
            }
          </summary>
          @for (topic of domain.topics; track topic.id) {
            <details class="topic" [open]="containsActive(topic)">
              <summary>{{ topic.title }}</summary>
              <ul class="subs">
                @for (sub of topic.subtopics; track sub.id) {
                  <li>
                    <a
                      [routerLink]="['/study', sub.id]"
                      class="sub-link"
                      [class.active]="sub.id === activeId()"
                      [attr.aria-current]="sub.id === activeId() ? 'page' : null"
                      (click)="navigated.emit()"
                    >
                      <span class="sub-title">
                        {{ sub.title }}
                        @if (sub.weak) {
                          <span class="chip chip-weak">{{ locale.t('tree.weak') }}</span>
                        }
                      </span>
                      @if (!sub.lessonOnly) {
                        <span
                          class="sub-stats"
                          [title]="
                            locale.t('tree.read') + ' ' + sub.readPct + '% · ' +
                            locale.t('tree.attempted') + ' ' + sub.attemptedPct + '% · ' +
                            locale.t('tree.correct') + ' ' + sub.correctPct + '%'
                          "
                        >
                          <span class="pbar"><span [style.width.%]="sub.readPct"></span></span>
                          <span class="pbar"><span class="warn" [style.width.%]="sub.attemptedPct"></span></span>
                          <span class="pbar"><span class="ok" [style.width.%]="sub.correctPct"></span></span>
                        </span>
                      }
                    </a>
                  </li>
                }
              </ul>
            </details>
          }
        </details>
      }
      <div class="legend">
        <span><i class="dot p"></i>{{ locale.t('tree.read') }}</span>
        <span><i class="dot w"></i>{{ locale.t('tree.attempted') }}</span>
        <span><i class="dot g"></i>{{ locale.t('tree.correct') }}</span>
      </div>
    </nav>
  `,
  styles: `
    .tree { font-size: 0.9rem; }
    details.domain { margin-bottom: 6px; }
    details.domain > summary {
      display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
      font-weight: 700; cursor: pointer; padding: 8px; border-radius: 8px;
    }
    details.domain > summary:hover { background: var(--bg-sunken); }
    .d-weight { font-weight: 500; color: var(--text-dim); font-size: 0.78rem; }
    details.topic { margin-left: 10px; }
    details.topic > summary {
      cursor: pointer; font-weight: 600; padding: 6px 8px; border-radius: 8px; color: var(--text-dim);
    }
    details.topic > summary:hover { background: var(--bg-sunken); }
    .subs { list-style: none; margin: 0; padding: 0 0 4px 14px; }
    .sub-link {
      display: block; padding: 6px 8px; border-radius: 8px;
      text-decoration: none; color: var(--text);
    }
    .sub-link:hover { background: var(--bg-sunken); }
    .sub-link.active { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
    .sub-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .sub-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-top: 4px; }
    .legend { display: flex; gap: 12px; padding: 10px 8px 4px; color: var(--text-dim); font-size: 0.75rem; flex-wrap: wrap; }
    .legend span { display: inline-flex; align-items: center; gap: 4px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.p { background: var(--primary); }
    .dot.w { background: var(--warn); }
    .dot.g { background: var(--ok); }
  `,
})
export class TopicTree {
  protected readonly locale = inject(LocaleService);
  private readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);
  private readonly mock = inject(MockExamService);

  readonly activeId = input<string | null>(null);
  readonly navigated = output<void>();

  protected readonly rows = computed<DomainRow[]>(() => {
    const manifest = this.content.manifest();
    if (!manifest) return [];
    const weak = this.mock.weakSet();
    // Depend on progress so bars refresh live.
    this.progress.progress();
    return manifest.domains.map((d) => ({
      id: d.id,
      title: this.locale.lt(d.title),
      weightLabel: d.weightLow > 0 ? `${d.weightLow}–${d.weightHigh}%` : '',
      lessonOnly: !!d.lessonOnly,
      topics: d.topics.map((t) => ({
        id: t.id,
        title: this.locale.lt(t.title),
        subtopics: t.subtopics.map((s) => {
          const stats = this.progress.statsForSubtopic(s.id, s.questionCount);
          const pct = (n: number) => (stats.total > 0 ? Math.round((n / stats.total) * 100) : 0);
          return {
            id: s.id,
            title: this.locale.lt(s.title),
            lessonOnly: !s.questionFile,
            readPct: pct(stats.read),
            attemptedPct: pct(stats.attempted),
            correctPct: pct(stats.correct),
            weak: weak.has(s.id),
          };
        }),
      })),
    }));
  });

  protected containsActive(topic: TopicRow): boolean {
    const active = this.activeId();
    return !!active && topic.subtopics.some((s) => s.id === active);
  }
}
