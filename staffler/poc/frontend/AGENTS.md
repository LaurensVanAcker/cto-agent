# Angular frontend, AGENTS entrypoint

Standalone Angular 18 app. Geen NgModules. Geen RxJS-heavy patterns. Signals voor state.

## Eerst lezen

1. `../AGENTS.md` voor de Fastify backend context en hoe frontend ↔ backend praten
2. `ARCHITECTURE.md` hier in deze folder voor het diagram
3. `../../api/openapi/openapi.json` als je een endpoint nodig hebt dat nog niet in `core/api/staffler.service.ts` zit

## Stack

| Onderdeel | Keuze |
|---|---|
| Framework | Angular 18.2+ |
| Components | standalone (geen NgModules) |
| Routing | `provideRouter` met lazy-loaded routes |
| State | Angular signals (`signal()`, `computed()`, `inject()`) |
| HTTP | HttpClient met `firstValueFrom()` voor Promise |
| Forms | template-driven met `[(ngModel)]` (FormsModule) |
| Templating | control flow `@if @for @switch` |
| Styles | SCSS per component, design tokens in `src/styles.scss` |
| Build | Angular CLI 18, `@angular-devkit/build-angular:application` builder |
| Dev | `ng serve` op :4200 met proxy.conf.json |
| Prod | `ng build` -> `dist/frontend/browser/` -> Fastify serveert |

## Folder layout

```
frontend/
├── AGENTS.md                je leest dit
├── ARCHITECTURE.md
├── angular.json
├── proxy.conf.json
├── package.json
├── tsconfig.json
├── tsconfig.app.json
└── src/
    ├── index.html
    ├── main.ts                bootstrapApplication
    ├── styles.scss            design tokens + global styles
    ├── environments/
    │   ├── environment.ts             production
    │   └── environment.development.ts ng serve config
    └── app/
        ├── app.config.ts      providers (router, http, interceptor)
        ├── app.routes.ts      lazy-loaded routes met guards
        ├── app.component.ts   shell met <router-outlet />
        ├── core/
        │   ├── api/
        │   │   ├── models.ts             types (subset DTOs)
        │   │   └── staffler.service.ts   HttpClient wrapper
        │   └── auth/
        │       ├── auth.service.ts       signal-based state
        │       ├── auth.guard.ts         canActivate
        │       └── auth.interceptor.ts   withCredentials + 401 handler
        ├── layout/
        │   ├── shell.component.{ts,html,scss}   navbar + outlet
        ├── pages/
        │   ├── login/{ts,html,scss}
        │   ├── dashboard/{ts,html}
        │   ├── employees/{ts,html}
        │   └── contracts/{ts,html}
        └── (future) shared/    pipes, directives, UI helpers
```

## Conventies

### Components zijn standalone

```typescript
@Component({
  selector: 'app-something',
  standalone: true,           // verplicht
  imports: [RouterLink, FormsModule, ...],   // alleen wat dit component echt gebruikt
  templateUrl: './something.component.html', // of inline `template:`
  styleUrls: ['./something.component.scss'],
})
export class SomethingComponent {
  private service = inject(SomeService);    // inject() functie, geen constructor DI
  protected state = signal<T>(initial);     // protected zodat template eraan kan
}
```

### State management is signals, geen RxJS chains

```typescript
// Goed
private _user = signal<DpsUserDetails | null>(null);
readonly user = this._user.asReadonly();
readonly isLoggedIn = computed(() => this._user() !== null);

// Vermijden in PoC (overdreven, NGXS komt later als product)
private user$ = new BehaviorSubject<DpsUserDetails | null>(null);
```

### HttpClient calls met firstValueFrom

```typescript
// Goed (Promise-based, leest natural in async functies)
async load() {
  const result = await firstValueFrom(this.http.get<T>(url));
  this.state.set(result);
}

// Vermijden (RxJS chains worden lastig om mee in te tappen voor signals)
this.http.get<T>(url).pipe(
  tap(r => this.state$.next(r)),
  catchError(err => of(null)),
).subscribe();
```

### Template control flow

```html
@if (loading()) {
  <p><span class="spinner"></span> Laden...</p>
}

@for (item of list(); track item.id) {
  <div>{{ item.name }}</div>
} @empty {
  <p class="muted">Geen items.</p>
}

@switch (status()) {
  @case ('success') { ... }
  @case ('error') { ... }
  @default { ... }
}
```

Geen `*ngIf`, geen `*ngFor`, geen `<ng-container>` voor flow control.

### Forms zijn template-driven (PoC versie)

```html
<input
  [ngModel]="username()"
  (ngModelChange)="username.set($event)"
  name="username"
  required
/>
```

Geen Reactive Forms voor PoC. Te veel boilerplate, niet nodig. Als forms complex worden, refactor naar Reactive Forms.

### Tekens en talen

- Geen em-dashes (—)
- Geen bold formatting in markdown
- UI tekst in Belgisch Nederlands
- Code comments in NL of EN, beide OK
- Variabele namen in Engels

