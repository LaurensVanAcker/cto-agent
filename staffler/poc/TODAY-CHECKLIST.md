# Vandaag-checklist

Eind-van-de-dag werkend hebben: login + dashboard + employees + contracten tegen QA test-account.

Ik heb alle skeleton-bestanden klaargezet. Volg de stappen, copy-paste de commando's.

## Voorbereiding (5 min)

Check dat je deze tools hebt:

```bash
node --version           # >= 20
npm --version            # >= 10
```

Vraag aan dev-ops (zie `../api/monday-checklist.md`):

1. Een QA test-account (`STAFFLER_USERNAME` + `STAFFLER_PASSWORD`)
2. CompanyId van het test-bedrijf

Zonder die 2 dingen kun je nog wel UI in elkaar zetten met dummy data, maar geen echte calls.

## Stap 1: Install backend deps (5 min)

```bash
cd ~/Documents/Repositories/cto/staffler/poc
npm install
```

Verwacht: fastify, typescript, tsx als dependencies.

## Stap 2: Install frontend deps (3-5 min)

```bash
cd ~/Documents/Repositories/cto/staffler/poc/frontend
npm install
```

Verwacht: Angular 18 + tooling, ~150 MB node_modules.

## Stap 3: Backend draaien (1 min)

```bash
cd ~/Documents/Repositories/cto/staffler/poc

# Maak .env van .env.example en vul credentials in
cp .env.example .env
# Edit .env met je QA test-account

# Start de backend
npm run dev
```

Verwacht output:
```
Staffler PoC backend listening on http://localhost:5173
Gateway: https://gw.qa.dps.boemm.eu
Env: qa
Frontend: `cd frontend && npm run start` → http://localhost:1445
MyStaffler PWA: `cd mystaffler-poc && npm run dev` → http://localhost:4201
```

Laat dit terminal-venster draaien. De backend doet hot-reload bij elke save.

## Stap 4: Frontend dev server draaien (2 min)

In een TWEEDE terminal:

```bash
cd ~/Documents/Repositories/cto/staffler/poc/frontend
npm run start
```

Verwacht output:
```
** Angular Live Development Server is listening on localhost:1445 **
✔ Compiled successfully.
```

Open `http://localhost:1445` in je browser.

Je ziet de login pagina van de PoC. Skeleton-Angular zonder data.

## Stap 5: Eerste login test (5 min)

Vul je QA test-account credentials in op de login pagina. Klik Login.

Verwacht:
- Login succesvol → redirect naar /dashboard
- Dashboard toont je naam, email, en een lijst company memberships
- Eén membership is geactiveerd ("Ja" in de Actief kolom)

Mogelijke fouten:
- `Verkeerde username of password` → check je credentials
- `Geen connectie met server` → Fastify backend draait niet. Check terminal 1.
- CORS error in console → check dat allowedDevOrigins `http://localhost:1445` bevat (default OK)
- Browser blijft op /login na correcte credentials → check Fastify logs voor errors

## Stap 6: Employees en contracten zien (5 min)

Vanaf het dashboard, klik op "Employees" achter je actieve company. Of klik in de navbar op "Employees".

Verwacht: tabel met employees uit Staffler.

Klik op "Contracts" voor een week-view van contracten.

Mogelijke fouten:
- Lege tabel → het test-bedrijf heeft mogelijk geen employees of contracten in deze week. Probeer een andere week (date picker bovenaan contracts pagina).
- 403 / "permission denied" → je test-account heeft geen permission voor dat companyId
- 500 / "Internal Server Error" → check Fastify logs en de Staffler `traceId` in de response

## Stap 7: Iteratie

Vanaf hier ga je verder bouwen. Suggested order:

1. **Beschikbaarheden flow** (kernfunctie van WT-proxy stijl PoC)
   - Eigen storage: simpele JSON file in `staffler/poc/data/availability.json`
   - Nieuwe page `/availability` met week-grid, employee per rij, dag per kolom
   - Toggle cell = beschikbaar/onbeschikbaar
   - Endpoint `POST /api/availability` in Fastify met file-write

2. **Contract create from availability**
   - Button "Maak contract" op een beschikbare cel
   - Opent modal met velden uit ContractWebDto (datum, position, statute, paritairComité)
   - POST /api/contracts via Fastify proxy

3. **Beter dashboard**
   - "Open actions" overzicht (gebruik `/api/contracts/notificationCount`)
   - Weekoverzicht met aantallen
   - Klant-friendly links naar relevante secties

