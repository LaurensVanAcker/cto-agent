import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  HttpStatusCode,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

import { AuthRoutePath } from 'src/app/pages/auth';
import { AUTH_KEY } from '../api/auth/auth.api.service';

// PoC: sessie loopt via een httpOnly cookie (poc_sid) die Fastify zet bij
// /api/login. De frontend kent geen skey en stuurt geen x-boemm-skey header
// meer. We hebben enkel withCredentials nodig zodat de cookie meegestuurd
// wordt op elke call naar /api/*.
//
// PoC corner case: bij een backend-restart blijft `skey` in localStorage
// staan terwijl de httpOnly-cookie weg is. /api/me geeft dan 401, maar de
// `unauthenticatedGuard` op /login zag het skey-vlaggetje nog en stuurde
// terug naar /, wat /me opnieuw triggerde — eindeloze redirect-loop. We
// strippen de skey nu samen met de redirect zodat /login wél laadt.
export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const router = inject(Router);

  return next(req.clone({ withCredentials: true })).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized) {
        // Demo routes are explicitly auth-free; we use them as visual
        // previews where API 401s are expected. Don't kick to /login from
        // /demo/* — the user is reviewing UI, not signed in.
        const onDemoRoute = router.url.startsWith('/demo');
        if (!onDemoRoute) {
          try {
            localStorage.removeItem(AUTH_KEY);
          } catch {
            /* localStorage onbeschikbaar — niets te doen */
          }
          router.navigateByUrl(AuthRoutePath.LOGIN);
        }
      }

      return throwError(() => error);
    })
  );
}
