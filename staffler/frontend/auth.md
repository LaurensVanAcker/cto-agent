# Authentication (frontend-side)

Cross-ref: zie `../api/auth.md` voor de volledige skey-lifecycle aan backend-zijde (Cognito InitiateAuth, Lambda authorizer, JWT-naar-skey conversie). Dit document focust op wat de FE doet en waar de FE-keuzes afwijken tussen `dps` en `my-staffler`.

## Korte recap (wat de backend verwacht)

1. POST `/publicapi/{companies|employees}/users/login` met `{username, password}`.
2. Antwoord = `AuthResultWebDto`:
   - `authStatus = "SUCCESS"` → `skey` populated, gebruik die.
   - `authStatus = "FORCE_PASSWORD_RESET"` → `session` populated, post nieuwe password naar `/setPassword`.
3. Skey gaat in elke verdere call als `x-boemm-skey: <skey>` header.
4. Bij 401 op een authenticated call: skey is dood. FE moet hem wegwerken en re-login afdwingen.
5. Logout: opt-in. Optie A is "alleen lokaal token wissen" (dps default). Optie B is `GET /api/users/logout` voor server-side Cognito GlobalSignOut (dps logout-confirmation modal).

## dps (admin SPA): localStorage flow

### Storage key
- `localStorage.skey` — opaque string. **Geen expiry, geen refresh**. De skey blijft 6 maanden geldig (cookie max-age in backend), backend refresht het Cognito access token automatisch in de Lambda authorizer.

### Login interactie

`AuthApiService` (`src/app/core/api/auth/auth.api.service.ts`):
```ts
private readonly CURRENT_USER_API_URL = `${environment.apiBaseUrl}/users/currentuser`;
private readonly COMPANY_USER_API_URL = `${environment.publicApiBaseUrl}/companies/users`;
private readonly USER_API_URL = `${environment.apiBaseUrl}/users`;

getCurrentUser():     this.http.get<CurrentUserModel>(this.CURRENT_USER_API_URL)
login(u, p):          this.http.post<AuthResultModel>(`${this.COMPANY_USER_API_URL}/login`, { username: u, password: p })
setPassword(payload): this.http.post<AuthResultModel>(`${this.COMPANY_USER_API_URL}/setPassword`, payload)
resetPassword(u):     this.http.post<void>(`${this.COMPANY_USER_API_URL}/resetPassword`, { username: u })
confirmResetPassword: this.http.post<void>(`${this.COMPANY_USER_API_URL}/confirmResetPassword`, payload)
private logoutCognito: this.http.get<void>(`${this.USER_API_URL}/logout`)

logout(): {
  // PrimeNG dialog 'LogoutConfirmationComponent' met checkbox "logout from all devices"
  // Indien checked: logoutCognito() (server-side GlobalSignOut)
  // Indien niet:    enkel localStorage.removeItem(AUTH_KEY) + AuthStore.reset() + dispatch(ClearCompanyData) + navigate(/login)
}
```

`get isAuthenticated(): boolean` returnt `!!localStorage.getItem(AUTH_KEY)` — geen expiry-check, geen ping-the-server, gewoon "is er een skey?". Dat is bewust simpel omdat de backend autorefresht.

### Login submit (LoginComponent)

```ts
this.authApiService.login(email, password).subscribe({
  next: resp => {
    if (resp.authStatus === AuthResultStatusEnum.SUCCESS) {
      localStorage.setItem(AUTH_KEY, resp.skey);
      this.authApiService.getCurrentUser().pipe(
        tap(currentUser => this.authStore.setCurrentUser(currentUser))
      ).subscribe(currUser => {
        this.router.navigate([
          AppRouteEnum.COMPANY,
          getLastViewedCompanyMembership(currUser.companyMemberships).companyId,
        ]);
      });
    }
    if (resp.authStatus === AuthResultStatusEnum.FORCE_PASSWORD_RESET) {
      this.router.navigateByUrl(AuthRoutePath.SET_PASSWORD, { state: resp });
    }
  },
  error: () => this.messageService.add({ severity: 'error', sticky: true, summary: ... }),
});
```

Belangrijke detail: `getLastViewedCompanyMembership(currUser.companyMemberships)` kiest het bedrijf met de meest-recente `lastViewedAt` timestamp uit de gebruiker's company memberships, en navigeert daarheen. Dat is de "remember last company"-feature.

Bij `FORCE_PASSWORD_RESET` worden de (kortlevende) Cognito session wel doorgegeven via `Router.state` zodat de SetPasswordComponent hem niet hoeft te onthouden (max 3 min geldigheid, zie `../api/auth.md`).

### Auth interceptor

