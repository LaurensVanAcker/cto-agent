# PoC plan — Niveau 1 + 2 + 3 op bestaande Staffler-backend

Versie 11/05/2026, na ronde feedback. Bouwt verder op het skelet in deze map (Fastify proxy + minimale UI). Doel: een standalone PoC die de mockup-flow uit `/staffler/mockups/` demonstreert, met 80 tot 85% via proxy naar de bestaande dps-service in QA en de strikt minimale gaps in een eigen store.

Bron-discovery: alle endpoint-info en domain-uitleg staat in `/staffler/api/`. Deze PoC-plan is de scope-keuze bovenop die kennisbank.

## Doel

Twee end-user rollen worden gedemonstreerd, alles in één web-portaal:

- Company user (klant), planscherm-mockups `v5-10-names.html`, `v5-11-vsl.html`, `v5-13-dag.html` en dialogs `09-dialog-volledig.html` + `12-batch-dialog.html`
- Temporary medewerker (uitzendkracht in de breedste zin: alle BOEMM-payrolled tijdelijke contracten ongeacht statuut), bekijken via een smalle mobile-stijl strook ingebed in hetzelfde portaal (geen aparte app gebouwd), gebaseerd op `mockups/mobile-mystaffler-v2.html` en `mockups/15-pool-mystaffler.html`

Geen aparte app, geen WhatsApp, geen mail. Alle communicatie tussen klant en uitzendkracht gebeurt binnen het portaal. De smalle strook simuleert wat de uitzendkracht straks op zijn telefoon ziet in MyStaffler.

Interne BOEMM-rollen (SUPER_ADMIN, payroll, sales, recruiter) zijn out of scope.

Belangrijke randvoorwaarde — strikte partitie tussen temporary (BOEMM) en permanent (extern):

- Temporary medewerkers leven 100% in DPS. Het zijn personen die via BOEMM tewerkgesteld worden onder een contract van bepaalde duur (dag, meerdaag of week). Hun statuut in DPS kan om het even wat zijn (`WHITE_COLLAR`, `LABOUR`, `FLEX_LABOUR`, `STUDENT`, `EXTRA`, ...), dat label slaat op de aard van het tijdelijke contract, niet op een onderscheid temporary versus permanent. De PoC haalt ze op via `GET /api/employees?companyId=`. Identiteit, profiel, loonpakketten en onboarding lopen via de bestaande productie-app.
- Permanent medewerkers leven 100% in PoC-DB. Dit zijn personen met een contract van onbepaalde duur dat via een ander sociaal secretariaat verloopt. BOEMM weet niets over hun statuut, loon of arbeidsovereenkomst en wil dat ook niet weten. De PoC slaat alleen op wat nodig is om hen visueel op het planscherm te tonen: naam plus optionele functie-label. De PoC creëert nooit Contracten in DPS voor hen want elke `POST /api/contracts` triggert Dimona-aangifte via BOEMM, en dat is niet onze verantwoordelijkheid voor deze mensen.

Gevolg: geen statuut-filter nodig in de kandidaten-selector. Elke medewerker die uit `GET /api/employees` komt is per definitie temporary (BOEMM-payrolled), ongeacht zijn statuut-veld. Permanent medewerkers verschijnen alleen via `permanent_assignments` op service-group rijen.

Terminologie in code en prose: we gebruiken consistent `temporary` versus `permanent` als axis. "Flexi" is een Belgisch-Nederlandse term die in DPS-naam-context te dubbelzinnig is (FLEX_LABOUR statuut = één van vele temporary-statuten), dus die vermijden we in identifiers. In gesprekken met klanten of intern mag "vaste medewerker" wel.

## Architectuur in één lijn

Browser → Fastify proxy (deze repo, in-memory session map) → `gw.qa.dps.boemm.eu/v1/dps-api/...`

Zes kleine tabellen in een eigen store voor de gaps die DPS niet biedt. Beslist: Heroku Postgres (vanilla Postgres op Basic-tier 9 dollar per maand, 10M rijen). Migratie weg van Heroku later naar bv. Supabase of RDS blijft triviaal omdat het gewoon Postgres is.

## Stack-beslissingen

Vastgelegd 11/05/2026 in chat:

