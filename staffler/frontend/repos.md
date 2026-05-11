# Frontend repos

GitHub-org `wlnob` bevat 107 repos. Hieronder enkel de Angular-projecten die de Staffler-backend consumeren of historisch consumeerden. Eind-bron `mcp__github__search_code` op `filename:angular.json org:wlnob` op 10 mei 2026.

## Actieve Staffler-frontends

### `wlnob/dps` — Staffler admin SPA

- **Naam in code**: `dps` (history: het project heet sinds 2025 commercieel "Staffler" maar de repo naam, npm-package naam, container, prefix `dps-` zijn allemaal blijven staan).
- **Default branch**: `dev`. Branch flow: `dev` → `qa` → `master` (= prod). Hotfix branches `hotfix/BCJ-XXXXX` direct van `master`.
- **Latest commit op dev (10/05)**: `c48737f8` — voorbij elke `qa` push.
- **Stack**: Angular 19.1.6, NGXS 19, PrimeNG 19 (Lara preset), Bryntum Scheduler 6.2 (paid), ngx-translate 16, Luxon 3.4, LaunchDarkly JS SDK, Rollbar, ngx-google-analytics.
- **Doel**: company-side UI: planning, contracts, actuals (loonbevestiging), employee pool, invitations, groups, user accounts, profiel, onboarding, time-registration. Plus auth (login/forgot/reset/setPassword/admin BoemmAD redirect).
- **Targets**: web only (PWA via service worker). Geen native build. Browsers: latest 2 + Chrome >=83 + Firefox ESR + Safari >=14.
- **Lokale install**:
  ```bash
  npm config set "@bryntum:registry=https://npm.bryntum.com"
  npm login --registry=https://npm.bryntum.com
  # Username: development..boemm.eu
  # Password: JvvlSIC5YoMIY9s9JCV2RcQ3   (in README, dev-shared)
  npm i
  npm start             # = ng serve --open  → http://localhost:1445/
  npm run start:qa      # tegen QA backend (gebruikt environment.qa.ts)
  ```
- **Build**:
  ```bash
  npm run build:dev     # → dist/dps/browser/
  npm run build:qa
  npm run build:prod
  ```
- **Tests**: `npm test` (Karma + Jasmine + ChromeHeadless). `karma.conf.js` aanwezig, weinig actieve specs (zie `**/*.component.spec.ts` excluded uit test-target). `npm run test:ci-cd` voor CI.
- **Andere scripts**:
  - `npm run generate:dps-icons-font` — fantasticon herbouwt `assets/fonts/dps-icons.woff` uit SVG-bron in `tools/fantasticon/`.
  - `npm run detect-circular-deps` — `madge --circular --extensions ts ./` (CI gate).
  - `npm run prepare` — husky-install (pre-commit prettier).
- **Deploy target**: AWS S3 → CloudFront. Per env een eigen S3-bucket en distribution. Domain via Route53 alias.
  - dev: `dev.dps.boemm.eu` (HostedZone `Z0952617WDGC04ALMM5H`)
  - qa: `qa.dps.boemm.eu` (HostedZone `Z0952030Y0Y7K9PLZHE0`)
  - prod: `myplanning.digitalpayrollservices.be` (HostedZone `Z045275738AOIHJHJ7WCP`)
  - CFN: `cfn/cloudfront-dps-static.yaml` + per-env parameters JSON.
- **CI/CD**: GitHub Actions, één workflow per env (`.github/workflows/{dev,qa,prod}.yaml`). Trigger: push op gelijknamige branch. Bouwt op Node 20.18.0, cache `node_modules`, maakt `dist/dps/browser`, sync naar S3 met `--delete --acl public-read`, invalidate CloudFront `/*`, en zet `npm pkg get version` als SSM `/dps/clientversion`. AWS auth via OIDC role `arn:aws:iam::${ACCOUNT_ID}:role/Github_Actions_Role`. `#skip-ci` in commit message slaat de deploy-stap over.
- **Bryntum**: dependency `@bryntum/scheduler` + `@bryntum/scheduler-angular`. Gebruikt voor de planning-grid in `pages/company/modules/planning` en `pages/company/modules/actuals`. Paid library, vereist registry login bij build én lokaal. CI heeft secret `BRYNTUM_PASS`.

