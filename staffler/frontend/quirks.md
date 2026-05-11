# Quirks + non-obvious gotchas

Dingen die je zou missen tijdens een eerste lezing van de code en alleen door te bouwen tegenkomt. Volgorde = impact-ranked.

## 1. Geen gedeelde component-library tussen `dps` en `my-staffler`

**Wat je verwacht**: `@boemm/ui` of `@staffler/components` package met gedeelde buttons, dialogs, validators.

**Wat is**: Twee aparte git-repos. dps heeft 17 shared components in `src/app/shared/components/`, mystaffler heeft helemaal geen eigen UI-library. De pink primary color (`#fc074f`), de Inter-font keuze, de auth-flow, de skey-management — alles wordt twéé keer geconfigureerd.

**Gevolg**:
- Wijzigingen aan IBAN-validator gebeuren één plek (dps), maar als mystaffler ooit IBAN nodig heeft moet dat opnieuw geschreven worden.
- Brand-colors kunnen drift krijgen (`#fc074f` zit hardcoded in 2 SCSS-files + 1 TS-file in dps, plus 1 SCSS-file in mystaffler).
- Auth-store implementatie verschilt subtiel (localStorage vs Capacitor Preferences) maar het BE-contract is gelijk → 2x foutgevoeligheid.

**Voor de PoC**: niet relevant tenzij je een unifying library wil bouwen. Voor nu: kies één repo als referentie en kopieer wat je nodig hebt.

## 2. Geen OpenAPI codegen voor TS-types

**Wat je verwacht**: een script dat `../api/openapi/openapi.json` neemt en `shared/models/*.ts` autogenereert.

**Wat is**: Alle TS-models worden handgeschreven. Drift tussen BE-DTO en FE-model is mogelijk (zie `../api/live-findings.md` voor een lijst van DTO-shape correcties die in de BE-codebase wel staan maar in de FE-models nooit gepatcht zijn voor sommige velden).

**Bekende drifts** (eind 2025/begin 2026, mogelijk ondertussen rechtgezet):
- `AddressModel` had vroeger `streetName, boxNumber, cityName, state` → echte BE retourneert `street, bus, postalCode, city, country`. dps repo lijkt dit gefixed.
- `StatuteItem.collar` enum waardes: BE returns `WHITE | BLUE`, FE-models hadden `WHITE_COLLAR | LABOUR`.
- `LanguageItem.primary` (BE) vs `isPrimary` (oude FE).
- `TaxLevel` returnt enkel `name`, geen `amount`.

**Gevolg**: Een `npm install` van `openapi-typescript` + een nieuw `npm run gen:types` script zou veel manueel werk besparen. Aanbeveling voor PoC: gebruik die wel. Zie `frontend/poc/` voor pattern.

## 3. mystaffler's interceptor-volgorde toont errors dubbel bij 401

`provideHttpClient(withInterceptors([httpErrorInterceptor, authInterceptor]))`:

Bij een 401-response:
1. `httpErrorInterceptor` runt eerst → `toastService.showError(error.message ?? 'An unexpected error occurred')`. **Toast verschijnt op scherm.**
2. `authInterceptor` runt daarna → ziet 401 → `authStore.clear()` + redirect naar `/auth`.
3. User ziet eerst de toast en wordt dan abrupt naar login geredirect.

In dps is de volgorde **omgekeerd** (`[authInterceptor, errorInterceptor]`) waardoor de auth-handler eerst trapt en de error-dialog niet getoond wordt voor 401:
```ts
if (error instanceof HttpErrorResponse && error.status !== HttpStatusCode.Unauthorized) {
  dialogService.open(GenericErrorDialogComponent, { ... });
}
```

**Voor de PoC**: kopieer de dps-volgorde, of voeg een 401-check in de mystaffler error-interceptor toe. Of: laat de auth-interceptor door subset van de error-handler runnen (`req.context.set(SKIP_GLOBAL_ERROR, true)` op auth-flow calls).

## 4. mystaffler heeft inconsistente "FE host" config

`environment.dev.ts` zegt `baseUrl: 'https://dev.staffler.boemm.eu'`. Maar de CFN-stack provisioneert `my.staffler.be` als CloudFront-domain. En de README-script zegt `npm run serve:native:ios -p=1444` met `localhost:1444` als dev URL.

In totaal kan de mystaffler-app dus in 4 hosts wonen tegelijk:
- Lokaal: `http://localhost:1444`
- Dev CFN: `dev.my.staffler.be` (per CFN parameter)
- Dev "officieel": `dev.staffler.boemm.eu` (per environment-file `baseUrl`)
- Native: bundle-internal `capacitor://localhost`