- Backend: Fastify standalone (optie 1 uit `../stack-decision.md`). Node 20+, TypeScript strict, ESM, in-memory session map voor skey.
- Frontend: hetzelfde als wat al in de GitHub-repo `staffler-availabilities-poc` staat. Op het moment van schrijven is die repo leeg, dus we bekijken het bij de start in de IDE.
- Database: Heroku Postgres, Basic-tier. Vanilla Postgres-driver in Fastify (concrete client te kiezen bij de start: `pg` puur of Drizzle ORM).
- Hosting: Vercel als eerste deploy-target voor beide apps, later eventueel naar BOEMM-infra.
- Repo: `staffler-availabilities-poc` onder het BOEMM GitHub-account (toegang voor de `laurens-boemm` collaborator-rol nog te regelen).

## Scope-keuze

In v0:

- Login en sessie voor company user en uitzendkracht
- Planning-grid lezen en blokjes klikken
- Niveau 1 contract aanmaken (dialog 09)
- Niveau 2 shifts aanmaken, broadcasten naar pool of selectie, kandideren en kiezen
- Niveau 3 beschikbaarheid invoeren in MyStaffler en tonen in de beschikbaarheidsstrip company-side
- Pool-overzicht en MyStaffler-invite (BCJ-19425 mockup)

Buiten v0 (bewust geschrapt):

- WhatsApp en e-mail. Alle communicatie binnen het portaal, geen externe channels. Geen BroadcastDelivery-tabel.
- Aparte mobile-app. Uitzendkracht-zicht is een smalle web-strook in hetzelfde portaal, mobile-stijl.
- LastUsedWagePackage cache. Pak laatst gebruikt loonpakket on-the-fly uit `GET /api/contracts?employeeIds=...`.
- Vestiging-naam als eigen tabel. We hergebruiken Engagement Groups in DPS als vestiging-naam (`Gent`, `Antwerpen`, ...).
- itsme, imports (`/import` multipart), actuals/prestatie-bevestiging, indexations, admin-invite, multi-company switcher.

Bewust IN scope, ook al kost het een PoC-tabel:

- Service Group (niveau onder vestiging, bv. `Toog Gent`, `Bar Gent`). Bestaat niet in DPS, moeten we zelf bewaren.
- PermanentAssignment (vaste-medewerker-blok met `Vast`-badge). Bestaat niet in DPS en MOET in eigen DB blijven, want we mogen geen Dimona-genererende Contracten aanmaken voor vaste medewerkers vanuit deze PoC.
- PermanentEmployee (identiteit van vaste medewerker). Leeft alleen in PoC-DB.

## Mockup-feature → bestaande API

Login en sessie (proxy doet dit al)

- Company user login: `POST /publicapi/companies/users/login`
- Uitzendkracht login: `POST /publicapi/employees/users/login`
- `getCurrentUser` via `/api/users/currentuser` (zit al in de client)

Planning-grid lezen (v5-10, v5-11, v5-13)

- Contracten voor de zichtbare week: `GET /api/contracts?companyId=&startDate=&endDate=&employeeIds=&statuses=&page=&size=`
- Detail bij klik op blok: `GET /api/contracts/{id}`
- Notification badge in topbar: `GET /api/contracts/notificationCount?companyId=`

Pool, medewerkers, loonpakketten (dialog 09 namen-dropdown, beschikbaarheidsstrip, mockup 15)

- Pool-lijst: `GET /api/employees?companyId=&nameLike=&groupIds=&page=&size=`
- Detailprofiel: `GET /api/employees/{id}`
- Loonpakketten: `GET /api/employeewages?companyId=&employeeId=`
- MyStaffler-invite van pool-rij: `POST /api/companies/{companyId}/employees/{employeeId}/mystaffler/invite`

Branch als rij-niveau-1 (rij-as in v5-11)

- Vestiging = `EngagementGroup` in DPS. Naam komt uit `GET /api/companies/{companyId}/groups`. Geen PoC-storage.
- Groups CRUD: `POST/GET/PUT/DELETE /api/companies/{companyId}/groups[/...]`
- Employee aan groups koppelen: `POST /api/companies/{companyId}/employees/{employeeId}/groups`
- Filter pool op groups: query-param `groupIds=` op `GET /api/employees`

