import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { CaseStudy, Question } from '../../../core/models/content.models';
import { QuestionProgress } from '../../../core/models/progress.models';
import { LocaleService } from '../../../core/services/locale.service';
import { ProgressService } from '../../../core/services/progress.service';
import { Response, isAnswered, isCorrect } from '../../../core/utils/grade';
import { dayNumber } from '../../../core/utils/srs';
import { CodeBlock } from '../../../shared/code-block';
import { RichText } from '../../../shared/rich-text';
import { QuestionInput } from './question-input';

/** One question in study mode: input + feedback + explanation + example. */
@Component({
  selector: 'app-question-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeBlock, RichText, QuestionInput, ReactiveFormsModule],
  host: {
    '[class.current]': 'current()',
    '[attr.id]': '"q-" + q().id',
  },
  template: `
    <header class="q-head">
      <span class="q-num">{{ locale.t('q.question') }} {{ index() + 1 }}</span>
      <span class="chip" [class]="'chip chip-' + q().difficulty">{{ locale.t('diff.' + q().difficulty) }}</span>
      <span class="chip chip-type">{{ locale.t('type.' + q().type) }}</span>
      @if (prog()?.lastCorrect === true) {
        <span class="chip chip-ok">{{ locale.t('q.correct') }}</span>
      } @else if (prog()?.lastCorrect === false) {
        <span class="chip chip-weak">{{ locale.t('q.incorrect') }}</span>
      }
      <span class="spacer"></span>
      <button
        type="button"
        class="icon-btn"
        [class.on]="prog()?.bookmarked"
        (click)="progress.toggleBookmark(q().id, q().subtopic)"
        [attr.aria-pressed]="prog()?.bookmarked ?? false"
        [attr.aria-label]="locale.t('q.bookmark')"
        [title]="locale.t('q.bookmark')"
      >{{ prog()?.bookmarked ? '★' : '☆' }}</button>
      <button
        type="button"
        class="icon-btn"
        [class.on]="prog()?.read"
        (click)="toggleRead()"
        [attr.aria-pressed]="prog()?.read ?? false"
        [attr.aria-label]="locale.t('q.markRead')"
        [title]="locale.t('q.markRead')"
      >{{ prog()?.read ? '◉' : '○' }}</button>
      <button
        type="button"
        class="icon-btn"
        [class.on]="!!prog()?.note"
        (click)="editingNote() ? cancelNote() : openNote()"
        [attr.aria-expanded]="editingNote()"
        [attr.aria-label]="locale.t('q.note')"
        [title]="locale.t('q.note')"
      >✎</button>
    </header>

    @if (caseStudy(); as cs) {
      <aside class="case-box">
        <h4>{{ locale.t('q.caseStudy') }}: {{ locale.lt(cs.title) }}</h4>
        <app-rich-text [text]="cs.scenario" />
        @if (cs.code) {
          <app-code-block [code]="cs.code" />
        }
      </aside>
    }

    <div class="q-text">
      <app-rich-text [text]="q().text" />
      @if (q().code) {
        <app-code-block [code]="q().code!" [lang]="q().codeLang ?? 'sql'" />
      }
    </div>

    <app-question-input
      #qinput
      [q]="q()"
      [value]="response()"
      [disabled]="submitted()"
      [showCorrect]="revealed()"
      (valueChange)="response.set($event)"
    />

    <div class="q-actions">
      @if (!submitted()) {
        <div class="confidence" role="group" [attr.aria-label]="locale.t('q.confidence')">
          <button
            type="button"
            class="seg"
            [class.on]="!guessed()"
            [attr.aria-pressed]="!guessed()"
            (click)="setConfidence('sure')"
            [title]="locale.t('q.sureHint')"
          >{{ locale.t('q.sure') }}</button>
          <button
            type="button"
            class="seg"
            [class.on]="guessed()"
            [attr.aria-pressed]="guessed()"
            (click)="setConfidence('guess')"
            [title]="locale.t('q.guessHint')"
          >{{ locale.t('q.guess') }}</button>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="!canSubmit()"
          (click)="submit()"
        >{{ locale.t('q.check') }}</button>
      } @else {
        <span class="verdict" [class.ok]="lastResult()" [class.err]="!lastResult()" role="status">
          {{ lastResult() ? locale.t('q.correctFb') : locale.t('q.incorrectFb') }}
        </span>
        @if (nextReviewLabel(); as label) {
          <span class="next-review">{{ label }}</span>
        }
        <button type="button" class="btn" (click)="retry()">{{ locale.t('q.tryAgain') }}</button>
      }
      <span class="spacer"></span>
      <button type="button" class="btn btn-sm" (click)="toggleAnswer()">
        {{ showAnswerEff() ? locale.t('q.hideAnswer') : locale.t('q.showAnswer') }}
      </button>
      @if (q().example || q().exampleCode) {
        <button type="button" class="btn btn-sm" (click)="toggleExample()">
          {{ showExampleEff() ? locale.t('q.hideExample') : locale.t('q.showExample') }}
        </button>
      }
      <button type="button" class="btn btn-sm" (click)="resetQuestion()">{{ locale.t('q.reset') }}</button>
    </div>

    @if (editingNote()) {
      <form class="note-form" (ngSubmit)="saveNote()" (keydown)="onNoteKey($event)">
        <label class="note-label" [attr.for]="'note-' + q().id">{{ locale.t('q.noteLabel') }}</label>
        <textarea
          #noteBox
          [id]="'note-' + q().id"
          rows="3"
          [formControl]="noteCtrl"
          [attr.maxlength]="noteMax"
          [placeholder]="locale.t('q.notePlaceholder')"
        ></textarea>
        <div class="note-actions">
          <span class="note-count">{{ noteLength() }} / {{ noteMax }}</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-sm" (click)="cancelNote()">{{ locale.t('q.noteCancel') }}</button>
          <button type="submit" class="btn btn-sm btn-primary" [disabled]="noteCtrl.invalid">
            {{ locale.t('q.noteSave') }}
          </button>
        </div>
      </form>
    } @else if (prog()?.note) {
      <aside class="note-view">
        <span class="note-label">{{ locale.t('q.noteLabel') }}</span>
        <p>{{ prog()?.note }}</p>
        <button type="button" class="btn btn-sm" (click)="openNote()">{{ locale.t('q.noteEdit') }}</button>
      </aside>
    }

    @if (revealed()) {
      <section class="explain">
        <h4>{{ locale.t('q.explanation') }}</h4>
        <app-rich-text [text]="q().explanation" />
        @if (q().sources.length > 0) {
          <p class="sources">
            {{ locale.t('q.sources') }}:
            @for (s of q().sources; track s; let last = $last) {
              <a [href]="s" target="_blank" rel="noopener">{{ hostOf(s) }}</a>@if (!last) {<span> · </span>}
            }
          </p>
        }
      </section>
    }

    @if (showExampleEff() && (q().example || q().exampleCode)) {
      <section class="example">
        <h4>{{ locale.t('q.example') }}</h4>
        @if (q().example) {
          <app-rich-text [text]="q().example!" />
        }
        @if (q().exampleCode) {
          <app-code-block [code]="q().exampleCode!" />
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block; background: var(--bg-elev); border: 1px solid var(--border);
      border-radius: 12px; padding: 16px; box-shadow: var(--shadow); scroll-margin-top: 80px;
    }
    :host(.current) { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft), var(--shadow); }
    .q-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .q-num { font-weight: 700; color: var(--text-dim); font-size: 0.9rem; }
    .spacer { flex: 1; }
    .icon-btn {
      border: 1px solid var(--border); background: transparent; color: var(--text-dim);
      border-radius: 8px; min-width: 36px; min-height: 36px; cursor: pointer; font-size: 1rem;
    }
    .icon-btn.on { color: var(--warn); border-color: var(--warn); }
    .case-box {
      border-left: 4px solid var(--accent); background: var(--bg-sunken);
      border-radius: 0 10px 10px 0; padding: 10px 14px; margin-bottom: 10px;
    }
    .case-box h4 { margin: 0 0 6px; color: var(--accent); font-size: 0.9rem; }
    .q-text { margin-bottom: 12px; }
    .q-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .verdict { font-weight: 700; }
    .next-review { font-size: 0.85rem; color: var(--text-dim); }
    .confidence {
      display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
    }
    .seg {
      border: 0; background: transparent; color: var(--text-dim); cursor: pointer;
      padding: 0 12px; min-height: 36px; font: inherit; font-size: 0.88rem;
    }
    .seg + .seg { border-left: 1px solid var(--border); }
    .seg.on { background: var(--primary-soft); color: var(--text); font-weight: 600; }
    .verdict.ok { color: var(--ok); }
    .verdict.err { color: var(--err); }
    .explain, .example {
      margin-top: 14px; border-top: 1px dashed var(--border); padding-top: 10px;
    }
    .explain h4, .example h4 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); }
    .sources { font-size: 0.82rem; color: var(--text-dim); }
    .note-form, .note-view {
      margin-top: 12px; border: 1px solid var(--border); border-left: 4px solid var(--warn);
      border-radius: 0 10px 10px 0; background: var(--bg-sunken); padding: 10px 12px;
    }
    .note-label {
      display: block; font-size: 0.8rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 6px;
    }
    .note-form textarea {
      width: 100%; box-sizing: border-box; resize: vertical; min-height: 4.5em;
      font: inherit; color: var(--text); background: var(--bg-elev);
      border: 1px solid var(--border); border-radius: 8px; padding: 8px;
    }
    .note-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .note-count { font-size: 0.8rem; color: var(--text-dim); font-variant-numeric: tabular-nums; }
    .note-view p { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
  `,
})
export class QuestionCard {
  protected readonly locale = inject(LocaleService);
  protected readonly progress = inject(ProgressService);
  private readonly el = inject(ElementRef<HTMLElement>);

