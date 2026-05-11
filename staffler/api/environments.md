# Environments

## Host overzicht

| Env | SPA host | Gateway host (API root) | Cognito hosted UI |
|---|---|---|---|
| dev | `https://dev.dps.boemm.eu` | `https://gw.dev.dps.boemm.eu` | `https://dps-dev.auth.eu-central-1.amazoncognito.com` |
| qa | `https://qa.dps.boemm.eu` | `https://gw.qa.dps.boemm.eu` | `https://dps-qa.auth.eu-central-1.amazoncognito.com` |
| prod | `https://myplanning.digitalpayrollservices.be` | `https://gw.myplanning.digitalpayrollservices.be` | `https://dps-app.auth.eu-central-1.amazoncognito.com` |

Bron: `src/environments/environment.{dev,qa,ts}.ts` in `wlnob/dps`.

## API base URLs

Per environment leeft de SPA via deze base URLs:

```ts
// QA voorbeeld (environment.qa.ts)
apiBaseUrl:        'https://gw.qa.dps.boemm.eu/v1/dps-api/api'
publicApiBaseUrl:  'https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi'
mediaBaseUrl:      'https://gw.qa.dps.boemm.eu/v1/media/api/public/media'
publicMediaBaseUrl:'https://gw.qa.dps.boemm.eu/v1/media/publicapi/media'
```

`/v1/dps-api/internalapi` bestaat ook maar wordt door de Lambda authorizer extern geblokkeerd. De SPA roept hem nooit aan.

## Cognito client IDs (publieke OAuth code grant)

| Env | Pool name | Client ID (company SPA) | Hosted UI flow |
|---|---|---|---|
| dev | `DPS` (dev) + `MyDPS` (dev) | `2vlmmrsanmo6ls0bgnpgum6ptv` | code grant naar `/v1/signin` |
| qa | `DPS` + `MyDPS-qa` | `27lsi3af4a8jpd7oba85q9sipf` | code grant naar `/v1/signin` |
| prod | `DPS` + `MyDPS` | `6ip7o5t7ctt8i44punh6eskj4p` | identity_provider=BoemmAD |

Twee user pools per env, allebei in eu-central-1. De company-pool (`DPS`) host SPA-admin users en BOEMM-medewerkers (federated). De employee-pool (`MyDPS*`) host MyStaffler werknemers.

De feitelijke `eu-central-1_xxxxx` pool IDs staan NIET in git, alleen in AWS SSM:
- `/auth/dps/user_pool_id`
- `/auth/dps/employee_pool_id`
- `/lambda/dps/USERPOOLID_CFN`
- `/lambda/dps/EMPLOYEEPOOLID_CFN`

Opvragen: vraag dev-ops, of decode een live JWT's `iss` claim (verschijnt na een login).

Cognito belangrijke instellingen uit CFN:

- `AllowedOAuthFlows: [code]` enkel, geen implicit. PKCE verplicht in browser flows.
- `AuthSessionValidity: 3` (minuten) voor de NEW_PASSWORD_REQUIRED challenge window.
- itsme scope: `service:BOEMM_AWS_LOGIN` op dev/qa, `service:BOEMMDPSPRD_SHAREDATA` op PROD.

Employee pool client IDs zijn in env vars (`EMPLOYEE_POOL_CLIENT_ID`) en niet in de SPA bundle.

In QA en lager kan een gewone username/password login via `POST /publicapi/companies/users/login`. Op PROD staat federated SSO via BoemmAD aan, maar de username/password endpoint blijft beschikbaar voor klant-accounts buiten BoemmAD.

## DynamoDB skey table

Tabel: `dps-users` (zelfde naam in alle envs). Key schema niet zichtbaar in CFN (bestaat los van deze stack). Bewaart `{access_token, id_token, refresh_token, ...}` per skey.

## Credit Safe + itsme

Credit Safe en itsme zijn externe services waar dps-service zelf op praat. Hun base URIs zitten in env vars (`ITSME_BASE_URI`, geen aparte voor Credit Safe in de yml maar wel via `boemm-core` rest-client).

itsme redirect URI in QA: `https://gw.qa.dps.boemm.eu/...` (controlled door `${ITSME_REDIRECT_URI}` env var). Voor een PoC die zelf itsme niet gebruikt is dit niet relevant.

## CORS / allowedOrigins

`application.yml` standaard staat `dev.dps.boemm.eu`, `localhost`, `localhost:1445` toe. In QA/PROD wordt dit per env gezet via `${ORIGIN}` en `${MY_STAFFLER_ORIGIN}` env vars (vanuit CFN-stack outputs).

CRUCIAAL voor PoC: localhost is NIET in de QA / PROD allowed list. Als je lokaal of op Vercel test moet je je origin laten toevoegen door dev-ops, anders blokkeert de gateway elke preflight (CORS error in browser). De gateway send `Access-Control-Allow-Origin` enkel terug als de origin matched.

Workaround voor PoC tijdens dev: server-side proxy (zoals WT-proxy doet) zodat de browser nooit direct met de Staffler gateway praat, en de origin-check er niet toe doet. Voor productie-PoC: vraag de exacte PoC-URL toe te voegen aan `ORIGIN` env var in QA/PROD.

## QA omgeving probe

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://qa.dps.boemm.eu/             # 200, SPA HTML
curl -s -o /dev/null -w "%{http_code}\n" https://gw.qa.dps.boemm.eu/v1/dps-api/v3/api-docs  # 401 (auth required)
```

Het Springdoc OpenAPI endpoint (`/v3/api-docs`) ligt achter de gateway authorizer, zelfs al is het op het backend zelf publiek. Dat is waarom we hier de OpenAPI spec offline reconstrueren uit de controllers (`openapi/openapi.json`).
