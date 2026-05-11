# Live findings (PROD-getest)

Op 9 mei 2026 heb ik tegen `gw.myplanning.digitalpayrollservices.be` (PROD) een reeks publieke endpoints gecald om de docs te valideren en de werkelijke wire shapes te vangen. QA was traag of sleeping op het moment van testen, PROD reageerde direct.

Dit document vat de afwijkingen tussen "code-uit-de-bron" en "wat de server echt teruggeeft". Voor de PoC is alles hieronder de canonieke waarheid.

## Wat werkt anoniem (zonder skey)

Alle `/publicapi` paths met onderstaande resource names werken zonder auth:

```
/v1/dps-api/publicapi/statutes
/v1/dps-api/publicapi/countries
/v1/dps-api/publicapi/languages
/v1/dps-api/publicapi/naces
/v1/dps-api/publicapi/blockingreasons
/v1/dps-api/publicapi/travelallowances
/v1/dps-api/publicapi/cancelreasons
/v1/dps-api/publicapi/reasons
/v1/dps-api/publicapi/defaulttaxrates
/v1/dps-api/publicapi/compensationhours
/v1/dps-api/publicapi/socialsecuritycategories
/v1/dps-api/publicapi/transports
/v1/dps-api/publicapi/drivinglicenses
/v1/dps-api/publicapi/dependentpartners
/v1/dps-api/publicapi/maritalstatuses
/v1/dps-api/publicapi/taxlevels
/v1/dps-api/publicapi/absenceReasons?statuteCode=<X>
/v1/dps-api/publicapi/dictionaries?types=<lowercase-resource-name-csv>
```

Geen rate-limit gedetecteerd in 30 calls binnen 60 seconden.

## Wat NIET werkt

`/v1/dps-api/publicapi/paritaircomites` returnt **HTTP 500** met `INTERNAL_SERVER_ERROR / Internal Server Error`. Geen detail. Probeer dit niet als load-bearing endpoint te gebruiken; vraag het team waarom dit broken is en waar paritair comités vandaan moeten komen (mogelijk via boemm-core dictionary direct, of via authenticated `/api/paritaircomites`).

`/v1/dps-api/publicapi/dictionaries` zonder `types=` returnt HTTP 500. Altijd minstens één type meegeven.

`/v1/dps-api/publicapi/version` returnt 404 via de catch-all dictionary route. Er is geen version endpoint.

`/v1/dps-api/actuator/health`, `/swagger-ui`, `/v3/api-docs` zijn allemaal **HTTP 401 via gateway**: de Lambda authorizer blokkeert ook de "publieke" Spring paths. Spring SecurityConfiguration zou ze zelf doorlaten, maar de gateway zit ervoor.

## DTO-shape correcties

De volgende veldnamen wijken af van wat ik aanvankelijk in `domains/*.md` documenteerde:

| Concept | Eerder gedocumenteerd | Werkelijk |
|---|---|---|
| Address (in core-dto) | `streetName`, `boxNumber`, `postCode`, `cityName`, `state` | `street`, `bus`, `postalCode`, `city`, `country` |
| StatuteItem | `label`, `minHourlyWage`, `maxHourlyWage`, `extra` | `name`, `isStudent`, `collar`, `genericStatute` (nested) |
| Statute `collar` | `WHITE_COLLAR` of `LABOUR` | `WHITE` of `BLUE` |
| LanguageItem | `isPrimary` boolean | `primary` boolean |
| TaxLevel | `label`, `amount` | `name` only (geen amount) |
| Generic DictionaryItem | `{code, label, description}` | `{code, name}` (description bestaat niet) |
| ConsultantWebDto | UUID consultantId | String (AD user id) |
| Address (twee classes) | één AddressWebDto | `company.AddressDTO` EN `contract.AddressDTO` (verschillend) |

## Endpoint-correcties

