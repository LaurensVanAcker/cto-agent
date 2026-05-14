# Staffler PoC

PoC bovenop de Staffler / dps-service backend. Server-side proxy in Fastify,
Angular 19 frontend gekloond van `wlnob/dps` en bijgewerkt voor de PoC-scope.

Voor de pilot draaien drie klanten echte planning hierop. Lees `PLAN.md` voor
het volledige product-plan en `CONCLUSIONS.md` voor de architecturele
keuzes.

## Wat is werkend

Sidebar items in het bedrijfsportaal (`/company/:id/...`):

| Item | Pad | Wat |
|---|---|---|
| Pool | `/pool` | BCJ-19425 — medewerkerslijst met MyStaffler-invite-flow, filter chips, last login, actions menu, "Toewijzen aan vestigingen" via assign-groups-dialog (DPS-write). |
| Beheer locaties | `/locations` | Vestigingen (RO uit DPS engagement-groups) · service-locations CRUD (PoC-DB) · vaste medewerkers CRUD (PoC-DB) · vaste toewijzingen pinnen (weekday-pattern dialog). |
| Nieuwe medewerkers | `/invitations` | Niet door PoC aangeraakt — bestaande dps invitations module. |
| Planning | `/planning` | Productie-zicht — bestaande Bryntum scheduler uit dps. |
| Planning (PoC) | `/planning-poc` | Nieuwe Bryntum-scheduler met view-toggle (Namen / V+SL / Dag): laadt contracten (DPS) + open shifts (PoC-DB) + Vast-blokken (permanent_assignments) in één keer. Klik op een lege cel = nieuw contract dialog. Klik op een contract-blok = production ContractDialog (edit/cancel). Klik op een shift = candidate-select dialog (Kies = POST `/api/shifts/:id/select` → DPS createContract met Dimona). |
| MyStaffler preview | `/mystaffler-preview` | Smalle mobile-strip die het MyStaffler-zicht van een uitzendkracht simuleert: planning, open shifts (kandidaat stellen / terugtrekken), beschikbaarheid (one-click toevoegen). |

## Architectuur in één lijn

```
Browser
  └─ Angular 19 (frontend/)
       └─ /api/* (relative URLs)
            └─ proxy.conf.json (dev) of Fastify static-serve (prod)
                 └─ Fastify (src/server) op :5174
                      ├─ DPS-pass-through  → gw.qa.dps.boemm.eu
                      └─ PoC-DB shim       → data/poc-db.json
```

Skey blijft in de Fastify session-Map (cookie `poc_sid`). De browser kent
geen skey en stuurt geen `x-boemm-skey` header. De PoC-DB tabellen (zes
stuks per `PLAN.md`) worden persistent gemaakt naar één JSON-file in
`data/poc-db.json` — survival across `tsx watch` reloads zonder migrations.
Voor v1 wisselen we dit voor Heroku Postgres in.

## Quick start

```bash
# Bryntum scheduler vereist een gateway-login (één keer per machine):
npm config set "@bryntum:registry=https://npm.bryntum.com"
npm login --registry=https://npm.bryntum.com
# Credentials: zie staffler/frontend/dev-setup.md (development..boemm.eu)

# Backend
cd staffler/poc
npm install
PORT=5174 npm run dev

# Frontend (apart terminal-venster)
cd staffler/poc/frontend
npm install
npm start                            # → http://localhost:1445
```

Het backend draait op `:5174` (i.p.v. de oude default `:5173` — zo
botst hij niet met een tweede worktree die ook draait). De frontend
proxy verstuurt alle `/api/*` calls naar `:5174`.

## QA credentials

Zet in `cto/.env` of in `staffler/poc/.env`:

```
STAFFLER_USERNAME=...
STAFFLER_PASSWORD=...
```

Die zijn voor login via de browser. De backend zelf gebruikt ze niet — hij
forwardt wat de browser POST'st naar `/api/login`.

## Backend endpoints

| Route | Forwardt naar | Wat |
|---|---|---|
| `POST /api/login` | `POST /publicapi/companies/users/login` | Login + cookie zetten. |
| `POST /api/logout` | `GET /api/users/logout` | Logout + cookie wissen. |
| `GET  /api/me` | `GET /api/users/currentuser` | Profiel + memberships. |
| `GET  /api/companies/:id` | proxy | |
| `GET  /api/companies/:id/groups` | proxy | Vestigingen. |
| `GET  /api/employees?companyId=&nameLike=` | proxy | Pool. |
| `GET  /api/contracts?companyId=&startDate=&endDate=` | proxy | Contracten week. |
| `POST /api/contracts` | proxy | **Dimona-aanvraag** via DPS. |
| `GET  /api/my-staffler/employees/:id/contracts` | proxy | Cross-bedrijf voor MyStaffler. |
| `GET  /api/dictionaries?types=` | proxy | Statutes, PC, etc. |
| `GET/POST /api/service-groups` | PoC-DB | Service-locations. |
| `PUT/DELETE /api/service-groups/:id` | PoC-DB | |
| `GET/POST /api/permanent-employees` | PoC-DB | Vaste medewerkers. |
| `GET/POST /api/permanent-assignments` | PoC-DB | Vast op service-group. |
| `GET/POST /api/shifts` | PoC-DB | Open shifts. |
| `POST /api/shifts/:id/publish` | PoC-DB | Status → open. |
| `GET  /api/shifts/:id/applications` | PoC-DB | Kandidaten lijst. |
| `POST /api/shifts/:id/apply` | PoC-DB | Kandidaat stellen. |
| `DELETE /api/shifts/:id/apply` | PoC-DB | Terugtrekken. |
| `POST /api/shifts/:id/select` | DPS create + PoC-DB | **Dimona** + applicatie → selected. |
| `GET  /api/my-shifts?employeeId=` | PoC-DB | Open shifts voor MyStaffler-zicht. |
| `GET/POST /api/availabilities` | PoC-DB | Beschikbaarheid Niveau 3. |
| `GET  /api/mystaffler-invites?companyId=` | PoC-DB | Pool-overview status. |
| `POST /api/employees/:id/mystaffler-invite` | DPS + PoC-DB | Uitnodigen. |
| `POST /api/employees/:id/mystaffler-resend-invite` | DPS + PoC-DB | Opnieuw versturen. |
| `POST /api/employees/:id/mystaffler-mark-active` | PoC-DB (demo) | Demo-helper voor de groen-badge. |

## Volgende iteratie

- DPS `/api/contracts` POST stuurt onze `companyHoursPerWeek=40` default; tune
  per-contract via productie `/planning` edit-dialog of via een PoC-extensie.
- Permanent assignment edit / delete (alleen create is wired).
- Reset password actie op de Pool — wired in de UI, backend-route nog niet.
- "Resend invite" link expiry per 7 dagen (nu altijd `invited`).
- Heroku Postgres migratie voor `data/poc-db.json`.

## Mockups als bron van waarheid

```
staffler/mockups/
├── 09-dialog-volledig.html       Niveau 1 directe toewijzing
├── 10-planning-names.html        Names-view (Bryntum)
├── 11-planning-vsl.html          V+SL view (Bryntum tree)
├── 12-batch-dialog.html          Niveau 2 shift create + publish
├── 13-planning-dag.html          Dag view (Bryntum verticaal)
├── 14-locatie-eigenschappen.html Beheer locaties
├── 15-pool-mystaffler.html       Pool (BCJ-19425)
└── mobile-mystaffler-v2.html     Uitzendkracht-strook
```

Bij twijfel: de mockup wint.
