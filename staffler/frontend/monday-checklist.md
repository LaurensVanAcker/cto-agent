# Monday morning checklist (frontend)

Concrete shopping-list voor maandag 11 mei 2026 om de FE-PoC te starten. Sortering op urgentie. Cross-ref met `../api/monday-checklist.md` voor backend-side vragen.

## Top 3 (deze MUSSEN klaar zijn voor FE-werk)

### 1. Twee test-accounts in QA — één company, één employee

**Wat**:
- Een **COMPANY_USER** account in de QA `DPS` Cognito user pool, gekoppeld aan een test-bedrijf met seedede employees + contracten in de huidige week. (Idem als `../api/monday-checklist.md` punt 1.)
- Een **EMPLOYEE_USER** account in de QA `MyDPS-qa` Cognito user pool, gekoppeld aan diezelfde test-employee, met enkele actuele shifts.

**Wie**: dev-ops (Bernardo of huidige tech hero, check #technical-errors topic).

**Waarom 2 accounts**: dps en mystaffler praten naar verschillende Cognito pools (zie `auth.md`). Eén account kan niet beide testen.

**Wat te vragen, letterlijk**:

> Dag,
>
> Voor de Staffler-frontend PoC heb ik twee QA test-accounts nodig:
>
> - Een COMPANY_USER op een test-company in QA (= zelfde request als de backend-PoC al heeft staan)
> - Een EMPLOYEE_USER op de MyDPS-qa pool, gekoppeld aan een employee in die test-company, met enkele scheduled shifts in de huidige week
>
> Username + password graag in 1Password.
>
> Thx
> Laurens

**Fallback**: Geen employee-account → mystaffler-PoC kan alleen login-screen tonen, niet de tab-shell. Werk alleen aan dps-PoC tot accounts klaar zijn.

### 2. Bevestig dat localhost:1444 / 1445 in dev-gateway allowedOrigins zit

**Wat**: Voor lokaal draaien tegen `gw.dev.dps.boemm.eu` of `gw.qa.dps.boemm.eu` moet je dev-origin in `boemm.allowedOrigins` env var zitten. (Idem als `../api/monday-checklist.md` punt 2.)

**Wie**: dev-ops.

**Wat te vragen**:

> Voor lokale FE-dev wil ik browsers laten draaien op:
> - `http://localhost:1445` (dps)
> - `http://localhost:1444` (mystaffler)
> - `http://localhost:5174` (mijn PoC-skeleton)
>
> Zitten die nu al in `ORIGIN` env var van de QA en DEV deployments? Of moet ik mijn calls via een server-side proxy doen?

**Fallback**: gebruik de `frontend/poc/` server-side proxy (geen CORS-issue mogelijk).

### 3. FE-prod URL voor mystaffler bevestigen

**Wat**: De codebase heeft tegenstrijdige informatie:
- `environment.prod.ts` zegt `baseUrl: 'https://staffler.boemm.eu'`
- `cfn/cloudfront-my-staffler-parameters-prod.json` zegt domain `my.staffler.be`
- Repo README is leeg over deploy-target

**Wie**: dev-ops.

**Vraag**: "Welke is de canonical PROD URL voor mystaffler? `staffler.boemm.eu`, `my.staffler.be`, of beide (DNS-aliases)? En welke wordt op de App Store / Play Store als landing-URL gebruikt?"

**Fallback**: Probeer beide URLs in browser → zien welke 200 retourneert (zie `live-findings.md`).

## Top 5 zachte vragen (kunnen wachten tot dag 2-3)

### 4. Status van Bryntum-dev-license

**Wat**: dps' README heeft een dev-credential voor Bryntum NPM-registry. Geen vervaldatum bekend.

**Wie**: dev-ops of frontend-lead (Hubert / dps repo authors).

**Vraag**: "Is de Bryntum dev-license `JvvlSIC5YoMIY9s9JCV2RcQ3` nog geldig? En wat is de licensure-strategie voor PROD?"

**Fallback**: voor de PoC niet relevant (gebruikt geen Bryntum scheduler). Wel voor toekomstige uitbreiding.

### 5. Welke breaking changes binnen 1 maand op /api/employees, /api/actuals, /api/dictionaries?

**Wat**: BCJ-19425 voegt velden toe aan `GET /api/employees`. BCJ-19435 wijzigt actuals-shape. BCJ-19554 statute dictionary.

**Wie**: BCJ epic owner / Bernardo. (Idem als `../api/monday-checklist.md` punt 5.)

**Vraag**: "We bouwen een FE-PoC die deze maand live moet. Welke breaking changes zijn er gepland in `/api/employees`, `/api/contracts`, `/api/actuals`, `/api/dictionaries` tussen nu en eind mei? Als we velden moeten droppen of nieuwe enum-waarden moeten supporten, doe ik dat liever vooraf."

### 6. Is `wlnob/your-dps` definitief obsolete?

**Wat**: GitHub repo `wlnob/your-dps` is niet gearchiveerd. Last commit feb 2025. Bevat een Express-backend en oudere Angular client. Zie `quirks.md` punt 19.

**Wie**: Lieven / dev-ops.

**Vraag**: "Kan `wlnob/your-dps` gearchiveerd worden? Of zijn er nog actieve consumenten?"

**Fallback**: documenteer dat hij obsolete is, ook als niet gearchiveerd.

### 7. Welke @angular/material gebruik in mystaffler?

**Wat**: `package.json` heeft `@angular/material@^21.0.0` als dependency. Geen import van `@angular/material/*` gevonden in source. Zie `quirks.md` punt 24.

**Wie**: frontend-lead voor mystaffler (Vanessa / Roman).

**Vraag**: "Is `@angular/material` daadwerkelijk in gebruik in mystaffler? Zo nee, kunnen we hem verwijderen om bundle-size te reduceren?"

**Fallback**: laat staan, vermoedelijk geplande feature.

### 8. Force-pwd-reset endpoint path voor MyStaffler (BCJ-19535)

**Wat**: `LoginComponent.onSetNewPassword()` is een lege placeholder. BE endpoint TBD.

**Wie**: BE engineer voor BCJ-19535 (Dmytro).

**Vraag**: "Wat is de exacte path + payload van de force-password-reset endpoint voor MyStaffler? Werkt het analoog aan dps' `POST /publicapi/companies/users/setPassword`?"

**Fallback**: implement client-side validatie + error-handling, leave service stub tot path bevestigd.

## Vragen voor PoC-scope (Lieven)

### 9. Welke business-flow moet de FE-PoC concreet demonstreren?

**Wat**: Drie kandidaten:
- **(A)** Greenfield Angular PoC matching architecture van `dps` (admin-style: lijst + detail van employees, contracten).
- **(B)** Lichtgewicht TS-PoC die `openapi.json` consumeert + 2-3 representative endpoints toont (zoals `../poc/` doet voor backend).
- **(C)** Mobile/PWA PoC analogous aan mystaffler's tab-shell, gebruikt employee-pool login + schedule view.

**Vraag aan Lieven**: "Welke richting wil je dat de FE-PoC opgaat? (A) admin-look matching huidige Staffler, (B) minimale TS-client voor demonstratie, of (C) mobile employee-app?"

**Aanbeveling**: optie (B) als V1 — snelste demonstratie, geen Angular-leercurve. Optie (A) of (C) als follow-up.

### 10. Welke klant ziet deze PoC?

**Wat**: Doel van de PoC bepaalt budget en feature-prioriteit. Demo-only? Real klant ?

**Vraag aan Lieven**.

## Informatie die je zelf al kan ophalen

Geen vraag aan iemand nodig:

- **FE-architectuur**: zie `architecture.md`
- **Routing tree**: zie `routing.md`
- **Components**: zie `components.md`
- **Auth flow client-side**: zie `auth.md` (cross-ref `../api/auth.md`)
- **HTTP interceptors**: zie `api-client.md`
- **Build + deploy**: zie `build-deploy.md`
- **Lokaal draaien**: zie `dev-setup.md`
- **Sprint Q2.3 impact**: zie `breaking-changes-q23.md`
- **Wat NIET kopiëren**: zie `quirks.md`
- **Live PROD-observaties**: zie `live-findings.md`

## PoC werkflow voor maandag

1. `cd staffler/frontend/poc && npm install`
2. `cp .env.example .env`, vul `STAFFLER_USERNAME` + `STAFFLER_PASSWORD` aan met QA test-account
3. `npm run dev` → server op `http://localhost:5174` (ander port dan dps:1445 en mystaffler:1444)
4. Open browser, klik "Login as company user".
5. Verwacht: `currentUser` JSON returned + `companyMemberships` populated.
6. Klik "Get dictionaries" → werkt anonymously (publicapi).
7. Klik "List my company's employees" met companyId van membership → ziet lijst.
8. Als alles werkt: dag 1 done.

Foutmeldingen die je kan krijgen:

- 401 op login → wrong creds. Check `.env`.
- 403 na login → companyId niet van jouw membership.
- CORS-error → dev-origin niet in allowedOrigins; gebruik server-side proxy in PoC.
- 500 op call → vraag traceId aan dev-ops voor logs.
- Network error → QA cold-start, retry na 30 sec.

## Niet zelf doen voor dag 1

- Geen Bryntum scheduler proberen te integreren (paid library, dev-creds in dps repo, niet kopiëren naar PoC).
- Geen LaunchDarkly init (FeatureFlagKey is leeg in dps, niet relevant).
- Geen Capacitor native builds (niet nodig voor browser-PoC).
- Geen contract-creatie tegen echte company (test-bedrijf is OK).

## Top 3 vragen samengevat (stuur deze maandag-ochtend)

1. **Twee test-accounts in QA** (company + employee).
2. **localhost-origins in dev/qa allowedOrigins** of bevestig server-side-proxy is OK.
3. **Canonical PROD-URL voor mystaffler** (`staffler.boemm.eu` vs `my.staffler.be`).