4. **Styling**
   - Brand kleuren (--color-primary nu Staffler-pink #fc074f)
   - Logo plek bovenaan
   - Demo-klaar voor klant-meeting

## Reuse uit wlnob/dps (vanaf morgen)

Als je morgen verder werkt en de basis staat:

```bash
# Clone dps repo lokaal als je het nog niet hebt
cd ~/Documents/Repositories/
git clone git@github.com:wlnob/dps.git dps-reference
```

Daarna kun je per file kopiëren:

| Van dps-reference | Naar staffler/poc/frontend |
|---|---|
| `src/app/shared/components/*` | `src/app/shared/components/` |
| `src/app/shared/pipes/*` | `src/app/shared/pipes/` |
| `src/app/shared/directives/*` | `src/app/shared/directives/` |
| `src/app/core/api/*.service.ts` | `src/app/core/api/dps/` (rename om botsing te vermijden) |
| `tsconfig.json` paths | merge in onze tsconfig |

Aanpassingen die je MOET doen na copy:
- API base URL: dps gebruikt `${environment.apiBaseUrl}/...`, wij gebruiken `${environment.apiBase}/staffler/...`
- Auth interceptor: niet hergebruiken, wij hebben eigen flow
- environments files: niet hergebruiken, wij hebben eigen
- providers in app.config.ts: merge handmatig

## Wat ik klaar heb gezet

```
poc/
├── ARCHITECTURE.md          uitleg van het geheel
├── TODAY-CHECKLIST.md       je leest dit
├── README.md                (oude readme, mag bijgewerkt)
├── package.json             backend deps
├── tsconfig.json            backend ts
├── .env.example             env template
├── src/                     Fastify backend
│   ├── client/staffler-client.ts
│   ├── types/staffler.ts
│   └── server/index.ts      bijgewerkt: cookie session + static serve + CORS
└── frontend/                NIEUWE Angular app
    ├── ARCHITECTURE.md      diepere uitleg frontend
    ├── package.json
    ├── angular.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── proxy.conf.json      /api proxy naar :5173
    ├── .gitignore
    └── src/
        ├── index.html
        ├── main.ts
        ├── styles.scss
        ├── environments/
        │   ├── environment.ts
        │   └── environment.development.ts
        └── app/
            ├── app.config.ts
            ├── app.routes.ts
            ├── app.component.ts
            ├── core/
            │   ├── api/
            │   │   ├── models.ts
            │   │   └── staffler.service.ts
            │   └── auth/
            │       ├── auth.service.ts
            │       ├── auth.guard.ts
            │       └── auth.interceptor.ts
            ├── layout/
            │   ├── shell.component.ts
            │   ├── shell.component.html
            │   └── shell.component.scss
            └── pages/
                ├── login/
                ├── dashboard/
                ├── employees/
                └── contracts/
```

Backend compileert clean (TypeScript strict). Frontend bestand-structuur is volledig Angular CLI compatible: `ng build` / `ng serve` werken zoals verwacht.

## Als iets niet werkt

Foutmeldingen die ik anticipeer:

| Fout | Oplossing |
|---|---|
| `Cannot find module '@env/environment'` | tsconfig paths klopt niet, herstart `ng serve` |
| `EADDRINUSE: address already in use :::5173` | Andere proces gebruikt port 5173. `lsof -i :5173` en kill, of zet `PORT=5174` in .env |
| `Network error / fetch failed` op POST /api/login | Backend draait niet. Check terminal 1. |
| CORS error in console | Browser console moet 'Access-Control-Allow-Origin: http://localhost:1445' zien. Backend zou dat moeten zetten als origin matched. |
| Login geslaagd maar geen redirect naar dashboard | Check Network tab: `/api/me` response. Mogelijk `401` waardoor auth.guard.ts faalt. |
| Employees page geeft 401 | Cookie wordt niet meegestuurd. Check Network tab dat `withCredentials` aan staat en cookie zichtbaar is in request headers. |
| TypeScript errors in component | Strict mode is aan. Check ts files in IDE, fix wat rood is. |

## Wanneer is dit "klaar voor demo"

Het PoC is demo-ready wanneer:

- Login werkt
- Dashboard toont jouw test-bedrijf
- Employees pagina toont minstens 1 employee
- Contracts pagina toont contracten of "geen contracten deze week" (correct gedrag)
- Logout werkt en stuurt naar /login terug
- Refresh van de browser blijft je ingelogd (cookie blijft staan)

Vanaf dat punt kun je het laten zien aan Lieven of een klant. Beschikbaarheden + contract-create zijn fase 2.