`src/app/core/interceptors/auth.interceptor.ts`:
```ts
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

- **Voegt header `x-boemm-skey` ALTIJD toe**, ook als skey leeg is. Backend verwerkt een lege skey door 401 te returnen op `/api/...` paths.
- **Op 401 wist hij localStorage en redirect naar /login**. Dit gebeurt op `request`-niveau, dus elke component die `next()` doet krijgt het automatisch — geen manuele 401-handling per call.
- **Geen retry-logica**, geen refresh-token call (omdat backend autorefresht).

### Signin redirect (Cognito hosted UI return)

Op PROD gebruikt BOEMM-medewerkers federated SSO via BoemmAD. De Cognito hosted UI redirect na succesvolle code exchange naar `/v1/signin?skey=...`, een gateway-route die afgehandeld wordt door een Lambda. Die Lambda redirect dan naar de SPA op `/signin?skey=...&redirectPath=...`.

`SigninComponent` (`src/app/pages/signin/signin.component.ts`):
```ts
this.route.queryParamMap.pipe(
  filter(paramMap => paramMap.has(AUTH_KEY)),
  take(1)
).subscribe(paramMap => {
  localStorage.setItem(AUTH_KEY, paramMap.get(AUTH_KEY) as string);
  this.router.navigateByUrl(paramMap.get(REDIRECT_PATH_QUERY_PARAM_KEY) || '');
});
```

Dat is de "ik kom net van Cognito"-handler. Pikt skey uit URL-query, slaat op in localStorage, navigeert naar de gewenste landingsroute.

`/admin` route gebruikt een truc: lazy `loadComponent` is een Promise die nooit resolved, maar in de Promise body wordt een `window.location.href = environment.boemmLoginUrl` toegekend. Dat triggert de browser om naar de Cognito hosted UI te gaan zonder Angular ooit een component te renderen. Smooth redirect via lazy-load.

### Guards

`src/app/core/api/auth/guards/`:

```ts
// authenticated.guard.ts (CanMatch)
export const authenticatedGuard: CanMatchFn = () => {
  const authApiService = inject(AuthApiService);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  return authApiService.isAuthenticated
    ? authStore.select$(state => state.currentUser).pipe(
        take(1),
        switchMap(currentUser =>
          currentUser
            ? of(currentUser)
            : authApiService.getCurrentUser().pipe(tap(u => authStore.setCurrentUser(u)))
        ),
        map(() => true),
      )
    : router.createUrlTree([AuthRoutePath.LOGIN]);
};
```

Werkt op `CanMatch` niveau, dus de hele lazy module wordt niet eens geladen als je niet ingelogd bent. Lazy-load + auth-check tegelijk = snellere "redirect naar login" UX.

```ts
// unauthenticated.guard.ts (omgekeerd, op /auth/* routes)
return !authApiService.isAuthenticated || router.createUrlTree([]);
```

```ts
// admin-user-access.guard.ts (alleen op /search route)
return authStore.getCurrUserData$().pipe(
  map(() => authStore.hasRoles([
    UserRole.FULL_ADMIN, UserRole.CREDIT_CONTROLLER, UserRole.SALES_ADMIN,
    UserRole.SUPER_ADMIN, UserRole.RECRUITER, UserRole.PREVENTION_ADVISOR,
    UserRole.DPS_SALES, UserRole.DPS_DIRECTOR,
  ])),
);
```

Gebruikt `authStore.hasRoles(...)` die kijkt naar de huidige company-membership rol en valt terug op de globale `userRoles` array als er geen company-context is.

### `AuthStore`

`src/app/core/store/auth.store.ts`:
```ts
@Injectable({ providedIn: 'root' })
export class AuthStore extends Store<{ currentUser: CurrentUserModel | null }> {
  #ngxsStore = inject(NgxsStore);
  readonly currCompany = this.#ngxsStore.selectSignal(RootState.getCompanyData);

