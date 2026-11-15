import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { highlight } from '../core/utils/highlight';

@Component({
  selector: 'app-code-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<pre class="code-block" tabindex="0"><code [innerHTML]="html()"></code></pre>`,
})
export class CodeBlock {
  readonly code = input.required<string>();
  readonly lang = input<string>('sql');

  private readonly sanitizer = inject(DomSanitizer);

  readonly html = computed(() =>
    // highlight() escapes all input and only emits our own span tags
    this.sanitizer.bypassSecurityTrustHtml(highlight(this.code(), this.lang())),
  );
}
