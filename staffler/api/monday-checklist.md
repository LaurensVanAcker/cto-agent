# Monday morning checklist

Concrete shopping-list voor maandag 11 mei 2026 om de PoC te starten. Sorted op urgentie. Voor elke item: wie te vragen, exact wat je nodig hebt, en welk fallback-plan als het antwoord lang op zich laat wachten.

## Top 3 (deze MUSSEN klaar zijn voor je begint)

### 1. Test-account in QA

Wat: een COMPANY_USER account in de QA `DPS` Cognito user pool, gekoppeld aan een test-bedrijf met seedede employees + contracten.

Wie: dev-ops (Bernardo of de huidige tech hero, check #technical-errors topic).

Wat te vragen, letterlijk:

> Dag,
>
> Voor de Staffler PoC heb ik een QA-test-account nodig.
>
> - Een COMPANY_USER op een test-company in QA
> - Bedrijf met enkele actieve employees + contracten in de huidige week (om data te kunnen demo'en)
> - companyId mag je rechtstreeks doorgeven, dan heb ik geen multi-company switcher nodig op dag 1
>
> Username + password graag in 1Password. Ik beschouw het als test-data, geen echte personen.
>
> Thx
> Laurens

Fallback: gebruik je eigen BoemmAD-account op PROD voor read-only verkenning (NIET schrijven, geen contracten aanmaken op PROD).

### 2. Origin in `boemm.allowedOrigins` (of: bouw met server-side proxy)

Wat: de PoC origin toevoegen aan QA's `ORIGIN` env var voor dps-service. Anders blokkeert de gateway elke browser-call.

Wie: dev-ops.

Twee opties:

A. Vraag origin toe te voegen:

> Voor de PoC wil ik browser-calls direct naar gw.qa.dps.boemm.eu doen. Kun je `https://staffler-poc.local:5173` (lokaal) en `https://staffler-poc.vercel.app` (dev domein) toevoegen aan `boemm.allowedOrigins` in de QA env? Anders moet ik een server-side proxy bouwen.

B. Zonder dat, werk met server-side proxy. De skeleton in `staffler/poc/` doet dat al, dus dit kan parallel.

Aanbeveling: doe A én B. Vraag de origin, en bouw ondertussen verder met de proxy. Zodra de origin er is kan je de proxy eruit halen.

### 3. Confirmation dat skey niet expireert tijdens PoC-run

Wat: bevestiging van dev-ops dat de skey-DynamoDB rows niet voortijdig worden uitgewist, en dat de Cognito refresh tokens lang genoeg geldig blijven (30 dagen default voor user pool).

Wie: dev-ops.

Vraag: "We bouwen een PoC die een skey lang blijft hergebruiken. Geen TTL op de DynamoDB row `dps-users` of op de session, klopt dat? Refresh token lifetime is 30 dagen voor de DPS pool, klopt dat ook?"

Fallback: implementeer auto-relogin in StafflerClient bij 401 detection. Werk al verstandig in de skeleton (StafflerError check op `kind: "gateway"` of HTTP 401).

## Top 5 zachte vragen (kunnen wachten tot dag 2-3)

### 4. Is /paritaircomites broken op PROD bekend?

Wat: PROD endpoint `GET /v1/dps-api/publicapi/paritaircomites` returnt 500. Per 9 mei 2026.

Wie: backend lead.

Vraag: "Hoort dit zo? Of moeten we via authenticated `/api/paritaircomites` of via boemm-core direct? Wat is de canonieke bron voor PC codes?"

### 5. Welke endpoints zijn binnen 1 maand breaking?

Wat: BCJ-19425 voegt velden toe aan `GET /api/employees`. BCJ-19435 wijzigt actuals shape voor MyStaffler. BCJ-18046 done maar response-shape grew.

Wie: BCJ epic owner / Bernardo.

Vraag: "We bouwen een PoC die deze maand live moet. Welke breaking changes zijn er gepland in /api/employees, /api/contracts, /api/actuals tussen nu en eind mei? Als we velden moeten droppen, doe ik dat liever vooraf."

### 6. Test-data voor seasonal/EXTRA statuten

Wat: voor PoC die contract-creatie wil tonen heb ik weet ik graag wat een typisch contract eruitziet voor een FLEX_LABOUR vs LABOUR_STUDENT vs EXTRA. Statute heeft business rules (bv. EXTRA = max 2 opeenvolgende dagen).

Wie: een payroll-medewerker die de domain-rules kent.

Fallback: lees Confluence pagina 2798092290 (Contract validations), pak de regels.

### 7. Welke username-format voor employee-pool login?

Wat: `/publicapi/employees/users/login` accepteert een username. Is dat email, employeeId, nationalNumber? CFN noemt geen `username_attributes` voor MyDPS pool.

Wie: dev-ops of frontend (Hubert / dps repo authors).

Fallback: probeer email eerst, daarna employee email.

### 8. Confluence "REST API" pagina invullen?

Wat: Confluence pagina `3278962728 REST API` bestaat al maar is een stub. Onze offline kennisbank in `/staffler/api/` is nu vollediger. Wil het team dat ik die docs (deels) terug naar Confluence zet?

Wie: Bernardo / Lieven.

Fallback: laat de docs staan in repo, link ze in slack #engineering bij vraag.

## Vragen die niet aan dev-ops, eerder aan Lieven

### 9. Welke business-flow wil de PoC concreet demonstreren?

Wat: in de WT-proxy klant deed iemand "beschikbaarheden invoeren" in eigen front, contract auto-genereren in WT backend. Voor Staffler kan hetzelfde, of iets anders.

Eerste keuze: replay WT-proxy idee. Tweede keuze: dashboard voor manager (bekijk je week, bevestig actuals, geen create contracts). Derde keuze: medewerker self-service (mijn contracten + clock-in stub).

Vraag aan Lieven: "Welk concreet scenario wil je dat de PoC laat zien aan klanten? Beschikbaarheden + auto-contract zoals WT-proxy? Of iets specifieks voor MyStaffler?"

### 10. Welke klant gaat dit gebruiken? Of is dit demo-only?

Wat: budget en feature-prioriteit hangt af van wie de PoC ziet.

Vraag aan Lieven.

## Informatie die je zelf al kan ophalen

Geen vraag aan iemand nodig:

- Login flow: zie `auth.md`
- Endpoints: zie `endpoints-index.md` of `openapi/openapi.json`
- DTO field names: zie `domains/*.md` of `sources/dps-service-dtos.md`
- Address shape: zie `sources/boemm-core-dto.md`
- Error codes: zie `sources/error-codes.md` (53 codes)
- Cognito infra: zie `sources/cfn-infra.md`
- Pool name + Auth flow: zie `environments.md`
- Live-tested data: zie `live-findings.md`
- Wat staat te wijzigen in komende weken: zie `sources/jira-mystaffler-details.md`

## PoC werkflow voor maandag

1. `cd staffler/poc && npm install`
2. `cp .env.example .env`, vul `STAFFLER_USERNAME` + `STAFFLER_PASSWORD` aan
3. `npm run dev` → server op `http://localhost:5173`
4. Open browser, klik Login. Verwacht: `companyMemberships` populated.
5. Klik "GET /api/me", verifieer profile.
6. Klik "Fetch dictionaries" → moet werken (lekt geen auth, gewoon publicapi).
7. Vul `companyId` (auto-gefilled uit /me), klik "List employees" en "List contracts".
8. Als alles werkt: je hebt je eerste werkende dag.

Foutmeldingen die je kan krijgen:
- 401 op login → wrong creds. Check je `.env`.
- 403 na login → companyId niet van jouw membership.
- 500 op willekeurige call → vraag traceId aan dev-ops om logs te checken.
- "INTERNAL_SERVER_ERROR" envelope → kijk in `sources/error-codes.md`.
- Network error → QA cold-start, retry na 30 sec.

## Niet zelf doen voor dag 1

- Geen contracten écht aanmaken op een echt bedrijf (test-bedrijf is OK)
- Geen `/internalapi/...` paths roepen (gateway blokkeert)
- Geen credentials in repo committen (.env gitignored)
- Geen langlopende skey hardcoden (sessions Map is in-memory, restart = loginnu)
