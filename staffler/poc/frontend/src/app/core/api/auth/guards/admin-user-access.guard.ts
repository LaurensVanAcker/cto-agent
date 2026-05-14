import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';

import { map } from 'rxjs/operators';
import { AuthStore } from '@dps/core/store';
import { UserRole } from '@dps/shared/models';

export const adminUserAccessGuard: CanMatchFn = () => {
  const authStore = inject(AuthStore);

  return authStore
    .getCurrUserData$()
    .pipe(
      map(() =>
        authStore.hasRoles([
          UserRole.FULL_ADMIN,
          UserRole.CREDIT_CONTROLLER,
          UserRole.SALES_ADMIN,
          UserRole.SUPER_ADMIN,
          UserRole.RECRUITER,
          UserRole.PREVENTION_ADVISOR,
          UserRole.DPS_SALES,
          UserRole.DPS_DIRECTOR,
        ])
      )
    );
};
