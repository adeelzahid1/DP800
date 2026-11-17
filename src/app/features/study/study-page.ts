import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CaseStudy,
  Difficulty,
  Lesson,
  Question,
  QuestionBank,
  QuestionType,
} from '../../core/models/content.models';
import { ContentService, SubtopicRef } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { ProgressService } from '../../core/services/progress.service';
import { createRng, shuffled } from '../../core/utils/rng';
import { parseDateInput } from '../../core/utils/study-plan';
import { CodeBlock } from '../../shared/code-block';
import { RichText } from '../../shared/rich-text';
import { QuestionCard } from './questions/question-card';
import { TopicTree } from './topic-tree';

const ALL_TYPES: QuestionType[] = [
  'single',
  'multiple',
  'dragdrop-order',
  'dragdrop-match',
  'yesno',
  'dropdown',
];

type TriState = 'any' | 'yes' | 'no';

@Component({
  selector: 'app-study-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RichText, CodeBlock, QuestionCard, TopicTree],
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  templateUrl: './study-page.html',
  styleUrl: './study-page.css',
})
export class StudyPage {
  protected readonly locale = inject(LocaleService);
  protected readonly content = inject(ContentService);
  protected readonly progress = inject(ProgressService);
  private readonly router = inject(Router);

  /** Route param (component input binding). */
  readonly subtopicId = input<string>();

  protected readonly lesson = signal<Lesson | null>(null);
  protected readonly bank = signal<QuestionBank | null>(null);
  protected readonly loading = signal(true);
  protected readonly drawerOpen = signal(false);
  protected readonly helpOpen = signal(false);
  protected readonly currentIndex = signal(0);

  // ----- filters -----
  protected readonly fDifficulty = signal<Set<Difficulty>>(new Set());
  protected readonly fTypes = signal<Set<QuestionType>>(new Set());
  protected readonly fRead = signal<TriState>('any');
  protected readonly fAttempted = signal<TriState>('any');
  protected readonly fCorrect = signal<TriState>('any');
  protected readonly fBookmarked = signal(false);
  protected readonly allTypes = ALL_TYPES;
  protected readonly allDiffs: Difficulty[] = ['easy', 'medium', 'hard'];

  // ----- practice session -----
  protected readonly customCount = signal(15);
  protected readonly sessionRandom = signal(false);
  protected readonly sessionShuffleOptions = signal(false);
  /** Frozen question list for the running session; null = browse mode. */
  protected readonly session = signal<Question[] | null>(null);

  private readonly cards = viewChildren(QuestionCard);

  protected readonly ref = computed<SubtopicRef | null>(() => {
    const id = this.subtopicId();
    if (!id) return null;
    return this.content.refById().get(id) ?? null;
  });

  protected readonly prevRef = computed(() => {
    const id = this.subtopicId();
    return id ? this.content.neighbor(id, -1) : null;
  });
  protected readonly nextRef = computed(() => {
    const id = this.subtopicId();
    return id ? this.content.neighbor(id, 1) : null;
  });

  protected readonly filteredQuestions = computed<Question[]>(() => {
    const bank = this.bank();
    if (!bank) return [];
    const prog = this.progress.progress();
    const diffs = this.fDifficulty();
    const types = this.fTypes();
    return bank.questions.filter((q) => {
      if (diffs.size > 0 && !diffs.has(q.difficulty)) return false;
      if (types.size > 0 && !types.has(q.type)) return false;
      const p = prog[q.id];
      if (this.fRead() !== 'any' && (p?.read ?? false) !== (this.fRead() === 'yes')) return false;
      const attempted = (p?.attempts ?? 0) > 0;
      if (this.fAttempted() !== 'any' && attempted !== (this.fAttempted() === 'yes')) return false;
      if (this.fCorrect() !== 'any') {
        if (!attempted) return false;
        if ((p?.lastCorrect ?? false) !== (this.fCorrect() === 'yes')) return false;
      }
      if (this.fBookmarked() && !(p?.bookmarked ?? false)) return false;
      return true;
    });
  });

  /** What is actually rendered: the frozen session, or the filtered bank. */
  protected readonly visibleQuestions = computed<Question[]>(
    () => this.session() ?? this.filteredQuestions(),
  );

  protected readonly filtersActive = computed(
    () =>
      this.fDifficulty().size > 0 ||
      this.fTypes().size > 0 ||
      this.fRead() !== 'any' ||
      this.fAttempted() !== 'any' ||
      this.fCorrect() !== 'any' ||
      this.fBookmarked(),
  );

  constructor() {
    // Redirect to the first subtopic when none is selected.
    effect(() => {
      const id = this.subtopicId();
      const refs = this.content.subtopicRefs();
      if (!id && refs.length > 0) {
        void this.router.navigate(['/study', refs[0].subtopic.id], { replaceUrl: true });
      }
    });
    // Load lesson + bank when the subtopic changes.
    effect(() => {
      const ref = this.ref();
      if (!ref) return;
      this.loading.set(true);
      this.session.set(null);
      this.currentIndex.set(0);
      const sub = ref.subtopic;
      void Promise.all([
        this.content.getLesson(sub).catch(() => null),
        this.content.getBank(sub).catch(() => null),
      ]).then(([lesson, bank]) => {
        // Ignore stale loads after further navigation.
        if (this.ref()?.subtopic.id !== sub.id) return;
        this.lesson.set(lesson);
        this.bank.set(bank);
        this.loading.set(false);
      });
    });
  }

