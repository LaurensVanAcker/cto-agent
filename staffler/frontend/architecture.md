# Architecture

## TL;DR

Twee onafhankelijke Angular-applicaties met **dezelfde backend** en sterk verschillende stacks. `dps` is gebouwd in een 2024-Angular-19-stijl met klassieke standalone components + zonal change detection (experimentally zoneless), NGXS voor app-state, en PrimeNG als design system. `my-staffler` is gestart in 2026 met de moderne ionic-mobile stack: Angular 21, standalone components, signals, Capacitor voor native, en een veel slankere set dependencies. Geen monorepo, geen gedeelde libraries.

## dps (admin SPA)

### Bootstrap

`src/main.ts`:
```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
```

Geen `AppModule` — fully standalone. `appConfig` (in `src/app/app.config.ts`) zet alle providers expliciet:

```ts
providers: [
  provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
  provideRouter(routes, withViewTransitions()),
  importProvidersFrom(I18nModule),
  provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  provideExperimentalZonelessChangeDetection(),
  DialogService,
  { provide: ErrorHandler, useClass: RollbarErrorHandler },
  { provide: RollbarService, useFactory: rollbarFactory },
  provideAppInitializer(() => featureFlagFactory(inject(FeatureFlagService))()),
  provideAnimationsAsync(),
  providePrimeNG({ theme: { preset: DPS_LIGHT_THEME_PRESET, options: { darkModeSelector: false } } }),
  importProvidersFrom(NgxGoogleAnalyticsModule.forRoot(environment.googleMeasurementId)),
  NgxGoogleAnalyticsRouterModule,
  provideStore([RootState], withNgxsLoggerPlugin({ collapsed: true, disabled: environment.envName === EnvNameEnum.PROD })),
],
```

Belangrijke keuzes:
- **`provideExperimentalZonelessChangeDetection()`** — zoneless mode aan. Dat betekent geen `zone.js`-patching meer; updates komen van signals, `ChangeDetectorRef.markForCheck()` of routerevents. Mengvorm met NGXS werkt omdat NGXS observables triggeren `MessageService.add()` etc. via `selectSignal`.
- **Service Worker** geactiveerd in non-dev. `ngsw-worker.js`, registratie pas na 30 sec stable.
- **`provideAppInitializer`** wacht op LaunchDarkly initialize, blokkeert app-start tot SDK klaar is (max ~timeout, anders default-flag waarden).
- **PrimeNG** met custom Lara-preset (zie `app.theme.ts`), dark mode hard uitgezet (`darkModeSelector: false`).
- **NGXS** met logger-plugin, uitgezet op prod.

### Module-structuur

```
src/app/
├── app.component.{ts,html,scss}     dps-root, root toast voor app-update
├── app.config.ts                    providers (zie boven)
├── app.routes.ts                    top-level lazy routes
├── app.routes.model.ts              AppRouteEnum (EMPLOYEE, SEARCH, COMPANY, INVITATION)
├── app.theme.ts                     DPS_LIGHT_THEME_PRESET (PrimeNG Lara override)
├── core/
│   ├── api/                         API services: auth, company, contract, employee, dictionary, invitation, media, ...
│   ├── app-update/                  AppUpdateService (SwUpdate poll)
│   ├── feature-flag/                LaunchDarkly init + FeatureFlagKey enum
│   ├── i18n/                        I18nModule, AppLocaleEnum, ngx-translate config
│   ├── interceptors/                authInterceptor, errorInterceptor, IGNORE_404_ERROR token
│   ├── notification-preferences/    notification prefs API+storage
│   ├── rollbar/                     RollbarErrorHandler + factory
│   └── store/
│       ├── auth.store.ts            custom Store<AuthState>, sole source for currentUser
│       ├── store.ts                 abstract Store<T> base (BehaviorSubject + shareReplay)
│       └── root/                    NGXS RootState (current company, sidenav, mobile bp, actuals count)
├── pages/
│   ├── auth/                        login, set-password, forgot-password, reset-password
│   ├── company/                     /company/:companyId nest
│   │   ├── company.component.ts     wrapper met main-menu + drawer (mobile sidenav)
│   │   └── modules/
│   │       ├── onboarding/, planning/, profile/, newcomers/, time-registration/,
│   │       │   invitations/, groups/, user-accounts/, actuals/
│   ├── employee/                    /employee/:employeeId nest (BOEMM-side employee detail)
│   ├── invitation/                  invite-accept landing
│   ├── search/                      /search global search (alleen admin)
│   └── signin/                      /signin redirect-handler (Cognito hosted UI return)
└── shared/
    ├── components/                  17 standalone components (zie components.md)
    ├── configs/                     general-scheduler.config.ts (Bryntum), company-route-icons.config.ts
    ├── constants/                   contract.ts, employee.ts, masks.ts, time-registration.ts, ...
    ├── directives/                  navigate-back-button (history-back)
    ├── functions/                   getLastViewedCompanyMembership(), ...
    ├── models/                      24 domain interfaces (Company, Contract, CurrentUser, …)
    ├── pipes/                       format-datetime, time-diff, vat-mask, media-file-source
    ├── services/                    QueryParamsService (URL state)
    ├── types/                       cross-cutting TS types
    └── validators/                  17 form-validators (IBAN, SSN, dimona-rules, …)
```

