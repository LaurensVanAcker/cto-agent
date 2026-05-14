import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
  HttpStatusCode,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { DialogService } from 'primeng/dynamicdialog';
import { GenericErrorDialogComponent } from '@dps/shared/components';
import { COMPANIES_API_URL, CONTRACTS_API_URL, NEWCOMER_SELF_REGISTRATION_URL } from '../api';
import { IGNORE_404_ERROR } from './ignore-404.token';

// Surfaces a modal only for genuinely user-actionable errors: validation,
// permission, conflict. Background data-fetch failures (DPS 5xx, missing
// scopes, etc.) just get logged so the rest of the surface keeps painting.
const USER_ACTIONABLE_STATUSES: Array<HttpStatusCode> = [
  HttpStatusCode.BadRequest,
  HttpStatusCode.Forbidden,
  HttpStatusCode.Conflict,
];
const ENRICHED_DIALOG_URLS: Array<string> = [
  CONTRACTS_API_URL,
  COMPANIES_API_URL,
  NEWCOMER_SELF_REGISTRATION_URL,
];

export function errorInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const dialogService = inject(DialogService);
  const ignore404 = req.context.get(IGNORE_404_ERROR);

  return next(req).pipe(
    catchError(error => {
      if (
        ignore404 &&
        error instanceof HttpErrorResponse &&
        error.status === HttpStatusCode.NotFound
      ) {
        return throwError(() => error);
      }
      // Only open the generic modal for actionable status codes. Everything
      // else (401 → handled by auth interceptor; 5xx → DPS hiccup, callers
      // already have catchError fallbacks) is logged but silent.
      if (
        error instanceof HttpErrorResponse &&
        USER_ACTIONABLE_STATUSES.includes(error.status)
      ) {
        dialogService.open(GenericErrorDialogComponent, {
          modal: true,
          showHeader: false,
          styleClass: 'overflow-hidden max-w-30rem',
          data: ENRICHED_DIALOG_URLS.some(url => req.url.includes(url))
            ? error.error
            : null,
        });
      } else if (error instanceof HttpErrorResponse && error.status >= 500) {
        // eslint-disable-next-line no-console
        console.warn(`[api ${error.status}] ${req.method} ${req.url}`, error.error);
      }

      return throwError(() => error);
    }),
  );
}
