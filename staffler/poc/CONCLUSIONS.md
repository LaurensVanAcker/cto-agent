# Staffler PoC, conclusies en handoff

Geschreven 11 mei 2026 aan het einde van de research- en setup-fase. Vanaf hier neemt een nieuwe Claude-thread over om de PoC echt te bouwen tegen QA. Dit document is dat punt van overdracht.

## Belangrijk: PLAN.md is de scope-bron

Naast dit document leeft er `PLAN.md` in dezelfde folder. Dat is de gedetailleerde scope-keuze voor de 3-niveaus PoC met mockup-mapping en PoC-DB tabellen. Geschreven door Laurens met feedback-rondes. Wanneer dit handoff-document en PLAN.md ergens uit elkaar lopen wint PLAN.md voor wat te bouwen. Dit document is voor de stand van zaken en de stack-keuze.

Lees PLAN.md eerst als je nog niet weet wat de PoC concreet moet demonstreren.

## Wat is dit project

Een externe PoC bovenop de Staffler/DPS backend, geïnspireerd op een echte klant ("WT-proxy") die hetzelfde deed bovenop WorkToday. De klant bouwt een eigen frontend, gebruikt zijn eigen storage voor "beschikbaarheden", en sync'ed contracts via de officiële API. Doel van deze PoC: aan klanten kunnen laten zien dat dit patroon werkt voor Staffler, met als bonus dat we het zelf gebouwd hebben dus we weten waar de pijnpunten zitten.

Niet een productioneel product. Niet een vervanging van Staffler. Wel een demonstratie en een leerinstrument.

## Stack-beslissingen

Drie keuzes waren in de mix. Wat we besloten:

1. Fastify (backend) + Angular 18 (frontend). Dit is wat nu werkend staat in `staffler/poc/`. Reden: Laurens wil eind van vandaag iets draaiend, en Fastify is een proven dom proxy. Angular omdat 80% van bestaande dps frontend reusable is.

2. Op termijn migreren naar Nx + NestJS + Angular (de A2N stack). Niet vandaag. Wanneer de PoC een product wordt. Detail in `../stack-decision.md`.

3. Remix 3 beta is onderzocht en afgewezen. Te beta, ander component-model dat AI agents nog niet beheersen, geen Tailwind, Node 24.3+. Research-folder is gewist.

## Wat is opgeleverd in deze fase

Tijdens deze threads is opgebouwd:

API kennisbank in `staffler/api/`:
- 37 markdown files (~7900 lijnen) over auth, environments, endpoints, conventions, errors, alle 16 domeinen
- OpenAPI 3.1 spec met 85 operations en 114 schemas (111 echt ingevuld, 3 stub)
- 53 error codes geparsed uit Spring messages.properties
- 21 PROD-tested response samples in `sources/live-probes/`
- 6 bron-files met ruwe data uit GitHub, Confluence, Jira, CFN templates
- Monday checklist met concrete vragen voor dev-ops
- Known-gaps document met 22 open issues, deels al opgelost tijdens deze sessie

Werkende skeleton in `staffler/poc/`:
- Fastify backend in TypeScript, compileert strict mode, cookie-based session, server-side proxy met skey injectie, CORS voor ng serve, optional static dist serving
- Angular 18 frontend met 16 TS files, 6 HTML templates, signals, lazy-loaded routes, AuthGuard + AuthInterceptor, login + dashboard + employees + contracts pages
- TypeScript strict in beide kanten, beide compileren zonder warnings
- TODAY-CHECKLIST.md met copy-paste commando's voor opstart
- ARCHITECTURE.md met diagram en uitleg
- Drie AGENTS.md files (poc/, frontend/, parent staffler/) voor nieuwe thread oriëntatie

Stack-decision document in `staffler/stack-decision.md` met onderbouwing waarom Fastify nu en A2N later.

## Status klaar voor bouw

Backend: compileert, draait met `npm run dev`. Dependencies geïnstalleerd via `npm install`. Endpoints werken in principe maar nog niet getest tegen QA in deze sessie omdat we geen credentials hadden.

Frontend: Angular CLI structuur compleet. `ng serve` zou direct moeten werken na `npm install`. UI's voor login, dashboard, employees, contracts staan klaar maar nog niet visueel geverifieerd in browser.

Laurens heeft QA credentials. Vanaf nu kan een nieuwe thread:
1. `cd poc && npm install`
2. `cd poc/frontend && npm install`
3. `.env` vullen
4. Twee terminals starten
5. Browser openen op `http://localhost:4200`
6. Login testen

## Wat als eerste moet werken (must-have voor demo)

Vier flows, oplopend in complexiteit:

1. Login met username + password. Bij succes redirect naar dashboard. Bij falen duidelijke error.
2. Dashboard toont user info (naam, email, userId) en lijst company memberships uit `/api/me`.
3. Employees page toont employees voor het actieve bedrijf, paginated, doorklikbaar.
4. Contracts page toont contracten in de huidige week, met date picker voor andere weken.

Als deze 4 werken: PoC is "demo-ready" voor een eerste klant-conversatie.

## Wat als tweede moet werken (nice-to-have, dag 2-3)

5. Beschikbaarheden invoeren. Eigen storage (JSON file in `poc/data/availability.json` of Vercel KV). Week-grid met employees per rij, dagen per kolom. Klik op cel toggelt beschikbaarheid.
6. Contract create vanuit beschikbaarheid. "Maak contract" knop op een cel, modal opent met ContractWebDto velden, POST naar `/api/contracts`.
7. Multi-company switcher op het dashboard. Voor users met meer dan één membership.
8. Logout cleaning up session in Staffler (al gedeeltelijk geïmplementeerd, testen).