### Standalone components

Alle nieuwe components zijn standalone met inline `imports: [...]`. Voorbeeld (`AppComponent`):

```ts
@Component({
  selector: 'dps-root',
  imports: [RouterOutlet, ToastModule, ButtonModule, TranslatePipe],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

Default change-detection in `angular.json` → `OnPush`. Schematics:

```json
"@schematics/angular:component": { "style": "scss", "changeDetection": "OnPush" }
```

### Lazy routes

Top-level routes laden modules met `loadChildren: () => import(...).then(m => m.XXX_ROUTES)`. Children laden components met `loadComponent`. Geen `NgModule` per feature, alles standalone.

### TS path-aliases

`tsconfig.json`:
```json
"paths": {
  "@dps/core/*": ["src/app/core/*"],
  "@dps/env": ["src/environments/index.ts"],
  "@dps/shared/*": ["src/app/shared/*"]
}
```

Nooit relatieve imports voor cross-folder requires. `@dps/env` exporteert `environment` + `EnvNameEnum`.

### TS strictheid

```json
"strict": true,
"noImplicitOverride": true,
"noPropertyAccessFromIndexSignature": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
"target": "ES2022",
"module": "ES2022"
```

Angular compiler ook strict:
```json
"angularCompilerOptions": {
  "strictInjectionParameters": true,
  "strictInputAccessModifiers": true,
  "strictTemplates": true
}
```

### State-management strategie

Zie `state.md` voor diepte. Korte samenvatting:

- **NGXS `RootState`** voor wat globaal en geshared moet zijn over routes: `currentCompany`, `currCompanyActualsCount`, `isMobileScreen`, `isSidenavVisible`. Acties: `GetCompany`, `UpdateCompany`, `LoadActualsCount`, `ClearCompanyData`, `ChangeSidenavVisibility`. Reden: cross-cutting, polled count, mobile-breakpoint listener moet op één plek leven.
- **Custom `AuthStore`** voor de huidige user. Erft van een eigen `Store<T>` base class (`core/store/store.ts`) gebouwd op `BehaviorSubject + shareReplay`. **Niet** in NGXS omdat (a) skey-management was eerder dan NGXS toegevoegd, (b) auth state hoeft geen actions te dispatchen, (c) zie de TODO in dps README: "Replace custom auth store with [NGxs Auth](https://www.ngxs.io/recipes/authentication)".
- **Geen Redux/effects pattern**. NGXS-actions in dps zijn synchrone `patchState` of een rxjs `tap` na een API call. Geen Effects-decorator in zicht.
- **Component-state** met `signal()` waar mogelijk (zie `LoginComponent.inProcess = signal(false)` en `LoginComponent.forgotPasswordRoute = ['/', AuthRoutePath.FORGOT_PASSWORD]`).
- **Selecteren**: `store.selectSignal(RootState.getCompanyData)`, `store.select(...)` voor observables. AuthStore biedt `getCurrUserData$()` (Observable), `currentUser` signal.

### App Update flow

`AppUpdateService` (in `core/app-update/`) gebruikt `SwUpdate` om periodiek te checken voor een nieuwe deployed-bundle:

```ts
APP_UPDATE_CHECK_INTERVAL_PER_ENV: Record<EnvNameEnum, Duration> = {
  DEV:  Duration.fromObject({ minute: 30 }),
  QA:   Duration.fromObject({ minute: 30 }),
  PROD: Duration.fromObject({ hours: 24 }),
};
```

Bij detectie van een update toont `AppComponent` een sticky PrimeNG-toast met "Update Now" + "Later" knoppen. "Update Now" doet `router.navigateByUrl('').then(() => window.location.reload())`.

### Error handling

`RollbarErrorHandler` is geregistreerd als `ErrorHandler`. Captures uncaught + unhandled rejections. `.handleError()` logt naar console én Rollbar (`rollbar.error()`). Configureert payload met `currUser` zodra `AuthStore` die levert (subscribe in constructor).

Daarnaast zit er een `errorInterceptor` op HTTP-laag (zie `api-client.md`).

### Internationalization init

`I18nModule` setup (zie `i18n.md`). Localize default `nl-BE` (Belgian Dutch). Bryntum-scheduler-locales worden separately geladen via static JS imports.

### Service worker config

`ngsw-config.json` bestaat (619 bytes, niet gelezen) — standaard Angular SW config. Caching strategie via `dataGroups` en `assetGroups`. Disabled in dev mode (`!isDevMode()`).

### Bryntum integration

`@bryntum/scheduler` is een cross-framework library; `@bryntum/scheduler-angular` is de Angular-wrapper. Configuratie in `shared/configs/general-scheduler.config.ts` (3225 bytes). Locale-injection in `I18nModule` via `LocaleManager.applyLocale(...)`. Custom CSS overrides in `src/styles.scss` (`.b-sch-event-wrap`, `.b-mask`, dps-specifieke klassen).

---

## my-staffler (employee mobile app)

### Bootstrap

`src/main.ts`:
```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElements } from '@ionic/pwa-elements/loader';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
defineCustomElements(window);   // PWA Elements voor camera fallback in browser
```

`appConfig`:
```ts
providers: [
  provideRouter(APP_ROUTES, withComponentInputBinding()),
  provideAppInitializer(() => inject(AuthStore).init()),
  provideHttpClient(withInterceptors([httpErrorInterceptor, authInterceptor])),
  provideIonicAngular({ mode: 'ios' }),
  { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  importProvidersFrom(
    TranslateModule.forRoot({ loader: { provide: TranslateLoader, useFactory: HttpLoaderFactory, deps: [HttpClient] }, defaultLanguage: 'en' }),
    ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.production }),
  ),
],
```

Belangrijke keuzes:
- **Geen NGXS, geen LaunchDarkly, geen Rollbar, geen Google Analytics**. Slankere dependency-tree. Mogelijk later toegevoegd.
- **`provideIonicAngular({ mode: 'ios' })`** — forceert iOS-stijl UI overal (ook op Android en in browser). Bewuste design-keuze (zie `quirks.md`).
- **`IonicRouteStrategy`** — vervangt de default RouteReuseStrategy zodat tabs hun state behouden bij switchen (Ionic-conventie).
- **`provideAppInitializer(() => inject(AuthStore).init())`** — leest token uit Capacitor `Preferences` async voor de eerste route resolved.
- **`withComponentInputBinding()`** — laat route params automatisch in `@Input()`-velden binden (Angular 16+ feature, gebruikt voor `:shiftId`).
- **Service Worker** alleen aan als `environment.production` — alle 3 envs (dev/qa/prod) hebben `production: true` behalve het lokale `environment.ts` (die heeft `production: false`).

### Module-structuur

```
src/app/
├── app.component.ts                 ms-root, ion-app + router-outlet, deep-link listener, splash hide, status bar init
├── app.config.ts                    providers
├── app.routes.ts                    top-level lazy routes
├── app.routes.model.ts              AppRoutePath (ROOT, AUTH, ONBOARDING, TABS)
├── core/
│   ├── api/
│   │   ├── auth/                    AuthService, authGuard, guestGuard, models
│   │   ├── documents/               DocumentService (mock data, BCJ-19453)
│   │   ├── onboarding/              OnboardingService (mock data, BCJ-19440 storeDeviceToken)
│   │   └── user/                    UserService (mock data, BCJ-19451)
│   ├── i18n/                        HttpLoaderFactory only
│   ├── index.ts                     re-exports core/api + core/storage
│   ├── interceptors/                authInterceptor, httpErrorInterceptor
│   ├── models/                      Schedule.models.ts (Shift, ActualStatus enum)
│   └── storage/
│       ├── auth/auth.store.ts       Capacitor Preferences-backed AuthStore
│       └── store.ts                 abstract Store<T> base (BehaviorSubject)
├── modules/
│   ├── auth/login/                  /auth (single page)
│   ├── onboarding/permissions/      /onboarding/permissions (camera+gps+push)
│   ├── tabs/                        /tabs shell met IonTabs
│   │   └── tabs.routes.ts           SCHEDULE | CLOCK_IN | PROFILE
│   ├── schedule/
│   │   ├── schedule-list/           default (weekly schedule)
│   │   └── shift-detail/            /tabs/schedule/detail/:shiftId
│   ├── clock-in/clock-in/           /tabs/clock-in (skeleton, BCJ-19440 niet af)
│   └── profile/
│       ├── profile-details/         default
│       ├── employment-documents/    /tabs/profile/documents
│       └── personal-details/        /tabs/profile/personal-details
└── shared/
    ├── constants/preferences.keys.ts   PREFERENCES_KEYS object voor Capacitor Preferences
    ├── services/
    │   ├── permission/permission.service.ts   Camera + Geolocation permission checks
    │   └── toast/toast.service.ts             Wrapper around IonToast
    └── utils/platform.util.ts                 PlatformUtil.isNative / isIos / isAndroid / isWeb
