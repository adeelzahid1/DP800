import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService, LoadedQuestion } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { ProgressService } from '../../core/services/progress.service';
import { NotebookEntry, NotebookKind, notebookEntries } from '../../core/utils/notebook';
import { createRng, shuffled } from '../../core/utils/rng';
import { PracticeRunner } from '../practice/practice-runner';
import { QuestionCard } from '../study/questions/question-card';

type Filter = 'all' | NotebookKind;

interface NotebookGroup {
  subtopicId: string;
  title: string;
  order: number;
  entries: NotebookEntry[];
}

const SNIPPET_MAX = 180;

/** Mistake notebook: wrong answers, lucky guesses and questions with notes, grouped by subtopic. */
@Component({
  selector: 'app-notebook-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PracticeRunner, QuestionCard],
  template: `
    <h1>{{ locale.t('notebook.title') }}</h1>

    @if (session(); as items) {
      <app-practice-runner [items]="items">
        <ng-container summary-actions>
          <button type="button" class="btn btn-primary" (click)="session.set(null)">
            {{ locale.t('notebook.back') }}
          </button>
          <a routerLink="/" class="btn">{{ locale.t('review.backDash') }}</a>
        </ng-container>
      </app-practice-runner>
    } @else {
      <p class="dim intro">{{ locale.t('notebook.intro') }}</p>

      @if (all().length === 0) {
        <section class="card">
          <h2>{{ locale.t('notebook.empty') }}</h2>
          <p class="dim">{{ locale.t('notebook.emptyHint') }}</p>
          <a routerLink="/study" class="btn btn-primary">{{ locale.t('dash.continueStudy') }}</a>
        </section>
      } @else {
        <div class="toolbar">
          <div class="filters" role="group" [attr.aria-label]="locale.t('notebook.filter')">
            @for (f of filterOptions; track f) {
              <button
                type="button"
                class="seg"
                [class.on]="filter() === f"
                [attr.aria-pressed]="filter() === f"
                (click)="filter.set(f)"
              >
                {{ locale.t('notebook.f.' + f) }} <span class="count">{{ counts()[f] }}</span>
              </button>
            }
          </div>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="visible().length === 0 || starting()"
            (click)="practice(visible())"
          >
            {{ locale.t('notebook.practice').replace('{n}', '' + visible().length) }}
          </button>
        </div>

        @if (loadError()) {
          <p class="err-text" role="alert">{{ loadError() }}</p>
        }

        @for (g of groups(); track g.subtopicId) {
          <section class="card group">
            <header class="group-head">
              <h2>{{ g.title }}</h2>
              <span class="spacer"></span>
              <a class="btn btn-sm" [routerLink]="['/study', g.subtopicId]">{{ locale.t('notebook.openStudy') }}</a>
              <button type="button" class="btn btn-sm" [disabled]="starting()" (click)="practice(g.entries)">
                {{ locale.t('notebook.practice').replace('{n}', '' + g.entries.length) }}
              </button>
            </header>
            <ul class="entries">
              @for (e of g.entries; track e.id) {
                <li>
                  <button
                    type="button"
                    class="entry"
                    [attr.aria-expanded]="expanded() === e.id"
                    (click)="toggle(e)"
                  >
                    <span class="snippet">{{ snippet(e.id) }}</span>
                    <span class="kinds">
                      @for (k of e.kinds; track k) {
                        <span class="chip" [class]="'chip kind-' + k">{{ locale.t('notebook.k.' + k) }}</span>
                      }
                    </span>
                  </button>
                  @if (e.note && expanded() !== e.id) {
                    <p class="note">✎ {{ e.note }}</p>
                  }
                  @if (expanded() === e.id) {
                    @if (loaded().get(e.id); as item) {
                      <app-question-card
                        class="inline-card"
                        [q]="item.q"
                        [index]="0"
                        [caseStudy]="item.caseStudy"
                        [globalShowAnswer]="false"
                        [globalShowExample]="false"
                      />
                    } @else {
                      <p class="dim" role="status">{{ locale.t('review.loading') }}</p>
                    }
                  }
                </li>
              }
            </ul>
          </section>
        } @empty {
          <p class="card dim">{{ locale.t('notebook.noneForFilter') }}</p>
        }
      }
    }
  `,
  styles: `
    .dim { color: var(--text-dim); font-size: 0.9rem; }
    .err-text { color: var(--err); }
    .intro { margin-top: -4px; }
    .toolbar {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
    }
    .filters {
      display: inline-flex; flex-wrap: wrap; border: 1px solid var(--border);
      border-radius: 8px; overflow: hidden;
    }
    .seg {
      border: 0; background: transparent; color: var(--text-dim); cursor: pointer;
      padding: 0 12px; min-height: 36px; font: inherit; font-size: 0.88rem;
    }
    .seg + .seg { border-left: 1px solid var(--border); }
    .seg.on { background: var(--primary-soft); color: var(--text); font-weight: 600; }
    .count { font-variant-numeric: tabular-nums; opacity: 0.75; }
    .group { margin-bottom: 14px; }
    .group-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .group-head h2 { margin: 0; font-size: 1.05rem; }
    .spacer { flex: 1; }
    .entries { list-style: none; margin: 0; padding: 0; }
    .entries li { border-top: 1px solid var(--border); padding: 8px 0; }
    .entry {
      display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
      background: transparent; border: 0; padding: 4px 0; cursor: pointer; color: var(--text);
      font: inherit;
    }
    .entry:hover .snippet { text-decoration: underline; }
    .snippet { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .kinds { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .kind-wrong { background: var(--err-soft); color: var(--err); }
    .kind-guessed { background: var(--warn-soft); color: var(--warn); }
    .kind-note { background: var(--primary-soft); color: var(--primary); }
    .note {
      margin: 4px 0 0; font-size: 0.88rem; color: var(--text-dim);
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .inline-card { margin-top: 8px; }
    @media (max-width: 640px) {
      .entry { flex-direction: column; gap: 4px; }
      .kinds { justify-content: flex-start; }
    }
  `,
})
export class NotebookPage {
  protected readonly locale = inject(LocaleService);
  private readonly progress = inject(ProgressService);
  private readonly content = inject(ContentService);

