import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

import { AppLocaleEnum } from '@dps/core/i18n';

@Component({
  selector: 'dps-app-locale-selector',
  standalone: true,
  imports: [MenuModule, ButtonModule],
  templateUrl: './app-locale-selector.component.html',
  styleUrl: './app-locale-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLocaleSelectorComponent {
  constructor(private translateService: TranslateService) {}

  readonly currLang = toSignal(
    this.translateService.onLangChange.pipe(
      map(({ lang }) => lang),
      startWith(this.translateService.currentLang)
    )
  );
  readonly localeControl = new FormControl<AppLocaleEnum>(
    this.translateService.currentLang as AppLocaleEnum,
    { nonNullable: true }
  );
  readonly menuLocales: MenuItem[] = this.translateService.getLangs().map(locale => ({
    label: locale,
    styleClass: 'uppercase',
    command: () => this.translateService.use(locale),
  }));
}
