# Routing

## TL;DR

Beide apps gebruiken Angular standalone routing met `provideRouter(...)`. Lazy loading per feature module via `loadChildren` of `loadComponent`. Guards op `canMatch`-niveau (lazy loading + auth-check ineen). Geen `RouterModule.forRoot()`.

## dps route catalog

### Top-level (`src/app/app.routes.ts`)

```ts
export const routes: Routes = [
  ...AUTH_ROUTES,                                  // /login, /set-password, /forgot-password, /reset-password
  {
    path: AppRouteEnum.EMPLOYEE,                   // /employee
    loadChildren: () => import('./pages/employee/employee.routes').then(m => m.EMPLOYEE_ROUTES),
    canMatch: [authenticatedGuard],
  },
  {
    path: AppRouteEnum.COMPANY,                    // /company
    loadChildren: () => import('./pages/company/company.routes').then(m => m.COMPANY_ROUTES),
    canMatch: [authenticatedGuard],
  },
  {
    path: AppRouteEnum.SEARCH,                     // /search
    loadComponent: () => import('./pages/search/search.component').then(c => c.SearchComponent),
    canMatch: [authenticatedGuard, adminUserAccessGuard],
  },
  {
    path: AppRouteEnum.INVITATION,                 // /invitation
    loadChildren: () => import('./pages/invitation/invitation.routes').then(m => m.INVITATION_ROUTES),
  },
  {
    path: 'signin',                                // /signin (Cognito redirect handler)
    loadComponent: () => import('./pages/signin/signin.component').then(c => c.SigninComponent),
  },
  {
    path: 'admin',                                 // /admin (BoemmAD federated SSO redirect)
    loadComponent: () => new Promise(() => (window.location.href = environment.boemmLoginUrl)),
  },
  { path: '**', redirectTo: AppRouteEnum.SEARCH }, // catch-all → /search
];
```

`AppRouteEnum`:
```ts
EMPLOYEE = 'employee', SEARCH = 'search', COMPANY = 'company', INVITATION = 'invitation'
```

### Auth subroutes (`pages/auth/auth.routes.ts`)

```ts
export const AUTH_ROUTES: Routes = [
  { path: 'login',           loadComponent: ..., canMatch: [unauthenticatedGuard] },
  { path: 'set-password',    loadComponent: ..., canMatch: [unauthenticatedGuard] },
  { path: 'forgot-password', loadComponent: ..., canMatch: [unauthenticatedGuard] },
  { path: 'reset-password',  loadComponent: ..., canMatch: [unauthenticatedGuard] },
];
```

`AuthRoutePath`:
```ts
LOGIN = 'login', SET_PASSWORD = 'set-password', FORGOT_PASSWORD = 'forgot-password', RESET_PASSWORD = 'reset-password'
```

### Company subroutes (`pages/company/company.routes.ts`)

```ts
export const COMPANY_ROUTES: Routes = [
  {
    path: ':companyId',
    component: CompanyComponent,                   // wrapper met sidebar + drawer
    children: [
      { path: 'onboarding',         loadComponent: ... },
      { path: 'planning',           loadComponent: ... },                    // <- default landing
      { path: 'profile',            loadComponent: ... },
      { path: 'newcomers',          loadChildren: ... },                     // sub-routes per newcomer state
      { path: 'time-registration',  loadComponent: ..., canActivate: [COMPANY_TIME_REGISTRATION_CAN_ACTIVATE_FN] },
      { path: 'invitations',        loadChildren: ... },
      { path: 'groups',             loadChildren: ..., canActivate: [COMPANY_GROUPS_ENABLED_GUARD, GROUP_USER_ROLE_GUARD] },
      { path: 'user-accounts',      loadChildren: ... },
      { path: 'actuals',            loadChildren: ..., canActivate: [COMPANY_ACTUALS_ENABLED_GUARD] },
      { path: '**', redirectTo: 'planning' },
    ],
  },
];
```

