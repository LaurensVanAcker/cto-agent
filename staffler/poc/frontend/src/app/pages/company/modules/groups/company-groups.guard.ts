import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';

import { AuthStore, RootState } from '@dps/core/store';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { UserRole } from '@dps/shared/models';
import { Store } from '@ngxs/store';

export const COMPANY_GROUPS_ENABLED_GUARD: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);

  return store.select(RootState.getCompanyData).pipe(
    filter(Boolean),
    take(1),
    map(
      ({ id, isGroupsEnabled }) =>
        isGroupsEnabled ||
        new RedirectCommand(router.createUrlTree([AppRouteEnum.COMPANY, id]), {
          skipLocationChange: true,
        })
    )
  );
};

export const GROUP_USER_ROLE_GUARD: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);
  const store = inject(Store);

  return store.select(RootState.getCompanyData).pipe(
    filter(currCompany => !!currCompany),
    take(1),
    map(
      currCompany =>
        !authStore.hasRoles([UserRole.GROUP_USER]) ||
        new RedirectCommand(router.createUrlTree([AppRouteEnum.COMPANY, currCompany.id]), {
          skipLocationChange: true,
        })
    )
  );
};
