import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const ok = await auth.hydrate();
  if (ok) return true;

  // Niet ingelogd: stuur naar /login met de bedoelde URL als query parameter
  return router.createUrlTree(['/login'], {
    queryParams: { returnTo: state.url },
  });
};
