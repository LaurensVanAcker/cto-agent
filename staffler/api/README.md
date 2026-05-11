# Staffler API kennisbank

Doelpubliek: iemand die een PoC bouwt die op de Staffler-backend praat (zoals de WT-proxy klant deed op WorkToday). Bron: GitHub `wlnob/dps-service` + `wlnob/dps` (Angular front) + `wlnob/dps-external-auth` (gateway authorizer) + Confluence DPS-space (157 pagina's) + Jira BCJ. Gepulld op 9 mei 2026.

## Wat is Staffler

Staffler (vroeger DPS, Digital Payroll Services) is het BOEMM-platform voor klant-zelfbediening rond planning, contracten en loonadministratie. De backend is een Spring Boot 3.2 / Java 21 monoliet (`dps-service`) met daarvoor een AWS API Gateway en Cognito authorizer. De productie-backend leeft nog op `digitalpayrollservices.be`; QA/dev op `*.dps.boemm.eu`. MyStaffler is de medewerker-app naast de admin-front. Beide praten op dezelfde dps-service backend, met een aparte Cognito user pool per doelgroep.

Geen volledig SaaS-API in de "publieke developer portal" zin. Alle endpoints draaien achter dezelfde gateway als de SPA, gegate door een Lambda authorizer die een opaque session key (skey) wisselt voor een Cognito JWT.

## Structuur van deze kennisbank

```
staffler/
├── api/                         deze kennisbank
│   ├── README.md                je leest dit
│   ├── auth.md                  login, skey, Cognito, refresh, logout
│   ├── environments.md          host URLs per env, gateway prefixes, Cognito infra
│   ├── conventions.md           URL prefixes, dates, money, IDs, paging, sortBy
│   ├── errors.md                error envelope, status codes, traceId
│   ├── endpoints-index.md       platte lijst van alle 95 endpoints
│   ├── live-findings.md         PROD-getest, correcties op de docs
│   ├── known-gaps.md            onzekerheden, open vragen
│   ├── monday-checklist.md      shopping list voor PoC start
│   ├── poc-recipe.md            stap-voor-stap recipe
│   ├── domains/                 één file per domein
│   │   ├── companies.md, company-users.md, employees.md, contracts.md
│   │   ├── actuals.md, wages.md, engagement-groups.md, invitations.md
│   │   ├── newcomer.md, itsme.md, mystaffler.md, dictionary.md
│   │   ├── notifications-prefs.md, indexation.md, reports.md, internal-cron.md
│   ├── openapi/
│   │   ├── openapi.json         OpenAPI 3.1, 85 ops, 114 schemas (111 inlined)
│   │   └── README.md
│   └── sources/                 ruwe bron-files
│       ├── dps-service-controllers.md   45 controllers, 94 endpoints
│       ├── dps-service-controllers-extra.md  extra UserController
│       ├── dps-service-dtos.md  ~75 DTOs, 24 enums verbatim Java
│       ├── boemm-core-dto.md    canonical Address, Communication, etc
│       ├── user-service.md      separate user-service backend (not /dps-api)
│       ├── confluence-dps-summary.md  157 pages digested
│       ├── confluence-dps-pages.tsv
│       ├── jira-bcj-api-tickets.md
│       ├── jira-mystaffler-details.md  upcoming breaking changes
│       ├── error-codes.md       53 error codes, NL-only
│       ├── cfn-infra.md         Cognito + DynamoDB + Lambda CFN
│       └── live-probes/         echte JSON responses van PROD
└── poc/                         werkbare TypeScript skeleton
    ├── README.md
    ├── package.json, tsconfig.json, .env.example
    ├── public/index.html        minimale UI
    └── src/
        ├── client/staffler-client.ts   typed wrapper rond de API
        ├── types/staffler.ts           handgeschreven types (subset)
        └── server/index.ts             Fastify proxy + UI
```

## Snelle oriëntatie

- Backend host (QA): `https://gw.qa.dps.boemm.eu`
- API root onder gateway: `/v1/dps-api`
- Spring context-path achter gateway: `/dps-api` (niet zichtbaar van buiten omdat de gateway het strip+prefix doet)
- Drie URL prefixes:
  - `/v1/dps-api/api/...` voor authenticated calls
  - `/v1/dps-api/publicapi/...` voor login + read-only dictionary calls
  - `/v1/dps-api/internalapi/...` cron-only, niet bedoeld voor externe consumenten
- Auth: opaque skey in header `x-boemm-skey`, gewisseld door API Gateway authorizer voor Cognito JWT
- Twee Cognito user pools (company + employee), één gateway, één set endpoints

Volgende stap voor maandag:

1. Lees `monday-checklist.md` (5 min) en stuur de drie top-vragen door
2. Lees `auth.md` voor de login-flow + skey (10 min)
3. `cd ../poc && npm install && npm run dev` om de skeleton te draaien
4. Open `http://localhost:5173`, login met QA test-account
5. Daarna lees `poc-recipe.md` voor de bouw-stappen per fase

Voor type generation in de PoC: `npm run gen:types` regenereert TypeScript types uit `openapi/openapi.json`.

## Stand van zaken (9 mei 2026)

Wat zit in de doos:

- 85 REST endpoints gedocumenteerd met method, path, body, response
- 111 DTO schemas inline in OpenAPI met echte Java field-defs
- 53 error codes uit messages.properties
- Auth flow volledig uitgespeld (skey + Cognito, beide pools)
- 21 PROD-tested response samples in `sources/live-probes/`
- Werkbaar TypeScript skelet in `../poc/` (compilet, draait lokaal)
- Confluence-summary van 157 DPS-pagina's
- Recente Jira-tickets met breaking changes voor de komende sprint

Wat er ontbreekt en alleen via team beantwoord kan worden:

- QA test-account credentials (zie `monday-checklist.md` punt 1)
- PoC origin in QA `boemm.allowedOrigins` (zie `monday-checklist.md` punt 2)
- Cognito user pool reële IDs (zitten in SSM, niet in git)
- Confirmation MFA niet aan op company pool

Alles wat de PoC-bouwer "los uit het hoofd" zou moeten weten zit in deze map.
