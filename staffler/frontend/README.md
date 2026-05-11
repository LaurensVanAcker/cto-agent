# Staffler Frontend kennisbank

Doelpubliek: iemand die een PoC-frontend bouwt die op de Staffler-backend praat (companion van `../api/`). Bron: GitHub `wlnob/dps` (Angular admin SPA) + `wlnob/my-staffler` (Ionic+Capacitor employee app), Confluence DPS-space, Jira BCJ, en de live PROD-frontends. Gepulld op 10 mei 2026.

## Wat is de Staffler-frontend

De backend uit `../api/` wordt vandaag door **twee Angular-codebases** geconsumeerd:

- **`wlnob/dps`** — de admin/company SPA. Angular 19 + NGXS + PrimeNG + Bryntum Scheduler. PROD draait op `myplanning.digitalpayrollservices.be`. Bedrijfsadmins, salaris-medewerkers en BOEMM-staff loggen hier in om planning, contracten, facturatie en pool-beheer te doen. Branch model `dev` → `qa` → `master` met CFN+CloudFront deploy per env.
- **`wlnob/my-staffler`** — de werknemer-app, nieuw in Q2.3 (sprint mei-juni 2026). Angular 21 + Ionic 8 + Capacitor 8 → PWA + iOS + Android binaries. Domein `my.staffler.be` (CloudFront) of `staffler.boemm.eu` (alias). Vervangt het oude `wlnob/your-dps` proof-of-concept en spreekt de nieuwe `/publicapi/employees/users/login` + `/api/my-staffler/...` namespace aan.

Tussen die twee zit **geen gedeelde component-library**. Beide repos hebben hun eigen `shared/` folder, hun eigen interceptors, hun eigen Store-base-class. Het pink-thema (`#fc074f`) en de Inter-font keuze worden los geconfigureerd in elk project. Wanneer ze convergeren is een open project (zie `quirks.md`).

## Structuur van deze kennisbank

```
staffler/
├── frontend/                        deze kennisbank
│   ├── README.md                    je leest dit
│   ├── repos.md                     elke FE-repo, rol, build, deploy
│   ├── architecture.md              versies, modules, signals, change detection, PWA
│   ├── auth.md                      Cognito + skey op de FE-kant
│   ├── api-client.md                hoe FE de OpenAPI consumeert (interceptors, errors)
│   ├── components.md                gedeelde components per repo
│   ├── i18n.md                      ngx-translate setup, NL/EN, fallbacks
│   ├── forms.md                     reactive forms, validators, error display
│   ├── routing.md                   route catalog, guards, lazy modules
│   ├── state.md                     NGXS in dps, BehaviorSubject Store in mystaffler
│   ├── styling.md                   PrimeNG/Ionic/SCSS, theming, dark mode
│   ├── dev-setup.md                 lokaal draaien, env vars, mock backends
│   ├── build-deploy.md              CI/CD, S3+CloudFront, OIDC
│   ├── quirks.md                    non-obvious gotchas (zie het echt)
│   ├── breaking-changes-q23.md      Jira BCJ Q2.3 FE-impact
│   ├── monday-checklist.md          shopping list voor maandag
│   └── live-findings.md             observaties op de deployed FE
└── frontend/poc/                    werkbare TypeScript skeleton (option B)
    ├── README.md
    ├── package.json, tsconfig.json
    ├── src/
    └── public/
```

## Snelle oriëntatie

| Aspect | dps (admin) | my-staffler (employee) |
|---|---|---|
| Angular versie | 19.1.6 | 21.0.0 |
| Bootstrap | Standalone (`bootstrapApplication`) | Standalone + Ionic |
| Change detection | OnPush + experimental zoneless | OnPush, zone.js |
| State management | NGXS 19 + custom `Store<T>` BehaviorSubject base | Custom `Store<T>` only (geen NGXS) |
| UI library | PrimeNG 19 (Lara preset) + primeflex | Ionic 8 (mode `ios`) + Angular Material 21 |
| Icons | Custom dps-icons font (fantasticon) + SVG | ionicons via `addIcons()` per component |
| i18n | ngx-translate, NL+EN, default NL (EN op dev) | ngx-translate, default `en` |
| Forms | Reactive, custom validators per veldtype | Reactive, ad-hoc validators |
| HTTP auth | `localStorage.skey` + `x-boemm-skey` header | Capacitor `Preferences.staffler_auth_token` + `x-boemm-skey` header |
| Auth pool | `/publicapi/companies/users/login` (DPS pool) | `/publicapi/employees/users/login` (MyDPS pool) |
| Routing | `provideRouter(... withViewTransitions())` | `provideRouter(... withComponentInputBinding())` + IonicRouteStrategy |
| Service Worker | enabled when `!isDevMode()`, 30 min poll dev/qa, 24u prod | enabled in `production: true` (qa+prod) |
| Error tracking | Rollbar (`aa41db0a03e146f6bf997139e05b6fb3`) | none yet |
| Feature flags | LaunchDarkly anonymous (env-specific clientId) | none yet |
| Analytics | Google Analytics 4 (env-specific GA id) | none yet |
| Dev port | 1445 | 1444 |
| Prod URL | `myplanning.digitalpayrollservices.be` | `my.staffler.be` (CloudFront) / `staffler.boemm.eu` (alias) |
| Build output | `dist/dps/browser/` | `www/browser/` (Ionic build) |
| Deploy target | S3 + CloudFront via GitHub Actions OIDC | idem |
| Default branch | `dev` (master is for prod tag) | `dev` |
| Test framework | Karma + Jasmine (no real coverage) | Karma + Jasmine + jasmine-core 5 |
| Native targets | n/a | iOS (Xcode), Android (Studio) via Capacitor |