### `wlnob/my-staffler` — MyStaffler employee app

- **Default branch**: `dev`. Active feature branches op 10/05: `feature/BCJ-19426`, `feature/BCJ-19428`, `feature/BCJ-19431`, `feature/BCJ-19433`, `feature/BCJ-19451`, `feature/BCJ-19453`, `feature/BCJ-19506`. Allemaal in sprint Q2.3.
- **Latest commit op dev (10/05)**: `cc9f1ae8`.
- **Stack**: Angular 21.0.0, Ionic 8.8.3 (`mode: 'ios'`), Capacitor 8 (iOS + Android), Angular Material 21, ngx-translate 16, date-fns 4, ionicons 7. **Geen NGXS, geen PrimeNG, geen Bryntum, geen LaunchDarkly, geen Rollbar.** Bewust slanke dependency-tree.
- **Doel**: werknemer-view: weekly schedule, shift-detail, clock-in (selfie + GPS, BCJ-19440-19442), profile (personal-details + documents + logout), onboarding-permissions (camera + locatie + push). Vervangt het oude `wlnob/your-dps` PoC dat enkel een Express-backend met statisch geserveerde Angular bevatte.
- **Targets**: PWA (web), iOS native (`be.boemm.staffler`, schemes `App` / `MyStaffler QA` / `MyStaffler` per env), Android native (flavors `dev`/`qa`/`prod`).
- **Lokale install**:
  ```bash
  npm i
  npm run serve                # ionic serve -p=1444 → http://localhost:1444/
  npm run serve:native:ios     # ionic cap run ios -l --external -p=1444 (live reload op device)
  npm run serve:native:android
  ```
- **Build**:
  ```bash
  npm run build:web:dev        # → www/browser/
  npm run build:web:qa
  npm run build:web:prod
  npm run sync:native:dev      # ionic cap sync -c=dev (NODE_ENV=dev wordt door capacitor.config.ts gelezen om scheme/flavor te kiezen)
  npm run sync:native:qa
  npm run sync:native:prod
  npm run open:ide:ios         # opent Xcode project
  npm run open:ide:android     # opent Android Studio
  npm run generate-native-assets  # capacitor-assets, regenereert app icons + splash
  ```
- **Tests**: `npm test` (Karma+Jasmine). Eén echte spec gevonden (`permissions.component.spec.ts`, 10337 bytes). Verder skeletons.
- **Lint**: `npm run lint` (`@angular-eslint` + `typescript-eslint` 8). Prettier scripts: `npm run format` / `format:check`.
- **Deploy target**: AWS S3 → CloudFront. Eén domain `my.staffler.be` over alle 3 envs (verschillende CloudFront distributies per env, eigen HostedZone). Maar de SPA gebruikt OOK `staffler.boemm.eu` als `baseUrl` per env (env-files versus CFN parameters tegenstrijdig — zie `quirks.md` punt 4).
  - dev CFN: HostedZone `Z01152173O2586AQ7S7KY`, domain `my.staffler.be`
  - qa  CFN: HostedZone `Z08483133CPVP2KH4DOE6`, domain `my.staffler.be`
  - prod CFN: HostedZone `Z052890712QPTK5SDOETG`, domain `my.staffler.be`
- **CI/CD**: GitHub Actions zoals `dps`-repo. Node 22.12.0 (vs 20 in dps). Build `npm run build:web:qa`, output naar `./www`, sync naar S3, invalidate CloudFront. Geen Bryntum-login stap, geen SSM-write stap.
- **Capacitor plugins gebruikt**:
  - `@capacitor/app` — deep linking via `App.addListener('appUrlOpen', …)` (zie `app.component.ts`).
  - `@capacitor/preferences` — persist auth token (`staffler_auth_token` key) ipv localStorage.
  - `@capacitor/camera` — clock-in selfie (BCJ-19440).
  - `@capacitor/geolocation` — clock-in location (BCJ-19442).
  - `@capacitor/push-notifications` — shift reminders (BCJ-19446-19447, niet actief).
  - `@capacitor/splash-screen`, `status-bar`, `haptics`, `keyboard`, `dialog`, `device`.
  - `capacitor-native-settings` — link naar OS-instellingen voor permission denials.
  - `@ionic/pwa-elements` — fallback camera UI in browser PWA-modus.

