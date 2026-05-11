import { Injectable } from '@angular/core';
import { initialize, LDClient, LDFlagValue } from 'launchdarkly-js-client-sdk';
import { BehaviorSubject, Observable, ReplaySubject, shareReplay } from 'rxjs';

import { FeatureFlagKey } from './feature-flag.enum';
import { environment } from '@dps/env';

export function featureFlagFactory(featureFlagService: FeatureFlagService) {
  return () => featureFlagService.initialize();
}

const FEATURE_FLAGS_DEFAULT_VALUES: Record<FeatureFlagKey, any> = {};

@Injectable({
  providedIn: 'root',
})
export class FeatureFlagService {
  private client!: LDClient;

  initialize(): Promise<boolean> {
    this.client = initialize(environment.featureFlagClientId, { anonymous: true });

    return this.client
      .waitForInitialization()
      .then(() => true)
      .catch(() => {
        console.error('LaunchDarkly could NOT be initialized!');
        return true;
      });
  }

  getFlagValue$<T = LDFlagValue>(flagKey: FeatureFlagKey): Observable<T> {
    const flagValue$ = new BehaviorSubject<T>(
      this.client.variation(flagKey as any, FEATURE_FLAGS_DEFAULT_VALUES[flagKey])
    );
    this.client.on(`change:${flagKey}`, value => flagValue$.next(value));
    return flagValue$.asObservable().pipe(shareReplay(1));
  }
}
