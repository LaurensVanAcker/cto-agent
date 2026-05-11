import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Twee taken:
 *  1. Voeg `withCredentials: true` toe aan elke /api call zodat de session cookie meekomt.
 *  2. Bij een 401 op een protected endpoint: clear cached user + redirect naar /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  let modified = req;
  if (req.url.startsWith('/api')) {
    modified = req.clone({ withCredentials: true });
  }

  return next(modified).pipe(
    catchError((err) => {
      // Niet uitloggen bij failed login zelf; alleen bij 401 op andere endpoints
      const isLoginCall = req.url.endsWith('/api/login');
      if (err?.status === 401 && !isLoginCall) {
        auth.forceLogout();
      }
      return throwError(() => err);
    }),
  );
};
