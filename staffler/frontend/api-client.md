# API client (HTTP layer)

Hoe de frontends de Staffler-backend consumeren. Voor de backend-zelfreflectie zie `../api/openapi/openapi.json` en `../api/conventions.md`.

## Geen OpenAPI codegen

Beide repos houden de TypeScript types **handgeschreven** in `shared/models/` (dps) of `core/api/*/models/` (mystaffler). De OpenAPI spec uit `../api/openapi/openapi.json` (offline gereconstrueerd) is **niet** gebruikt om de FE-types te genereren.

Gevolg:
- Drift tussen BE-DTO en FE-model is mogelijk en gebeurt soms (zie `../api/live-findings.md` voor real DTO-shape correcties).
- Bij een breaking change moet iemand handmatig de FE-models updaten.
- Voor de PoC: gebruik wél `npm run gen:types` van `../poc/` (openapi-typescript) en consumeer die in de PoC zonder duplicatie.

## Base URLs per env

`environment.{ts|qa|dev}.ts` definieert per app:

```ts
// dps
apiBaseUrl:        '<gw>/v1/dps-api/api'
publicApiBaseUrl:  '<gw>/v1/dps-api/publicapi'
mediaBaseUrl:      '<gw>/v1/media/api/public/media'
publicMediaBaseUrl:'<gw>/v1/media/publicapi/media'

// mystaffler
apiBaseUrl:        '<gw>/v1/dps-api/api'
publicApiBaseUrl:  '<gw>/v1/dps-api/publicapi'
// geen media URLs
```

Beide apps **delen dezelfde gateway** per env. Verschil zit in de Cognito pool (zie `auth.md`).

## API service pattern (dps)

`core/api/<domain>/<domain>.api.service.ts` per domain. Voorbeeld `AuthApiService`:

```ts
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly CURRENT_USER_API_URL = `${environment.apiBaseUrl}/users/currentuser`;
  private readonly COMPANY_USER_API_URL = `${environment.publicApiBaseUrl}/companies/users`;

  constructor(private http: HttpClient, ...) {}

  login(username: string, password: string): Observable<AuthResultModel> {
    return this.http.post<AuthResultModel>(`${this.COMPANY_USER_API_URL}/login`, { username, password });
  }
  // ...
}
```

Geen base service class, geen RxJS `mergeMap`-trickery. Simpele wrappers rond `HttpClient`. Returns `Observable<DTO>`, components subscriben.

`core/api/index.ts` re-exporteert alle services + bekende URLs:

```ts
export * from './employee';
export * from './employee-wage';
export * from './dictionary/dictionary.api.service';
export * from './media/media.api.service';
export * from './models/base-api';
export * from './company';
export * from './contract/contract.api.service';
export * from './invitation/invitation.api.service';
export * from './consultant/consultant.api.service';
export * from './company-group/company-group.api.service';
export * from './company-group/company-group.api.model';
export * from './contract-confirmation';
export * from './user/user.api.service';
```

Importeren met `import { ContractApiService } from '@dps/core/api'`.

## API service pattern (mystaffler)

Slankere set: `auth`, `documents`, `onboarding`, `user` (vier domains). Elk in `core/api/<domain>/`. Veel zijn nog **mock-implementaties** met `delay()` + `console.log` en TODO-commentaar verwijzend naar BCJ-tickets:

```ts
// core/api/onboarding/onboarding.service.ts
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  // TODO: replace with real API call to store S3 identifier with completion date
  recordOnboarding(record: OnboardingRecord): Observable<void> {
    console.log('[OnboardingService] recordOnboarding (mock):', record);
    return of(undefined).pipe(delay(100));
  }
  // TODO: replace with real API call to register device token for push notifications
  storeDeviceToken(token: string): Observable<void> {
    console.log('[OnboardingService] storeDeviceToken (mock):', token);
    return of(undefined).pipe(delay(100));
  }
}
```

```ts
// core/api/user/user.service.ts
@Injectable({ providedIn: 'root' })
export class UserService {
  // TODO: BCJ-19451 triggers email verification flow on BE
  updateEmail(_email: string): Observable<void> { return of(undefined).pipe(delay(300)); }
  // TODO: BCJ-19451 triggers SMS verification flow on BE
  updatePhone(_phone: string): Observable<void> { return of(undefined).pipe(delay(300)); }
}
```

```ts
// core/api/documents/document.service.ts
const MOCK_DOCUMENTS: EmploymentDocument[] = [ ... 3 hardcoded items ... ];

getDocuments(): Observable<EmploymentDocument[]> {
  return of(MOCK_DOCUMENTS).pipe(delay(300));
  // TODO: BCJ-19453 replace mock
  //   this.#http.get<EmploymentDocument[]>(this.DOCUMENTS_API_URL)
}

getOpenedIds(): Observable<Set<string>> { ... Capacitor Preferences-backed Set lookup ... }
markAsOpened(id: string): Observable<void> { ... persist via Preferences ... }
```

`getOpenedIds` / `markAsOpened` zijn **echte** implementaties: ze persisten in Capacitor Preferences om de "New" badge bij geopende documenten af te zetten.

