import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LocaleService } from './core/services/locale.service';
import { ThemeService } from './core/services/theme.service';
import { ContentService } from './core/services/content.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly locale = inject(LocaleService);
  protected readonly theme = inject(ThemeService);
  protected readonly content = inject(ContentService);

  protected onLocaleChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.locale.setLocale(value);
  }
}
