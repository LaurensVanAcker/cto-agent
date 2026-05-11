import {
  ApplicationConfig,
  importProvidersFrom,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideStore } from '@ngxs/store';

import { DialogService } from 'primeng/dynamicdialog';
import { providePrimeNG } from 'primeng/config';

import { I18nModule } from '@dps/core/i18n';
import { authInterceptor, errorInterceptor } from './core/interceptors';
import { routes } from './app.routes';
import { DPS_LIGHT_THEME_PRESET } from './app.theme';
import { environment, EnvNameEnum } from '@dps/env';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { RootState } from './core/store';

// PoC step 1: dropped Rollbar (RollbarErrorHandler/RollbarService),
// LaunchDarkly feature-flag bootstrap (provideAppInitializer + FeatureFlagService),
// ngx-google-analytics (NgxGoogleAnalyticsModule/RouterModule) and the PWA
// service worker (provideServiceWorker). These were noisy at boot without
// credentials and out of scope for v0 — see staffler/poc/PLAN.md.

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideRouter(routes, withViewTransitions()),
    importProvidersFrom(I18nModule),
    provideExperimentalZonelessChangeDetection(),
    DialogService,
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: DPS_LIGHT_THEME_PRESET,
        options: {
          darkModeSelector: false,
        },
      },
    }),
    provideStore(
      [RootState],
      withNgxsLoggerPlugin({
        collapsed: true,
        disabled: environment.envName === EnvNameEnum.PROD,
      })
    ),
  ],
};
