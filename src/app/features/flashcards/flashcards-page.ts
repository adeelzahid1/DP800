import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { LocaleService } from '../../core/services/locale.service';
import { ProgressService } from '../../core/services/progress.service';
import {
  Flashcard,
  buildDeck,
  cardsForLesson,
  deckCounts,
} from '../../core/utils/flashcards';
import { createRng, shuffled } from '../../core/utils/rng';
import { dayNumber } from '../../core/utils/srs';
import { RichText } from '../../shared/rich-text';

type SizeChoice = '10' | '20' | '50' | 'all';

/** Horizontal drag (px) that counts as a swipe answer. */
const SWIPE_PX = 90;

/** Flashcards built from lesson exam tips, scheduled with the same Leitner boxes as questions. */
@Component({
  selector: 'app-flashcards-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RichText],
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    <h1>{{ locale.t('cards.title') }}</h1>

    @switch (phase()) {
      @case ('setup') {
        <section class="card setup">
          <p class="dim">{{ locale.t('cards.intro') }}</p>
          <div class="row">
            <label for="cards-scope">{{ locale.t('cards.scope') }}</label>
            <select id="cards-scope" (change)="onScope($event)">
              <option value="" [selected]="!subtopicId()">{{ locale.t('cards.allSubtopics') }}</option>
              @for (d of content.manifest()?.domains ?? []; track d.id) {
                <optgroup [label]="locale.lt(d.title)">
                  @for (t of d.topics; track t.id) {
                    @for (s of t.subtopics; track s.id) {
                      <option [value]="s.id" [selected]="s.id === subtopicId()">{{ locale.lt(s.title) }}</option>
                    }
                  }
                </optgroup>
              }
            </select>
          </div>

          @if (loading()) {
            <p class="dim" role="status">{{ locale.t('review.loading') }}</p>
          } @else if (loadError()) {
            <p class="err-text" role="alert">{{ loadError() }}</p>
          } @else {
            <ul class="counts">
              <li><strong>{{ counts().due }}</strong> {{ locale.t('cards.due') }}</li>
              <li><strong>{{ counts().fresh }}</strong> {{ locale.t('cards.new') }}</li>
              <li><strong>{{ counts().total }}</strong> {{ locale.t('cards.total') }}</li>
            </ul>
            <div class="row">
              <label for="cards-size">{{ locale.t('cards.size') }}</label>
              <select id="cards-size" [value]="size()" (change)="onSize($event)">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="all">{{ locale.t('review.all') }}</option>
              </select>
              <label class="check">
                <input type="checkbox" [checked]="cram()" (change)="cram.set(!cram())" />
                {{ locale.t('cards.cram') }}
              </label>
            </div>
            <div class="actions">
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="deckSize() === 0"
                (click)="start()"
              >
                {{ locale.t('cards.start').replace('{n}', '' + deckSize()) }}
              </button>
            </div>
            @if (deckSize() === 0) {
              <p class="dim">{{ locale.t('cards.nothingDue') }}</p>
            }
          }
        </section>
        <p class="dim keys">{{ locale.t('cards.keys') }}</p>
      }

      @case ('running') {
        @if (current(); as card) {
          <div class="run-head">
            <span class="counter" aria-live="polite">
              {{ locale.t('review.progress').replace('{i}', '' + (index() + 1)).replace('{n}', '' + deck().length) }}
            </span>
            <div class="pbar"><span [style.width.%]="(index() / deck().length) * 100"></span></div>
            <button type="button" class="btn btn-sm" (click)="phase.set('done')">{{ locale.t('review.end') }}</button>
          </div>

          <!-- A fresh element per card, so the next card never animates in from its answer side. -->
          @for (c of [card]; track c.id) {
            <div
              class="flashcard"
              [class.flipped]="flipped()"
              [class.dragging]="dragging()"
              [style.transform]="dragTransform()"
              (pointerdown)="onPointerDown($event)"
              (pointermove)="onPointerMove($event)"
              (pointerup)="onPointerUp($event)"
              (pointercancel)="resetDrag()"
            >
              <div class="inner">
                <div class="face front" [attr.aria-hidden]="flipped()">
                  <span class="chip chip-type">{{ subtopicTitle(card.subtopic) }}</span>
                  <p class="prompt">{{ locale.lt(card.front) }}</p>
                  <span class="hint dim">{{ locale.t('cards.tapToFlip') }}</span>
                </div>
                <div class="face back" [attr.aria-hidden]="!flipped()">
                  <span class="chip chip-type">{{ locale.t('cards.answer') }}</span>
                  <p class="prompt-small dim">{{ locale.lt(card.front) }}</p>
                  <app-rich-text class="tip" [text]="card.back" />
                </div>
              </div>
              @if (swipeHint(); as hint) {
                <span class="swipe-hint" [class.yes]="hint === 'yes'">
                  {{ hint === 'yes' ? locale.t('cards.knew') : locale.t('cards.didntKnow') }}
                </span>
              }
            </div>
          }

          <div class="card-actions">
            @if (!flipped()) {
              <button type="button" class="btn btn-primary" (click)="flip()">{{ locale.t('cards.show') }}</button>
            } @else {
              <button type="button" class="btn btn-no" (click)="answer(false)">✗ {{ locale.t('cards.didntKnow') }}</button>
              <button type="button" class="btn btn-yes" (click)="answer(true)">✓ {{ locale.t('cards.knew') }}</button>
            }
          </div>
          <p class="sr-status visually-hidden" aria-live="polite">{{ flipped() ? locale.lt(card.back) : '' }}</p>
        }
      }

      @case ('done') {
        <section class="card summary">
          <h2>{{ locale.t('review.summary') }}</h2>
          <ul class="counts">
            <li><strong class="ok-text">{{ knewCount() }}</strong> {{ locale.t('cards.knew') }}</li>
            <li><strong class="err-text">{{ results().length - knewCount() }}</strong> {{ locale.t('cards.didntKnow') }}</li>
            <li><strong>{{ deck().length - results().length }}</strong> {{ locale.t('review.skipped') }}</li>
          </ul>
          @if (results().length - knewCount() > 0) {
            <p class="dim">{{ locale.t('cards.againHint') }}</p>
          }
          <div class="actions">
            <button type="button" class="btn btn-primary" (click)="phase.set('setup')">{{ locale.t('cards.again') }}</button>
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
    .setup p:first-child { margin-top: 0; }
    .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 10px 0; }
    .row select { min-height: 36px; max-width: 100%; }
    #cards-scope { flex: 1; min-width: 0; }
    .check { display: inline-flex; align-items: center; gap: 6px; }
    .counts { list-style: none; margin: 12px 0; padding: 0; display: flex; gap: 22px; flex-wrap: wrap; }
    .counts strong { font-size: 1.5rem; font-variant-numeric: tabular-nums; margin-right: 4px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .keys { margin-top: 10px; }
    .summary h2 { margin-top: 0; }

    .run-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .counter { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .run-head .pbar { flex: 1; height: 8px; }

    .flashcard {
      position: relative; perspective: 1200px; cursor: pointer; user-select: none;
      touch-action: pan-y; transition: transform 0.2s ease-out;
    }
    .flashcard.dragging { transition: none; }
    .inner {
      display: grid; transform-style: preserve-3d; transition: transform 0.4s ease;
    }
    .flipped .inner { transform: rotateY(180deg); }
    .face {
      grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden;
      background: var(--bg-elev); border: 1px solid var(--border); border-radius: 14px;
      box-shadow: var(--shadow); padding: 20px; min-height: 240px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .back { transform: rotateY(180deg); border-color: var(--primary); }
    .chip { align-self: flex-start; }
    .prompt { font-size: 1.25rem; font-weight: 600; margin: auto 0; overflow-wrap: anywhere; }
    .prompt-small { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; }
    .tip { font-size: 1.1rem; overflow-wrap: anywhere; }
    .hint { text-align: center; }
    .swipe-hint {
      position: absolute; top: 12px; right: 12px; padding: 4px 10px; border-radius: 999px;
      font-weight: 700; background: var(--err-soft); color: var(--err); pointer-events: none;
    }
    .swipe-hint.yes { left: 12px; right: auto; background: var(--ok-soft); color: var(--ok); }
    .card-actions { display: flex; justify-content: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
    .card-actions .btn { min-width: 9rem; }
    .btn-yes { border-color: var(--ok); color: var(--ok); }
    .btn-no { border-color: var(--err); color: var(--err); }
    @media (prefers-reduced-motion: reduce) {
      .inner, .flashcard { transition: none; }
    }
  `,
})
export class FlashcardsPage {
  protected readonly locale = inject(LocaleService);
  protected readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);
  private readonly router = inject(Router);

  /** Route param: limit the deck to one subtopic. */
  readonly subtopicId = input<string>();

  protected readonly phase = signal<'setup' | 'running' | 'done'>('setup');
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  /** Every card in the current scope. */
  private readonly scopeCards = signal<Flashcard[]>([]);
  protected readonly size = signal<SizeChoice>('20');
  protected readonly cram = signal(false);

  protected readonly deck = signal<Flashcard[]>([]);
  protected readonly index = signal(0);
  protected readonly flipped = signal(false);
  /** One entry per answered card: true = knew it. */
  protected readonly results = signal<boolean[]>([]);

  // swipe state
  protected readonly dragX = signal(0);
  protected readonly dragging = signal(false);
  private startX = 0;
  private pointerId: number | null = null;

  protected readonly counts = computed(() =>
    deckCounts(this.scopeCards(), this.progress.cards(), dayNumber(Date.now())),
  );

  private readonly limit = computed(() =>
    this.size() === 'all' ? Number.MAX_SAFE_INTEGER : Number(this.size()),
  );

  protected readonly deckSize = computed(
    () =>
      buildDeck(
        this.scopeCards(),
        this.progress.cards(),
        dayNumber(Date.now()),
        this.limit(),
        this.cram(),
      ).length,
  );

  protected readonly current = computed(() => this.deck()[this.index()] ?? null);
  protected readonly knewCount = computed(() => this.results().filter((r) => r).length);

  protected readonly dragTransform = computed(() => {
    const x = this.dragX();
    return x === 0 ? null : `translateX(${x}px) rotate(${x / 30}deg)`;
  });
  protected readonly swipeHint = computed<'yes' | 'no' | null>(() => {
    const x = this.dragX();
    if (!this.flipped() || Math.abs(x) < SWIPE_PX / 2) return null;
    return x > 0 ? 'yes' : 'no';
  });

  constructor() {
    // (Re)load the cards whenever the scope or the manifest changes.
    effect(() => {
      const id = this.subtopicId();
      const refs = this.content.subtopicRefs();
      if (refs.length === 0) return;
      const scope = id ? refs.filter((r) => r.subtopic.id === id) : refs;
      this.loading.set(true);
      this.loadError.set(null);
      this.phase.set('setup');
      void Promise.all([
        this.content.getFlashcardPrompts(),
        Promise.all(scope.map((r) => this.content.getLesson(r.subtopic))),
      ])
        .then(([prompts, lessons]) => {
          if (this.subtopicId() !== id) return;
          this.scopeCards.set(
            lessons.flatMap((l) => cardsForLesson(l.subtopic, l.examTips, prompts.prompts[l.subtopic])),
          );
          this.loading.set(false);
        })
        .catch((e: unknown) => {
          this.loadError.set(e instanceof Error ? e.message : String(e));
          this.loading.set(false);
        });
    });
  }

  protected onScope(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.router.navigate(value ? ['/flashcards', value] : ['/flashcards']);
  }

  protected onSize(event: Event): void {
    this.size.set((event.target as HTMLSelectElement).value as SizeChoice);
  }

  protected start(): void {
    const deck = buildDeck(
      this.scopeCards(),
      this.progress.cards(),
      dayNumber(Date.now()),
      this.limit(),
      this.cram(),
    );
    if (deck.length === 0) return;
    // Mix subtopics within the session; due cards were already picked first.
    this.deck.set(shuffled(deck, createRng(Date.now() % 2 ** 31)));
    this.index.set(0);
    this.flipped.set(false);
    this.results.set([]);
    this.phase.set('running');
  }

  protected flip(): void {
    this.flipped.update((f) => !f);
  }

  protected answer(knew: boolean): void {
    const card = this.current();
    if (!card || !this.flipped()) return;
    this.progress.recordCard(card.id, card.subtopic, knew);
    this.results.update((r) => [...r, knew]);
    this.flipped.set(false);
    this.dragX.set(0);
    if (this.index() + 1 < this.deck().length) this.index.update((i) => i + 1);
    else this.phase.set('done');
  }

  protected subtopicTitle(id: string): string {
    const ref = this.content.refById().get(id);
    return ref ? this.locale.lt(ref.subtopic.title) : id;
  }

  // ----- swipe ---------------------------------------------------------------

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.dragging.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    // Only answered (flipped) cards can be swiped away; the front just wiggles a little.
    const dx = event.clientX - this.startX;
    this.dragX.set(this.flipped() ? dx : dx / 6);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.startX;
    this.resetDrag();
    if (this.flipped() && Math.abs(dx) >= SWIPE_PX) this.answer(dx > 0);
    else if (Math.abs(dx) < 8) this.flip();
  }

  protected resetDrag(): void {
    this.pointerId = null;
    this.dragging.set(false);
    this.dragX.set(0);
  }

  // ----- keyboard ------------------------------------------------------------

  protected onKey(event: KeyboardEvent): void {
    if (this.phase() !== 'running') return;
    const target = event.target as HTMLElement;
    const tag = target.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    switch (event.key) {
      case ' ':
      case 'Enter':
        if (tag === 'BUTTON' || tag === 'A') return;
        event.preventDefault();
        this.flip();
        break;
      case '1':
        this.answer(true);
        break;
      case '2':
        this.answer(false);
        break;
    }
  }
}