Service Group als rij-niveau-2 (subrij van vestiging in v5-11)

- Niet in DPS aanwezig. Komt uit PoC-tabel `service_groups`. Een service group hoort altijd bij één vestiging (EngagementGroup-UUID als ref).

Niveau 1 contract aanmaken voor een temporary medewerker (dialog 09, slot direct toegewezen)

- `POST /api/contracts` met `ContractWebDto`. Voor capaciteit > 1: één call per slot of `POST /api/contracts/batch`.
- Triggert Dimona-aangifte via BOEMM. Doe dit nooit voor een permanent medewerker (die zit ook niet in DPS, dus by-construction onmogelijk).
- Validatie en error-shape staat in `../api/errors.md`. Belangrijkste valstrik: tijden in `HH:mm`, dateFrom minstens 29 minuten in de toekomst, `wageHour` in `[8.50, 100.00]`.

Niveau 2 kandidaat selecteren wordt finale contract (alleen temporary, by definitie)

- Bij `Kies`-klik op kandidaat: `POST /api/contracts` met die kandidaat als `employeeId`, plus loonpakket-velden uit `GET /api/employeewages`. Daarna in PoC-DB de `shift_application.status` op `selected` en `shift_application.contract_id` zetten.
- Geen statuut-filter nodig: kandidaten komen uit `GET /api/employees`, dus zijn allemaal BOEMM-tijdelijken ongeacht statuut.

Permanent medewerker tonen op grid (Vast-badge in v5-11, geen DPS-write)

- Wordt geladen uit PoC-tabellen `permanent_employees` + `permanent_assignments`. Rendert als teal blok met `Vast`-badge in de service-group rij. Geen `POST /api/contracts`, geen Dimona, want hun arbeidsovereenkomst loopt via een ander sociaal secretariaat.
- Permanent medewerker aanmaken: eigen mini-form in de admin-UI met enkel voornaam en achternaam. Geen functie, geen onboarding-stepper, geen itsme, geen documenten, geen loongegevens. De UI toont in het grid-blok `Vast` als statuut-label.
- Onboarding van nieuwe temporary medewerker blijft via productie-app: PoC heeft een link "Nieuwe medewerker onboarden in Staffler" die opent in nieuw tabblad naar de bestaande app.

Uitzendkracht-app

- Eigen contracten cross-bedrijf: `GET /api/my-staffler/employees/{id}/contracts?startDate=&endDate=`
- Login: `POST /publicapi/employees/users/login`

Dictionaries en metadata (statuten, PC, talen, taxLevels)

- `GET /publicapi/dictionaries?types=...`, `GET /publicapi/statutes?pcCode=`, `GET /publicapi/paritaircomites`, `GET /publicapi/taxLevels`, `GET /publicapi/languages`
- Travel allowance suggestie: `GET /api/travelallowance/calculate?origin=&destination=&transportCode=`

Bedrijfsinfo voor coefficients en address

- `GET /api/companies/{companyId}` returns `CompanyWebDto` met paritair comité-mix, coefficients, employmentAddress

## Domeinregel: functie zit alleen op loonpakket-niveau

Belangrijke modelleerregel die we van DPS overnemen en consistent doorzetten:

- Een Employee heeft geen functie-veld
- Een PermanentEmployee heeft geen functie-veld
- Een Shift heeft geen functie-veld
- Een Loonpakket (`EmployeeWage` in DPS) heeft wel een functie. Dat is de enige plek waar functie leeft
- Een Contract erft de functie via het Loonpakket dat eraan hangt

Gevolg voor de UI: nergens functie tonen naast een medewerkersnaam in een lijst. Functie verschijnt alleen als die gekoppeld is aan een loonpakket of contract. Voor permanent medewerkers tonen we `Vast` als statuut-label op het grid-blok, geen functie.

Gevolg voor het loonpakket-keuze-moment: bij Niveau 1 directe toewijzing en bij Niveau 2 kandidaat-selectie kiest de klant het concrete loonpakket uit de loonpakketten die deze temporary medewerker heeft bij deze company (`GET /api/employeewages?companyId=&employeeId=`). Default = `isPrimary = true` of laatst gebruikt, override via dropdown.

