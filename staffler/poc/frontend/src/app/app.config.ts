import {
  ApplicationConfig,
  ErrorHandler,
  importProvidersFrom,
  isDevMode,
  provideExperimentalZonelessChangeDetection,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { NgxGoogleAnalyticsModule, NgxGoogleAnalyticsRouterModule } from 'ngx-google-analytics';
import { provideStore } from '@ngxs/store';

import { DialogService } from 'primeng/dynamicdialog';
import { providePrimeNG } from 'primeng/config';

import { I18nModule } from '@dps/core/i18n';
import { featureFlagFactory, FeatureFlagService } from '@dps/core/feature-flag';
import { authInterceptor, errorInterceptor } from './core/interceptors';
import { RollbarErrorHandler, RollbarService, rollbarFactory } from '@dps/core/rollbar';
import { routes } from './app.routes';
import { DPS_LIGHT_THEME_PRESET } from './app.theme';
import { environment, EnvNameEnum } from '@dps/env';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { RootState } from './core/store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideRouter(routes, withViewTransitions()),
    importProvidersFrom(I18nModule),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideExperimentalZonelessChangeDetection(),
    DialogService,
    { provide: ErrorHandler, useClass: RollbarErrorHandler },
    { provide: RollbarService, useFactory: rollbarFactory },
    provideAppInitializer(() => {
      const initializerFn = featureFlagFactory(inject(FeatureFlagService));
      return initializerFn();
    }),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: DPS_LIGHT_THEME_PRESET,
        options: {
          darkModeSelector: false,
        },
      },
    }),
    importProvidersFrom(NgxGoogleAnalyticsModule.forRoot(environment.googleMeasurementId)),
    NgxGoogleAnalyticsRouterModule,
    provideStore(
      [RootState],
      withNgxsLoggerPlugin({
        collapsed: true,
        disabled: environment.envName === EnvNameEnum.PROD,
      })
    ),
  ],
};
