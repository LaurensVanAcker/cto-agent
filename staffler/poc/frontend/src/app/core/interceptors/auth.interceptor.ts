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

import { AUTH_KEY } from '../api/auth';
import { AuthRoutePath } from 'src/app/pages/auth';

const AUTH_SKEY_HEADER = 'x-boemm-skey';

export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const router = inject(Router);

  return next(
    req.clone({
      headers: req.headers.append(AUTH_SKEY_HEADER, localStorage.getItem(AUTH_KEY) || ''),
    })
  ).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized) {
        localStorage.removeItem(AUTH_KEY);
        router.navigateByUrl(AuthRoutePath.LOGIN);
      }

      return throwError(() => error);
    })
  );
}
