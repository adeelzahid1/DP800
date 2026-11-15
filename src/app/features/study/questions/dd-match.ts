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
 * Matching / categorize drag & drop ("tap-to-place"):
 * pick an item (click/tap/keyboard), then pick a target to place it.
 * Works identically with mouse, touch and keyboard; placed items can be removed.
 */
@Component({
  selector: 'app-dd-match',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">{{ locale.t('dd.matchHint') }}</p>

    @if (pool().length > 0) {
      <div class="pool" role="group" [attr.aria-label]="locale.t('dd.pool')">
        @for (item of pool(); track item.id) {
          <button
            type="button"
            class="pool-item"
            [class.picked]="picked() === item.id"
            [attr.aria-pressed]="picked() === item.id"
            [disabled]="disabled()"
            (click)="pick(item.id)"
          >
            {{ locale.lt(item.text) }}
          </button>
        }
      </div>
    }

    <div class="targets">
      @for (t of targets(); track t.id) {
        <div
          class="target"
          [class.droppable]="picked() !== null"
          role="group"
          [attr.aria-label]="locale.lt(t.text)"
        >
          <button
            type="button"
            class="target-head"
            [disabled]="disabled() || picked() === null"
            (click)="placeInto(t.id)"
          >
            <span class="target-title">{{ locale.lt(t.text) }}</span>
            @if (picked() !== null) {
              <span class="place-hint">{{ locale.t('dd.placeHere') }}</span>
            }
          </button>
          <ul class="placed">
            @for (item of placedIn(t.id); track item.id) {
              <li
                [class.correct]="showCorrect() && answerMap()[item.id] === t.id"
                [class.incorrect]="showCorrect() && answerMap()[item.id] !== t.id"
              >
                <span>{{ locale.lt(item.text) }}</span>
                @if (!disabled()) {
                  <button
                    type="button"
                    class="btn btn-sm"
                    (click)="remove(item.id)"
                    [attr.aria-label]="locale.t('dd.remove') + ': ' + locale.lt(item.text)"
                  >✕</button>
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
    <p class="visually-hidden" aria-live="polite">{{ announce() }}</p>
  `,
  styles: `
    .hint { color: var(--text-dim); font-size: 0.85rem; margin: 0 0 8px; }
    .pool { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .pool-item {
      border: 1.5px solid var(--border); background: var(--bg-elev); color: var(--text);
      border-radius: 10px; padding: 8px 12px; cursor: pointer; min-height: 40px;
      max-width: 100%; text-align: left; overflow-wrap: anywhere;
    }
    .pool-item.picked { border-color: var(--primary); background: var(--primary-soft); font-weight: 600; }
    .targets { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .target { border: 1.5px dashed var(--border); border-radius: 10px; overflow: hidden; }
    .target.droppable { border-color: var(--primary); }
    .target-head {
      width: 100%; text-align: left; border: 0; background: var(--bg-sunken);
      padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between;
      align-items: center; gap: 8px; color: var(--text); min-height: 42px;
    }
    .target-head:disabled { cursor: default; }
    .target-title { font-weight: 600; font-size: 0.9rem; min-width: 0; overflow-wrap: anywhere; }
    .place-hint { color: var(--primary); font-size: 0.78rem; font-weight: 600; }
    .placed { list-style: none; margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 6px; min-height: 34px; }
    .placed li {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      background: var(--bg-elev); border: 1px solid var(--border); border-radius: 8px;
      padding: 6px 10px; font-size: 0.92rem; overflow-wrap: anywhere;
    }
    .placed li.correct { border-color: var(--ok); background: var(--ok-soft); }
    .placed li.incorrect { border-color: var(--err); background: var(--err-soft); }
  `,
})
export class DdMatch {
  protected readonly locale = inject(LocaleService);

  readonly items = input.required<Option[]>();
  readonly targets = input.required<Option[]>();
  /** itemId -> targetId (parent owns state). */
  readonly value = input.required<Record<string, string>>();
  readonly disabled = input(false);
  readonly showCorrect = input(false);
  readonly answerMap = input<Record<string, string>>({});

  readonly valueChange = output<Record<string, string>>();

  protected readonly picked = signal<string | null>(null);
  protected readonly announce = signal('');

  protected readonly pool = computed(() =>
    this.items().filter((i) => !(i.id in this.value())),
  );

  protected placedIn(targetId: string): Option[] {
    return this.items().filter((i) => this.value()[i.id] === targetId);
  }

  protected pick(id: string): void {
    this.picked.set(this.picked() === id ? null : id);
    if (this.picked()) this.announce.set(this.locale.t('dd.pickedItem'));
  }

  protected placeInto(targetId: string): void {
    const id = this.picked();
    if (!id) return;
    this.valueChange.emit({ ...this.value(), [id]: targetId });
    this.picked.set(null);
    this.announce.set(this.locale.t('dd.placed'));
  }

  protected remove(itemId: string): void {
    const next = { ...this.value() };
    delete next[itemId];
    this.valueChange.emit(next);
  }
}