```

### Path-aliases

`tsconfig.json`:
```json
"paths": {
  "@staffler/app/*":  ["src/app/*"],
  "@staffler/core":   ["src/app/core/index.ts"],
  "@staffler/core/*": ["src/app/core/*"],
  "@staffler/env":    ["src/environments/index.ts"],
  "@staffler/shared": ["src/app/shared/index.ts"],
  "@staffler/shared/*": ["src/app/shared/*"]
}
```

`@staffler/core` (zonder `/`) is een barrel-export die alle service classes en stores blootlegt — handig voor één-line imports.

### Standalone alles

Geen `NgModule`. Tabs gebruiken `IonTabs`/`IonTabBar`/`IonTabButton` standalone components met `addIcons({ ... })` om alleen ionicons te tree-shaken die echt gebruikt worden.

### Capacitor lifecycle

`AppComponent.ngOnInit()`:
```ts
SplashScreen.hide().catch(() => {});       // hide native splash
this.#initStatusBar();                     // overlay webview, light style
```

`AppComponent.constructor()`:
```ts
this.#initDeepLinkListener();              // App.addListener('appUrlOpen', …)
```

Deep links uit de OS lezen `event.url`, parsen het pad+hash en routeren via `Router.navigateByUrl(...)`. Wordt later gebruikt voor invite-emails en push-notificaties.

### State-management strategie

Veel slanker dan dps:
- **Custom `Store<T>`** in `core/storage/store.ts`. BehaviorSubject + `select`/`select$`/`update`/`clean` API.
- **Eén `AuthStore`** die persistente storage doet via Capacitor `Preferences` (i.p.v. localStorage).
- Niet meer in app. Geen NGXS, geen actions, geen selectors. Single component-tree state per feature.

### Service worker

`ngsw-config.json` bestaat (546 bytes), default Angular SW config. Aangezet alleen als `environment.production === true` (dev/qa/prod allemaal `true`, lokaal `false`).

### Capacitor config

```ts
// capacitor.config.ts
appId: 'be.boemm.staffler',
appName: 'My Staffler',
webDir: 'www/browser',
plugins: { StatusBar: { style: 'LIGHT' }, SplashScreen: { launchAutoHide: false }, PushNotifications: { presentationOptions: ['badge','sound','alert'] } },