`CompanyRouteEnum`:
```ts
ONBOARDING = 'onboarding', PLANNING = 'planning', PROFILE = 'profile', NEWCOMERS = 'newcomers',
TIME_REGISTRATION = 'time-registration', INVITATIONS = 'invitations', GROUPS = 'groups',
USER_ACCOUNTS = 'user-accounts', ACTUALS = 'actuals',
```

`CompanyRoutePathParam`:
```ts
COMPANY_ID = 'companyId'
```

`CompanyPlanningRouteQueryParams`:
```ts
{
  startDate: ISOString | null,
  endDate: ISOString | null,
  page: number,
  openedContractId?: string | null,
}
```

Filter-state wordt in URL gehouden via `QueryParamsService<CompanyPlanningRouteQueryParams>` (zie `forms.md`).

### Employee subroutes (`pages/employee/employee.routes.ts`)

```ts
export const EMPLOYEE_ROUTES: Routes = [
  {
    path: ':employeeId',
    component: EmployeeComponent,
    children: [
      { path: 'profile', loadComponent: ... },
      { path: '**', redirectTo: 'profile' },
    ],
  },
];
```

`EmployeeRouteEnum: PROFILE = 'profile'`. `EmployeeRoutePathParam: EMPLOYEE_ID = 'employeeId'`.
`EmployeeProfileQueryParamEnum: OPENED_WAGE_ID = 'openedWageId'` (deeplink naar specifieke wage in profile).

### Invitation subroutes

`pages/invitation/invitation.routes.ts` — geeft sub-routes voor invite-acceptance met `:invitationId` param.

### Cross-cutting guards

- `authenticatedGuard` (CanMatch) — controleert `localStorage.skey`, fetcht `currentUser` als nog niet in store.
- `unauthenticatedGuard` (CanMatch) — laat alleen door als niet ingelogd; anders redirect naar `/`.
- `adminUserAccessGuard` (CanMatch) — alleen voor BOEMM admin rollen op `/search`.
- `COMPANY_TIME_REGISTRATION_CAN_ACTIVATE_FN` (CanActivate) — checkt company.isTimeRegistrationEnabled.
- `COMPANY_GROUPS_ENABLED_GUARD` + `GROUP_USER_ROLE_GUARD` (CanActivate) — multi-step check voor groups feature.
- `COMPANY_ACTUALS_ENABLED_GUARD` (CanActivate) — checkt company.isActualsEnabled.

CanMatch wordt gebruikt voor lazy-load gating (geen module load als guard fail). CanActivate voor specifieke route-instances die wel mogen laden maar conditional active.

### Router options

```ts
provideRouter(routes, withViewTransitions())
```

`withViewTransitions()` activeert browser View Transitions API voor smooth animations tussen routes (Angular 17+, Chrome 111+, Safari 18+). Zonder fallback voor oudere browsers (geen animation in Firefox bv).

### Route param consumption

In `AppComponent` constructor:
```ts
this.router.events
  .pipe(
    filter(event => event.type === EventType.ActivationStart),
    map(event => (event as ActivationStart).snapshot.paramMap.get(CompanyRoutePathParam.COMPANY_ID)),
    filter(Boolean),
    untilDestroyed(this)
  )
  .subscribe(companyId => this.store.dispatch(new GetCompany(companyId)));
```

Elke `:companyId` change dispatcht een NGXS action `GetCompany` om `RootState.currentCompany` bij te werken. Dit is een global pattern: company-context volgt de URL, niet vice versa.

### Default landing logic

In `AppComponent` constructor (na startup):
```ts
if (window.location.pathname === '/') {
  this.authStore.getCurrUserData$().pipe(
    filter(currUser => !!currUser.companyMemberships.length),
    untilDestroyed(this)
  ).subscribe(currUser =>
    this.router.navigate([
      AppRouteEnum.COMPANY,
      getLastViewedCompanyMembership(currUser.companyMemberships).companyId,
    ])
  );
}
```

