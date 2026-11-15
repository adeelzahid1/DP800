import { Injectable, computed, inject, signal } from '@angular/core';
import { LocalizedText } from '../models/content.models';
import { ProgressService } from './progress.service';

/**
 * Locale handling. UI strings live in /content/i18n/<locale>.json; content
 * text carries per-locale fields (LocalizedText). English is the fallback
 * everywhere, so a future "roman" locale only needs a strings file plus
 * `roman` fields in content — no code changes.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly progress = inject(ProgressService);

  /** UI string tables keyed by locale code. */
  private readonly tables = signal<Record<string, Record<string, string>>>({});

  readonly locale = computed(() => this.progress.settings().locale);

  constructor() {
    void this.loadTable('en');
  }

  async loadTable(code: string): Promise<void> {
    if (this.tables()[code]) return;
    try {
      const res = await fetch(`content/i18n/${code}.json`);
      if (!res.ok) return;
      const table = (await res.json()) as Record<string, string>;
      this.tables.update((t) => ({ ...t, [code]: table }));
    } catch {
      // offline and uncached — fall back to keys
    }
  }

  setLocale(code: string): void {
    this.progress.updateSettings({ locale: code });
    void this.loadTable(code);
  }

  /** UI string by key, current locale, falling back to English then the key. */
  t(key: string): string {
    const tables = this.tables();
    return tables[this.locale()]?.[key] ?? tables['en']?.[key] ?? key;
  }

  /** Localized content text, falling back to English. */
  lt(text: LocalizedText | undefined): string {
    if (!text) return '';
    return text[this.locale()] ?? text.en ?? '';
  }
}
