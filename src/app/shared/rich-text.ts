import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { LocalizedText } from '../core/models/content.models';
import { LocaleService } from '../core/services/locale.service';
import { renderRichText } from '../core/utils/highlight';

/** Renders LocalizedText with light markdown (bold, code, lists, links). */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="rich-text" [innerHTML]="html()"></div>`,
})
export class RichText {
  readonly text = input.required<LocalizedText | string>();

  private readonly locale = inject(LocaleService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly html = computed(() => {
    const t = this.text();
    const raw = typeof t === 'string' ? t : this.locale.lt(t);
    // renderRichText escapes all input and emits only known-safe tags
    return this.sanitizer.bypassSecurityTrustHtml(renderRichText(raw));
  });
}