**Gevolg**: deep-link URLs, OAuth-redirect-URIs, share-URLs zijn niet voorspelbaar. Mogelijk werken sommige redirects niet op alle hosts.

**Voor de PoC**: kies één canonical URL per env. Vraag dev-ops welk domein "echt" is voor mystaffler.

## 5. dps catch-all `**` route → `/search` is een trap voor non-admin users

`app.routes.ts`:
```ts
{ path: '**', redirectTo: AppRouteEnum.SEARCH }
```

Maar `/search` heeft `canMatch: [authenticatedGuard, adminUserAccessGuard]`. Voor een non-admin user:
1. User typt `/foo` → `**` triggers → redirect naar `/search`.
2. `authenticatedGuard` check: ✅ ingelogd.
3. `adminUserAccessGuard` check: ❌ niet admin.
4. Route wordt niet matched → blijft hangen op `/search` URL met blank scherm of vorige route.

**Voor de PoC**: maak je catch-all altijd-reachable (bv. `redirectTo: '/'` of een dedicated 404 page).

## 6. dps `unauthenticatedGuard` is rare implementation

```ts
return !authApiService.isAuthenticated || router.createUrlTree([]);
```

Dat is een bool **OR** een UrlTree. JavaScript: als eerste true is, return `true`. Anders return `router.createUrlTree([])` → redirect naar `/`.

Werkt, maar leesbaarheid is laag. Reviewers verwachten een classic `if/else`. Geen bug, wel een readability-quirk.

## 7. dps' authInterceptor stuurt **lege** skey header

`localStorage.getItem(AUTH_KEY) || ''` — als skey leeg is wordt `x-boemm-skey: ''` toegevoegd. BE handelt dit correct af (geeft 401 op authenticated routes), maar het is overbodig en clutters request-logs.

**Voor de PoC**: alleen header sturen als token bestaat. mystaffler's interceptor doet dit beter:
```ts
const authReq = token
  ? req.clone({ headers: req.headers.set(AUTH_SKEY_HEADER, token), withCredentials: true })
  : req;
```

## 8. mystaffler 401-handler returnt EMPTY → component-side "loading vergeet zichzelf te resetten"

```ts
if (isApiRequest && error.status === Unauthorized && authStore.isAuthenticated()) {
  return from(authStore.clear()).pipe(switchMap(() => {
    router.navigateByUrl(`/${AppRoutePath.AUTH}`);
    return EMPTY;
  }));
}
```

`return EMPTY` betekent dat subscribers in components **geen** `error()` callback krijgen (en geen `next()`, en geen `complete()` direct daarna). Voor `subscribe({ next, error })` patterns die hun `loading.set(false)` in error-handler zetten: state blijft op `true` totdat de component destroyed wordt door de redirect.

**Voor de PoC**: gebruik `throwError(() => new Error('UNAUTHORIZED'))` zodat error-callbacks alsnog vuren.

## 9. `withCredentials: true` in mystaffler is redundant maar harmless

mystaffler's authInterceptor zet `withCredentials: true` op ALL requests. Backend stuurt geen Set-Cookie waar de browser-cookie-jar mee moet doen op de API-paths (skey staat in header). Cookie-flow gebeurt alleen op `/v1/signin` redirect — een gateway-route, geen Angular-route.

Voor mobiele Capacitor-context maakt `withCredentials` niet uit (geen browser cookie jar in WKWebView voor cross-origin).

Geen bug, gewoon noise.

## 10. dps' `errorInterceptor` opent dialog voor élke status > 400

```ts
if (error instanceof HttpErrorResponse && error.status !== Unauthorized) {
  dialogService.open(GenericErrorDialogComponent, { ... });
}
```

Dat opent een modal voor:
- 400, 403, 404, 409, 500, 502, ... — alles behalve 401.

Voor expected 404's (bv. "haal optionele resource op") moet je expliciet `IGNORE_404_ERROR` HttpContextToken zetten:
```ts
this.http.get(url, { context: new HttpContext().set(IGNORE_404_ERROR, true) });
```

Voor 409 op niet-allowlisted URL's krijg je een generieke error-dialog zonder details — minder hulpvol dan gehoopt.

**Voor de PoC**: als je een dialog voor errors wil, gebruik dps' pattern + token. Anders: gebruik een toast-pattern (zoals mystaffler) met betere filter-logic.

## 11. dps zoneless mode is "experimental"

