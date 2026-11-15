import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface TrendPoint {
  label: string;
  value: number;
}

/** SVG line chart for mock score trends. */
@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + w + ' ' + h"
      preserveAspectRatio="none"
      role="img"
      [attr.aria-label]="ariaLabel()"
      class="trend"
    >
      <line
        [attr.x1]="pad"
        [attr.x2]="w - pad"
        [attr.y1]="yFor(passLine())"
        [attr.y2]="yFor(passLine())"
        class="pass-line"
      />
      <polyline [attr.points]="points()" class="line" fill="none" />
      @for (p of coords(); track $index) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" class="dot">
          <title>{{ data()[$index].label }}: {{ data()[$index].value }}</title>
        </circle>
      }
    </svg>
  `,
  styles: `
    .trend { width: 100%; height: 140px; display: block; }
    .line { stroke: var(--primary); stroke-width: 2.5; vector-effect: non-scaling-stroke; }
    .dot { fill: var(--primary); }
    .pass-line { stroke: var(--ok); stroke-width: 1.5; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
  `,
})
export class TrendChart {
  readonly data = input.required<TrendPoint[]>();
  readonly min = input(100);
  readonly max = input(1000);
  readonly passLine = input(700);

  readonly w = 600;
  readonly h = 140;
  readonly pad = 10;

  yFor(v: number): number {
    const range = this.max() - this.min();
    const norm = (v - this.min()) / (range || 1);
    return this.h - this.pad - norm * (this.h - 2 * this.pad);
  }

  readonly coords = computed(() => {
    const d = this.data();
    if (d.length === 0) return [];
    const innerW = this.w - 2 * this.pad;
    return d.map((p, i) => ({
      x: this.pad + (d.length === 1 ? innerW / 2 : (i / (d.length - 1)) * innerW),
      y: this.yFor(p.value),
    }));
  });

  readonly points = computed(() => this.coords().map((p) => `${p.x},${p.y}`).join(' '));

  readonly ariaLabel = computed(
    () => 'Score trend: ' + this.data().map((p) => `${p.label} ${p.value}`).join(', '),
  );
}