  readonly q = input.required<Question>();
  readonly index = input.required<number>();
  readonly caseStudy = input<CaseStudy | null>(null);
  /** Global visibility defaults (from settings / page switch). */
  readonly globalShowAnswer = input(true);
  readonly globalShowExample = input(true);
  readonly current = input(false);

  /** Emits whether the submitted answer was correct. */
  readonly answeredChange = output<boolean>();

  private readonly qinput = viewChild<QuestionInput>('qinput');
  private readonly noteBox = viewChild<ElementRef<HTMLTextAreaElement>>('noteBox');
  private readonly injector = inject(Injector);

  protected readonly noteMax = ProgressService.NOTE_MAX;
  protected readonly noteCtrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(ProgressService.NOTE_MAX)],
  });
  protected readonly noteLength = toSignal(this.noteCtrl.valueChanges.pipe(map((v) => v.length)), {
    initialValue: 0,
  });
  protected readonly editingNote = signal(false);

  protected readonly response = signal<Response>({});
  protected readonly submitted = signal(false);
  protected readonly lastResult = signal(false);
  /** Learner marked the current attempt as a guess (spaced repetition won't promote it). */
  protected readonly guessed = signal(false);
  /** null = follow global toggle. */
  private readonly showAnswerLocal = signal<boolean | null>(null);
  private readonly showExampleLocal = signal<boolean | null>(null);

  protected readonly prog = computed<QuestionProgress | undefined>(() => {
    return this.progress.progress()[this.q().id] as QuestionProgress | undefined;
  });

  protected readonly showAnswerEff = computed(
    () => this.showAnswerLocal() ?? this.globalShowAnswer(),
  );
  protected readonly showExampleEff = computed(
    () => this.showExampleLocal() ?? this.globalShowExample(),
  );
  /** Answer/explanation revealed: by toggle or after submitting. */
  protected readonly revealed = computed(() => this.showAnswerEff() || this.submitted());

  protected readonly canSubmit = computed(() => isAnswered(this.q(), this.response()));

  /** "Next review: …" after an attempt, from the scheduled due day. */
  protected readonly nextReviewLabel = computed(() => {
    const due = this.prog()?.dueDay;
    if (due === undefined) return null;
    const days = due - dayNumber(Date.now());
    if (days <= 0) return this.locale.t('q.nextToday');
    if (days === 1) return this.locale.t('q.nextTomorrow');
    return this.locale.t('q.nextInDays').replace('{n}', String(days));
  });

  constructor() {
    afterNextRender(() => {
      if (!('IntersectionObserver' in window)) return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && this.progress.settings().autoMarkRead && !this.prog()?.read) {
              this.progress.markRead(this.q().id, this.q().subtopic, true);
            }
          }
        },
        { threshold: 0.6 },
      );
      observer.observe(this.el.nativeElement);
    });
  }

  protected hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  protected submit(): void {
    const ok = isCorrect(this.q(), this.response());
    this.lastResult.set(ok);
    this.submitted.set(true);
    this.progress.recordAttempt(this.q().id, this.q().subtopic, ok, this.guessed());
    this.answeredChange.emit(ok);
  }

  protected retry(): void {
    this.submitted.set(false);
    this.response.set({});
    this.guessed.set(false);
  }

  protected resetQuestion(): void {
    this.submitted.set(false);
    this.response.set({});
    this.guessed.set(false);
    this.progress.resetQuestion(this.q().id);
  }

  protected toggleRead(): void {
    this.progress.markRead(this.q().id, this.q().subtopic, !(this.prog()?.read ?? false));
  }

  /** Open the note editor (also the T shortcut on the study page). */
  openNote(): void {
    this.noteCtrl.setValue(this.prog()?.note ?? '');
    this.editingNote.set(true);
    afterNextRender(() => this.noteBox()?.nativeElement.focus(), { injector: this.injector });
  }

  protected saveNote(): void {
    if (this.noteCtrl.invalid) return;
    this.progress.setNote(this.q().id, this.q().subtopic, this.noteCtrl.value);
    this.editingNote.set(false);
  }

  protected cancelNote(): void {
    this.editingNote.set(false);
  }

  protected onNoteKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.saveNote();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelNote();
    }
  }

  toggleAnswer(): void {
    this.showAnswerLocal.set(!this.showAnswerEff());
  }

  toggleExample(): void {
    this.showExampleLocal.set(!this.showExampleEff());
  }

  /** Keyboard shortcuts from the study page. */
  selectOption(i: number): void {
    this.qinput()?.selectByIndex(i);
  }

  /** Sure / guessing, set before checking the answer. */
  setConfidence(level: 'sure' | 'guess'): void {
    if (!this.submitted()) this.guessed.set(level === 'guess');
  }

  submitFromKeyboard(): void {
    if (!this.submitted() && this.canSubmit()) this.submit();
  }

  focusCard(): void {
    this.el.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
