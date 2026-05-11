# Staffler PoC, AGENTS entrypoint

Externe PoC die op de Staffler/DPS backend praat. Doel: kunnen demonstreren aan een klant (zoals de WT-proxy klant deed op WorkToday). Live in mei 2026.

## Build instructions for Claude Code

PLAN.md is de autoriteit voor WAT je bouwt. Lees [PLAN.md](PLAN.md) eerst, dan deze AGENTS.md voor HOE. Wijk niet af van de scope in PLAN.md zonder akkoord van Laurens.

Stack samenvatting (gefixeerd):

- Backend: Fastify + TypeScript strict + ESM + Node 20+ (server-side proxy, in-memory session map)
- Frontend: Angular 18 standalone components, signals voor state, control flow `@if @for @switch`, SCSS per component
- PoC-DB: Supabase Postgres in QA (alternatief SQLite voor pure local-demo), zie PLAN.md "Wat in PoC-DB"
- Talt naar `gw.qa.dps.boemm.eu/v1/dps-api/...` via skey in HttpOnly cookie
- Geen UI-library voor dag 1, geen NGXS, geen Reactive Forms, geen i18n, geen PrimeNG

TodoWrite is verplicht. Volg dit ritme:

- Bij start van elke sessie: lees PLAN.md + CONCLUSIONS.md, daarna meteen TodoWrite met de discrete stappen uit "Bouwvolgorde" (Dag 1 ochtend, Dag 1 namiddag, Dag 2, ...)
- Eén item tegelijk als `in_progress`, voltooi het, commit, markeer `completed`, naar de volgende
- Bij ontdekking van werk midden in een stap: voeg toe aan TodoWrite, niet stilzwijgend opschuiven
- Bij sessie-crash of timeout: nieuwe sessie pakt de eerste niet-completed todo

Commit-cadans: één discrete stap = één commit. Conventional commit message in het Engels (`feat(shifts): add POST /api/shifts`, `fix(auth): clear cookie on logout`). Geen mega-commits.

Stop-en-vraag-momenten:

- Wijking van PLAN.md scope (nieuwe tabel, ander statuut-filter, extra entiteit) → stop, vraag akkoord
- Twijfel over of een entiteit in DPS of in PoC-DB hoort → stop, vraag (de strikte partitie flexi=DPS / vast=PoC-DB is heilig, geen `POST /api/contracts` voor vaste medewerkers, dat triggert Dimona)
- Open knoop uit PLAN.md "Open knopen" blokkeert verder werk → stop, vraag

Verificatie voor "klaar":

- `cd staffler/poc && npm run typecheck` schoon (backend)
- `cd staffler/poc/frontend && npm run build` schoon (frontend)
- Manuele rooktest: login werkt op QA, betreffende route geeft verwachte data
- Voor `POST /api/shifts/:id/select`: extra dubbelcheck dat enkel een flexi-employeeId doorgaat (Dimona-risico)

Niveau-3 partitie (kritiek, niet vergeten):

- Flexibele medewerkers: 100% in DPS, ophalen via `GET /api/employees`
- Vaste medewerkers: 100% in PoC-DB, eigen `permanent_employees` + `permanent_assignments` tabellen, geen DPS-Contract aanmaken (anders Dimona)

## Lees-volgorde voor een nieuwe thread

1. `PLAN.md` voor de gedetailleerde 3-niveaus PoC-scope met mockup-mapping (autoriteit voor wat je bouwt)
2. `CONCLUSIONS.md` (hier in deze folder) voor de huidige stand en handoff-context
3. `TODAY-CHECKLIST.md` voor concrete run commando's
4. `frontend/ARCHITECTURE.md` voor het diagram en mentaal model van de skeleton
5. `../api/auth.md` voor de Staffler login flow (skey, Cognito)
6. `../api/poc-recipe.md` voor de canonical recipe van end-to-end calls
7. `frontend/AGENTS.md` voordat je Angular code schrijft
8. `../api/openapi/openapi.json` voor de volledige API surface (85 operations, 114 schemas)

## Stack

