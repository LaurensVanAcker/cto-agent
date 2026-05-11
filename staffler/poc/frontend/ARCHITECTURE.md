# Frontend architectuur, vandaag-versie

## Eén plaatje

```
                ┌────────────────────────────────────────────────────┐
                │  Browser (localhost:4200 in dev, of /dist via :5173)│
                │  Angular 18 standalone, signals + HttpClient       │
                └───────────────────────┬────────────────────────────┘
                                        │
                                  /api/...  (XHR/fetch)
                                        │
                ┌───────────────────────▼────────────────────────────┐
                │  Fastify (localhost:5173)                          │
                │  - Static: serves dist/frontend/browser/           │
                │  - Proxy: forwards /api/staffler/* with x-boemm-skey│
                │  - Auth: /api/login, /api/logout, /api/me          │
                │  - Session: skey in server-side Map, cookie sid    │
                └───────────────────────┬────────────────────────────┘
                                        │
                              x-boemm-skey header
                                        │
                ┌───────────────────────▼────────────────────────────┐
                │  Staffler gateway (gw.qa.dps.boemm.eu)             │
                │  Lambda authorizer + dps-service                   │
                └────────────────────────────────────────────────────┘
```

## Folder structuur

```
poc/
├── package.json                  backend deps (fastify, tsx)
├── tsconfig.json                 backend ts config
├── src/                          Fastify backend (al bestaand)
│   ├── client/staffler-client.ts (typed wrapper)
│   ├── types/staffler.ts         (handgeschreven types)
│   └── server/index.ts           (Fastify routes + session)
├── public/                       (kan weg na frontend setup)
└── frontend/                     NIEUWE Angular app
    ├── package.json              Angular CLI deps
    ├── angular.json              CLI build config
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tsconfig.spec.json
    ├── proxy.conf.json           ng serve proxy naar Fastify
    ├── src/
    │   ├── index.html
    │   ├── main.ts               bootstrap
    │   ├── styles.scss
    │   ├── environments/
    │   │   ├── environment.ts
    │   │   └── environment.development.ts
    │   └── app/
    │       ├── app.config.ts     providers (router, http, interceptor)
    │       ├── app.routes.ts     routing met guards
    │       ├── app.component.ts  shell met <router-outlet>
    │       ├── core/
    │       │   ├── api/
    │       │   │   ├── models.ts                staffler types subset
    │       │   │   └── staffler.service.ts      HttpClient wrapper
    │       │   └── auth/
    │       │       ├── auth.service.ts          login/logout/me state
    │       │       ├── auth.guard.ts            route protection
    │       │       └── auth.interceptor.ts      401 → /login redirect
    │       ├── layout/
    │       │   ├── shell.component.ts           navbar + outlet
    │       │   └── shell.component.html
    │       └── pages/
    │           ├── login/
    │           │   ├── login.component.ts
    │           │   └── login.component.html
    │           ├── dashboard/
    │           │   ├── dashboard.component.ts
    │           │   └── dashboard.component.html
    │           ├── employees/
    │           │   ├── employees.component.ts
    │           │   └── employees.component.html
    │           └── contracts/
    │               ├── contracts.component.ts
    │               └── contracts.component.html
```

## Twee draaiende modes

### Dev mode (snel itereren)

Twee processen, twee terminals:

```bash
# Terminal 1: Fastify backend
cd staffler/poc
npm run dev                       # backend op :5173

# Terminal 2: Angular dev server
cd staffler/poc/frontend
npm run start                     # ng serve op :4200, proxy /api/* naar :5173
```

Browser opent `http://localhost:4200`. Hot-reload via Angular CLI bij elke save. Backend hot-reload via tsx watch.

### Prod-like mode (één deployable)

```bash
cd staffler/poc/frontend
npm run build                     # output naar ../dist/frontend/browser/

cd ..
npm run start                     # Fastify serveert dist + /api in één proces
```

Browser opent `http://localhost:5173`. Geen Angular dev server nodig, Fastify dient de gebouwde Angular SPA als static files.

## Reuse uit wlnob/dps

Wat we direct copy-pasten:

