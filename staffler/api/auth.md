# Authentication

## Architectuur in 1 alinea

Een SPA-client (of PoC) krijgt na succesvolle login een opaque session key (`skey`) terug. Die zet je in elke volgende request als header `x-boemm-skey`. De API Gateway voor `gw.*.dps.boemm.eu` heeft een Lambda authorizer die `x-boemm-skey` opzoekt in DynamoDB, daar de Cognito tokens uit haalt, het access token tegen de juiste Cognito JWKS valideert, eventueel het token vernieuwt, en het id_token als `Authorization: Bearer …` doorzet naar de Spring backend. De backend (dps-service) valideert die JWT met `JwtIssuerAuthenticationManagerResolver` tegen één van twee Cognito pools (company of employee).

Met andere woorden: vanuit een externe client zie je nooit de raw Cognito JWT, je werkt met de skey. De gateway doet de Bearer-vertaling.

## Twee Cognito user pools, één API

`SecurityConfiguration` zet beide pool issuers naast elkaar in een `JwtIssuerAuthenticationManagerResolver`:

- Company pool, IDP voor admin/company users die in de Staffler admin web app inloggen
- Employee pool, IDP voor MyStaffler werknemers die op de mobile of medewerker-flow inloggen

Welke pool een token uitgaf wordt bepaald door de `iss` claim. De Lambda authorizer doet hetzelfde aan gateway-kant. Er is geen aparte URL per pool, beide draaien onder `/v1/dps-api/api/...`. Endpoints zijn met `@PreAuthorize` gegate, en het permission-systeem checkt rol per gebruiker (zie `conventions.md`).

## Skey lifecycle

1. Client roept een login endpoint (`/publicapi/companies/users/login` of `/publicapi/employees/users/login`)
2. Backend doet Cognito InitiateAuth met USER_PASSWORD_AUTH flow, krijgt access_token + id_token + refresh_token
3. Backend roept de "signin store" Lambda (env var `auth.authFunctionName=dps-lambda-signin-store`) die genereert een nieuwe skey en bewaart `{access_token, id_token, refresh_token}` onder die skey in DynamoDB
4. Backend stuurt skey terug in `AuthResultWebDto.skey`, plus als cookie `SKEY` (domain=root, secure, max-age=4320h dus 6 maanden) en als response header `X-BOEMM-SKEY`
5. Client bewaart skey, voor de SPA in `localStorage` onder key `skey`
6. Op elke volgende API call zet de client header `x-boemm-skey: <skey>`
7. De gateway authorizer leest de skey, doet DynamoDB GET, valideert de JWT, refresh als < 5 min over, zet `Authorization: Bearer <id_token>` voor de backend
8. Bij 401 (skey ongeldig of verlopen) gooit de SPA de skey weg en stuurt door naar /login

Bron: `dps-external-auth/lambda/lambda_authorizer.py` (gateway) + `wlnob/dps/src/app/core/interceptors/auth.interceptor.ts` (client).

## Login (company user)

```http
POST /v1/dps-api/publicapi/companies/users/login HTTP/1.1
Host: gw.qa.dps.boemm.eu
Content-Type: application/json

{
  "username": "user@example.be",
  "password": "secret"
}
```

Response 200 (success path):

```json
{
  "username": "user@example.be",
  "session": null,
  "authStatus": "SUCCESS",
  "skey": "AbCdEf0123456789..."
}
```

Set-Cookie response header zet ook `SKEY=<skey>; Domain=...; Secure; Max-Age=15552000`.

Response 200 (force password reset path), bij eerste login na admin-invite:

```json
{
  "username": "user@example.be",
  "session": "AYABe...long Cognito session string...",
  "authStatus": "FORCE_PASSWORD_RESET",
  "skey": null
}
```

In dat geval direct doorroepen naar `setPassword`:

```http
POST /v1/dps-api/publicapi/companies/users/setPassword HTTP/1.1
Content-Type: application/json

{
  "session": "AYABe...",
  "username": "user@example.be",
  "password": "NewStrongPassword!"
}
```

Returnt opnieuw `AuthResultWebDto`, dit keer met `authStatus = SUCCESS` en een gevulde `skey`.

## Login (MyStaffler employee)

```http
POST /v1/dps-api/publicapi/employees/users/login HTTP/1.1
Content-Type: application/json

{
  "username": "employee.email@example.be",
  "password": "secret"
}
```

Response is dezelfde shape (`AuthResultWebDto`). Geen aparte reset/setPassword endpoints in employee pool, want werknemers gaan typisch via itsme (zie `domains/itsme.md`).

## Forgot password (company user)

Twee-staps Cognito ForgotPassword flow:

```http
POST /v1/dps-api/publicapi/companies/users/resetPassword
{ "username": "user@example.be" }
```

Cognito mailt een 6-cijferige confirmation code. Daarna:

```http
POST /v1/dps-api/publicapi/companies/users/confirmResetPassword
{
  "username": "user@example.be",
  "newPassword": "NewStrongPassword!",
  "confirmationCode": "123456"
}
```

Return: 204 No Content. De gebruiker moet daarna nog opnieuw inloggen via `/login` om een skey te krijgen.

## Logout

```http
GET /v1/dps-api/api/users/logout
x-boemm-skey: <skey>
```

Roept Cognito GlobalSignOut aan (invalidateert refresh token en daarmee toekomstige refresh-pogingen). De skey row in DynamoDB wordt vermoedelijk gewist door de signin-store Lambda. De client moet nog steeds zelf de skey uit localStorage halen.

