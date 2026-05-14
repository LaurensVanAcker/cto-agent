import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthApiService } from '../auth.api.service';

export const unauthenticatedGuard: CanMatchFn = () => {
  const authApiService = inject(AuthApiService);
  const router = inject(Router);

  return !authApiService.isAuthenticated || router.createUrlTree([]);
};
