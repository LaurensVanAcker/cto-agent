# Staffler PoC skeleton

Klaar-om-te-draaien skelet voor een externe PoC die op de Staffler / dps-service backend werkt. Server-side proxy in TypeScript (Node + Fastify), met een minimale HTML UI voor lokaal testen.

Doel maandag: `npm install && npm run dev`, daarna in de browser inloggen tegen QA en de eerste calls zien werken.

## Why a server-side proxy

Staffler's API gateway laat geen onbekende origins toe in CORS. Lokale dev (`http://localhost:5173`) en Vercel-deploys staan default niet in de allow-list. Een server-side proxy omzeilt dat: de browser praat met onze proxy, de proxy praat met de gateway. Skey blijft server-side, niet in localStorage.

Zodra je PoC origin formeel toegevoegd is aan `boemm.allowedOrigins` (vraag dev-ops, zie `../api/known-gaps.md`) kan je de browser ook direct met de gateway laten praten en deze proxy-laag schrappen.

## Folder structuur

```
poc/
├── package.json
├── tsconfig.json
├── .env.example       cp naar .env, vul aan
├── public/
│   └── index.html     simpele test UI
├── src/
│   ├── client/
│   │   └── staffler-client.ts   typed wrapper rond de Staffler API
│   ├── types/
│   │   └── staffler.ts          handgeschreven types (subset)
│   └── server/
│       └── index.ts             Fastify proxy + statische UI
└── README.md (je leest dit)
```

## Getting started

```bash
cd staffler/poc

# 1. Install
npm install

# 2. Setup env
cp .env.example .env
# Edit .env met je QA test-account credentials

# 3. Run
npm run dev
```

Open `http://localhost:5173`. Vul username + password in, klik Login. Na succesvolle login zie je je `companyMemberships`. Daarna kan je dictionaries, employees en contracten ophalen.

## Roadmap voor de PoC

Fase 1 (maandag-dinsdag): bevestig dat de bestaande happy paths werken op QA met je test-account. Login werkt, /api/me werkt, /api/employees en /api/contracts geven data terug.

Fase 2 (woensdag-donderdag): bouw de "beschikbaarheden" UI bovenop. Eigen storage voor availability records (start met JSON file, later Vercel KV of Supabase). Bind beschikbaarheid aan employeeId + dateRange.

Fase 3 (vrijdag): bouw `POST /api/contracts` flow zodat je vanuit beschikbaarheid + 1 klik een contract kan creëeren in Staffler.

Fase 4 (week 2): refine UX, deploy naar Vercel, vraag origin toe te voegen aan QA allowedOrigins zodat de proxy facultatief wordt.

## Calling endpoints not wrapped yet

`StafflerClient` heeft `rawAuthed` en `rawPublic` als escape hatches:

```ts
import { StafflerClient } from "./client/staffler-client.js";

const client = new StafflerClient({ gateway, skey });
const wages = await client.rawAuthed<PageWebDto<EmployeeWageWebDto>>(
  "GET",
  `/api/employeewages?companyId=${id}&page=0&size=20`
);
```

Voor de volledige endpoint-lijst zie `../api/endpoints-index.md`. Voor wire-shapes zie `../api/sources/dps-service-dtos.md`.

## Generating types from OpenAPI

`../api/openapi/openapi.json` heeft alle 85 operations. Voor stronger typing:

```bash
npm run gen:types
```

Genereert `src/types/staffler.generated.ts` met types per request/response. Replace de hand-geschreven `staffler.ts` ermee zodra de OpenAPI volledig genoeg is.

## Deploy naar Vercel later

Dit project is een gewone Node Fastify app. Voor Vercel:

1. Voeg een `vercel.json` toe die de Fastify server als serverless function deployt
2. Of converteer naar Vercel functions formaat (`api/login.ts`, `api/me.ts`, etc.) waar elke route een eigen file is
3. Skey state moet dan in een externe store (Upstash Redis, Vercel KV, Supabase)

Voor lokaal werken is dit niet nodig.

## Security notes

- Skey wordt nooit in browser localStorage opgeslagen, alleen in een server-side `Map` per session-cookie
- HttpOnly cookie zodat JS niet bij de session ID kan
- Voor productie: wissel deze in-memory Map voor een echte session store, anders crash je sessions weg bij restart
- Stuur HTTPS in productie. Cookies `Secure` flag toevoegen op deploy

## Skey lifecycle

- Login → server kreeg skey, bewaart in sessions Map
- Elke API call: server haalt skey uit Map op basis van cookie
- Gateway authorizer refresht het Cognito access token automatisch zolang refresh_token geldig is (30 dagen default)
- Logout → server roept `/api/users/logout` (Cognito GlobalSignOut), cleart Map entry, cookie expiry
- Server restart → in-memory Map gewist, gebruikers moeten opnieuw inloggen
- Voor langlopende sessions: zet skey-store in een externe DB zoals KV

## Wat ontbreekt nog

Bewust minimaal gehouden. Te bouwen wanneer relevant:

- Forgot password flow (POST /publicapi/companies/users/resetPassword + confirm)
- Force password reset flow (catch FORCE_PASSWORD_RESET in login response)
- Contract create form
- Beschikbaarheden flow (PoC-eigen storage)
- Vercel deploy
- Errors UI (parse `apiErrors[].code` + `traceId` properly)
- Multi-company switcher (companyMemberships[] dropdown)

Zie ook `../api/poc-recipe.md` voor de stap-voor-stap recipe en `../api/monday-checklist.md` voor wat je dev-ops moet vragen voor je begint.