  setCurrentUser(currentUser: CurrentUserModel) { this.update({ currentUser }); }
  getCurrUserData$() { return this.select$(state => state.currentUser).pipe(filter(Boolean)); }
  hasRoles(desiredRoles: UserRole[]): boolean {
    const currentUser = this.get().currentUser;
    if (!currentUser) return false;
    const roles = currentUser.companyMemberships?.length > 0
      ? [currentUser.companyMemberships.find(m => m.companyId === this.currCompany()?.id)?.role].filter(Boolean)
      : currentUser.userRoles ?? [];
    return desiredRoles.some(role => roles.includes(role));
  }
}
```

Dit is de kruising tussen NGXS (current company) en custom store (current user). De `hasRoles` check is contextual: als de user op een company zit, wordt de **rol binnen dat bedrijf** gebruikt; anders fallback op `userRoles` (BOEMM-medewerker rollen).

### Logout met confirmation

Modal `LogoutConfirmationComponent` heeft een checkbox "log out from all devices". Als aangevinkt → `logoutCognito()` (Cognito GlobalSignOut, alle sessies van die user dood). Anders alleen lokaal:

```ts
localStorage.removeItem(AUTH_KEY);
this.store.dispatch(new ClearCompanyData());     // NGXS RootState
this.authStore.reset();                           // custom store
this.router.navigateByUrl(AuthRoutePath.LOGIN);
```

---

## my-staffler (employee mobile): Capacitor Preferences flow

### Storage key
- Capacitor `Preferences` plugin onder key `staffler_auth_token`. **Geen localStorage** — dat werkt niet betrouwbaar in WKWebView (iOS) en kan worden gewist door OS-cleanup.
- Op web (PWA) gebruikt Capacitor Preferences automatisch IndexedDB onder de hood.

### `AuthStore`

`src/app/core/storage/auth/auth.store.ts`:
```ts
export const AUTH_TOKEN_KEY = 'staffler_auth_token';