`/api/users/currentuser` BESTAAT in dps-service, maar in een controller die ik in eerste pass had gemist: `eu.boemm.dps.common.security.controller.UserController`. Returnt `DpsUserDetailsWebDto`:

```json
{
  "user": { "id": "<uuid-string>", "email": "...", "name": "..." },
  "userRoles": ["..."],
  "companyMemberships": [
    { "companyId": "<uuid>", "role": "..." }
  ],
  "managedEmployeeId": "<uuid|null>",
  "employeeId": "<uuid|null>",
  "userId": "<uuid>"
}
```

`idpUserId` (Cognito sub) is `@JsonIgnore`, krijg je niet via JSON.

`user-service` (apart deployment, `wlnob/user-service`) is een interne service die NIET onder `/dps-api` draait en niet door externe clients bereikbaar is. Heeft `/users/api/users`, `/users/api/offices`, `/users/api/sync`. Voor PoC niet relevant.

## Cognito infra-feiten

Reële pool IDs (`eu-central-1_xxxxx`) staan niet in git. SSM Parameters hebben ze:

- `/auth/dps/user_pool_id` (company)
- `/auth/dps/employee_pool_id`
- `/lambda/dps/USERPOOLID_CFN`
- `/lambda/dps/EMPLOYEEPOOLID_CFN`

Pool names per env:

| Env | Company pool name | Employee pool name |
|---|---|---|
| dev | DPS | MyDPS |
| qa  | DPS | MyDPS-qa |
| prod | DPS | MyDPS |

Cognito relevante config:

- `AllowedOAuthFlows: [code]` enkel, geen implicit. PKCE verplicht.
- `AuthSessionValidity: 3` minuten voor de NEW_PASSWORD_REQUIRED window. Tussen `loginCustomer` (FORCE_PASSWORD_RESET) en `setPassword` mag je hooguit 3 min wachten.
- itsme scope per env: `service:BOEMM_AWS_LOGIN` (dev/qa) vs `service:BOEMMDPSPRD_SHAREDATA` (PROD).

DynamoDB skey-tabel: `dps-users` (zelfde naam in alle envs, key schema niet in CFN).

## CORS hard feit

QA en PROD allowed origins komen uit `${ORIGIN}` en `${MY_STAFFLER_ORIGIN}` env vars. Localhost is NIET toegestaan in QA/PROD. Voor lokale dev: server-side proxy gebruiken (zoals WT-proxy) of vraag dev-ops om `http://localhost:5173` aan QA toe te voegen tijdens de PoC build phase.

## Te-soon-to-pin tickets (Jira BCJ epic)

De volgende endpoint-veranderingen staan op de roadmap voor Q2.3 sprint (mei-juni 2026). Vermijd deze als load-bearing in een PoC zonder versie-pinning of feature-flag:

- `GET /api/employees` krijgt extra velden `myStafflerStatus`, `linkedSalaryPackages`, `lastLogin` (BCJ-19425, breaking schema change)
- `POST /api/contracts/batch` response-shape grew (`created` en `failed` arrays, BCJ-18046 done maar oude single-object response is legacy)
- `/api/my-staffler/...` namespace breidt uit met clock-in/out, location, actuals listing endpoints (BCJ-19435 t/m 19442)
- ITSME v1 endpoints worden gemigreerd naar v2 (BCJ-19111 on hold)
- Statute enum wordt gedynamiseerd (BCJ-19554)
- MyStaffler "force password reset on first login" voegt een nieuw `isFirstLogin` veld toe aan login response (BCJ-19535)

Voor een PoC die in mei-juni leeft: pin op de huidige shape via type-checks, en zet feature-flags klaar voor de schema-changes die je verwacht.

## Test-account placeholder

Geen echte test credentials in deze docs. Vraag dev-ops voor een QA test-account met een eigen test-bedrijf. Bij voorkeur een COMPANY_USER in `DPS` pool met seedede employees + contracten in een test-week.