## HTTP interceptors

Beide repos registreren interceptors in dezelfde volgorde **maar omgekeerd**:

```ts
// dps app.config.ts
provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))

// mystaffler app.config.ts
provideHttpClient(withInterceptors([httpErrorInterceptor, authInterceptor]))
```

In dps loopt de auth-interceptor **eerst** (zet header → response gaat door errorInterceptor → die opent dialog op fout). In mystaffler loopt de error-interceptor eerst (zet toast op fout → response gaat door auth → die set header).

Dat is een non-trivial verschil. **In mystaffler kan je 401 dus dubbel-tonen**: de toast in `httpErrorInterceptor` toont "An unexpected error occurred" voordat de auth-interceptor het 401 vangt en navigatert naar `/auth`. Zie `quirks.md` punt 3.

### dps `authInterceptor`

```ts
const AUTH_SKEY_HEADER = 'x-boemm-skey';

export function authInterceptor(req, next) {
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
```

- `req.headers.append(...)` — append, niet set. Als je manueel een header toevoegt blijft die staan.
- Skey ALTIJD in header, ook leeg.

### dps `errorInterceptor`

```ts
const showErrorStatusCodes = [BadRequest, Forbidden, Conflict];   // 400, 403, 409
const showErrorUrls = [CONTRACTS_API_URL, COMPANIES_API_URL, NEWCOMER_SELF_REGISTRATION_URL];

export function errorInterceptor(req, next) {
  const dialogService = inject(DialogService);
  const ignore404 = req.context.get(IGNORE_404_ERROR);

  return next(req).pipe(
    catchError(error => {
      if (ignore404 && error.status === NotFound) return throwError(() => error);
      if (error instanceof HttpErrorResponse && error.status !== Unauthorized) {
        dialogService.open(GenericErrorDialogComponent, {
          modal: true,
          showHeader: false,
          styleClass: 'overflow-hidden max-w-30rem',
          data: showErrorStatusCodes.includes(error.status) && showErrorUrls.some(url => req.url.includes(url))
            ? error.error
            : null,
        });
      }
      return throwError(() => error);
    })
  );
}
```

Logica:
- **401** → niet hier afgehandeld, doorgegeven aan authInterceptor.
- **404 met `IGNORE_404_ERROR` context-token** → silent rethrow. Voor calls die optioneel zijn (bv. "haal team-info op, mag ontbreken").
- **400/403/409 op een paar specifieke URLs** (contracts, companies, newcomer self-registration) → toon de **echte** server-error JSON in de dialog. Voor andere status codes/urls → toon een generieke dialog zonder details.
- **Alle andere errors** (500, 502, network) → generieke `GenericErrorDialogComponent` zonder data.

`IGNORE_404_ERROR` token:
```ts
// core/interceptors/ignore-404.token.ts
export const IGNORE_404_ERROR = new HttpContextToken<boolean>(() => false);

// gebruik per call
this.http.get(url, { context: new HttpContext().set(IGNORE_404_ERROR, true) });
```

### mystaffler `httpErrorInterceptor`

```ts
export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);
  return next(req).pipe(
    catchError(error => {
      const message: string = error?.error?.message ?? error?.message ?? 'An unexpected error occurred.';
      toastService.showError(message);
      return throwError(() => error);
    })
  );
};
```

Veel simpeler: voor elke fout een toast tonen met de server-error-message. Geen filter op status code, geen ignore-token, geen onderscheid tussen "expected" en "unexpected" errors. **Status 401 toont dus ook een toast**, naast de redirect die de auth-interceptor doet. Bekend gevolg: dubbele feedback bij sessieverloop.

### mystaffler `authInterceptor`

(Volledige code zie `auth.md`.) Highlights:
- Header alleen sturen als token bestaat.
- `withCredentials: true` (cookies meesturen).
- 401 → `from(authStore.clear()).pipe(switchMap(() => { router.navigateByUrl('/auth'); return EMPTY; }))`. **Returnt EMPTY**, error-stream stopt hier. Subscribers in components zien geen `.error()` callback. Loading-states moeten dan via `.complete()`-handler gereset worden — een subtle gotcha.

## Pagination

Backend gebruikt Spring Pageable shape: `?page=0&size=20&sort=field,asc`. FE-types in dps:

```ts
// shared/models/pageable-request-params.model.ts
export interface PageableRequestParams { page?: number; size?: number; sortBy?: string; }

// shared/models/pageable-response-payload.model.ts
export interface PageableResponsePayload<T> { content: T[]; totalElements: number; ... }
```

Geen abstractie zoals "load more" of cursor-based — components doen zelf `?page=N&size=M` query params samenstellen. Zie `pages/company/modules/planning/` voor concrete pagination patroon (volgende pass).

## Retry strategie

**Geen** automatische retry's in beide repos. Geen `retryWhen`, geen exponential backoff. Reden:
- API gateway koud-start kan 5-10 sec duren in dev/qa, maar app-level retry verbergt dat slecht voor de user.
- Een refresh-token flow in de gateway zelf maakt FE-side refresh-retries irrelevant.