## Wat NIET in de PoC scope hoort

- itsme integratie. Staffler doet itsme zelf via hun gateway.
- Federated SSO via BoemmAD. Alleen voor BOEMM-medewerkers nodig, niet voor PoC-klanten.
- Indexation flows. Deze API is intern only.
- Cron triggers. Deze API is intern only.
- E-signing of documents flow.
- Mobile app. Web only.
- i18n. Belgisch Nederlands hardcoded volstaat.
- Multi-tenancy aan onze kant. Eén PoC per klant of demo per klant.
- Productie observability (Rollbar, GA, Sentry). Niet nodig voor een demo.

## Belangrijke gotchas voor nieuwe thread

CORS. PoC origin (`http://localhost:4200` en straks Vercel URL) moet in `boemm.allowedOrigins` van QA env staan. Default is NIET. Tot dat geregeld is werkt de Fastify proxy om CORS heen. Eens origin toegevoegd kan de browser ook direct met Staffler praten.

Skey expiry. Default 30 dagen Cognito refresh token. DynamoDB skey-tabel `dps-users` houdt de mapping. Geen extra TTL door ons bekend, maar verifieer met dev-ops.

`/paritaircomites` endpoint geeft 500 op PROD per 9 mei 2026. Bug aan Staffler-kant. Niet vertrouwen op dit endpoint, gebruik `/dictionaries?types=paritaircomites` als alternatief of vraag dev-ops.

Time-gates op contracts en actuals. Vanaf maandag 23:59 zijn vorige week's actuals gelocked. Contract dateFrom moet >= now + 29 minuten zijn. EXTRA statuut max 2 opeenvolgende dagen. Volledige lijst in `../api/conventions.md` en `../api/domains/contracts.md`.

Geen `Content-Type` JSON header voor login? Login endpoint accepteert `application/json` body, geen issue.

Cookie sameSite. Bij deploy naar Vercel (waar frontend en backend mogelijk op verschillende subdomains) moet sameSite naar 'none' en secure 'true', anders blokt de browser de cookie. Voor localhost is 'Lax' OK.

## Open vragen voor dev-ops

Volledig overzicht in `../api/monday-checklist.md`. Top 3 nog open:

1. Bevestiging dat skey niet voortijdig wordt uitgewist door TTL. Refresh token lifetime is 30 dagen?
2. PoC origin toevoegen aan `boemm.allowedOrigins` van QA env. PoC URL: localhost:4200 + (later) Vercel preview URL.
3. `/paritaircomites` 500 bug op PROD: bekende issue of moeten we ticketten?

## Reuse uit wlnob/dps

70-85% van dps Angular code is reusable. Concrete tabel in `frontend/AGENTS.md`. Niet hergebruiken zonder aanpassing: auth interceptor (cookie i.p.v. skey header), API base URL, environment files. Wel direct hergebruikbaar: shared components, pipes, directives, design tokens.

Suggestie: kopieer niet alles in één keer. Per feature, copy in shared/components/ wat je nodig hebt voor die feature.

## Vandaag-uur indeling voor de nieuwe thread

Schatting met QA credentials beschikbaar:

| Stap | Tijd | Resultaat |
|---|---|---|
| `npm install` in beide folders | 10 min | Dependencies klaar |
| `.env` vullen, beide terminals starten | 5 min | Servers draaien |
| Login pagina visueel checken | 5 min | UI verschijnt |
| Login flow end-to-end testen | 15 min | Token vloeit door, dashboard verschijnt |
| Dashboard fine-tunen met echte company memberships | 30 min | Data zichtbaar |
| Employees pagina werkend met paging | 30 min | Tabel met echte employees |
| Contracts pagina met week-picker | 1u | Week-view werkt |
| Layout polish, error states, loading states | 1u | Demo-presentabel |
| README update, deploy plan schrijven | 30 min | Documentatie up-to-date |

Totaal: ~4u voor "demo-ready". De rest van de dag is voor de nice-to-have flows.

## Wat ik niet zelf heb getest

Volledige eerlijkheid:

- Login end-to-end vanuit browser tegen QA. Geen credentials gehad in deze sessie.
- Angular `npm install` (dependencies installed kunnen falen op Windows of oudere Node)
- `ng serve` startup
- Cookie cross-origin gedrag op een productie deploy

Wat ik wel heb gevalideerd:

- TypeScript compileert clean (`npx tsc --noEmit`) op zowel backend als frontend
- Live PROD endpoints werken voor publicapi calls
- 53 error codes uit messages.properties zijn echt
- Auth flow logic klopt met dps frontend `auth.api.service.ts` plus `dps-external-auth/lambda/lambda_authorizer.py`
- DTO schemas in OpenAPI matchen het Java bron via `dps-service-dtos.md`

Nieuwe thread: pak de TODAY-CHECKLIST.md, start, en flag wat in praktijk breekt. Aanpassing van de skeleton is verwacht.

## Verwante context

- Volledige API kennisbank: `../api/`
- Stack-redenering: `../stack-decision.md`
- Visie van Staffler 3-niveaus uitbreiding: `../visie/` (los van deze PoC)
- Bestaande Staffler UI ter referentie: `../screenshots/`, of live op `https://qa.dps.boemm.eu/`
- WT-proxy klant code: `~/Documents/Repositories/cto/WT-proxy/` (Node + nodemailer + web-push, niet TypeScript)