// + per env:
//   dev → ios scheme 'App',          android flavor 'dev'
//   qa  → ios scheme 'MyStaffler QA', android flavor 'qa'
//   prod → ios scheme 'MyStaffler',  android flavor 'prod'
```

`NODE_ENV` wordt gelezen om te bepalen welke scheme/flavor. CI sets dit via `sync:native:qa` / `sync:native:prod` scripts.

### Mocked services

Veel API-services zijn nog **mocks met `delay()` en `console.log`**. Voorbeelden:
- `OnboardingService.recordOnboarding` / `storeDeviceToken` — mock met TODO comment
- `UserService.updateEmail` / `updatePhone` — mock, gepland in BCJ-19451
- `DocumentService.getDocuments` — returnt 3 mock documents (loonbrief 2026-04, 2026-03, contract 2025-01) met `delay(300)`. Comment: `// TODO: BCJ-19453 replace mock`.

`DocumentService.getOpenedIds` / `markAsOpened` zijn echter **wel echt** geïmplementeerd: schrijft een Set van geopende doc-IDs naar Capacitor `Preferences` onder de key `PREFERENCES_KEYS.openedDocuments`. Dat is het "New" badge mechanisme uit BCJ-19453.

### Mode `'ios'` over alle platforms

`provideIonicAngular({ mode: 'ios' })` zorgt dat ook Android-builds en de browser-PWA de iOS-styling krijgen. Gevolg: `IonAlert`, `IonActionSheet`, transitions, fontstack, status-bar height — overal iOS-look. Dit is een UX-keuze van het team om consistentie te krijgen tussen iOS en Android (zie ook `styling.md`).

