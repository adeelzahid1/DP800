import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Question } from '../../../core/models/content.models';
import { LocaleService } from '../../../core/services/locale.service';
import { Response } from '../../../core/utils/grade';
import { RichText } from '../../../shared/rich-text';
import { CodeBlock } from '../../../shared/code-block';
import { DdMatch } from './dd-match';
import { DdOrder } from './dd-order';

/**
 * Renders the interactive part of any question type and reports the learner's
 * response. In `showCorrect` mode it marks right/wrong against the key.
 */
@Component({
  selector: 'app-question-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichText, CodeBlock, DdOrder, DdMatch],
  template: `
    @switch (q().type) {
      @case ('single') {
        <div role="radiogroup" [attr.aria-label]="locale.t('q.options')" class="opts">
          @for (opt of q().options ?? []; track opt.id; let i = $index) {
            <label
              class="opt"
              [class.selected]="isSelected(opt.id)"
              [class.correct]="showCorrect() && isKey(opt.id)"
              [class.incorrect]="showCorrect() && isSelected(opt.id) && !isKey(opt.id)"
            >
              <input
                type="radio"
                [name]="q().id"
                [checked]="isSelected(opt.id)"
                [disabled]="disabled()"
                (change)="selectSingle(opt.id)"
              />
              <span class="opt-letter">{{ letter(i) }}</span>
              <span class="opt-body">
                <app-rich-text [text]="opt.text" />
                @if (opt.code) {
                  <app-code-block [code]="opt.code" />
                }
              </span>
              @if (showCorrect() && isKey(opt.id)) {
                <span class="key-mark" aria-hidden="true">✓</span>
              }
            </label>
          }
        </div>
      }
      @case ('multiple') {
        @if (q().selectCount; as n) {
          <p class="select-n">{{ locale.t('q.selectN').replace('{n}', '' + n) }}</p>
        }
        <div role="group" [attr.aria-label]="locale.t('q.options')" class="opts">
          @for (opt of q().options ?? []; track opt.id; let i = $index) {
            <label
              class="opt"
              [class.selected]="isSelected(opt.id)"
              [class.correct]="showCorrect() && isKey(opt.id)"
              [class.incorrect]="showCorrect() && isSelected(opt.id) && !isKey(opt.id)"
            >
              <input
                type="checkbox"
                [checked]="isSelected(opt.id)"
                [disabled]="disabled()"
                (change)="toggleMultiple(opt.id)"
              />
              <span class="opt-letter">{{ letter(i) }}</span>
              <span class="opt-body">
                <app-rich-text [text]="opt.text" />
                @if (opt.code) {
                  <app-code-block [code]="opt.code" />
                }
              </span>
              @if (showCorrect() && isKey(opt.id)) {
                <span class="key-mark" aria-hidden="true">✓</span>
              }
            </label>
          }
        </div>
      }
      @case ('yesno') {
        <table class="yn-table">
          <thead>
            <tr>
              <th scope="col">{{ locale.t('q.statement') }}</th>
              <th scope="col" class="yn-col">{{ locale.t('q.yes') }}</th>
              <th scope="col" class="yn-col">{{ locale.t('q.no') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (st of q().statements ?? []; track st.id) {
              <tr
                [class.correct]="showCorrect() && mapVal(st.id) === keyVal(st.id)"
                [class.incorrect]="showCorrect() && mapVal(st.id) !== undefined && mapVal(st.id) !== keyVal(st.id)"
              >
                <td>
                  <app-rich-text [text]="st.text" />
                  @if (showCorrect()) {
                    <span class="yn-key">({{ locale.t('q.correctAnswer') }}: {{ keyVal(st.id) === 'yes' ? locale.t('q.yes') : locale.t('q.no') }})</span>
                  }
                </td>
                <td class="yn-col">
                  <input
                    type="radio"
                    [name]="q().id + '-' + st.id"
                    [checked]="mapVal(st.id) === 'yes'"
                    [disabled]="disabled()"
                    (change)="setMap(st.id, 'yes')"
                    [attr.aria-label]="locale.t('q.yes')"
                  />
                </td>
                <td class="yn-col">
                  <input
                    type="radio"
                    [name]="q().id + '-' + st.id"
                    [checked]="mapVal(st.id) === 'no'"
                    [disabled]="disabled()"
                    (change)="setMap(st.id, 'no')"
                    [attr.aria-label]="locale.t('q.no')"
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
      @case ('dropdown') {
        <div class="blanks">
          @for (blank of q().blanks ?? []; track blank.id; let i = $index) {
            <label
              class="blank"
              [class.correct]="showCorrect() && mapVal(blank.id) === keyVal(blank.id)"
              [class.incorrect]="showCorrect() && mapVal(blank.id) !== undefined && mapVal(blank.id) !== keyVal(blank.id)"
            >
              <span class="blank-label">
                {{ blank.label ? locale.lt(blank.label) : locale.t('q.blank') + ' ' + (i + 1) }}
              </span>
              <select
                [disabled]="disabled()"
                [value]="mapVal(blank.id) ?? ''"
                (change)="onBlankChange(blank.id, $event)"
              >
                <option value="" disabled>{{ locale.t('q.choose') }}</option>
                @for (c of blank.choices; track c.id) {
                  <option [value]="c.id">{{ locale.lt(c.text) }}</option>
                }
              </select>
              @if (showCorrect() && mapVal(blank.id) !== keyVal(blank.id)) {
                <span class="blank-key">{{ locale.t('q.correctAnswer') }}: {{ choiceText(blank.id, keyVal(blank.id)) }}</span>
              }
            </label>
          }
        </div>
      }
      @case ('dragdrop-order') {
        <app-dd-order
          [items]="q().items ?? []"
          [value]="value().answer ?? defaultOrder()"
          [disabled]="disabled()"
          [showCorrect]="showCorrect()"
          [answerOrder]="showCorrect() ? (q().answer ?? []) : []"
          (valueChange)="emitOrder($event)"
        />
        @if (showCorrect()) {
          <div class="key-order">
            <strong>{{ locale.t('q.correctOrder') }}:</strong>
            <ol>
              @for (id of q().answer ?? []; track id) {
                <li>{{ itemText(id) }}</li>
              }
            </ol>
          </div>
        }
      }
      @case ('dragdrop-match') {
        <app-dd-match
          [items]="q().items ?? []"
          [targets]="q().targets ?? []"
          [value]="value().answerMap ?? {}"
          [disabled]="disabled()"
          [showCorrect]="showCorrect()"
          [answerMap]="showCorrect() ? (q().answerMap ?? {}) : {}"
          (valueChange)="emitMap($event)"
        />
        @if (showCorrect()) {
          <div class="key-order">
            <strong>{{ locale.t('q.correctMatches') }}:</strong>
            <ul>
              @for (item of q().items ?? []; track item.id) {
                <li>{{ locale.lt(item.text) }} → {{ targetText(q().answerMap?.[item.id]) }}</li>
              }
            </ul>
          </div>
        }
      }
      @default {
        <p>{{ locale.t('q.unsupported') }}</p>
      }
    }
  `,
  styles: `
    .opts { display: flex; flex-direction: column; gap: 8px; }
    .opt {
      display: flex; align-items: flex-start; gap: 10px;
      border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px;
      cursor: pointer; background: var(--bg-elev);
    }
    .opt:hover { border-color: var(--primary); }
    .opt.selected { border-color: var(--primary); background: var(--primary-soft); }
    .opt.correct { border-color: var(--ok); background: var(--ok-soft); }
    .opt.incorrect { border-color: var(--err); background: var(--err-soft); }
    .opt input { margin-top: 3px; }
    .opt-letter {
      font-weight: 700; color: var(--text-dim); min-width: 20px; margin-top: 1px;
    }
    .opt-body { flex: 1; min-width: 0; }
    .opt-body .rich-text p { margin: 0; }
    .key-mark { color: var(--ok); font-weight: 700; font-size: 1.1rem; }
    .select-n { font-weight: 600; color: var(--primary); font-size: 0.9rem; margin: 0 0 8px; }
    .yn-table { width: 100%; border-collapse: collapse; }
    .yn-table th, .yn-table td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; }
    .yn-table .rich-text p { margin: 0; }
    .yn-col { width: 54px; text-align: center !important; }
    .yn-table tr.correct td { background: var(--ok-soft); }
    .yn-table tr.incorrect td { background: var(--err-soft); }
    .yn-key { font-size: 0.8rem; color: var(--text-dim); }
    .blanks { display: flex; flex-direction: column; gap: 10px; }
    .blank { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .blank-label { font-weight: 600; min-width: 70px; font-size: 0.9rem; }
    .blank.correct select { border-color: var(--ok); }
    .blank.incorrect select { border-color: var(--err); }
    .blank select { font-family: Consolas, monospace; max-width: 100%; min-width: 0; }
    .blank-key { color: var(--ok); font-size: 0.85rem; font-family: Consolas, monospace; min-width: 0; overflow-wrap: anywhere; }
    .key-order { margin-top: 10px; font-size: 0.9rem; color: var(--text-dim); }
    .key-order ol, .key-order ul { margin: 4px 0 0; padding-left: 1.4em; }
  `,
})
export class QuestionInput {
  protected readonly locale = inject(LocaleService);