`provideExperimentalZonelessChangeDetection()` is letterlijk `experimental`. Pre-stable API. Aspecten van Angular werken anders:
- `ngOnInit` runs nog steeds, maar binding-changes triggeren niet automatisch op event-handlers buiten Zone.js.
- Form `valueChanges` werkt via signals; rxjs-only patterns kunnen update-cycles missen.
- Third-party libraries die op `setInterval` of `addEventListener` rekenen zonder explicit signal/CD trigger kunnen "stuck" raken.

Voorbeeld dat dps daarom expliciet doet: `markForCheck()` of `signal.set(...)` na elke external state mutation. Niet altijd consistent.

## 12. Bryntum is paid + dev-license in repo

`README.md` van dps:
```
Username: development..boemm.eu
Password: JvvlSIC5YoMIY9s9JCV2RcQ3
```

Dat is een gedeelde dev-account credential **in een private repo**. OK voor dev/qa maar:
- Bij externe contractor: hoe krijgen die toegang?
- Wat is de license-voorwaarde voor productie? Aparte license?
- Wat als Bryntum upstream dev-renewal laat verlopen?

Geen risico voor de PoC (gebruikt Bryntum niet), wel een kennis-gap voor onderhoud.

## 13. dps' `LoadActualsCount` polled elke 60 sec

`CompanyComponent`:
```ts
const COMPANY_ACTUALS_COUNT_INTERVAL_MILLIS: number = DateTime.fromSeconds(60).toMillis();

interval(COMPANY_ACTUALS_COUNT_INTERVAL_MILLIS).pipe(
  startWith(company),
  takeWhile(() => company.isActualsEnabled),
).subscribe(() => this.store.dispatch(new LoadActualsCount()));
```

Voor elke open `/company/:id` tab elke 60 sec een API call. Met 50 actieve users = 50 calls/min op die endpoint. Geen cache aan FE-zijde.

**Voor de PoC**: vermijd polling; gebruik manuele refresh of WebSocket als latency belangrijk is.

## 14. dps `AppUpdateService` toont sticky toast

`AppComponent` template:
```html
<p-toast [key]="appUpdateToastKey" [preventOpenDuplicates]="true">
```

Toast is sticky (geen auto-close). Op desktop OK, op mobile blokkert hij content. User moet expliciet "Later" klikken om hem weg te krijgen.

## 15. dps' Bryntum events hebben CSS-coupling per status

`styles.scss`:
```scss
.b-sch-event {
  &.CONFIRMED, &.ABSENT { color: #1a862a; }
  &.PENDING               { color: #f29120; }
  &.OVERDUE               { color: var(--p-red-500); }
}
```

Status-class names `CONFIRMED` / `ABSENT` / `PENDING` / `OVERDUE` MOETEN exact uit de BE komen. Een rename in de BE breekt de styling stilzwijgend (geen TS-error). Coupling zonder type-safety.

## 16. dps gebruikt `appendChild`-stijl head injectie voor Google Maps

`index.html`:
```html
<script async src="https://maps.googleapis.com/maps/api/js?key=AIzaSyB4g_bV2ErSF2nKMnUw1MWhEvGdjPkuNMc&loading=async&libraries=places"></script>
```

API key is hardcoded in HTML (publiek per Google Maps design, maar wel gebonden aan domain-restrictions in Google Cloud Console). Voor PoC: kopieer key alleen als je domain matcht.

## 17. mystaffler zet `provideIonicAngular({ mode: 'ios' })` voor alle platforms

Inclusief Android en browser. Bewuste design-keuze, maar:
- Android-users zien iOS-stijl back-arrows en page-transitions.
- Browser-users zien iOS-stijl status bar gaps en safe-area paddings die niet relevant zijn voor desktop.

Dit is waarschijnlijk een Lieven-besluit (consistency over platform-conformity). Documenteer waarom voor reviewers.

## 18. dps `core/feature-flag/feature-flag.enum.ts` is **leeg**

```ts
export enum FeatureFlagKey {}
```

LaunchDarkly is wel **geactiveerd** (`provideAppInitializer` wacht op SDK init), maar geen flags worden geconsumeerd in de codebase. Dat betekent:
- Initialisatie-tijd kost wel ~200-500ms aan bundle-load + network roundtrip.
- Geen flag-checks in code → alle features altijd aan.
- Klaar voor toekomstig gebruik, maar nu pure dead-weight.

**Voor de PoC**: skip LaunchDarkly. Voeg later toe als nodig.

