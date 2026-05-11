import Rollbar, { Configuration } from 'rollbar';

import { Injectable, InjectionToken, ErrorHandler, Inject } from '@angular/core';
import { environment } from '@dps/env';
import { AuthStore } from '../store';

const rollbarConfig = {
  accessToken: 'aa41db0a03e146f6bf997139e05b6fb3',
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: environment.envName,
  codeVersion: '1',
  payload: {
    client: {
      javascript: {
        source_map_enabled: true,
        guess_uncaught_frames: true,
      },
    },
  },
} satisfies Configuration;

@Injectable()
export class RollbarErrorHandler implements ErrorHandler {
  constructor(
    @Inject(RollbarService) private rollbar: Rollbar,
    private authStore: AuthStore
  ) {
    this.authStore.getCurrUserData$().subscribe(currUser =>
      this.rollbar.configure({
        payload: {
          currUser,
        },
      })
    );
  }

  handleError(err: any): void {
    console.error(err);
    this.rollbar.error(err.originalError || err);
  }
}

export function rollbarFactory() {
  return new Rollbar(rollbarConfig);
}

export const RollbarService = new InjectionToken<Rollbar>('rollbar');