Op `/` na login: kies de meest-recent-bekeken company en navigeer naar `/company/:id` (default child = planning).

### Catch-all

`{ path: '**', redirectTo: AppRouteEnum.SEARCH }` — fallback naar `/search`. Maar `/search` heeft `adminUserAccessGuard`. Voor non-admin users die op een onbestaande URL landen wordt dat een redirect-to-redirect. Het `authenticatedGuard` op /search trapt eerst en stuurt naar /login als niet ingelogd, of naar /search als wel ingelogd maar dan blokkeert `adminUserAccessGuard` met... niets duidelijks. Volgens de `admin-user-access.guard.ts` returnt de guard `false` als de user niet de juiste rollen heeft. Bij `false` blijft de browser op de huidige URL hangen — dat kan een UX-bug zijn voor non-admin users met een typed-URL. Zie `quirks.md` punt 5.

---

## my-staffler route catalog

### Top-level (`src/app/app.routes.ts`)

```ts
export const APP_ROUTES: Routes = [
  { path: '',           pathMatch: 'full', redirectTo: AppRoutePath.TABS },        // / → /tabs
  { path: 'auth',       loadChildren: ..., canMatch: [guestGuard] },                // /auth (guest only)
  { path: 'onboarding', loadChildren: ..., canMatch: [authGuard] },                 // /onboarding/*
  { path: 'tabs',       loadChildren: ..., canMatch: [authGuard] },                 // /tabs/*
  { path: '**',         redirectTo: AppRoutePath.AUTH },                            // 404 → /auth
];
```

`AppRoutePath`:
```ts
ROOT = '', AUTH = 'auth', ONBOARDING = 'onboarding', TABS = 'tabs'
```

### Auth subroutes (`modules/auth/auth.routes.ts`)

```ts
export const AUTH_ROUTES: Routes = [
  { path: '', loadComponent: ... },     // single login screen at /auth
];
```

Niet meerdere paginas zoals dps. Force-pwd-reset is een verborgen state binnen LoginComponent (toggles `isFirstLogin` signal).

### Onboarding subroutes (`modules/onboarding/onboarding.routes.ts`)

```ts
export const ONBOARDING_ROUTES: Routes = [
  { path: '',            pathMatch: 'full', redirectTo: OnboardingRoutePath.PERMISSIONS },
  { path: 'permissions', loadComponent: ... },                                       // /onboarding/permissions
];
```

`OnboardingRoutePath: PERMISSIONS = 'permissions'`. Single onboarding step (camera + GPS + push permissions).

### Tabs shell (`modules/tabs/tabs.routes.ts`)

```ts
export enum TabRoutePath { SCHEDULE = 'schedule', CLOCK_IN = 'clock-in', PROFILE = 'profile' }

export const TABS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs.component').then(m => m.TabsComponent),
    children: [
      { path: 'schedule',  loadChildren: ... },
      { path: 'clock-in',  loadChildren: ... },
      { path: 'profile',   loadChildren: ... },
      { path: '',          pathMatch: 'full', redirectTo: 'schedule' },              // /tabs → /tabs/schedule
    ],
  },
];
```

`TabsComponent` is een Ionic-style tab-shell met `<ion-tabs>` + `<ion-tab-bar>` voor mobile-bottom-nav. `IonicRouteStrategy` zorgt dat tabs hun state bewaren bij switchen.

### Schedule subroutes (`modules/schedule/schedule.routes.ts`)

```ts
export enum ScheduleRoutePath { LIST = '', DETAIL = 'detail/:shiftId' }

export const SCHEDULE_ROUTES: Routes = [
  { path: '',                loadComponent: () => ScheduleListComponent },           // /tabs/schedule
  { path: 'detail/:shiftId', loadComponent: () => ShiftDetailComponent },             // /tabs/schedule/detail/:shiftId
];
```

