import { registerLocaleData } from '@angular/common';
import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { DEFAULT_CURRENCY_CODE, LOCALE_ID, NgModule } from '@angular/core';
import { provideTranslateService, TranslateLoader, TranslateService } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { LocaleManager } from '@bryntum/scheduler';
import { PrimeNG } from 'primeng/config';
import { Settings } from 'luxon';
import localeNl from '@angular/common/locales/nl-BE';
import '../../../assets/i18n/scheduler.locale.En.js';
import '../../../assets/i18n/scheduler.locale.Nl.js';

import { EnvNameEnum, environment } from '@dps/env';
import { AppLocaleEnum } from './app-locale.enum';

function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}

const APP_LOCALE_KEY = 'dpsLocale';
const APP_TO_SCHEDULER_LOCALES_MAP: Record<AppLocaleEnum, string> = {
  [AppLocaleEnum.EN]: 'En',
  [AppLocaleEnum.NL]: 'Nl',
};

@NgModule({
  providers: [
    { provide: LOCALE_ID, useValue: AppLocaleEnum.NL },
    {
      provide: DEFAULT_CURRENCY_CODE,
      useValue: 'EUR',
    },
    provideHttpClient(withInterceptorsFromDi()),
    provideTranslateService({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
  ],
})
export class I18nModule {
  constructor(
    private translateService: TranslateService,
    private primeConfig: PrimeNG
  ) {
    registerLocaleData(localeNl, AppLocaleEnum.NL);
    // PoC: Dutch is the only supported locale. No language switcher, no
    // localStorage override, no DEV-mode English fallback. The pilot
    // customers are Flemish; everything else is dead weight.
    this.translateService.langs.push(AppLocaleEnum.NL);
    const defaultLocale = AppLocaleEnum.NL;
    this.translateService.setDefaultLang(defaultLocale);
    this.translateService.use(defaultLocale);

    this.translateService.onLangChange.asObservable().subscribe(({ lang, translations }) => {
      document.documentElement.lang = lang;
      localStorage.setItem(APP_LOCALE_KEY, lang);
      this.primeConfig.setTranslation(translations['primeng']);
      Settings.defaultLocale = lang;
      LocaleManager.applyLocale(APP_TO_SCHEDULER_LOCALES_MAP[lang as AppLocaleEnum]);
    });
  }
}