@Injectable({ providedIn: 'root' })
export class AuthStore extends Store<{ currentUser: CurrentUser | null; token: string | null }> {
  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY });
    if (value) this.update({ token: value });
  }

  getToken(): string | null  { return this.select(s => s.token); }
  isAuthenticated(): boolean { return !!this.getToken(); }

  async setToken(token: string): Promise<void> {
    await Preferences.set({ key: AUTH_TOKEN_KEY, value: token });
    this.update({ token });
  }

  async clear(): Promise<void> {
    await Preferences.remove({ key: AUTH_TOKEN_KEY });
    this.update({ currentUser: null, token: null });
  }
}
```

`init()` wordt door `provideAppInitializer(() => inject(AuthStore).init())` aangeroepen vóór de eerste route resolved. Dat is essentieel: de eerste request die door de auth-interceptor gaat moet de token al in store hebben, anders gaat hij zonder header op pad.

### Login service

`src/app/core/api/auth/auth.service.ts`:
```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly CURRENT_USER_API_URL = `${environment.apiBaseUrl}/users/currentuser`;
  private readonly EMPLOYEE_USER_API_URL = `${environment.publicApiBaseUrl}/employees/users`;

  getCurrentUser(): Observable<CurrentUser> {
    return this.#http.get<CurrentUser>(this.CURRENT_USER_API_URL);
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.#http.post<LoginResponse>(`${this.EMPLOYEE_USER_API_URL}/login`, credentials);
  }

  logout(): Observable<void> {
    return from(this.#authStore.clear());
  }
}
```

Verschillen met dps:
- Login url is `/publicapi/employees/users/login` (employee pool, niet company pool).
- Geen `setPassword` of `resetPassword` op deze service. **Force-password-reset** flow is in flight (BCJ-19535) maar nog niet geïmplementeerd in dit kanaal.
- Logout is gewoon de store wissen, geen server-side Cognito GlobalSignOut. Dat zit nog in BCJ-19431 (`DEV TESTING`).

### Login submit (LoginComponent)

```ts
const result = await firstValueFrom(this.#authService.login(this.loginForm.getRawValue()));
if (result.authStatus === AuthResultStatusEnum.FORCE_PASSWORD_RESET) {
  this.isFirstLogin.set(true);
  return;        // toont newPasswordForm in template, maar onSetNewPassword is leeg ('to be done in another tiket')
}

if (result.authStatus === AuthResultStatusEnum.SUCCESS) {
  await this.#authStore.setToken(result.skey);
  await firstValueFrom(this.#authService.getCurrentUser().pipe(
    tap(user => this.#authStore.setCurrentUser(user))
  ));
  await this.#navigateAfterLogin();   // → /tabs
}
```

De LoginComponent heeft ook een `loginItsme()` placeholder en een tweede `newPasswordForm` met `passwordStrengthValidator` + `passwordMatchValidator` validators ingebakken. De form bestaat maar `onSetNewPassword()` is een lege body — geplande implementatie via BCJ-19535 (zie `breaking-changes-q23.md`).

### Auth interceptor

`src/app/core/interceptors/auth.interceptor.ts`:
```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  const token = authStore.getToken();
  const authReq = token
    ? req.clone({
        headers: req.headers.set(AUTH_SKEY_HEADER, token),
        withCredentials: true,
      })
    : req;

  return next(authReq).pipe(
    catchError(error => {
      const isApiRequest = req.url.includes(environment.publicApiBaseUrl);
      if (isApiRequest && error.status === HttpStatusCode.Unauthorized && authStore.isAuthenticated()) {
        return from(authStore.clear()).pipe(switchMap(() => {
          router.navigateByUrl(`/${AppRoutePath.AUTH}`);
          return EMPTY;
        }));
      }
      return throwError(() => error);
    })
  );
};
```

Verschillen met dps' interceptor:
- **Token-aanwezigheid wordt gecheckt** voor de header gezet wordt. Geen lege headers gestuurd.
- **`withCredentials: true`** wordt meegegeven (cookies meesturen). Relevant voor de `SKEY`-cookie die backend ook zet (zie `../api/auth.md`).
- **De 401-handler is striker**: alleen op API-requests (`req.url.includes(environment.publicApiBaseUrl)` — let op: dit checkt PUBLICapi, niet apiBaseUrl, mogelijk een bug; zie `quirks.md`) en alleen als je nog dacht ingelogd te zijn (`authStore.isAuthenticated()`).
- **Returnt `EMPTY`** in plaats van error door te gooien — zwakker error-bubbling. Component-code ziet de 401 niet, ziet alleen "request voltooid maar zonder data". Dat kan onverwachts loadingstates blokkeren in subscribers.

### Guards

`src/app/core/api/auth/guards/auth.guard.ts` en `guest.guard.ts` — namen `authGuard` (canMatch) en `guestGuard`. Nog niet gelezen op tekst-niveau, maar bedoeling is identiek aan `authenticated.guard.ts` / `unauthenticated.guard.ts` in dps.

```ts
// app.routes.ts gebruik
{
  path: AppRoutePath.AUTH,
  loadChildren: () => import('./modules/auth/auth.routes').then(m => m.AUTH_ROUTES),
  canMatch: [guestGuard],
},
{
  path: AppRoutePath.TABS,
  loadChildren: () => import('./modules/tabs/tabs.routes').then(m => m.TABS_ROUTES),
  canMatch: [authGuard],
},
```

---

## Vergelijkingsmatrix auth-stack

| Aspect | dps | my-staffler |
|---|---|---|
| Storage primitive | `localStorage` key `skey` | Capacitor `Preferences` key `staffler_auth_token` |
| Header naam | `x-boemm-skey` | `x-boemm-skey` (gelijk) |
| Header set wanneer | altijd, ook als leeg | alleen als token bestaat |
| `withCredentials` | nee | ja |
| Login URL | `/publicapi/companies/users/login` | `/publicapi/employees/users/login` |
| Cognito user pool | `DPS` company pool | `MyDPS` employee pool |
| Force-pwd-reset | `setPassword` endpoint live | UI bestaat, BE TODO (BCJ-19535) |
| Forgot-pwd | `resetPassword` + `confirmResetPassword` live | niet aanwezig |
| Federated SSO | BoemmAD via Cognito hosted UI (`/admin` redirect) | itsme placeholder, `loginItsme()` is `console.log` |
| 401 reactie | wis localStorage, navigate `/login` | wis Preferences, navigate `/auth`, return EMPTY |
| Get current user | `GET /api/users/currentuser` | identiek (`GET /api/users/currentuser`) |
| Logout | dialog + opt-in server-side GlobalSignOut | alleen lokale token-clear |
| Has-roles check | `AuthStore.hasRoles([...])` met company context | n.v.t., MyStaffler has 1 role |

## Conclusies / advies voor PoC-bouwers

1. **Voor een nieuwe PoC: kopieer de dps-aanpak** — het is de meest compleet uitgewerkte (force-pwd, forgot-pwd, federated SSO, role-based guards). Vervang alleen `localStorage` door iets persistents (cookies, IndexedDB) als je client-side cross-tab nodig hebt.
2. **Vermijd de mystaffler 401-handler return-EMPTY** — gebruik gewoon `throwError(() => error)` zodat je components ook een fail-state kunnen tonen.
3. **Skey is opaque** — probeer hem niet te decoderen. Geen JWT, geen base64 payload. Is gewoon een DynamoDB-row-key naar de echte Cognito tokens.
4. **Geen MFA** in beide flows. De Cognito pool kan MFA aanzetten maar `/publicapi/{companies|employees}/users/login` accepteert alleen username+password vandaag.
5. **De dps `setPassword`-flow heeft 3 min window** (Cognito `AuthSessionValidity`). Geen lange wizard tussen login-response en setPassword-call zetten.
6. **Cookie wordt OOK gezet** door backend (`SKEY=<skey>; Domain=...; Secure; Max-Age=15552000`). Voor de meeste calls niet relevant, maar `my-staffler` zet `withCredentials: true` zodat de cookie meekomt — handig als backend ooit naar cookie-only auth migreert.