## API root vs FE host

Beide FE-apps bellen naar dezelfde backend gateway. Zie `../api/environments.md`:

| Env | Gateway (API) | dps SPA host | my-staffler SPA host |
|---|---|---|---|
| dev | `gw.dev.dps.boemm.eu` | `dev.dps.boemm.eu` | `dev.staffler.boemm.eu` (per env-file), CFN target `my.staffler.be` |
| qa | `gw.qa.dps.boemm.eu` | `qa.dps.boemm.eu` | `qa.staffler.boemm.eu` / CFN `my.staffler.be` |
| prod | `gw.myplanning.digitalpayrollservices.be` | `myplanning.digitalpayrollservices.be` | `staffler.boemm.eu` / CFN `my.staffler.be` |

CORS-implicatie: lokaal draaien op `localhost:1444/1445` werkt **niet direct tegen QA/PROD-gateway**. De gateway weigert preflights van origins die niet in `boemm.allowedOrigins` zitten. Werkbaar zijn (a) een server-side proxy zoals in `../poc/`, (b) je dev-origin laten toevoegen door dev-ops, (c) lokaal op een andere QA-deployment richten waar `localhost` al toegelaten is. De PoC-skeleton in `frontend/poc/` kiest optie (a).

## Volgende stap voor maandag

1. Lees `monday-checklist.md` (5 min) en stuur de top vragen door.
2. Lees `auth.md` voor de FE-kant van de skey-flow (cross-ref met `../api/auth.md`).
3. Lees `breaking-changes-q23.md` voor de FE-impact van Jira sprint Q2.3.
4. `cd frontend/poc && npm install && npm run dev` om de skeleton te draaien.
5. Open `http://localhost:5174` (we gebruiken een ander port dan de echte FEs zodat ze parallel kunnen draaien).
6. Daarna lees `architecture.md` + `routing.md` + `components.md` om te beslissen of je verder bouwt op één van de bestaande FE-repos of greenfield gaat.

## Stand van zaken (10 mei 2026)

Wat zit in de doos:

- 2 hoofd-Angular-repos in detail beschreven (`dps` v19, `my-staffler` v21+Ionic+Capacitor)
- Auth-flow client-side (skey in localStorage vs Capacitor Preferences) gedocumenteerd
- HTTP-interceptor patronen (auth + error) van beide repos verbatim toegelicht
- Routing tree per app (paths, guards, lazy modules)
- State-management: NGXS + custom Store class (dps), pure custom Store (my-staffler)
- Theming + design system per app (PrimeNG Lara preset + custom; Ionic theming)
- i18n setup (NL/EN dictionaries per repo, ngx-translate v16)
- Forms patronen + 16+ shared validators in dps
- 16+ shared components in dps (action-center, address autocomplete, IBAN field, phone field, generic error dialog, main menu, …)
- CI/CD workflows (GitHub Actions, AWS OIDC role, S3+CloudFront)
- CFN Cloudfront-stack parameters per env
- Native build setup voor my-staffler (Capacitor iOS+Android, splash, status bar, push)
- Sprint Q2.3 BCJ-tickets met FE-impact (force-pwd-reset, schedule list, clock-in selfie, …)
- PoC-skeleton in `frontend/poc/` (Vite+TS+lit-html, geen Angular om snel te draaien)
- Live-findings van de deployed FE (login pagina, public assets, manifest, headers)

Wat er ontbreekt en alleen via team beantwoord kan worden:

- Of er een gedeelde component-library moet komen tussen `dps` en `my-staffler` (zie `quirks.md` punt 1)
- Werknemer test-account in QA (employee pool, MyDPS-qa) → vraag dev-ops
- Bryntum-licentie geldigheid (in dev README staat een hardcoded credential, vermoedelijk gedeelde dev-account)
- Of `wlnob/your-dps` definitief obsolete is (laatste commit feb 2025, blijkt eerste prototype voor `my-staffler` te zijn) — bevestiging dev-ops

Alles wat de PoC-bouwer "los uit het hoofd" zou moeten weten zit in deze map.

## Cross-refs naar de backend kennisbank

| FE-doc | Cross-ref backend |
|---|---|
| `auth.md` | `../api/auth.md` (skey life cycle, beide pools) |
| `api-client.md` | `../api/openapi/openapi.json` + `../api/conventions.md` |
| `breaking-changes-q23.md` | `../api/sources/jira-mystaffler-details.md` (BCJ Q2.3) |
| `routing.md` | `../api/endpoints-index.md` (welke endpoint achter welke route) |
| `live-findings.md` | `../api/live-findings.md` (BE-side anti-patterns) |