Component-code die wel een retry wil, moet `.pipe(retry(2))` zelf toevoegen. Geen pattern voor reusable retry-policy.

## Caching

**Geen client-side cache** in beide repos:
- Geen `HttpInterceptor` met cache-Map.
- Geen `@ngneat/cashew` of `apollo`-stijl cache.
- Custom `Store<T>` per service kán cachen (bv. `AuthStore.currentUser`) maar doet dat alleen voor cross-component state-share, niet voor cache-invalidation logic.
- Service Worker (PWA) cached statische assets (`assets/i18n/*.json`, fonts) maar geen API responses.

Effect: elke component-init triggers fresh GET. Soms 4-5 calls per route-hit. Voor de PoC: doe één API-aggregator endpoint of een client-state Store per resource (zoals dps' AuthStore).

## File upload (dps)

`MediaApiService` (`core/api/media/media.api.service.ts`) handelt file uploads naar `mediaBaseUrl` (separate gateway sub-route `/v1/media/api/public/media`). Vermoedelijk multipart `FormData`, niet gelezen in detail. Components: `media-card`, `address-autocomplete-field` (heeft media als attachment context).

Dps-prefixed media URLs voor weergave: pipe `MediaFileSourcePipe` in `shared/pipes/media-file-source/`. Resolves een media-id naar een full `<img src>` URL via env config.

## File upload (mystaffler)

Geen MediaApiService. Gepland in BCJ-19440 (clock-in selfie naar S3). Camera capture via `@capacitor/camera`, daarna upload via `HttpClient.post(formData)`. Niet geïmplementeerd op 10/05/2026.

## CORS handling

FE-zijde geen CORS-config nodig (dat is server). Maar het zorgt voor **lokale dev** problemen:

| Scenario | Werkt zonder hulp? |
|---|---|
| `npm start` op localhost:1444/1445 → tegen QA gateway | nee, gateway weigert preflight (origin niet in allowedOrigins) |
| `npm start` op localhost → tegen lokale BE | ja, lokale BE laat localhost toe |
| `npm start` op localhost → tegen dev gateway | ja, dev allowedOrigins bevat localhost:1445 default |
| `npm start` op localhost → tegen PROD | nee, idem als QA |
| Vercel preview deploy → tegen QA | nee, vraag dev-ops origin toe te voegen |

Workaround voor de PoC: server-side proxy (zoals in `../poc/`). Gateway ziet een server-IP als origin, geen browser-CORS check nodig.

## Error envelope (BE-side)

Backend stuurt foutresponses als:
```json
{
  "code": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong",
  "traceId": "...",
  "details": [ ... ]
}
```

Zie `../api/errors.md` voor de 53 bekende error codes.

In dps' `errorInterceptor` wordt `error.error` (= het JSON-body object) doorgegeven aan `GenericErrorDialogComponent` voor de specifieke URLs. Component leest `code` + `message` + optionele `details`.

In mystaffler's `httpErrorInterceptor` wordt `error?.error?.message` opgehaald → toast.

`api-error.model.ts` (dps shared):
```ts
export interface ApiErrorModel {
  code: string;
  message: string;
  traceId?: string;
  details?: string[];
}
```

## Concrete request example

Hieronder de calls die je zou zien tijdens een typische dps-login + landing op `/company/<id>/planning`:

```
1.  POST /v1/dps-api/publicapi/companies/users/login            (no skey)
    body: {username, password}
    resp: {authStatus: SUCCESS, skey: "AbCdEf..."}

2.  GET  /v1/dps-api/api/users/currentuser
    headers: x-boemm-skey: AbCdEf...
    resp: CurrentUserModel

3.  GET  /v1/dps-api/api/companies/<id>
    headers: x-boemm-skey: ...
    resp: CompanyDetailModel    (triggered by CompanyComponent ngOnInit + GetCompany action)

4.  GET  /v1/dps-api/api/companies/<id>/contracts/confirmations/count
    resp: number                (LoadActualsCount, polled every 60s)

5.  GET  /v1/dps-api/api/companies/<id>/contracts?startDate=...&endDate=...&page=0&size=...
    resp: PageableResponsePayload<ContractModel>

6.  GET  /v1/dps-api/publicapi/dictionaries?types=statutes,absencereasons,countries
    (anonymous, no skey needed but interceptor sends header anyway)
    resp: DictionaryModel
```

## API client pattern voor de PoC

Aanbeveling voor `frontend/poc/` (zie ook PoC README):

1. Eén `StafflerClient` class die de `fetch` (of `HttpClient`) wrapt.
2. Skey in een `private token: string`, niet localStorage. Maakt server-side rendering simpel.
3. Methodes per domain: `client.auth.login(...)`, `client.dictionaries.getStatutes()`, etc.
4. **Wel** type-checken tegen de OpenAPI-types uit `../api/openapi/openapi.json` (use `openapi-typescript` of `openapi-fetch`).
5. Eén centrale error-mapper die de BE error-envelope parseert naar een typed `StafflerError` met `code` + `message` + `traceId`.
6. Geen automatische retries, maar wél een single retry op 401 met re-login (omdat backend autorefresht is dat zelden nodig, maar safety-net is goed).