## Naming-conventies

Geldt voor de hele PoC en wordt bewaakt:

- Code-identifiers (variabelen, functies, types, klassen, modules): enkel Engels
- Database (tabelnamen, kolomnamen, enum-values): enkel Engels
- API-paden en query-parameters: enkel Engels
- Geen mix Engels/Nederlands binnen één identifier (geen `vast_employees`, gebruik `permanent_employees`; geen `vestiging_group_id`, gebruik `branch_group_id`)
- Markdown/prose mag Belgisch Nederlands blijven, dat is de werktaal
- Concept-namen in prose mogen wel de Engelse identifier-vorm gebruiken (vb. "PermanentAssignment") wanneer dat verduidelijking schept

Vertaaltabel die we hanteren:

- vast → permanent (employee, assignment) = mensen met contract van onbepaalde duur via een ander sociaal secretariaat
- temporary = elke medewerker in DPS, BOEMM-payrolled, contract van bepaalde duur (dag, meerdaag, week), ongeacht statuut-label
- "flexi" vermijden in code-identifiers want te dubbelzinnig (`FLEX_LABOUR` is één statuut van vele, niet synoniem voor temporary). In prose met klanten of intern mag het wel
- vestiging → branch
- functie → function (vermijd als var-naam wegens SQL-keyword; `function_label` is OK als kolomnaam)
- loonpakket → wage_package
- beschikbaarheid → availability
- bedrijf → company (matcht DPS)
- medewerker → employee (matcht DPS)

## Wat in PoC-DB

Zes tabellen, additief, geen overlap met DPS. Soft-referenties (UUID-velden zonder FK) naar DPS-entities zijn bewust: DPS is een aparte database, we doen geen cross-DB constraints.

```
service_groups
  id                   uuid pk
  company_id           uuid          -- externe ref naar Staffler
  branch_group_id   uuid          -- externe ref naar EngagementGroup (rij-niveau-1 = vestiging)
  name                 text          -- vb "Toog Gent", "Bar Sluizeken"
  address_line1        text          -- adres van de service-plek
  address_line2        text
  postal_code          text
  city                 text
  deleted_at           timestamptz   -- soft-delete (mockup 14)
  created_at           timestamptz default now()
  updated_at           timestamptz default now()

  index (company_id, deleted_at)
  index (branch_group_id)

permanent_employees                  -- vaste medewerker, leeft niet in DPS
  id                   uuid pk
  company_id           uuid          -- externe ref naar Staffler company
  first_name           text
  last_name            text
  deleted_at           timestamptz
  created_at           timestamptz default now()
  updated_at           timestamptz default now()

  index (company_id, deleted_at)

permanent_assignments                    -- vaste medewerker per service group, geen DPS-Contract!
  id                   uuid pk
  service_group_id     uuid fk service_groups(id)
  permanent_employee_id     uuid fk permanent_employees(id)
  weekday_pattern      jsonb         -- {"MON":{"from":"09:00","to":"17:00","pauseFrom":"12:00","pauseTo":"12:30"}, ...}
  valid_from           date
  valid_to             date          -- nullable voor open-eind
  note                 text
  created_at           timestamptz default now()
  updated_at           timestamptz default now()

  index (service_group_id, valid_from)
  index (permanent_employee_id, valid_from)

shifts                               -- open vraag voor temporary invulling
  id                   uuid pk
  company_id           uuid
  service_group_id     uuid fk service_groups(id)    -- rij in de grid; functie wordt impliciet afgeleid uit de service group + het loonpakket dat bij selectie gekozen wordt
  date_from            date
  date_to              date          -- gelijk aan date_from voor single-day
  from_time            time
  to_time              time
  pause_from           time
  pause_to             time
  capacity             int default 1
  deadline             timestamptz
  target_type          text          -- ALL_POOL | SELECTION | GROUP | NONE
  target_employee_ids  uuid[]        -- bij SELECTION
  target_group_ids     uuid[]        -- bij GROUP
  status               text          -- draft | open | closed | fulfilled | cancelled
  published_at         timestamptz   -- wanneer zichtbaar geworden voor de target
  created_by_user_id   uuid
  created_at           timestamptz default now()
  updated_at           timestamptz default now()

  index (company_id, date_from)
  index (service_group_id, date_from)
  index (status, deadline)

shift_applications
  id                   uuid pk
  shift_id             uuid fk shifts(id)
  employee_id          uuid          -- externe ref naar DPS Employee (temporary, BOEMM-payrolled)
  status               text          -- candidate | selected | rejected | withdrawn
  applied_at           timestamptz default now()
  decided_at           timestamptz
  contract_id          uuid          -- externe ref naar Staffler Contract na selectie
  note                 text

  index (shift_id, status)
  index (employee_id, status)
  unique (shift_id, employee_id) where status in (candidate, selected)

availabilities
  id                   uuid pk
  employee_id          uuid          -- externe ref naar DPS Employee (temporary, BOEMM-payrolled)
  date                 date
  from_time            time
  to_time              time
  status               text          -- open | locked | withdrawn | expired
  locked_by_contract_id uuid
  created_at           timestamptz default now()
  updated_at           timestamptz default now()

  index (employee_id, date)
  index (date, status)
```