## Reuse uit wlnob/dps

dps is Angular 18 standalone, dezelfde mental model. Wat 1-op-1 past:

| Van dps repo | Naar onze frontend | Aanpassing |
|---|---|---|
| `src/app/shared/components/*` | `src/app/shared/components/` | geen, kopiëren |
| `src/app/shared/pipes/*` | `src/app/shared/pipes/` | geen |
| `src/app/shared/directives/*` | `src/app/shared/directives/` | geen |
| `src/app/core/api/*.service.ts` shape | nieuwe services hier | URL base anders |
| Custom validators in core/forms | shared/forms | geen |
| environments file pattern | `src/environments/` | onze waarden |
| Routing guard pattern | `core/auth/auth.guard.ts` | logic herschrijven |
| Tailwind config (als gebruikt) | root | overnemen, controleer of we het echt willen |
| tsconfig paths (@app/, @env/) | `tsconfig.json` | al klaar |

NIET hergebruiken:
- `auth.interceptor.ts` van dps stuurt `x-boemm-skey` header. Onze versie doet cookie + withCredentials. Schrijf nieuw.
- API base URL van dps is direct naar Staffler gateway. Onze versie gaat altijd via `/api/staffler/...` van onze Fastify proxy. Aanpassen.
- NGXS stores: voor PoC overdreven. Gebruik Angular signals in services.
- ngx-google-analytics, RollbarErrorHandler, service worker: weglaten voor PoC.
- i18n module: Nederlands hardcoded volstaat voor PoC.
- PrimeNG: optioneel toevoegen pas op dag 2, niet vandaag.

### Hergebruik werkwijze

```bash
# Clone dps eens lokaal als reference
cd ~/Documents/Repositories/
git clone git@github.com:wlnob/dps.git dps-reference

# Per component: copy + aanpassen
cp -r dps-reference/src/app/shared/pipes ~/Documents/Repositories/cto/staffler/poc/frontend/src/app/shared/
# Daarna in IDE: check imports, fix paths
```

## Endpoints die je gebruikt

Beschikbaar in `core/api/staffler.service.ts`:

```typescript
const staffler = inject(StafflerService);

await staffler.login({ username, password });           // auth flow
await staffler.logout();
const me = await staffler.me();                          // DpsUserDetails

const dicts = await staffler.getDictionaries(['statutes', 'languages']);
const company = await staffler.getCompany(companyId);

const employees = await staffler.listEmployees({ companyId, page: 0, size: 50 });
const contracts = await staffler.listContracts({ companyId, startDate, endDate });
```

Voor endpoints die nog niet in de service zitten: voeg ze toe in `staffler.service.ts`, of gebruik `inject(HttpClient).get<T>('/api/...', { withCredentials: true })` direct in een component.

Voor de volledige Staffler API surface: zie `../../api/openapi/openapi.json` en `../../api/endpoints-index.md`.

## Wat is GEEN deel van deze frontend

- Geen login form voor itsme of Cognito hosted UI. Wij gebruiken alleen username/password endpoint van Staffler.
- Geen complete contract-create flow vandaag. Wel een basis-form voor dag 2.
- Geen multi-company switcher dropdown (gebruik eerste membership default).
- Geen beschikbaarheden UI vandaag. Komt op dag 2 met eigen storage in Fastify.
- Geen 404 page, geen 500 page, geen offline page.
- Geen PWA, geen service worker.
- Geen analytics, geen error tracking.

Komt allemaal later. Vandaag: login + dashboard + employees + contracts werkend krijgen tegen QA.

## Veelvoorkomende Angular pitfalls

| Symptoom | Oorzaak / fix |
|---|---|
| `NG02200: Found the synthetic property` | Vergeten `provideAnimations()` of `provideAnimationsAsync()` in app.config.ts. We hebben het bewust weggelaten omdat we geen Material/PrimeNG hebben. |
| Standalone component werkt niet | Vergeten `standalone: true` of vergeten te `imports`. |
| `@if` werkt niet | Angular versie < 17. Check `package.json` voor 18.x. |
| Signal lezen geeft `undefined` | Signal is een functie, je moet `userSignal()` aanroepen, niet `userSignal`. |
| `withCredentials` werkt niet in dev | proxy.conf.json moet `"changeOrigin": true` hebben. Onze versie heeft dat. |
| Route loaded maar guard runt niet | `canActivate` array vergeten in routes definitie. |
| Lazy load faalt met "Cannot find module" | Path in `loadComponent` is fout. Check relative path. |

## Voor de nieuwe thread

Skeleton is klaar en compileert. Backend draait via Fastify, frontend via Angular CLI. Begin door:

1. `cd frontend && npm install`
2. `cd .. && npm install`
3. Twee terminals starten zoals in `../TODAY-CHECKLIST.md` stappen 3 en 4
4. Browser naar `http://localhost:4200`, login pagina verifiëren
5. Login testen met QA credentials uit `../.env`
6. Vanaf dashboard verder bouwen volgens scope in `../CONCLUSIONS.md`
