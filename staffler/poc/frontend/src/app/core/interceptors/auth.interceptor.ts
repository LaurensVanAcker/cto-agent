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

// PoC: sessie loopt via een httpOnly cookie (poc_sid) die Fastify zet bij
// /api/login. De frontend kent geen skey en stuurt geen x-boemm-skey header
// meer. We hebben enkel withCredentials nodig zodat de cookie meegestuurd
// wordt op elke call naar /api/*.
export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const router = inject(Router);

  return next(req.clone({ withCredentials: true })).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized) {
        router.navigateByUrl(AuthRoutePath.LOGIN);
      }

      return throwError(() => error);
    })
  );
}