Geen pool-membership, geen loonpakketten, geen finale contracten (de echte zitten in DPS), geen dictionaries, geen bedrijfsdata, geen vestiging-naam (= EngagementGroup in DPS). Die blijven 100% in DPS.

## Reductie-opties (als we nog magerder willen)

Optie strip-1 (geen Niveau 3 demo):

- Schrap `availabilities`
- Schrap beschikbaarheidsstrip onderaan in v5-10/v5-11
- 5 tabellen, demo focust op vaste-medewerker visualisatie + Niveau 1 + Niveau 2

Optie strip-2 (geen vaste-medewerker-visualisatie):

- Schrap `permanent_employees` + `permanent_assignments`. Risico: de mockup met `Vast`-blokken klopt niet meer met de demo.
- Niet aanbevolen, het is een opvallend stuk van v5-11 dat klanten zullen herkennen.

Optie strip-3 (alleen Niveau 2, geen apart applications-record):

- Embed candidates als jsonb in `shifts.candidates`
- Verlies query "in welke shifts zit medewerker X als kandidaat"
- Spaart 1 tabel, maakt de uitzendkracht-strook moeilijker

Voorkeur: blijf bij 6 tabellen. Geen strip-optie levert genoeg bouwtijd-winst op om de demo-coverage te verliezen.

## Nieuwe proxy-routes toe te voegen aan `src/server/index.ts`

Bovenop wat al in de Fastify-server zit:

Service Groups (PoC-DB):

- `POST /api/service-groups` (bij + in mockup 14)
- `GET /api/service-groups?companyId=` (rij-niveau-2 in planscherm)
- `PUT /api/service-groups/:id`, `DELETE /api/service-groups/:id` (soft-delete)

Vaste medewerkers + assignments (PoC-DB):

- `POST /api/permanent-employees` `{ companyId, firstName, lastName }`
- `GET /api/permanent-employees?companyId=`
- `PUT /api/permanent-employees/:id`, `DELETE /api/permanent-employees/:id` (soft-delete)
- `POST /api/permanent-assignments` (vaste medewerker pinnen op service group, weekday-pattern)
- `GET /api/permanent-assignments?companyId=&serviceGroupId=&dateFrom=&dateTo=`
- `PUT /api/permanent-assignments/:id`, `DELETE /api/permanent-assignments/:id`

Shifts (PoC-DB):

- `POST /api/shifts` (create draft, klant in dialog 09)
- `PUT /api/shifts/:id` (publish, deadline aanpassen, cancellen)
- `GET /api/shifts?companyId=&dateFrom=&dateTo=` (planscherm)
- `POST /api/shifts/:id/publish` (zet status open + published_at; geen externe push, alleen UI-zichtbaarheid in de strook)
- `POST /api/shifts/:id/select` `{ applicationId, wageId }` → creëert Contract in DPS via `POST /api/contracts` (Dimona!), update application + shift

Applications (uitzendkracht-strook):

- `POST /api/shifts/:id/apply` (uitzendkracht klikt "Kandideren")
- `DELETE /api/shifts/:id/apply` (intrekken)
- `GET /api/my-shifts?employeeId=` (alle shifts waar ik kandidaat ben + status)

