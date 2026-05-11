import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { map, of, switchMap, take, tap } from 'rxjs';

import { AuthApiService } from '../auth.api.service';
import { AuthRoutePath } from 'src/app/pages/auth';
import { AuthStore } from '@dps/core/store';

export const authenticatedGuard: CanMatchFn = () => {
  const authApiService = inject(AuthApiService);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  return authApiService.isAuthenticated
    ? authStore
        .select$(state => state.currentUser)
        .pipe(
          take(1),
          switchMap(currentUser =>
            currentUser
              ? of(currentUser)
              : authApiService
                  .getCurrentUser()
                  .pipe(tap(currentUser => authStore.setCurrentUser(currentUser)))
          ),
          map(() => true)
        )
    : router.createUrlTree([AuthRoutePath.LOGIN]);
};
