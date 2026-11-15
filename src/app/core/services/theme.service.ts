import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ProgressService } from './progress.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly progress = inject(ProgressService);

  private readonly systemDark = signal(
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  );

  /** 'system' | 'light' | 'dark' as chosen by the user. */
  readonly preference = computed(() => this.progress.settings().theme);

  /** Effective theme after resolving 'system'. */
  readonly effective = computed<'light' | 'dark'>(() => {
    const pref = this.preference();
    if (pref === 'system') return this.systemDark() ? 'dark' : 'light';
    return pref;
  });

  constructor() {
    if (typeof matchMedia !== 'undefined') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) =>
        this.systemDark.set(e.matches),
      );
    }
    effect(() => {
      document.documentElement.dataset['theme'] = this.effective();
    });
  }

  /** Cycle light → dark → light (explicit choice replaces 'system'). */
  toggle(): void {
    const next = this.effective() === 'dark' ? 'light' : 'dark';
    this.progress.updateSettings({ theme: next });
  }

  useSystem(): void {
    this.progress.updateSettings({ theme: 'system' });
  }
}