---

## Vergelijking + observaties

| Aspect | dps | my-staffler |
|---|---|---|
| Bootstrap pattern | `bootstrapApplication` + `appConfig` | `bootstrapApplication` + `appConfig` |
| Standalone | ✅ | ✅ |
| Signals | Mengvorm (sommige), oudere code is rxjs | Volop signals nieuw |
| Zoneless | ✅ experimental | ❌ standaard zone.js |
| State lib | NGXS + custom Store | Alleen custom Store |
| UI lib | PrimeNG | Ionic |
| Native | nee | ja (Capacitor) |
| Path aliases | `@dps/*` | `@staffler/*` |
| Component prefix | `dps-` | `ms-` |
| App selector | `<dps-root>` | `<ms-root>` |
| Service worker | actief altijd buiten dev | actief altijd in production-builds |

Convergentie (gedeelde tooling):
- Beide gebruiken `@ngneat/until-destroy` voor RxJS unsubscribe (versie 10).
- Beide gebruiken `ngx-translate` v16 (zelfde major).
- Beide gebruiken `prettier` 3 + Angular eslint.
- Beide gebruiken Karma+Jasmine 5.

Divergentie (verschillende keuzes):
- Form validators in dps zijn in een aparte folder met index-barrels. In my-staffler wordt validation inline in components gedefinieerd (zie `LoginComponent.passwordStrengthValidator`).
- `dps` heeft `husky` + pre-commit hooks; `my-staffler` heeft `eslint` workflow maar geen husky.
- `dps` heeft `madge --circular` als lint-stap; `my-staffler` heeft eslint+typescript-eslint.
- `dps` test-target excludeert `*.component.spec.ts`; `my-staffler` heeft één echte spec (`permissions.component.spec.ts`).

## Wat er niet is (gemist + open)

- Geen monorepo (Nx, Lerna). Twee aparte git-repos.
- Geen gedeelde UI-library (geen `@boemm/ui`, geen `@staffler/ui`). Alle components leven in hun eigen repo.
- Geen gegenereerde TS-types uit OpenAPI. Models worden handmatig bijgehouden in `shared/models/` (dps) of `core/api/*/models/` (mystaffler). Zie `quirks.md` punt 2.
- Geen end-to-end tests (Playwright/Cypress) in beide repos.
- `dps` README noemt expliciet "Replace custom auth store with NGxs Auth" als tech debt — beweegt dus richting standaardisatie.