## Historische / parallel projects

### `wlnob/your-dps` — afgesloten PoC (2024 → feb 2025)

- **Default branch**: `master`. Geen merges meer sinds 2025-02-04.
- **Stack**: Angular legacy (HTML repo-tag, server-folder met Express, client-folder met oudere Angular), TSLint, Protractor (verlaten in Angular 12+).
- **Bevat**: `your-dps-doc.docx`, `your-dps-doc.pdf` — interne discussie-doc.
- **Conclusie**: definitief vervangen door `wlnob/my-staffler`. Niet meer van toepassing voor nieuwe FE-werk. Niet weggegooid omdat de design-doc nog handig was tijdens MyStaffler-opzet.

### `wlnob/eagle` — apart product (BOEMM Eagle backoffice)

- **Default branch**: `dev`. Active.
- **Stack**: Angular (eigen versie, eigen prefix). Geen Staffler-koppeling vanuit codepath: heeft eigen authenticated routes en geen import van dps-service URLs.
- **Doel**: BOEMM-internal tool voor BOEMM-medewerkers (consultants), GEEN klant-frontend. Toont employee freshness, leads, vacancies, contract sync states.
- **Niet relevant** voor de Staffler PoC. Eigen backend (`falcon-api`, `lead-lifecycle`, etc.).

### `wlnob/my-jobfixers` + `wlnob/jobfixers-applications` + `wlnob/jobfixers-vacancies-deprecated` + `wlnob/jobfixers-work`

- **Stack**: Angular (versies wisselen).
- **Doel**: JobFixers-merk (parallel product van BOEMM, niet Staffler). Eigen backend `myjobfixers-service`, `jobfixers-applications-api-gateway`. Zelfde BOEMM Cognito setup maar andere user pool en andere domeinen.
- **Niet relevant** voor de Staffler PoC.

### `wlnob/boemm-performance`

- **Stack**: Angular.
- **Doel**: HR-performance dashboards intern.
- **Niet relevant**.

### `wlnob/watchtower-fe`

- **Default branch**: `master`. Heel jong (mar 2026). 1 open issue.
- **Stack**: nog onbekend (root contents niet gespecificeerd in eerste pass).
- **Bijhorend**: backend `wlnob/watchtower-service` (Java).
- **Doel**: BOEMM-internal monitoring tool. Niet relevant voor Staffler PoC.

## Niet-Angular FE in dezelfde org

- `wlnob/onboarding` — "New Onboarding script B.O.E.M.M. JobFixers". Klein, jan 2026. Niet Staffler.
- `wlnob/boemm-dubbies` — JavaScript repo, geen Angular. Vermoedelijk een marketing-site. Buiten scope.

## Clone-commando's

Alle repos zijn private. Voor lokale clone heb je een GitHub-account nodig dat lid is van `wlnob` of een PAT met `repo` scope.

```bash
# Met SSH (aangenomen je SSH-key zit op je github account)
git clone git@github.com:wlnob/dps.git
git clone git@github.com:wlnob/my-staffler.git

# Of met HTTPS + PAT
git clone https://github.com/wlnob/dps.git
git clone https://github.com/wlnob/my-staffler.git

# Specifieke branches
git clone -b dev git@github.com:wlnob/dps.git
git clone -b dev git@github.com:wlnob/my-staffler.git
```

Voor `dps`: vergeet de Bryntum-registry login niet vóór `npm i`, anders faalt installatie van `@bryntum/scheduler` met 401 op de private NPM registry.

## Branch-conventie samengevat

Beide repos volgen dezelfde flow:

| Branch | Doel | Auto-deploy naar |
|---|---|---|
| `dev` | Default voor PR's, integratie | dev env |
| `qa` | Cherry-pick / fast-forward vanuit dev voor QA-testing | qa env |
| `master` | Productie | prod env |
| `feature/BCJ-XXXXX` | Per Jira-ticket | — (CI build only) |
| `fix/<naam>` of `hotfix/BCJ-XXXXX` | Quick fix, vaak van master | optioneel direct naar prod |
| `dependabot/...` | Automatisch | — |

Geen "release" branches, geen tags. Versie wordt bijgehouden in `package.json` (`npm pkg get version`) en weggeschreven naar AWS SSM bij elke deploy (alleen dps doet dit, mystaffler niet).
