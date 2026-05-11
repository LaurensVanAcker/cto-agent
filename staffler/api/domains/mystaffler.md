# Domain: MyStaffler

## Wat is MyStaffler

MyStaffler is de medewerker-app die naast de admin Staffler bestaat. Web + iOS + Android. Werknemers loggen zelf in om hun komende contracten te zien, beschikbaarheid in te vullen, in/uit te klokken en documenten te raadplegen.

Het hele MyStaffler-domein deelt dezelfde dps-service backend met admin Staffler. Endpoints zijn gewoon onder `/api/my-staffler/...` of via het employee-pool-token op gedeelde endpoints.

URL host op PROD: `https://my.staffler.be` (default in `application.yml`). App stores: zie env vars `MYSTAFFLER_APP_STORE_URL`, `MYSTAFFLER_PLAY_STORE_URL`.

Recent Jira (Q2.2 sprint 2026):

- BCJ-19481 setup/devops
- BCJ-19424 auth & onboarding
- BCJ-19432 shift scheduling
- BCJ-19439 clock in/out
- BCJ-19445 notifications
- BCJ-19452 profile/documents
- BCJ-19535 force password reset on first login

## Endpoints

### Auth

```http
POST /publicapi/employees/users/login
Content-Type: application/json

{ "username": "employee@example.be", "password": "..." }
```

Returnt `AuthResultWebDto` zoals company login. Skey is van het employee pool, je MOET hem in dezelfde header sturen `x-boemm-skey`.

Geen forgot-password endpoint voor employee pool. Reset gaat via admin re-invite of itsme.

### Invite een werknemer naar MyStaffler

```http
POST /api/companies/{companyId}/employees/{employeeId}/mystaffler/invite
```

Permission `EMPLOYEE_EDIT` (door een COMPANY_USER van de Company). Stuurt een mail naar de employee om zich te registreren in het employee Cognito pool en de mobile app te downloaden. Returnt 204.

### Contracten zien

```http
GET /api/my-staffler/employees/{id}/contracts?startDate=&endDate=&activeStartDate=&activeEndDate=&statuses=
```

Permission `MY_STAFFLER_VIEW_EMPLOYEE_CONTRACTS`. Returnt `List<EmployeeContractWebDto>` (NIET paginated).

`EmployeeContractWebDto` shape (`sources/dps-service-dtos.md` § 4.6):

```
id (UUID)
companyId (UUID)
companyName (String)
employmentAddress (AddressWebDto)
position (String)
status (ContractStatusWebDto)
dateFrom, dateTo (LocalDate)
fromTime, toTime (LocalTime "HH:mm")
pauseFromTime, pauseToTime (LocalTime)
hours (BigDecimal)
function (String)
statuteName (String)
```

`{id}` hier = employee ID, geen contract ID. Path is "geef alle contracten van deze werknemer" niet "contract by id".

## Wat ontbreekt nog (per Jira mei 2026)

Het MyStaffler suite epic is in opbouw. Per BCJ-19432 (shift scheduling) zijn er availability + clock in/out endpoints in development of pending. Concrete endpoint-URLs niet aangetroffen in dps-service commit van vandaag, dus voor een PoC die "beschikbaarheid invoeren" vraagt: dit moet je zelf bouwen op je eigen storage en pas later integreren.

## Implicaties voor de PoC die jij wil bouwen

De WT-proxy klant deed precies dit: een eigen front met eigen storage voor beschikbaarheid, en sync naar de officiële backend voor contracten. Voor Staffler kan dezelfde aanpak:

- Eigen Vercel/Netlify front + serverless storage (Supabase, KV) voor beschikbaarheden
- Voor contract-creatie: tunnel via de gewone admin endpoints (`POST /api/contracts`) als COMPANY_USER skey
- Voor "alleen voor de medewerker zichtbaar" data: blijf in eigen storage tot Staffler de availability endpoints heeft

Zie `poc-recipe.md` voor een werkbaar startpunt.