Availabilities:

- `POST /api/availabilities`
- `GET /api/availabilities?employeeId=&from=&to=`
- `GET /api/availabilities?companyId=&from=&to=` (klant-zijde, joint over pool)
- `PATCH /api/availabilities/:id` (status withdrawn)

Loonpakketten read (proxy-laagje):

- `GET /api/employeewages?companyId=&employeeId=`

Cross-bedrijf my-staffler contracts:

- `GET /api/my-staffler/employees/:id/contracts?startDate=&endDate=`

Pool-overzicht extra:

- `POST /api/employees/:id/mystaffler-invite?companyId=` (proxy van `POST /api/companies/{cid}/employees/{eid}/mystaffler/invite`)

## Bouwvolgorde

Dag 1, ochtend:

- Supabase opzetten in QA, 6 tabellen, env-vars in `.env.example`
- Proxy uitbreiden met service-groups + permanent-employees CRUD + employeewages-read

Dag 1, namiddag:

- Pool + planscherm-grid mounten op bestaande `/api/employees` en `/api/contracts` (= temporary medewerkers)
- Vestiging-rijen uit `/api/companies/{id}/groups`, service-group sub-rijen uit PoC-DB

Dag 2:

- Vaste medewerker mini-form + fixed assignments CRUD + render `Vast`-blokken in service-group rijen (geen DPS-write)
- Onboarding-link voor nieuwe temporary medewerker naar de bestaande productie-app (extern tabblad)
- Dialog 09 als Niveau 1 direct contract create voor temporary medewerker via `POST /api/contracts`

Dag 3:

- Shifts CRUD + publish-flow, broadcast-knop publiceert enkel binnen het portaal
- Beschikbaarheidsstrip onderaan, leest uit PoC-DB availabilities, gefilterd op pool

Dag 4:

- Smalle mobile-strook in portaal: login als uitzendkracht, eigen kalender (POST availability), shifts ontvangen, applyen
- Kandidaat-keuze-flow company-side → `POST /api/shifts/:id/select` → maakt Contract in DPS (Dimona!)

Dag 5:

- Polish, error-handling, Vercel-deploy voorbereiden
- Eventueel: vragen om PoC-origin toe te voegen aan `boemm.allowedOrigins` zodat proxy facultatief wordt voor toekomstige iteraties

## Open knopen

Vragen die ik morgen vroeg wil aftikken, ofwel zelf beslissen ofwel met dev-team:

- Welk testaccount + companyId in QA? Iemand met realistische pool, meerdere loonpakketten, bestaande contracten in deze week, en bij voorkeur al wat EngagementGroups die als vestiging dienst doen.
- Voor uitzendkracht-login: bestaat er al een test-employee met een MyStaffler-account in QA, of moeten we eerst eentje aanmaken via `mystaffler/invite`?
- Permanent medewerkers zitten 100% in PoC-DB, temporary 100% in DPS. Onboarding van een nieuwe temporary medewerker gaat via de bestaande productie-app, PoC heeft enkel een doorlink. Akkoord?
- Loonpakket-keuze bij Niveau 2 selectie: in dialog 09 autosuggest toont statuut. Bij selectie het concrete loonpakket = `isPrimary = true` of laatst-gebruikt, klant overschrijft via dropdown. Akkoord?
- Cross-bedrijf zichtbaarheid van beschikbaarheid: v0 single-bedrijf, cross in v1?
- Conflict-detectie (medewerker al gepland elders op die uren): v0 weglaten, in v1 query op `GET /api/contracts?employeeIds=`.
- Supabase vs SQLite vs Vercel KV: voorkeur Supabase. SQLite alleen als PoC pure local-demo blijft.

## Volgende stap

Morgen 11/05 om te beginnen:

- 30min: testaccount + companyId verifiëren in QA (login werkt, employees en contracten gevuld)
- 60min: Supabase project + migrations met de 3 tabellen
- Rest van de dag: shifts-routes en de drie nieuwe dialogs in de UI

Bij twijfel of bug: `/staffler/api/errors.md` voor error-shape, `/staffler/api/poc-recipe.md` voor de basis-flow, `/staffler/api/domains/<x>.md` voor wire-detail per endpoint.