Fastify (backend) + Angular 18 (frontend). Beide TypeScript, beide standalone. Backend proxyt naar Staffler gateway en houdt skey in een server-side session map. Frontend praat enkel met onze backend via `/api/...`.

Voor wie de stack-beslissing wil begrijpen, zie `../stack-decision.md`. De korte versie: Fastify is wat we vandaag werkend hebben. Nx + NestJS + Angular is de A2N stack die we later overwegen als de PoC een product wordt.

## Folder layout

```
poc/
├── AGENTS.md                  je leest dit
├── CONCLUSIONS.md             handoff naar nieuwe thread, stand van zaken
├── PLAN.md                    autoriteit voor WAT te bouwen (3 niveaus, mockup-mapping)
├── TODAY-CHECKLIST.md         copy-paste run commando's voor opstart
├── README.md                  algemene project README
├── package.json               backend deps (fastify, tsx, @fastify/static)
├── tsconfig.json
├── .env.example               STAFFLER_ENV, STAFFLER_GATEWAY_*, STAFFLER_USERNAME, STAFFLER_PASSWORD
├── public/                    legacy HTML UI, mag weg na Angular setup
├── src/                       Fastify backend
│   ├── server/index.ts        routes, session, CORS, static dist
│   ├── client/staffler-client.ts  typed wrapper rond Staffler API
│   └── types/staffler.ts      hand-written types (subset)
└── frontend/                  Angular 18 app, standalone components
    ├── AGENTS.md
    ├── ARCHITECTURE.md        diagram van browser/Fastify/Staffler
    ├── angular.json
    ├── proxy.conf.json        /api/* naar :5173 in dev
    ├── package.json
    └── src/...
```

## Run commando's

Twee terminals, beide hot-reload:

```bash
# Terminal 1: Fastify backend op port 5173
cd staffler/poc
npm install
cp .env.example .env  # vul STAFFLER_USERNAME + STAFFLER_PASSWORD aan
npm run dev

# Terminal 2: Angular dev server op port 4200
cd staffler/poc/frontend
npm install
npm run start
```

Open `http://localhost:4200`. Login pagina verschijnt.

Voor een prod-like single-server mode:

```bash
cd staffler/poc/frontend
npm run build         # produceert dist/frontend/browser/ in poc-root

cd ..
npm run dev           # Fastify dient nu ook de Angular SPA
```

Open `http://localhost:5173`.

