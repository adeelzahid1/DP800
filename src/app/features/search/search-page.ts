import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Lesson, QuestionBank } from '../../core/models/content.models';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';

interface SearchHit {
  kind: 'lesson' | 'question';
  subtopicId: string;
  subtopicTitle: string;
  /** For questions: anchor id. */
  questionId?: string;
  title: string;
  snippet: string;
}

@Component({
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>{{ locale.t('search.title') }}</h1>

    <form class="search-form" (submit)="$event.preventDefault(); run()">
      <label class="visually-hidden" for="search-input">{{ locale.t('search.placeholder') }}</label>
      <input
        id="search-input"
        type="search"
        [placeholder]="locale.t('search.placeholder')"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        autocomplete="off"
      />
      <button type="submit" class="btn btn-primary" [disabled]="query().trim().length < 2 || indexing()">
        {{ locale.t('search.go') }}
      </button>
    </form>

    @if (indexing()) {
      <p class="card" role="status">{{ locale.t('search.indexing') }}</p>
    } @else if (searched()) {
      <p class="dim" role="status">
        {{ locale.t('search.results').replace('{n}', '' + hits().length) }}
      </p>
      <div class="hits">
        @for (hit of hits(); track $index) {
          <a
            class="hit card"
            [routerLink]="['/study', hit.subtopicId]"
            [fragment]="hit.questionId ? 'q-' + hit.questionId : undefined"
          >
            <span class="chip" [class.chip-type]="hit.kind === 'question'" [class.chip-ok]="hit.kind === 'lesson'">
              {{ locale.t('search.' + hit.kind) }}
            </span>
            <span class="hit-body">
              <strong>{{ hit.title }}</strong>
              <span class="snippet">{{ hit.snippet }}</span>
              <span class="hit-topic">{{ hit.subtopicTitle }}</span>
            </span>
          </a>
        } @empty {
          <p class="card">{{ locale.t('search.none') }}</p>
        }
      </div>
    }
  `,
  styles: `
    .search-form { display: flex; gap: 8px; margin-bottom: 16px; }
    .search-form input { flex: 1; min-width: 0; }
    .dim { color: var(--text-dim); font-size: 0.9rem; }
    .hits { display: flex; flex-direction: column; gap: 10px; }
    .hit { display: flex; gap: 12px; align-items: flex-start; text-decoration: none; color: var(--text); }
    .hit:hover { border-color: var(--primary); }
    .hit-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .snippet { color: var(--text-dim); font-size: 0.9rem; overflow-wrap: anywhere; }
    .hit-topic { color: var(--primary); font-size: 0.8rem; }
  `,
})
export class SearchPage {
  protected readonly locale = inject(LocaleService);
  private readonly content = inject(ContentService);

  protected readonly query = signal('');
  protected readonly indexing = signal(false);
  protected readonly searched = signal(false);
  protected readonly hits = signal<SearchHit[]>([]);

  private index: { lessons: Map<string, Lesson>; banks: Map<string, QuestionBank> } | null = null;

  protected readonly ready = computed(() => this.content.manifest() !== null);

  protected async run(): Promise<void> {
    const q = this.query().trim().toLowerCase();
    if (q.length < 2) return;
    if (!this.index) {
      this.indexing.set(true);
      await this.buildIndex();
      this.indexing.set(false);
    }
    const hits: SearchHit[] = [];
    const refs = this.content.refById();
    const snippetOf = (text: string): string => {
      const i = text.toLowerCase().indexOf(q);
      if (i < 0) return text.slice(0, 120);
      const start = Math.max(0, i - 50);
      return (start > 0 ? '…' : '') + text.slice(start, i + q.length + 70) + '…';
    };

    for (const [subId, lesson] of this.index!.lessons) {
      const ref = refs.get(subId);
      const subTitle = ref ? this.locale.lt(ref.subtopic.title) : subId;
      const all = [
        this.locale.lt(lesson.title),
        ...lesson.sections.map((s) => `${this.locale.lt(s.heading)} ${this.locale.lt(s.body)}`),
        ...(lesson.prerequisiteRecap ?? []).map(
          (s) => `${this.locale.lt(s.heading)} ${this.locale.lt(s.body)}`,
        ),
        ...lesson.examTips.map((t) => this.locale.lt(t)),
      ].join(' ');
      if (all.toLowerCase().includes(q)) {
        hits.push({
          kind: 'lesson',
          subtopicId: subId,
          subtopicTitle: subTitle,
          title: this.locale.lt(lesson.title),
          snippet: snippetOf(all),
        });
      }
    }

    for (const [subId, bank] of this.index!.banks) {
      const ref = refs.get(subId);
      const subTitle = ref ? this.locale.lt(ref.subtopic.title) : subId;
      for (const question of bank.questions) {
        const all = [
          this.locale.lt(question.text),
          question.code ?? '',
          ...(question.options ?? []).map((o) => this.locale.lt(o.text)),
          this.locale.lt(question.explanation),
        ].join(' ');
        if (all.toLowerCase().includes(q)) {
          hits.push({
            kind: 'question',
            subtopicId: subId,
            subtopicTitle: subTitle,
            questionId: question.id,
            title: this.locale.lt(question.text).slice(0, 110),
            snippet: snippetOf(all),
          });
          if (hits.length > 200) break;
        }
      }
      if (hits.length > 200) break;
    }

    this.hits.set(hits);
    this.searched.set(true);
  }

  private async buildIndex(): Promise<void> {
    const lessons = new Map<string, Lesson>();
    const banks = new Map<string, QuestionBank>();
    const refs = this.content.subtopicRefs();
    await Promise.all(
      refs.map(async (ref) => {
        const [lesson, bank] = await Promise.all([
          this.content.getLesson(ref.subtopic).catch(() => null),
          this.content.getBank(ref.subtopic).catch(() => null),
        ]);
        if (lesson) lessons.set(ref.subtopic.id, lesson);
        if (bank && bank.questions.length > 0) banks.set(ref.subtopic.id, bank);
      }),
    );
    this.index = { lessons, banks };
  }
}
