# Local development setup

## Voor beide repos

### Vereisten

- **Git** met SSH-key bij `wlnob` GitHub-org of een PAT met `repo` scope.
- **Node.js**:
  - dps → 20.18.0 (zie CI workflow)
  - mystaffler → 22.12.0 (zie CI workflow)
  - Lokaal: gebruik nvm of fnm om per-project te switchen.
- **npm** (komt met Node).
- **Een browser** (Chrome aanbevolen voor Karma-tests).

### Aanbevolen tooling

- **VS Code** of **Cursor** (beide repos hebben `.vscode/` configs)
- **nvm/fnm** voor Node-versie-management
- **Postman** of **HTTPie** of **curl** voor handmatige API tests

### nvm/fnm setup

```bash
# nvm
nvm install 20.18.0
nvm install 22.12.0

# in dps repo:
nvm use 20.18.0

# in mystaffler repo:
nvm use 22.12.0

# fnm equivalent
fnm install 20.18.0 && fnm install 22.12.0
fnm use 20.18.0    # in dps
fnm use 22.12.0    # in mystaffler
```

Voeg `.nvmrc` toe aan elke repo voor auto-switch (niet aanwezig in repos op 10/05/2026).

---

## dps lokaal draaien

### Initial setup

```bash
git clone git@github.com:wlnob/dps.git
cd dps

# Bryntum-registry login (paid library)
npm config set "@bryntum:registry=https://npm.bryntum.com"
npm login --registry=https://npm.bryntum.com
# Username: development..boemm.eu
# Password: JvvlSIC5YoMIY9s9JCV2RcQ3
# Email:    development@boemm.eu  (optioneel, sommige npm versies vragen het)

npm install
```

Bij Bryntum-401: stop, herstart vanaf `npm config set ...`. De registry-config zit per-user in `~/.npmrc`.

### Dev server (default = dev backend)

```bash
npm start
# = ng serve --open
# Opent http://localhost:1445/ (auto-launch in default browser)
# Praat tegen https://gw.dev.dps.boemm.eu (zie environment.dev.ts)
```

### Dev server tegen QA backend

```bash
npm run start:qa
# = ng serve -c=qa --open
# Praat tegen https://gw.qa.dps.boemm.eu
# CORS-issue: localhost:1445 zit waarschijnlijk niet in QA's allowedOrigins
# → probeer eerst, fallback: server-side proxy of vraag dev-ops origin toe te voegen
```

### Eerste login

1. Open `http://localhost:1445/`.
2. Wordt geredirected naar `/login`.
3. Login met dev/qa-test-account (vraag dev-ops, zie `monday-checklist.md`).
4. Na success → `/company/<id>/planning` met Bryntum scheduler.

### Testen (lokaal)

```bash
npm test                   # = ng test (Karma + Chrome)
# Opent een browser-window dat tests live draait
# Watch-mode aan, hoekkijken naar broken tests

npm run test:ci-cd         # = ng test --no-watch --browsers=ChromeHeadless
# Voor CI of voor één-shot run zonder window
```

Note: `**/*.component.spec.ts` is **excluded** uit test-target (zie `angular.json`). Veel components hebben geen actieve tests.

### Build (lokaal)

```bash
npm run build:dev          # → dist/dps/browser/  (sourcemaps, dev backend)
npm run build:qa           # → dist/dps/browser/  (sourcemaps, qa backend)
npm run build:prod         # → dist/dps/browser/  (geen sourcemaps, prod backend)
```

Geen development build voor lokale `ng serve` (HMR doet dat al).

### Linting + format

```bash
# Husky pre-commit hook draait Prettier
npx prettier --check "src/**/*.{ts,html,scss}"
npx prettier --write "src/**/*.{ts,html,scss}"
```

Geen ESLint config in dps. `npm run detect-circular-deps` (`madge --circular`) is de enige TS-lint.

### Service worker debug

Service Worker is **disabled in dev mode** (`!isDevMode()`). Om SW lokaal te testen:
```bash
npm run build:dev
npx http-server dist/dps/browser -p 1445
```

(Of gebruik PWA-debug tools in Chrome DevTools → Application tab.)

### Bekende lokale problemen

