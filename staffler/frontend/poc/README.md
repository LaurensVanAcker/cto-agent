# Staffler frontend PoC skeleton

Minimal browser-side PoC die de Staffler-backend rechtstreeks consumeert. Vanilla TypeScript + Vite + ingebouwde dev-server proxy (om CORS te omzeilen). Geen Angular, geen Ionic — bewust slank zodat je in 2 minuten begrijpt wat er gebeurt.

## Doel

Demonstreer de FE-architectuur die de PoC-bouwer kan kopiëren naar een echte Angular/React/Vue/Svelte app:

1. Server-side proxy (Vite dev) om CORS te vermijden
2. OpenAPI-driven types (geen handgeschreven DTOs)
3. Skey in `sessionStorage` (per tab; verdwijnt bij close)
4. 3 representative endpoints: login, currentuser, statutes-dictionary

## Run

```bash
cd staffler/frontend/poc
npm install

# Vite dev server met proxy
npm run dev
# Opent http://localhost:5174/
```

Login met QA company-pool credentials (vraag dev-ops, zie `../monday-checklist.md`).

## Folder structuur

```
poc/
├── package.json
├── tsconfig.json
├── vite.config.ts          dev-server proxy config
├── index.html              minimale UI
├── src/
│   ├── main.ts             entrypoint, wire UI events
│   ├── client.ts           StafflerClient class (fetch wrapper)
│   ├── types.ts            handgeschreven model subset
│   └── ui.ts               render helpers
└── README.md (je leest dit)
```

## Wat het doet

- Login form rechtsboven → POST `/publicapi/companies/users/login`
- Skey wordt in `sessionStorage` gezet (verdwijnt bij tab-close)
- "Get current user" → GET `/api/users/currentuser` met header `x-boemm-skey`
- "Get statutes (public)" → GET `/publicapi/statutes` (geen skey nodig)
- "Logout" → wist sessionStorage

## Vite proxy

`vite.config.ts` proxyt `/api/*` en `/publicapi/*` naar de QA-gateway. Dev server is dus een transparante proxy. In de browser zie je calls als `http://localhost:5174/api/users/currentuser` — geen CORS issue.

Als je tegen een andere env wil: edit `vite.config.ts` of zet `VITE_GATEWAY` env variable.

## Types

`src/types.ts` is een handgeschreven minimale subset. Voor productie:

```bash
npm run gen:types
```

Maakt `src/openapi.generated.ts` uit `../../api/openapi/openapi.json` via `openapi-typescript`.

## Wat het NIET doet (bewust)

- Geen routing (single-page, alle UI in 1 file)
- Geen NGXS / Zustand / Redux
- Geen design system / styling polish
- Geen forgot-pwd flow
- Geen multi-company switcher
- Geen contract-creation
- Geen MyStaffler-pool login (employees) — voeg eventueel `EMPLOYEE_USER_API_URL` toe als je dat wil testen
- Geen tests
- Geen auto-refresh-on-401 (manueel re-login)

## Voor productie / volgende stappen

1. Vervang `sessionStorage` door iets durabler (cookie+httpOnly, of state-mgmt-lib).
2. Voeg `xhr.timeout` of `AbortController` toe aan elke call (gateway cold-start tot 10s).
3. Vervang typed-fetch door `openapi-fetch` voor full-typed paths.
4. Voeg `errorBoundary`-equivalent toe (catch + display in UI).
5. Voeg `i18n` toe als je Angular/React migreert (gebruik ngx-translate of i18next).
6. Voor PROD: vraag origin in `boemm.allowedOrigins`, ga van proxy naar direct (zie `../monday-checklist.md`).

## Security notes

- Skey in `sessionStorage`: makkelijker dan cookie maar **leesbaar door alle JS in dezelfde origin**. Voor productie: gebruik `httpOnly` cookie met server-side session store (zie `../../poc/src/server/index.ts` voor BE-kant van die aanpak).
- Geen CSP / HSTS in deze dev-setup — voeg toe op deploy.
- **Geen credentials hardcoded**. Login form vraagt elke session om username + password.

## Verschillen met `../../poc/` (backend PoC)

| Aspect | `staffler/poc/` (BE) | `staffler/frontend/poc/` (FE, dit) |
|---|---|---|
| Stack | Fastify + TS, server-side render | Vite + TS, browser-side |
| Doel | Externe applicatie die op Staffler-API praat | Demo-FE van hoe een Angular/React/Vue PoC zou werken |
| Proxy | Fastify proxy routes | Vite dev-server proxy |
| Skey | server-side `Map<sessionId, skey>` | browser `sessionStorage` |
| UI | static HTML served by Fastify | Vite-served TS+HTML |
| Port | 5173 | 5174 |

Beide PoCs draaien parallel kunnen — ze gebruiken verschillende ports en hun eigen skey-state.

## Cross-refs

- Backend PoC: `../../poc/`
- Backend kennisbank: `../../api/`
- FE kennisbank: `../`
