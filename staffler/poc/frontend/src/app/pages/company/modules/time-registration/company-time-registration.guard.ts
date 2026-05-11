import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { AppRouteEnum } from 'src/app/app.routes.model';
import { Store } from '@ngxs/store';
import { RootState } from '@dps/core/store';

export const COMPANY_TIME_REGISTRATION_CAN_ACTIVATE_FN: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);

  return store.select(RootState.getCompanyData).pipe(
    filter(Boolean),
    take(1),
    map(
      ({ id, isTimeRegistrationEnabled }) =>
        isTimeRegistrationEnabled || router.createUrlTree([AppRouteEnum.COMPANY, id])
    )
  );
};