| Van dps repo | Naar onze frontend | Aanpassing |
|---|---|---|
| `src/app/shared/components/*` | `src/app/shared/components/` | geen |
| `src/app/core/api/*.service.ts` | `src/app/core/api/` | wijzig base URL naar `/api/staffler` |
| `src/app/core/store/*` | `src/app/core/store/` | NGXS state werkt zoals dps het doet |
| Tailwind config (als dps het heeft) | root | overnemen |
| environments.*.ts pattern | `src/environments/` | aanpassen aan onze proxy |
| Custom pipes, directives | `src/app/shared/` | geen |

Wat NIET zomaar werkt:
- `auth.interceptor.ts` van dps stuurt `x-boemm-skey` header. Onze versie roept `/api/auth/login` en hangt cookies aan. Schrijf nieuw, niet copy-paste.
- API base URL: dps gebruikt `https://gw.qa.dps.boemm.eu/v1/dps-api/api`, wij gebruiken `/api/staffler`. Verander één env var.

## Auth flow (jouw mentaal model)

1. User bezoekt `/`, geen sessie → route guard stuurt naar `/login`
2. User vult username + password, submitten
3. Angular POST `/api/auth/login` → Fastify POST `/publicapi/companies/users/login` → Staffler
4. Staffler returnt `{ skey, authStatus: SUCCESS }` → Fastify slaat skey op in sessions Map onder een sid, set httpOnly cookie `poc_sid=<sid>`
5. Angular krijgt `{ ok: true, profile: DpsUserDetailsWebDto }` → AuthService bewaart profile in signal
6. Angular navigeert naar `/dashboard`
7. Elke volgende request stuurt automatisch de `poc_sid` cookie mee (Angular HttpClient met `withCredentials: true`)
8. Fastify ziet de cookie, vindt skey, voegt `x-boemm-skey` header toe, proxyt door
9. Bij 401: AuthInterceptor wist profile signal, navigeert naar `/login`

Angular kent NOOIT de skey. Skey leeft in Fastify session Map. Browser ziet enkel een opaque cookie sid.

## State management voor PoC

Geen NGXS voor de eerste iteratie. Te complex voor wat we vandaag bouwen.

In plaats daarvan: AuthService met Angular signals (`signal<DpsUserDetailsWebDto | null>(null)`). Andere components injecteren AuthService en gebruiken `authService.user()` voor reactief lezen.

Voor data: HttpClient direct in components. Geen Observable chains, gebruik `firstValueFrom` of de async pipe.

Als de PoC groeit naar product → introduceer NGXS uit dps repo. Voor vandaag overdreven.

## UI library

Twee opties:

A. Plain HTML + SCSS, geen UI library. Snelste setup, basic look. Voor een PoC-demo prima.

B. PrimeNG installeren (zoals dps). Mooie components, krijg je dialogs/tables/datepickers gratis. ~5 minuten setup, +30 min styling.

Aanbeveling vandaag: A (plain) zodat je niet vast loopt op CSS-tweaks. Switch naar PrimeNG op dag 2.

## Wat je vandaag NIET moet bouwen

- Geen i18n (NL hardcoded volstaat)
- Geen Google Analytics
- Geen RollbarErrorHandler
- Geen service worker / PWA
- Geen feature flags
- Geen multi-company switcher (gebruik eerste membership default)
- Geen pretty 404 page

Allemaal nuttig later, vandaag verspilt het je tijd.

## Time budget

| Stap | Tijd |
|---|---|
| Angular project genereren (`ng new` + deps installeren) | 15 min |
| Skeleton bestanden plaatsen (kopiëren van wat ik klaar zet) | 15 min |
| `ng serve` + verifieer dat root pagina laadt | 5 min |
| Fastify aanpassen: cookie session i.p.v. JSON, dist serveren | 30 min |
| Login flow werkend krijgen (end-to-end met QA test-account) | 1u |
| Dashboard: /api/me display | 30 min |
| Employees lijst pagina | 1u |
| Contracts week-view pagina | 1u 30min |
| Styling polish | 30 min |
| Deploy naar Vercel/Netlify (optioneel) | 30 min |

Totaal: ~6u werk. Doenbaar in één dag als je niet vastloopt.