`withComponentInputBinding()` (in `app.config.ts`) → `ShiftDetailComponent` krijgt `:shiftId` automatisch via `@Input() shiftId: string`.

### Clock-in subroutes (`modules/clock-in/clock-in.routes.ts`)

```ts
export const CLOCK_IN_ROUTES: Routes = [
  { path: '', loadComponent: () => ClockInComponent },                                // /tabs/clock-in
];
```

Single page; sub-routes voor selfie-capture en location-confirmation komen via dialogs/modals, niet route-changes.

### Profile subroutes (`modules/profile/profile.routes.ts`)

```ts
export const PROFILE_ROUTES: Routes = [
  { path: '',                  loadComponent: () => ProfileDetailsComponent },        // /tabs/profile
  { path: 'documents',         loadComponent: () => EmploymentDocumentsComponent },   // /tabs/profile/documents
  { path: 'personal-details',  loadComponent: () => PersonalDetailsComponent },       // /tabs/profile/personal-details
];
```

Drie pages: hoofdpagina, documents-list, personal-details edit.

### Cross-cutting guards

- `authGuard` (CanMatch) — checkt `AuthStore.isAuthenticated()` (token in Capacitor Preferences).
- `guestGuard` (CanMatch) — laat alleen niet-ingelogde users door op /auth.

Specifieke files niet in detail gelezen, vermoedelijk identiek aan dps' equivalente functions maar met `AuthStore` ipv `AuthApiService`.

### Router options

```ts
provideRouter(APP_ROUTES, withComponentInputBinding())
```

`withComponentInputBinding()` activeert `@Input()` automatic-bind van route params. Geen `withViewTransitions` (Ionic doet eigen page-transitions).

`{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }` — zorgt dat tab-state behouden blijft bij switchen tussen tabs.

### Deep linking

`AppComponent.constructor()`:
```ts
App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
  this.#zone.run(() => {
    try {
      const url = new URL(event.url);
      const path = url.pathname + url.search + url.hash;
      if (path && path !== '/') this.#router.navigateByUrl(path);
    } catch { /* malformed URL */ }
  });
});
```

Capacitor `App` plugin luistert op OS-deeplink-events (custom URL scheme `mystaffler://...` op iOS, `appLinks` op Android). Path uit de URL → router-navigatie.

### Catch-all

`{ path: '**', redirectTo: AppRoutePath.AUTH }` → onbekende URLs landen op login. Beter dan dps' `/search` fallback omdat het altijd reachable is.

---

## Vergelijking

| Aspect | dps | mystaffler |
|---|---|---|
| Top-level routes | 7 (login, employee, company, search, invitation, signin, admin) | 4 (root redirect, auth, onboarding, tabs) |
| Lazy module count | 12+ (alle features lazy) | 6 (auth, onboarding, tabs + 3 children) |
| Guards | authenticatedGuard, unauthenticatedGuard, adminUserAccessGuard, 4 feature-flags guards | authGuard, guestGuard |
| Route reuse strategy | default | IonicRouteStrategy (tab-state preservation) |
| View transitions | `withViewTransitions()` | `withComponentInputBinding()` (Ionic doet eigen transitions) |
| Component input binding | nee (manueel `route.snapshot.paramMap`) | ja (`withComponentInputBinding`) |
| Deep linking | via `/signin?skey=...` URL param | Capacitor `App.addListener('appUrlOpen')` |
| Catch-all | `**` → `/search` (kan loopen) | `**` → `/auth` (altijd reachable) |
| Default landing | `/company/:id/planning` (laatste-bekeken) | `/tabs/schedule` |
| Force-pwd reset route | aparte `/set-password` route | inline binnen `/auth` (signal-toggle) |

## Route mapping naar API

Cross-ref naar `../api/endpoints-index.md` (volledige BE endpoint lijst):