  readonly q = input.required<Question>();
  readonly value = input.required<Response>();
  readonly disabled = input(false);
  readonly showCorrect = input(false);

  readonly valueChange = output<Response>();

  protected readonly defaultOrder = computed(() => (this.q().items ?? []).map((i) => i.id));

  protected letter(i: number): string {
    return String.fromCharCode(65 + i);
  }

  protected isSelected(id: string): boolean {
    return (this.value().answer ?? []).includes(id);
  }

  protected isKey(id: string): boolean {
    return (this.q().answer ?? []).includes(id);
  }

  protected mapVal(key: string): string | undefined {
    return this.value().answerMap?.[key];
  }

  protected keyVal(key: string): string | undefined {
    return this.q().answerMap?.[key];
  }

  protected itemText(id: string | undefined): string {
    const item = (this.q().items ?? []).find((i) => i.id === id);
    return item ? this.locale.lt(item.text) : (id ?? '');
  }

  protected targetText(id: string | undefined): string {
    const t = (this.q().targets ?? []).find((i) => i.id === id);
    return t ? this.locale.lt(t.text) : (id ?? '');
  }

  protected choiceText(blankId: string, choiceId: string | undefined): string {
    const blank = (this.q().blanks ?? []).find((b) => b.id === blankId);
    const c = blank?.choices.find((x) => x.id === choiceId);
    return c ? this.locale.lt(c.text) : (choiceId ?? '');
  }

  protected selectSingle(id: string): void {
    this.valueChange.emit({ answer: [id] });
  }

  protected toggleMultiple(id: string): void {
    const cur = new Set(this.value().answer ?? []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    this.valueChange.emit({ answer: [...cur] });
  }

  protected setMap(key: string, val: string): void {
    this.valueChange.emit({
      answerMap: { ...(this.value().answerMap ?? {}), [key]: val },
    });
  }

  protected onBlankChange(blankId: string, event: Event): void {
    this.setMap(blankId, (event.target as HTMLSelectElement).value);
  }

  protected emitOrder(order: string[]): void {
    this.valueChange.emit({ answer: order });
  }

  protected emitMap(map: Record<string, string>): void {
    this.valueChange.emit({ answerMap: map });
  }

  /** Select option by index (keyboard shortcut 1-9 / A-F from the study page). */
  selectByIndex(i: number): void {
    const q = this.q();
    if (this.disabled()) return;
    if (q.type === 'single') {
      const opt = (q.options ?? [])[i];
      if (opt) this.selectSingle(opt.id);
    } else if (q.type === 'multiple') {
      const opt = (q.options ?? [])[i];
      if (opt) this.toggleMultiple(opt.id);
    }
  }
}
