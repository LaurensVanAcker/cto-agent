# Staffler kennisdatabank

Werkmap voor het uitwerken van een uitbreiding op Staffler: van één-flow planning naar één scherm dat drie planning-werkwijzen geïntegreerd ondersteunt.

## Inhoud

### Visie + mockups (oorspronkelijk werkdoel)
- [huidige-werking.md](huidige-werking.md), wat Staffler vandaag doet (UI-observatie + Confluence + Jira)
- [visie/3-niveaus.md](visie/3-niveaus.md), de drie werkwijzen en hoe ze samenkomen in één scherm
- [visie/domeinmodel-evolutie.md](visie/domeinmodel-evolutie.md), wat we toevoegen aan het model (Locatie, Functie, Shift, Beschikbaarheid)
- [visie/open-vragen.md](visie/open-vragen.md), 26 vragen die we doorhakken voor we bouwen
- [visie/levensloop-blokjes.md](visie/levensloop-blokjes.md) of [.html](visie/levensloop-blokjes.html), states en transities van een planning-blokje (Shift, Beschikbaarheid, Contract)
- [visie/beslissingen.md](visie/beslissingen.md), antwoorden op vragen 1-12 + interpretatie + nieuwe vragen 27-34
- [visie/research-bevindingen.md](visie/research-bevindingen.md), bevindingen na deep-dive Jira + Confluence ronde 2 (flash-patroon WT, MyStaffler-mockups, availabilityScore, twee-pools SPIKE)
- [visie/vereenvoudiging.md](visie/vereenvoudiging.md), waarom mockup 06 te complex was en hoe het simpeler kan
- [visie/vestigingen-functies.md](visie/vestigingen-functies.md), voorstel om Groepen te schrappen en te vervangen door Vestiging + Functie
- [visie/prioritering.md](visie/prioritering.md), checklist van 50+ items om prioriteit op aan te geven (must / nice / later / nooit)
- [mockups/](mockups/), drie alternatieven voor het nieuwe planscherm in HTML
- [screenshots/](screenshots/), UI-foto's die de huidige werking documenteren

### Backend kennisbank ([api/](api/))

37 docs, 7955 regels, 85 endpoints, 111 DTO schemas, 53 error codes. Bron: GitHub `wlnob/dps-service`, `wlnob/dps-external-auth`, `wlnob/user-service`, `wlnob/boemm-core-dto` + Confluence DPS-space + Jira BCJ.

Top-level: [api/README.md](api/README.md). Quick links:
- [api/auth.md](api/auth.md) — login, skey, Cognito, refresh
- [api/environments.md](api/environments.md) — host URLs per env
- [api/openapi/openapi.json](api/openapi/openapi.json) — OpenAPI 3.1 spec
- [api/monday-checklist.md](api/monday-checklist.md) — shopping list voor PoC start
- [api/sources/jira-mystaffler-details.md](api/sources/jira-mystaffler-details.md) — sprint Q2.3 BE-impact

### Backend PoC ([poc/](poc/))

Werkbaar TypeScript skeleton: Fastify proxy + minimale UI. Server-side proxy om CORS te omzeilen. `cd poc && npm install && npm run dev` → `http://localhost:5173`.

### Frontend kennisbank ([frontend/](frontend/))

Mirror van de backend kennisbank, maar dan voor de Angular FE-stack. Bron: GitHub `wlnob/dps` (Angular 19 admin SPA) + `wlnob/my-staffler` (Angular 21 + Ionic 8 + Capacitor employee app).

Top-level: [frontend/README.md](frontend/README.md). Quick links:
- [frontend/repos.md](frontend/repos.md) — elke FE-repo, rol, build, deploy
- [frontend/architecture.md](frontend/architecture.md) — versies, modules, signals
- [frontend/auth.md](frontend/auth.md) — Cognito + skey op de FE-kant (cross-ref met api/auth.md)
- [frontend/api-client.md](frontend/api-client.md) — interceptors, errors
- [frontend/components.md](frontend/components.md), [frontend/forms.md](frontend/forms.md), [frontend/routing.md](frontend/routing.md), [frontend/state.md](frontend/state.md), [frontend/styling.md](frontend/styling.md), [frontend/i18n.md](frontend/i18n.md)
- [frontend/dev-setup.md](frontend/dev-setup.md), [frontend/build-deploy.md](frontend/build-deploy.md)
- [frontend/quirks.md](frontend/quirks.md) — 25 non-obvious gotchas
- [frontend/breaking-changes-q23.md](frontend/breaking-changes-q23.md) — sprint Q2.3 FE-impact (cross-ref met api/sources/jira-mystaffler-details.md)
- [frontend/monday-checklist.md](frontend/monday-checklist.md) — shopping list voor FE-PoC start
- [frontend/live-findings.md](frontend/live-findings.md) — observaties op deployed FE

### Frontend PoC ([frontend/poc/](frontend/poc/))

Vanilla TS + Vite + dev-proxy. Demonstreert login + currentuser + dictionaries. `cd frontend/poc && npm install && npm run dev` → `http://localhost:5174`.

## Status

Visie en mockups zijn een eerste passage. Open vragen staan klaar voor je. Zodra de hoofdrichting gekozen is volgen detailschermen (shift-aanmaak modal, mobile, conflict-handling).

## Volgende stappen

1. Open vragen overlopen, antwoorden verwerken in domeinmodel
2. Eén mockup-richting kiezen of een mengvorm definiëren
3. MVP-scope vasttimmeren
4. Detail-flows uitwerken (shift-aanmaak, kandidaat-selectie, conflict)

## Sessie-context voor volgende chat

Lees `CONTEXT-VOOR-NIEUWE-CHAT.md` als je terugkomt op dit project. Daar staat de hele draad samengevat: beslissingen, stijl-tokens, domeinmodel, randvoorwaarden, en wat de volgende stappen zijn.

`FEEDBACK-HISTORIEK.md` bevat de chronologische log van wat de Laurens corrigeerde of bevestigde, om herhaling te vermijden.