| Route (dps) | Voornaamste API call |
|---|---|
| `/login` | `POST /publicapi/companies/users/login` |
| `/set-password` | `POST /publicapi/companies/users/setPassword` |
| `/forgot-password` | `POST /publicapi/companies/users/resetPassword` |
| `/reset-password` | `POST /publicapi/companies/users/confirmResetPassword` |
| `/signin` | passive: skey uit URL → localStorage |
| `/admin` | redirect → Cognito hosted UI |
| `/company/:id` resolve | `GET /api/companies/:id` (via NGXS GetCompany) |
| `/company/:id/planning` | `GET /api/companies/:id/contracts?startDate=&endDate=` |
| `/company/:id/actuals` | `GET /api/companies/:id/contracts/confirmations` |
| `/company/:id/profile` | `GET/PATCH /api/companies/:id` |
| `/company/:id/newcomers` | `GET /api/companies/:id/newcomers` |
| `/company/:id/invitations` | `GET /api/companies/:id/invitations` |
| `/company/:id/groups` | `GET /api/companies/:id/groups` |
| `/company/:id/user-accounts` | `GET /api/companies/:id/users` |
| `/company/:id/time-registration` | `GET /api/companies/:id/time-registration` |
| `/employee/:id/profile` | `GET /api/employees/:id` |
| `/search` | `GET /api/search?q=...` (admin-only) |
| `/invitation/:id` | `GET /publicapi/invitations/:id`, `POST /publicapi/invitations/:id/accept` |

| Route (mystaffler) | Voornaamste API call |
|---|---|
| `/auth` | `POST /publicapi/employees/users/login` |
| `/tabs/schedule` | TBD: `GET /api/my-staffler/actuals` (BCJ-19435 in flight) |
| `/tabs/schedule/detail/:shiftId` | TBD: `GET /api/my-staffler/actuals/:id` (BCJ-19436) |
| `/tabs/clock-in` | TBD: `POST /api/my-staffler/actuals/:id/clockIn` (BCJ-19440) |
| `/tabs/profile` | `GET /api/users/currentuser` |
| `/tabs/profile/documents` | TBD: `GET /api/my-staffler/documents` (BCJ-19453, mock) |
| `/tabs/profile/personal-details` | TBD: `PATCH /api/my-staffler/users/profile` (BCJ-19451, mock) |
| `/onboarding/permissions` | geen API, alleen Capacitor permission requests |

## Resolvers

**Geen resolvers** in beide repos. Data wordt geladen in `ngOnInit` of via NGXS-action dispatched vanuit guards.

Voor de PoC: gebruik `withRouterConfig()` + resolver-functies als je atomic page-loads wil. Voorbeeld:
```ts
{ path: 'company/:id', resolve: { company: companyResolver }, loadComponent: ... }
```

Niet noodzakelijk voor de huidige codebase patterns.

## Lazy loading impact

Bundle splits per lazy-route. In dps:
- Initial bundle: `main.js` + auth-routes (vanwege `...AUTH_ROUTES` spread)
- Per company-feature: aparte chunk (planning, actuals, groups, …)
- Search, invitation, signin: aparte chunks

In mystaffler:
- Initial bundle: `main.js` + Ionic core
- Per tab-route: aparte chunk
- Per profile sub-route: aparte chunk

Network impact: eerste page-load downloadt alleen wat nodig is voor login (~200KB voor mystaffler, ~300KB voor dps na build:prod, niet gemeten in detail).

## Recommendation voor PoC

Voor een minimale frontend-PoC die de Staffler-API consumeert:
1. **Eén lazy module per "domein"** — auth, employee, company.
2. **CanMatch guards op auth** — niet inline-checks in components.
3. **`withComponentInputBinding()` aanzetten** — moderne pattern.
4. **Geen view transitions** in een PoC — extra complexiteit zonder UX-noodzaak.
5. **Geen IonicRouteStrategy** tenzij je echt mobile-tabs bouwt.
6. **Catch-all redirect naar `/login`** of `/auth` — altijd-reachable fallback.