  protected readonly filterOptions: Filter[] = ['all', 'wrong', 'guessed', 'note'];
  protected readonly filter = signal<Filter>('all');
  protected readonly expanded = signal<string | null>(null);
  protected readonly session = signal<LoadedQuestion[] | null>(null);
  protected readonly starting = signal(false);
  protected readonly loadError = signal<string | null>(null);
  /** Questions loaded so far, for snippets and the inline card. */
  protected readonly loaded = signal<Map<string, LoadedQuestion>>(new Map());

  /** The open entry, kept visible even if answering it inline takes it out of the notebook. */
  private readonly openEntry = signal<NotebookEntry | null>(null);

  protected readonly all = computed(() => {
    const list = notebookEntries(this.progress.progress());
    const open = this.openEntry();
    if (open && !list.some((e) => e.id === open.id)) list.push(open);
    return list;
  });

  protected readonly counts = computed(() => {
    const c: Record<Filter, number> = { all: 0, wrong: 0, guessed: 0, note: 0 };
    for (const e of this.all()) {
      c.all++;
      for (const k of e.kinds) c[k]++;
    }
    return c;
  });

  protected readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.all() : this.all().filter((e) => e.kinds.includes(f));
  });

  protected readonly groups = computed<NotebookGroup[]>(() => {
    const refs = this.content.refById();
    const byId = new Map<string, NotebookGroup>();
    for (const e of this.visible()) {
      let g = byId.get(e.subtopic);
      if (!g) {
        const ref = refs.get(e.subtopic);
        g = {
          subtopicId: e.subtopic,
          title: ref ? this.locale.lt(ref.subtopic.title) : e.subtopic,
          order: ref?.index ?? Number.MAX_SAFE_INTEGER,
          entries: [],
        };
        byId.set(e.subtopic, g);
      }
      g.entries.push(e);
    }
    return [...byId.values()].sort((a, b) => a.order - b.order);
  });

  constructor() {
    // Fetch question text for entries we haven't loaded yet (banks are cached by ContentService).
    effect(() => {
      const entries = this.all();
      if (this.content.refById().size === 0) return;
      const have = untracked(this.loaded);
      const missing = entries.filter((e) => !have.has(e.id));
      if (missing.length === 0) return;
      this.content
        .loadQuestions(missing)
        .then((items) => {
          this.loaded.update((m) => {
            const next = new Map(m);
            for (const it of items) next.set(it.q.id, it);
            return next;
          });
        })
        .catch((e: unknown) => this.loadError.set(e instanceof Error ? e.message : String(e)));
    });
  }

  protected snippet(id: string): string {
    const item = this.loaded().get(id);
    if (!item) return id;
    const plain = this.locale
      .lt(item.q.text)
      .replace(/[*`_#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > SNIPPET_MAX ? plain.slice(0, SNIPPET_MAX - 1) + '…' : plain;
  }

  protected toggle(entry: NotebookEntry): void {
    const open = this.expanded() !== entry.id;
    this.expanded.set(open ? entry.id : null);
    this.openEntry.set(open ? entry : null);
  }

  protected async practice(entries: readonly NotebookEntry[]): Promise<void> {
    if (entries.length === 0) return;
    this.starting.set(true);
    this.loadError.set(null);
    try {
      const items = await this.content.loadQuestions(entries);
      if (items.length > 0) {
        this.expanded.set(null);
        this.openEntry.set(null);
        this.session.set(shuffled(items, createRng(Date.now() % 2 ** 31)));
        window.scrollTo({ top: 0 });
      }
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.starting.set(false);
    }
  }
}