| Probleem | Oplossing |
|---|---|
| `npm install` faalt op `@bryntum/scheduler` 401 | Bryntum login vergeten (zie hierboven) |
| `ng serve` start niet op port 1445 | Andere process op die port? `lsof -i :1445` om te checken |
| CORS-error in browser console bij API calls | Origin niet in allowedOrigins van backend env. Zie `monday-checklist.md` |
| Login werkt maar /company/:id is leeg | companyId niet matched aan jouw memberships. Vraag dev-ops om jouw test-account aan een test-company te koppelen. |
| Service worker cached oude bundle | DevTools → Application → Service Workers → "Unregister" + hard refresh |
| Bryntum scheduler toont "License expired" | Dev-license periodiek vernieuwen, of vraag team |

---

## mystaffler lokaal draaien

### Initial setup

```bash
git clone git@github.com:wlnob/my-staffler.git
cd my-staffler

# Geen Bryntum nodig. Geen private registry.
npm install
```

### Dev server (web/PWA)

```bash
npm run serve
# = ionic serve -p=1444
# Opent http://localhost:1444/
# Praat tegen https://gw.dev.dps.boemm.eu (zie environment.ts default + .dev.ts)
```

Belangrijke noot: `environment.ts` heeft `production: false` en `apiBaseUrl: 'https://gw.dev.dps.boemm.eu/v1/dps-api/api'`. Lokaal default is dus dev-backend.

### Dev server tegen QA

Geen aparte `serve:qa` script. Gebruik fileReplacements:
```bash
npx ionic serve -c=qa -p=1444
```

(Of edit `angular.json` om een `qa` serve config toe te voegen.)

### Native dev (iOS, requires macOS + Xcode)

```bash
npm run serve:native:ios
# = ionic cap run ios -l --external -p=1444
# Live reload op je iPhone via local network
```

```bash
npm run open:ide:ios
# Opent Xcode project ios/App/App.xcworkspace
```

Voor distribution-builds: build via Xcode na `npm run sync:native:prod`.

### Native dev (Android, requires Android Studio)

```bash
npm run serve:native:android
npm run open:ide:android
```

### Sync Capacitor

```bash
npm run sync:native:dev      # NODE_ENV=dev
npm run sync:native:qa       # NODE_ENV=qa
npm run sync:native:prod     # NODE_ENV=prod
```

Dit:
1. Builds web (`ionic build -c=<env>`)
2. Copy de `www/browser/` output naar de native projecten (`ios/App/App/public/`, `android/app/src/main/assets/public/`)
3. Update Capacitor plugins (`capacitor.config.ts` evaluation per env)

Nodig na:
- Wijzigingen in `capacitor.config.ts`
- Wijzigingen in geïnstalleerde Capacitor plugins
- Eerste keer per env

### Native assets

```bash
npm run generate-native-assets
# = npx capacitor-assets generate --ios --android
# Regenereert app-icon + splash-screen voor beide platforms
# Bron: assets/icon.png + assets/splash.png (1024x1024 PNG)
```

### Eerste login

1. Open `http://localhost:1444/`.
2. Wordt geredirected naar `/auth`.
3. Login met employee-test-account (BCJ-19426, zie `monday-checklist.md`).
4. Na success → `/tabs/schedule`.
5. Op iOS/Android: voor first-launch gaat de app door `/onboarding/permissions` om camera/GPS/push te vragen.

### Tests

```bash
npm test                   # = ng test (Karma + Chrome)
npm test -- --no-watch --browsers=ChromeHeadless     # one-shot
```

Eén echte spec aanwezig: `permissions.component.spec.ts`. Verder skeletons.

### Lint

```bash
npm run lint               # = ng lint (gebruikt @angular-eslint + typescript-eslint v8)
```

### Format

```bash
npm run format             # prettier --write "src/**/*.{ts,html,scss,json}"
npm run format:check       # check-only, voor CI
```

### Build

```bash
npm run build:web:dev      # → www/browser/
npm run build:web:qa
npm run build:web:prod
```

Output bevat:
- `index.html`, `main.js`, `runtime.js`, `polyfills.js`, `styles.css`
- Lazy-chunks per route
- `ngsw-worker.js` + `ngsw.json` (service worker)
- `assets/` folder met i18n + icons + svgs
- `manifest.webmanifest` (PWA)

### Bekende lokale problemen

