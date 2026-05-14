import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { RootState } from '@dps/core/store';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { Store } from '@ngxs/store';

export const COMPANY_ACTUALS_ENABLED_GUARD: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);

  return store.select(RootState.getCompanyData).pipe(
    filter(Boolean),
    take(1),
    map(
      ({ id, isActualsEnabled }) =>
        isActualsEnabled || router.createUrlTree([AppRouteEnum.COMPANY, id])
    )
  );
};