  /** "Verified: Nov 2026" from a YYYY-MM-DD date, in the user's locale. */
  protected verifiedLabel(date: string | undefined): string | null {
    const day = parseDateInput(date);
    if (day === undefined || !date) return null;
    const [y, m] = date.split('-').map(Number);
    const month = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    return this.locale.t('study.verified').replace('{d}', month);
  }

  protected caseFor(q: Question): CaseStudy | null {
    if (!q.caseId) return null;
    return this.bank()?.cases?.find((c) => c.id === q.caseId) ?? null;
  }

  // ----- filter helpers -----

  protected toggleDiff(d: Difficulty): void {
    this.fDifficulty.update((s) => {
      const next = new Set(s);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
    this.session.set(null);
  }

  protected toggleType(t: QuestionType): void {
    this.fTypes.update((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    this.session.set(null);
  }

  protected setTri(which: 'read' | 'attempted' | 'correct', event: Event): void {
    const v = (event.target as HTMLSelectElement).value as TriState;
    if (which === 'read') this.fRead.set(v);
    else if (which === 'attempted') this.fAttempted.set(v);
    else this.fCorrect.set(v);
    this.session.set(null);
  }

  protected clearFilters(): void {
    this.fDifficulty.set(new Set());
    this.fTypes.set(new Set());
    this.fRead.set('any');
    this.fAttempted.set('any');
    this.fCorrect.set('any');
    this.fBookmarked.set(false);
    this.session.set(null);
  }

  // ----- session -----

  protected readonly countChoice = signal<'10' | '20' | '50' | 'all' | 'custom'>('all');

  protected onCountChoice(event: Event): void {
    this.countChoice.set((event.target as HTMLSelectElement).value as never);
  }

  protected onCustomCount(event: Event): void {
    const n = Math.max(1, Number((event.target as HTMLInputElement).value) || 1);
    this.customCount.set(n);
  }

  protected startSession(): void {
    const rng = createRng(Date.now() % 2 ** 31);
    let qs = this.filteredQuestions().slice();
    if (this.sessionRandom()) qs = shuffled(qs, rng);
    const choice = this.countChoice();
    const n =
      choice === 'all' ? qs.length : choice === 'custom' ? this.customCount() : Number(choice);
    qs = qs.slice(0, Math.min(n, qs.length));
    if (this.sessionShuffleOptions()) {
      qs = qs.map((q) => {
        if (q.options) return { ...q, options: shuffled(q.options, rng) };
        if (q.items && q.type === 'dragdrop-order') return { ...q, items: shuffled(q.items, rng) };
        return q;
      });
    }
    this.session.set(qs);
    this.currentIndex.set(0);
  }

  protected endSession(): void {
    this.session.set(null);
  }

  protected resetTopicProgress(): void {
    const bank = this.bank();
    if (!bank) return;
    if (!confirm(this.locale.t('study.resetTopicConfirm'))) return;
    this.progress.resetQuestions(bank.questions.map((q) => q.id));
  }

  // ----- global toggles -----

  protected toggleGlobalAnswers(): void {
    const cur = this.progress.settings().showAnswers;
    this.progress.updateSettings({ showAnswers: !cur });
  }

  protected toggleGlobalExamples(): void {
    const cur = this.progress.settings().showExamples;
    this.progress.updateSettings({ showExamples: !cur });
  }

  protected toggleAutoRead(): void {
    const cur = this.progress.settings().autoMarkRead;
    this.progress.updateSettings({ autoMarkRead: !cur });
  }

  // ----- navigation & keyboard -----

  protected goTo(index: number): void {
    const qs = this.visibleQuestions();
    const clamped = Math.max(0, Math.min(qs.length - 1, index));
    this.currentIndex.set(clamped);
    this.cards()[clamped]?.focusCard();
  }

  protected onKey(event: KeyboardEvent): void {
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
      // Allow ? even from nowhere special, but not from text inputs.
      return;
    }
    const card = this.cards()[this.currentIndex()];
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.goTo(this.currentIndex() + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.goTo(this.currentIndex() - 1);
        break;
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
          card?.submitFromKeyboard();
        }
        break;
      case 'h':
      case 'H':
        card?.toggleAnswer();
        break;
      case 'x':
      case 'X':
        card?.toggleExample();
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
      case 'm':
      case 'M':
        if (card) this.progress.toggleBookmark(
          this.visibleQuestions()[this.currentIndex()].id,
          this.visibleQuestions()[this.currentIndex()].subtopic,
        );
        break;
      case 'n':
      case 'N': {
        const next = this.nextRef();
        if (next) void this.router.navigate(['/study', next.subtopic.id]);
        break;
      }
      case 'p':
      case 'P': {
        const prev = this.prevRef();
        if (prev) void this.router.navigate(['/study', prev.subtopic.id]);
        break;
      }
      case '?':
        this.helpOpen.set(true);
        break;
      case 'Escape':
        this.helpOpen.set(false);
        this.drawerOpen.set(false);
        break;
    }
  }

  protected onCardAnswered(index: number): void {
    this.currentIndex.set(index);
  }
}