| Probleem | Oplossing |
|---|---|
| `npm install` faalt op peer-deps | Angular 21 + Ionic 8 hebben strikte peers; force-install met `npm i --legacy-peer-deps` |
| `ionic serve` doet niets | Check of `@ionic/cli` geïnstalleerd is (`npx ionic -v`) |
| Capacitor sync faalt op iOS | Check Xcode geïnstalleerd, command-line tools (`xcode-select --install`), CocoaPods (`brew install cocoapods`) |
| iOS app crasht bij start | Bekijk Xcode console → vaak een ontbrekende permission key in `Info.plist` |
| Camera werkt niet in browser PWA | `@ionic/pwa-elements` moet geladen zijn (zie `main.ts` `defineCustomElements(window)`) |
| Token niet bewaard tussen reloads | Capacitor Preferences faalt soms op localhost; check Application → IndexedDB in DevTools |
| Service worker cached oude bundle | Onregister via DevTools, hard refresh, of bouw een nieuwe build |

---

## Environment variables

Beide repos hebben **geen `.env` files**. Configuratie zit in TypeScript:

`dps`:
- `src/environments/environment.ts` (= prod default)
- `src/environments/environment.dev.ts`
- `src/environments/environment.qa.ts`

`mystaffler`:
- `src/environments/environment.ts` (= dev default, `production: false`)
- `src/environments/environment.dev.ts` (production: true, dev backend)
- `src/environments/environment.qa.ts` (production: true, qa backend)
- `src/environments/environment.prod.ts` (production: true, prod backend)

Switch via Angular fileReplacements (gedefinieerd in `angular.json` per build configuration).

**Geen secrets in environment files**. Alle "secrets" zijn publieke OAuth client IDs en LaunchDarkly client-side IDs (designed-to-be-public).

### Hardcoded "secrets" (in repo, public)

dps:
- `featureFlagClientId` (LaunchDarkly client-side, één per env)
- `googleMeasurementId` (Google Analytics, public)
- `boemmLoginUrl` (Cognito hosted UI URL met client_id, public)
- Bryntum dev-credentials in `README.md` (shared dev account, **niet productie**)
- Rollbar `accessToken` `aa41db0a03e146f6bf997139e05b6fb3` in `core/rollbar/rollbar.ts` (post-only token, public per Rollbar design)

mystaffler:
- Geen vergelijkbare secrets — enkel `apiBaseUrl` + `publicApiBaseUrl` per env.

---

## Mock backends

### dps

**Geen lokale mock-backend**. App praat altijd tegen een echte gateway-deployment (dev/qa/prod).

Voor offline ontwikkeling kan je `MirageJS` of `MSW` toevoegen als HTTP-interceptor mock — niet aanwezig in repo.

### mystaffler

**Veel services zijn van zichzelf mocks** met `delay()` + `console.log` (zie `api-client.md`):
- `OnboardingService.recordOnboarding` / `storeDeviceToken`
- `UserService.updateEmail` / `updatePhone`
- `DocumentService.getDocuments`

Login (`AuthService`) en `getCurrentUser` zijn echte API calls. Voor local dev zonder backend: alle services overschrijven met mocks via Angular DI (geen fake-API server).

---

## Seeded data

Geen seeded data in beide repos. Alle data komt van backend. Voor PoC met realistic data:

1. Vraag een QA test-bedrijf aan met seedede employees + contracten in de huidige week (zie `monday-checklist.md`).
2. Of gebruik backend-side seed scripts (`../api/sources/`).
3. Voor mystaffler: gebruik de mock-data in `DocumentService.MOCK_DOCUMENTS` als template.

---

## VPN / network

- Backend Swagger UI is alleen via BOEMM VPN bereikbaar (zie dps README): `http://boemm-nlb-dev-d79bf2e45c1cad91.elb.eu-central-1.amazonaws.com:8103/dps-api/swagger-ui/index.html`
- API-gateway endpoints (`gw.*.dps.boemm.eu`) zijn publiek (geen VPN nodig).
- AWS-resources (S3, CloudFront, SSM) vereisen AWS credentials of VPN.

---

## Tijdgebruik per setup

| Setup | Tijd |
|---|---|
| dps clone + Bryntum login + npm i | ~3-5 min (eerste keer) |
| dps `npm start` cold start | ~30-60 sec |
| mystaffler clone + npm i | ~2-3 min (eerste keer) |
| mystaffler `npm run serve` cold start | ~20-40 sec |
| Capacitor `sync:native:dev` (eerste keer) | ~2-5 min (CocoaPods install op iOS) |
| Build prod (dps) | ~60-90 sec |
| Build prod (mystaffler) | ~40-60 sec |

Geen webpack-config-changes, geen custom build-pipeline. Pure Angular CLI.