## Endpoints die Fastify exposed

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/login` | `{username, password}` -> sets HttpOnly cookie + returns profile |
| POST | `/api/logout` | clears cookie + calls Staffler logout |
| GET | `/api/me` | returns cached `DpsUserDetailsWebDto` |
| GET | `/api/dictionaries?types=` | proxy naar `/publicapi/dictionaries` |
| GET | `/api/companies/:id` | proxy naar `/api/companies/{id}` |
| GET | `/api/employees?companyId=&page=&size=` | proxy naar `/api/employees` |
| GET | `/api/contracts?companyId=&startDate=&endDate=` | proxy naar `/api/contracts` |
| POST | `/api/contracts` | proxy naar `/api/contracts` create |

Skey wordt nooit aan de browser teruggegeven. Browser krijgt enkel cookie `poc_sid=<id>`. Fastify mapt sid -> skey -> stuurt `x-boemm-skey` header naar Staffler.

## Conventies

Algemeen:
- Belgisch Nederlands (Vlaams) in domain-talk, dialoog met Laurens
- Mixed NL/EN in code comments en in `../api/` kennisbank
- Geen em-dashes (—) in tekst
- Geen bold formatting in markdown
- File names lowercase kebab-case

Naming in code en database (verplicht, zie ook `../AGENTS.md`):
- Code-identifiers, DB tabellen/kolommen, API-paden en query-parameters: enkel Engels
- Geen mix EN/NL binnen één identifier (niet `vast_employees`, wel `permanent_employees`)
- Vertaaltabel: vast → permanent (onbepaalde duur via ander sociaal secretariaat), temporary = elke DPS-employee (BOEMM-payrolled, bepaalde duur, ongeacht statuut), vestiging → branch, loonpakket → wage_package, beschikbaarheid → availability, bedrijf → company, medewerker → employee, functie → function (vermijd als var-naam wegens SQL-keyword)
- "flexi" vermijden in code want dubbelzinnig met `FLEX_LABOUR`-statuut; in prose mag het wel
- Voor bestaande DPS-entiteiten volg DPS-namen 1-op-1 (Engagement, ShiftTemplate, Actual, ...)

Backend (Fastify):
- TypeScript strict mode, ESM modules
- Top-level async (Node 20+)
- Fastify route handlers retourneren direct het object, geen `reply.send()` chains
- Errors via `asResponse(err)` helper voor consistente shape
- Session state in een in-memory `Map`. Voor productie pas later vervangen door Upstash Redis of Vercel KV.

Frontend (Angular 18):
- Standalone components, geen NgModules
- Signal-based state (`signal<T>()`, `computed()`, `inject()`), geen RxJS state
- HttpClient met `firstValueFrom()` voor Promise-based code
- Control flow `@if @for @switch`, geen `*ngIf` / `*ngFor`
- SCSS per component, design tokens in `src/styles.scss`
- Geen UI library voor dag 1 (later eventueel PrimeNG zoals dps repo)

## Reuse uit wlnob/dps

70-85% van de dps frontend code is herbruikbaar in `frontend/src/app/`. Wat past 1-op-1:
- `shared/components/`, `shared/pipes/`, `shared/directives/`
- `core/api/*.service.ts` patroon (URL base vervangen)
- Routing guards (auth interceptor herschrijven, rest hergebruikbaar)
- Design tokens, theme, environment patroon

Wat NIET past:
- Hun auth interceptor stuurt `x-boemm-skey`. Onze versie gebruikt cookie + withCredentials.
- API base URL is anders.
- NGXS state management: voor PoC overdreven, gebruik Angular signals.

Zie ook `frontend/AGENTS.md` voor de gedetailleerde reuse-tabel.

## Veelvoorkomende fouten

| Symptoom | Oorzaak / fix |
|---|---|
| `EADDRINUSE :::5173` | Andere proces gebruikt de port. Kill of zet `PORT=5174` in .env. |
| CORS error in browser console | Origin staat niet in `allowedDevOrigins`. Default is `http://localhost:4200`, override met env var `DEV_ORIGINS`. |
| Cookie wordt niet meegestuurd | HttpClient call mist `withCredentials: true`. Onze AuthInterceptor zet die voor `/api/*`, maar dubbelcheck als je een externe call doet. |
| `401 Unauthorized` ondanks ingelogd | Skey is expired of DynamoDB session wist row. Login opnieuw. |
| `Verkeerde username of password` | Credentials kloppen niet, of Staffler QA pool kent dit account niet. |
| `Geen connectie met server` | Fastify draait niet. Check terminal 1. |
| Angular build error `Cannot find module '@env/...'` | tsconfig paths. Herstart `ng serve` na tsconfig changes. |

## Test credentials

Laurens heeft een QA test-account. Credentials staan in `staffler/poc/.env` (niet in git, .gitignore'd). Vraag aan Laurens als je een vers account nodig hebt. Vraag NIET aan dev-ops zonder Laurens eerst te checken, hij heeft dat al gevraagd.

## Verwante context

- API kennisbank in `../api/` is de single source of truth voor Staffler API gedrag
- Stack rationale in `../stack-decision.md`
- Visie van het bestaande Staffler product in `../visie/`
- Mockups van planscherm in `../mockups/` (HTML, geen Angular)

## Voor de nieuwe thread

Dit project is in een handoff-staat. Vorige thread heeft:
- Backend skeleton ready en compilerend
- Frontend skeleton ready (Angular CLI compatible structuur)
- Auth flow uitgespeld in `../api/auth.md`
- 53 error codes gedocumenteerd in `../api/sources/error-codes.md`
- 21 PROD-tested response samples in `../api/sources/live-probes/`

Nieuwe thread starts met `npm install` in beide folders, dan login testen met QA credentials, dan iteratief features bouwen volgens `TODAY-CHECKLIST.md` stappen 6-9.
