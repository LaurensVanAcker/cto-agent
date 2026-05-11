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

const showErrorStatusCodes: Array<HttpStatusCode> = [
  HttpStatusCode.BadRequest,
  HttpStatusCode.Forbidden,
  HttpStatusCode.Conflict,
];
const showErrorUrls: Array<string> = [
  CONTRACTS_API_URL,
  COMPANIES_API_URL,
  NEWCOMER_SELF_REGISTRATION_URL,
];

export function errorInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const dialogService = inject(DialogService);
  const ignore404 = req.context.get(IGNORE_404_ERROR);

  return next(req).pipe(
    catchError(error => {
      if (ignore404 && error instanceof HttpErrorResponse && error.status === HttpStatusCode.NotFound) {
        return throwError(() => error);
      }
      else if (error instanceof HttpErrorResponse && error.status !== HttpStatusCode.Unauthorized) {
        dialogService.open(GenericErrorDialogComponent, {
          modal: true,
          showHeader: false,
          styleClass: 'overflow-hidden max-w-30rem',
          data:
            showErrorStatusCodes.includes(error.status) &&
            showErrorUrls.some(url => req.url.includes(url))
              ? error.error
              : null,
        });
      }

      return throwError(() => error);
    })
  );
}
