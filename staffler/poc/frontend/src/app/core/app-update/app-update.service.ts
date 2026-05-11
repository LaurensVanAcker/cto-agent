import { ApplicationRef, Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { UntilDestroy } from '@ngneat/until-destroy';
import { filter, switchMap, tap, interval, concat, first } from 'rxjs';
import { Duration } from 'luxon';
import { EnvNameEnum, environment } from '@dps/env';

export const APP_UPDATE_TOAST_KEY = 'appUpdateToast';

const APP_UPDATE_CHECK_INTERVAL_PER_ENV: Record<EnvNameEnum, Duration> = {
  [EnvNameEnum.DEV]: Duration.fromObject({ minute: 30 }),
  [EnvNameEnum.QA]: Duration.fromObject({ minute: 30 }),
  [EnvNameEnum.PROD]: Duration.fromObject({ hours: 24 }),
};

@UntilDestroy()
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly isAppStable$ = this.appRef.isStable.pipe(first(Boolean));
  private readonly appUpdateCheckInterval$ = interval(
    APP_UPDATE_CHECK_INTERVAL_PER_ENV[environment.envName].as('milliseconds')
  );
  readonly updateAvailable$ = concat(this.isAppStable$, this.appUpdateCheckInterval$).pipe(
    filter(() => this.swUpdate.isEnabled),
    switchMap(() => this.swUpdate.checkForUpdate()),
    tap(result => console.log('Checking for update result:', result)),
    filter(Boolean)
  );

  constructor(
    private swUpdate: SwUpdate,
    private appRef: ApplicationRef
  ) {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.unrecoverable.subscribe(event =>
        console.error('Unrecoverable error with the service worker', event)
      );
    } else {
      console.warn('Service worker is disabled');
    }
  }
}
