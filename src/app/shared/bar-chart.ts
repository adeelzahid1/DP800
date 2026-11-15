import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarDatum {
  label: string;
  /** 0..1 */
  value: number;
  /** Extra text after the bar, e.g. "12/15". */
  detail?: string;
  tone?: 'ok' | 'warn' | 'err' | 'primary';
}

/** Horizontal bar chart built from plain divs (accessible, theme-aware). */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" role="img" [attr.aria-label]="ariaLabel()">
      @for (d of data(); track d.label) {
        <div class="row">
          <span class="label" [title]="d.label">{{ d.label }}</span>
          <span class="track">
            <span
              class="fill"
              [class.ok]="d.tone === 'ok'"
              [class.warn]="d.tone === 'warn'"
              [class.err]="d.tone === 'err'"
              [style.width.%]="d.value * 100"
            ></span>
          </span>
          <span class="detail">{{ d.detail ?? (d.value * 100).toFixed(0) + '%' }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .chart { display: flex; flex-direction: column; gap: 8px; }
    .row { display: grid; grid-template-columns: minmax(90px, 2fr) 3fr auto; gap: 10px; align-items: center; }
    .label { font-size: 0.85rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { height: 12px; background: var(--bg-sunken); border-radius: 6px; overflow: hidden; }
    .fill { display: block; height: 100%; background: var(--primary); border-radius: 6px; }
    .fill.ok { background: var(--ok); }
    .fill.warn { background: var(--warn); }
    .fill.err { background: var(--err); }
    .detail { font-size: 0.82rem; font-variant-numeric: tabular-nums; color: var(--text-dim); min-width: 48px; text-align: right; }
  `,
})
export class BarChart {
  readonly data = input.required<BarDatum[]>();
  readonly caption = input<string>('');

  readonly ariaLabel = computed(
    () =>
      this.caption() +
      ': ' +
      this.data()
        .map((d) => `${d.label} ${(d.value * 100).toFixed(0)}%`)
        .join(', '),
  );
}