Voor klant-flows die alleen "uit dit toestel uitloggen" willen, doet de SPA in `auth.api.service.ts` enkel `localStorage.removeItem(AUTH_KEY)` en geen logoutCognito.

## Wie ben ik (currentuser)

Na login kan je je eigen profiel + rollen + memberships ophalen via een endpoint dat IN dps-service zit (niet in user-service zoals eerder vermoed):

```http
GET /v1/dps-api/api/users/currentuser
x-boemm-skey: <skey>
```

Returnt `DpsUserDetailsWebDto`:

```json
{
  "user": { "id": "<uuid-as-string>", "email": "...", "name": "..." },
  "userRoles": ["..."],
  "companyMemberships": [
    { "companyId": "<uuid>", "role": "..." }
  ],
  "managedEmployeeId": "<uuid|null>",
  "employeeId": "<uuid|null>",
  "userId": "<uuid>"
}
```

`idpUserId` (de Cognito sub) is bewust `@JsonIgnore` aan server-zijde, krijg je niet. Voor je PoC: gebruik `userId` (UUID) als principal-ID en `companyMemberships[]` om te tonen voor welk bedrijf je werkt en in welke rol.

Bron: `UserController` in `eu.boemm.dps.common.security.controller` (dps-service). Niet in `user-service` (die service draait intern, achter de gateway, niet onder `/api/users`).

## Roles + permissions

De Cognito user pool stopt rol-info in custom JWT claims:

- `custom:companyId` voor company-pool tokens, identificeert het bedrijf waar de user lid van is
- Custom group claims voor de rol per bedrijf

De Spring backend mapt JWT claims naar `Authentication.principal` via `CustomUserAuthenticationConverter`. Daarna doen `@PreAuthorize` annotaties op controllers permission checks zoals:

```java
@PreAuthorize("@actualsSecurityDecisionMaker.checkPermissionActualsAccess('ACTUALS_VIEW_ANY', #companyId)")
```

Rollen die op de wire voorkomen via `CustomerRole` enum:

- `COMPANY_USER` ziet alles binnen het bedrijf
- `GROUP_USER` is gefilterd tot specifieke engagement groups

Intern (`UserRole`) bestaan ook: `SUPER_ADMIN`, `SALES_ADMIN`, `FULL_ADMIN`, `PAYROLL_ADMIN`, `DPS_DIRECTOR`, `DPS_SALES`, `CREDIT_CONTROLLER`, `PREVENTION_ADVISOR`, `RECRUITER`. Die zien klant-tokens niet, alleen BOEMM-medewerkers krijgen die.

## AuthSessionValidity = 3 min

Belangrijke footnote uit de Cognito CFN: `AuthSessionValidity` van de user pool is op 3 minuten gezet. Dat is het venster tussen wanneer Cognito een NEW_PASSWORD_REQUIRED challenge geeft en wanneer de client `setPassword` moet posten. Te lang wachten geeft een nieuwe `session` value nodig.

Voor itsme-flows met user-interactie (eID-app op telefoon) is dit krap. Bouw daarom geen lange wizards tussen `loginCustomer` (FORCE_PASSWORD_RESET response) en `setPassword`.

## Federated SSO (PROD only)

De SPA prod-config bevat een `boemmLoginUrl` met `identity_provider=BoemmAD`:

```
https://dps-app.auth.eu-central-1.amazoncognito.com/oauth2/authorize
  ?identity_provider=BoemmAD
  &redirect_uri=https://gw.myplanning.digitalpayrollservices.be/v1/signin
  &response_type=CODE
  &client_id=6ip7o5t7ctt8i44punh6eskj4p
  &scope=aws.cognito.signin.user.admin email openid phone profile
```

Na OAuth code exchange landt de browser op `/v1/signin` (een Lambda). Die wisselt de code voor tokens, slaat ze op met een verse skey, en redirect naar de SPA met de skey als cookie. Voor BoemmAD users (BOEMM-medewerkers) is dat de enige login flow op prod. Externe klanten gebruiken nog username/password.

## Implicaties voor een PoC

1. De simpelste PoC-aanpak is `POST /publicapi/companies/users/login` met username + password van een testaccount, daarna skey hergebruiken voor alle calls. Geen extra Cognito SDK nodig in de PoC.
2. Skey heeft 6 maanden levensduur (cookie max-age). De Lambda refresht het Cognito access token als nodig, dus de skey blijft geldig zolang DynamoDB hem niet wist.
3. CORS: de PoC-origin moet in `boemm.allowedOrigins` van de juiste env. Anders weigert de gateway elke preflight.
4. Het `x-boemm-skey` header vervangt elke `Authorization: Bearer …`. Stuur nooit zelf een Bearer header, de gateway negeert hem.
5. Voor een MyStaffler-stijl PoC (werknemer flow), gebruik `/publicapi/employees/users/login` ipv company endpoint. De rest van de API (`/api/my-staffler/employees/{id}/contracts`) is dan beschikbaar.

## Test users in QA

Geen vaste lijst in repo gevonden. Vraag het team aan, vermoedelijk zit er een seed-account in de QA company pool dat de QA team gebruikt.

## Wat er NIET is

- Geen API-key flow. Alle externe clients moeten via Cognito.
- Geen client_credentials grant op deze backend, althans niet voor de externe API. De SPA gebruikt enkel authorization_code en USER_PASSWORD_AUTH.
- Geen developer portal of Swagger UI publiek beschikbaar. Springdoc UI bestaat wel maar zit achter de gateway authorizer.
- Geen multi-factor flow geïmplementeerd in de publicapi login. De Cognito pool kan MFA aanzetten, maar de huidige `loginCustomer` handler verwacht alleen username + password.