## 19. `wlnob/your-dps` bestaat nog (niet archived)

GitHub repo `your-dps` is niet gearchiveerd, last commit feb 2025. Bevat een Express-backend en oudere Angular client. Het was vermoedelijk een prototype voor wat nu mystaffler is. Niet meer gebruikt maar staat nog in de org-listing.

**Verwarrende factor** voor nieuwe devs die googlen "dps angular boemm".

## 20. mystaffler `defaultLanguage: 'en'` voor Belgische werknemers

```ts
TranslateModule.forRoot({ ..., defaultLanguage: 'en' })
```

In dps wordt dat `nl` (op QA/PROD). In mystaffler is het ENGELS. Voor een werknemer-app gericht op Belgische werknemers (overgrote meerderheid Nederlandstalig of Franstalig) is dat een mismatch.

Geen `nl.json` of `fr.json` in `assets/i18n/` op 10/05/2026 in mystaffler.

**Voor de PoC**: kies NL als default voor mystaffler, voeg een lokale-switcher toe.

## 21. `mystaffler.permission.service.ts` is 5204 bytes — meest complexe service in de repo

Reden: Capacitor Camera + Geolocation + Push permissions hebben op iOS en Android verschillende afhandeling, en de "settings"-redirect bij denied requires `capacitor-native-settings`.

Niet een bug, gewoon een opvallende complexiteit-concentratie. Veel logic dat platform-specifiek is. Goed kandidaat voor unit tests (1 spec is er al: `permissions.component.spec.ts` 10337 bytes).

## 22. dps' `app.component.ts` heeft een race-condition op startup

```ts
if (window.location.pathname === '/') {
  this.authStore.getCurrUserData$().pipe(filter(...)).subscribe(currUser =>
    this.router.navigate([AppRouteEnum.COMPANY, getLastViewedCompanyMembership(...).companyId])
  );
}
```

Deze logic wordt in `AppComponent.constructor` uitgevoerd. Maar `getCurrUserData$()` returnt een observable die **alleen vuurt** als `authStore.setCurrentUser(...)` is gecalled. Dat gebeurt in `authenticatedGuard` of na manuele `getCurrentUser()` call.

Op `/` is er geen route die `authenticatedGuard` triggert (geen route matched `''` direct). Dus de subscription wacht "voor altijd" tot iets anders setCurrentUser triggert.

Daarom zit er een fallback in `LoginComponent` die expliciet navigeert naar `/company/<id>` na succesvolle login + getCurrentUser.

**Niet een bug**, wel een fragiele initialization-flow.

## 23. CI workflows hebben `continue-on-error: true` op install

Beide repos:
```yaml
- name: Install dependencies
  if: ${{ steps.cache-npm.outputs.cache-hit != 'true' }}
  continue-on-error: true
  run: |
    npm install
```

Als install faalt gaat de build gewoon door. Volgende step `npm run build:<env>` faalt dan met onduidelijker error. Vermoedelijk historisch om soepel te kunnen retry'en op intermittent NPM 502's, maar maakt CI logs misleidend.

## 24. mystaffler heeft `Angular Material` als dependency maar nergens gebruikt

`package.json`:
```json
"@angular/material": "^21.0.0"
```

Geen import van `@angular/material/*` gevonden in source. Bundle-size wordt vergroot. Mogelijk:
- Geplande feature die nog niet gebouwd is
- Indirecte dependency van een Capacitor plugin
- Vergeten dependency

`global.scss` heeft één enkele MDC-related rule:
```scss
.plt-hybrid { .mdc-dialog { padding-top: env(safe-area-inset-top); } }
```

Dat is MDC (Material Design Components) — vermoedelijk via Ionic's onderlaag, niet @angular/material direct. Investigatie nodig.

## 25. Beide repos hebben 0 e2e-tests

Geen Playwright, Cypress, of Selenium. Zoals iedereen weet over JS-projecten in 2026 is dat een gemiste kans. Voor de PoC: niet relevant, maar voor volgende projecten mogelijk de moeite.

---

## Samenvatting top-5 voor PoC-bouwer

1. **Punt 2 (geen OpenAPI codegen)** → de PoC moet dit beter doen.
2. **Punt 5 (catch-all naar /search)** → niet kopiëren in PoC.
3. **Punt 8 (EMPTY in 401)** → niet kopiëren, gebruik throwError.
4. **Punt 18 (LaunchDarkly leeg)** → skip in PoC.
5. **Punt 22 (startup race)** → vermijd `subscribe in constructor` met fallback elsewhere.
