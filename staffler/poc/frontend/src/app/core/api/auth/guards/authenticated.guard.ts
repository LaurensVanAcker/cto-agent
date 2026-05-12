import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, map, of, switchMap, take, tap } from 'rxjs';

import { AuthApiService } from '../auth.api.service';
import { AuthRoutePath } from 'src/app/pages/auth';
import { AuthStore } from '@dps/core/store';

export const authenticatedGuard: CanMatchFn = () => {
  const authApiService = inject(AuthApiService);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!authApiService.isAuthenticated) {
    return router.createUrlTree([AuthRoutePath.LOGIN]);
  }
  return authStore
    .select$(state => state.currentUser)
    .pipe(
      take(1),
      switchMap(currentUser =>
        currentUser
          ? of(currentUser)
          : authApiService
              .getCurrentUser()
              .pipe(tap(c => authStore.setCurrentUser(c))),
      ),
      map(() => true),
      // PoC: if /api/me errors (401, session expired, etc.) the previous
      // implementation left the router-outlet empty and the page hung.
      // Send the user back to /login instead so they can re-authenticate.
      catchError(() => of(router.createUrlTree([AuthRoutePath.LOGIN]))),
    );
};
