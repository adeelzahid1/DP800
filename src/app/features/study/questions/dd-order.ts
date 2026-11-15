import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Option } from '../../../core/models/content.models';
import { LocaleService } from '../../../core/services/locale.service';

/**
 * Ordering (sequence) drag & drop.
 * - Mouse/touch: drag rows via pointer events.
 * - Keyboard: focus a row, Space/Enter to grab, Arrow Up/Down to move, Space to drop, Esc to cancel.
 * - Up/Down buttons as an always-available fallback.
 */
@Component({
  selector: 'app-dd-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">{{ locale.t('dd.orderHint') }}</p>
    <ol class="dd-list" role="listbox" [attr.aria-label]="locale.t('dd.orderHint')">
      @for (id of order(); track id; let i = $index) {
        <li
          class="dd-row"
          role="option"
          [attr.aria-selected]="grabbed() === id"
          [class.grabbed]="grabbed() === id"
          [class.drag-over]="dragOverIndex() === i && draggingId() !== null"
          [class.correct]="showCorrect() && correctness()[i] === true"
          [class.incorrect]="showCorrect() && correctness()[i] === false"
          tabindex="0"
          (keydown)="onKey($event, id, i)"
          (pointerdown)="onPointerDown($event, id)"
          [attr.data-index]="i"
        >
          <span class="dd-handle" aria-hidden="true">⠿</span>
          <span class="dd-num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="dd-text">{{ textOf(id) }}</span>
          <span class="dd-btns">
            <button
              type="button"
              class="btn btn-sm"
              [disabled]="disabled() || i === 0"
              (click)="move(id, -1)"
              [attr.aria-label]="locale.t('dd.moveUp') + ': ' + textOf(id)"
            >↑</button>
            <button
              type="button"
              class="btn btn-sm"
              [disabled]="disabled() || i === order().length - 1"
              (click)="move(id, 1)"
              [attr.aria-label]="locale.t('dd.moveDown') + ': ' + textOf(id)"
            >↓</button>
          </span>
        </li>
      }
    </ol>
    <p class="visually-hidden" aria-live="polite">{{ announce() }}</p>
  `,
  styles: `
    .hint { color: var(--text-dim); font-size: 0.85rem; margin: 0 0 8px; }
    .dd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .dd-row {
      display: flex; align-items: center; gap: 10px;
      background: var(--bg-elev); border: 1.5px solid var(--border); border-radius: 10px;
      padding: 8px 10px; cursor: grab; touch-action: none; user-select: none;
    }
    .dd-row.grabbed { border-color: var(--primary); background: var(--primary-soft); }
    .dd-row.drag-over { border-style: dashed; border-color: var(--primary); }
    .dd-row.correct { border-color: var(--ok); background: var(--ok-soft); }
    .dd-row.incorrect { border-color: var(--err); background: var(--err-soft); }
    .dd-handle { color: var(--text-dim); font-size: 1.1rem; }
    .dd-num {
      background: var(--bg-sunken); border-radius: 6px; min-width: 24px; height: 24px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 0.8rem; font-weight: 700; color: var(--text-dim);
    }
    .dd-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .dd-btns { display: flex; gap: 4px; }
  `,
})
export class DdOrder {
  protected readonly locale = inject(LocaleService);

  readonly items = input.required<Option[]>();
  /** Current order as item ids (parent owns state). */
  readonly value = input.required<string[]>();
  readonly disabled = input(false);
  /** Review mode: show per-position correctness against `answerOrder`. */
  readonly showCorrect = input(false);
  readonly answerOrder = input<string[]>([]);

  readonly valueChange = output<string[]>();

  protected readonly grabbed = signal<string | null>(null);
  protected readonly draggingId = signal<string | null>(null);
  protected readonly dragOverIndex = signal<number | null>(null);
  protected readonly announce = signal('');

  protected readonly order = computed(() => {
    const v = this.value();
    if (v.length === this.items().length) return v;
    return this.items().map((i) => i.id);
  });

  protected readonly correctness = computed(() => {
    const ans = this.answerOrder();
    return this.order().map((id, i) => (ans.length ? ans[i] === id : undefined));
  });

  protected textOf(id: string): string {
    const item = this.items().find((i) => i.id === id);
    return item ? this.locale.lt(item.text) : id;
  }

  protected move(id: string, delta: number): void {
    if (this.disabled()) return;
    const order = this.order().slice();
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    this.valueChange.emit(order);
    this.announce.set(this.locale.t('dd.moved') + ` ${j + 1}`);
  }

  protected onKey(event: KeyboardEvent, id: string, index: number): void {
    if (this.disabled()) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON') return;
    switch (event.key) {
      case ' ':
      case 'Enter':
        event.preventDefault();
        this.grabbed.set(this.grabbed() === id ? null : id);
        this.announce.set(
          this.grabbed() === id ? this.locale.t('dd.grabbed') : this.locale.t('dd.dropped'),
        );
        break;
      case 'ArrowUp':
        if (this.grabbed() === id) {
          event.preventDefault();
          event.stopPropagation();
          this.move(id, -1);
        }
        break;
      case 'ArrowDown':
        if (this.grabbed() === id) {
          event.preventDefault();
          event.stopPropagation();
          this.move(id, 1);
        }
        break;
      case 'Escape':
        this.grabbed.set(null);
        break;
    }
    void index;
  }

  protected onPointerDown(event: PointerEvent, id: string): void {
    if (this.disabled()) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON') return;
    event.preventDefault();
    const row = (event.currentTarget as HTMLElement);
    row.setPointerCapture(event.pointerId);
    this.draggingId.set(id);

    const list = row.parentElement!;
    const onMove = (e: PointerEvent) => {
      const rows = Array.from(list.querySelectorAll<HTMLElement>('.dd-row'));
      let overIndex: number | null = null;
      rows.forEach((r, i) => {
        const rect = r.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) overIndex = i;
      });
      this.dragOverIndex.set(overIndex);
    };
    const onUp = () => {
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', onUp);
      row.removeEventListener('pointercancel', onUp);
      const over = this.dragOverIndex();
      const dragId = this.draggingId();
      this.draggingId.set(null);
      this.dragOverIndex.set(null);
      if (over === null || dragId === null) return;
      const order = this.order().slice();
      const from = order.indexOf(dragId);
      if (from < 0 || from === over) return;
      order.splice(from, 1);
      order.splice(over, 0, dragId);
      this.valueChange.emit(order);
    };
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onUp);
  }
}
