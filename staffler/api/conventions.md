# Conventions

## URL prefix tiers

`SecurityConfiguration` definieert drie tiers, elk met een eigen toegangsregel:

| Prefix | Auth | Aantal endpoints | Use case |
|---|---|---|---|
| `/v1/dps-api/api/...` | skey + Cognito JWT (één van twee pools) | 60 | normale CRUD voor admin SPA + MyStaffler |
| `/v1/dps-api/publicapi/...` | geen | 11 | login, dictionary lookups, itsme callback, employee invitation lookup |
| `/v1/dps-api/internalapi/...` | geen op backend, gateway-blocked van buiten | 12 | cron triggers, batch jobs |

Drie controllers zijn op meerdere tiers gemapt:

- `DictionaryController` op zowel `/api` als `/publicapi`, dus dictionaries werken anoniem
- `ContractHoursReportController` op zowel `/api/companies` als `/internalapi/companies`
- `DevContractHoursController` op zowel `/api/companies` als `/internalapi/companies` (deprecated)

## HTTP verbs in gebruik

GET (lezen), POST (create + niet-RESTful actions zoals `/import`, `/login`, `/batch`), PUT (volledige update), PATCH (partial of status update), DELETE.

Een paar opvallende conventies:

- POST wordt gebruikt voor cron-triggers onder `/internalapi/...` (zoals `/internalapi/actuals/lockForPayment`), niet voor entity-creatie
- PATCH gebruikt voor invitation status (`/api/employees/invitations/{id}` met body `EmployeeInvitationStatusWebDto`) en voor company user role (`/api/companies/{companyId}/users/{userId}` met body `CompanyUserRoleDto`)
- DELETE gebruikt path-only, geen body, returns 204 of void

## IDs

Alle entity IDs zijn UUID v4, op de wire als string `"a4b2c0d8-..."`. Geen integer IDs, geen short codes (behalve voor extern systemen zoals `pcCode` of `office.officeCode = "DPS100"`).

## Datums + tijden

| Type | Wire format | Voorbeeld |
|---|---|---|
| `LocalDate` | `yyyy-MM-dd` | `"2026-05-09"` |
| `LocalTime` | `HH:mm` (24h) | `"08:30"` |
| `LocalDateTime` (default) | ISO `yyyy-MM-ddTHH:mm:ss` | `"2026-05-09T08:30:00"` |
| `LocalDateTime` (uitzondering: `ActualWebDto.contractEndDate`) | `yyyy-MM-dd HH:mm:ss` met spatie | `"2026-05-09 08:30:00"` |

Time zone: alles is in Europe/Brussels (server config `boemm.defaultTimeZone`). Geen offset op de wire. Calls naar de backend interpreteren impliciet alle timestamps als Brussels lokale tijd.

## Geld en numerieke waarden

Bedragen zijn `BigDecimal` in JSON, default 4 decimalen voor wage values, 2 voor totalen. Voorbeeld: `"hourlyWage": "12.5000"`. Frontend parses naar string en formatteert met komma als decimaal.

Coefficients zoals shift premiums zitten in `CoefficientDto` met `multiplier` (BigDecimal) en `type` enum (`DEFAULT`, `HOLIDAY`, `MINIMAL`, `COMPANY`, `BANK_HOLIDAY`, `MIN_ADMIN`, `MIN_USER`).

## Paging

Spring's `Pageable` parameters worden ondersteund maar in een eigen variant:

- `?page=0&size=20` voor pagina + size, default size 20
- `?sortBy=field:asc,otherField:desc` voor sorteren, een enkele string parameter (niet Spring's standaard `sort=field,asc`)
- `SortingOrderParser` doet de mapping

Response is een `PageWebDto<T>` (custom envelope, niet Spring's default `Page`):

```json
{
  "content": [...],
  "totalElements": 142,
  "totalPages": 8,
  "number": 0,
  "size": 20,
  "numberOfElements": 20,
  "empty": false
}
```

Geen `pageable`, `sort`, `first`, `last` velden. Als je een typegen van Spring's default `Page` doet werkt dat hier dus niet.

## Error envelope

Errors worden gerendered door `GlobalExceptionHandler.ApiErrorResponse`:

```json
{
  "apiErrors": [
    {
      "code": "EMPLOYEE_INVALID_NATIONAL_NUMBER",
      "details": "National number checksum does not match",
      "group": "EMPLOYEE"
    }
  ],
  "traceId": "65ff8ec60ec9f2be36ad2f8859801597"
}
```

Status codes:

- 400 voor business validation fouten met `apiErrors` body
- 401 voor missing of expired skey, body is `{"message":"Unauthorized"}` (gateway-niveau, GEEN apiErrors envelope)
- 403 voor missing permission, body bevat de Spring AccessDeniedException message
- 404 voor onbestaande resource
- 409 voor conflict zoals dubbele invitation
- 500 voor unexpected, traceId is waardevol voor debugging

`traceId` is dezelfde als wat in CloudWatch logs leeft, geef het mee bij support requests.

## Common headers

Headers die de SPA en de backend gebruiken:

- `Content-Type: application/json` voor body POST/PUT
- `Content-Type: multipart/form-data` voor `/api/companies/import`, `/api/employees/import`, `/api/employeewages/import`
- `x-boemm-skey: <skey>` voor authenticated calls
- `Accept-Language: nl|fr|en|de` als hint voor messages.properties (gebruikt door `i18n` resolver in errors)
- `Authorization: Bearer ...` zelf zetten heeft geen zin, de gateway authorizer overschrijft dat

Response headers van interesse:

- `X-BOEMM-SKEY: <skey>` op login endpoints, dezelfde value als in body
- `Set-Cookie: SKEY=<skey>; Domain=.boemm.eu; Secure; ...`

## Permission codes (PreAuthorize)

Zichtbaar in controllers, niet exhaustief:

```
ACTUALS_VIEW_ANY
ACTUALS_EDIT_ANY
COMPANY_VIEW
COMPANY_SEARCH
COMPANY_ONBOARDING
COMPANY_GROUP_EDIT
COMPANY_GROUP_DELETE
COMPANY_REMOVE_USER
COMPANY_ADD_USER
COMPANY_USERS_VIEW_ANY
COMPANY_USERS_EDIT_ANY
COMPANY_USER_VIEW_NOTIFICATION_PREFERENCES
COMPANY_USER_EDIT_NOTIFICATION_PREFERENCES
EMPLOYEE_VIEW
EMPLOYEE_EDIT
EMPLOYEE_CREATE_INVITATION
EMPLOYEE_INVITATIONS_VIEW_ANY
EMPLOYEE_INVITATIONS_EDIT_STATUS
MY_STAFFLER_VIEW_EMPLOYEE_CONTRACTS
checkContract
checkListContracts
checkEmployeeWage
checkEmployeeWageView
checkCompanyUpdate
checkPermissionEmployeeInvitationAccess
```

`check*` zijn methods op `*SecurityDecisionMaker` Spring beans. Permission semantics worden afgeleid uit de user's role + companyId scoping.

## Status enums

| Enum | Waarden | Gebruikt in |
|---|---|---|
| `ContractStatusWebDto` | `DRAFT`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `OVERDUE`, `UNDER_REPAIR`, `CANCEL_VALIDATION` (8 totaal in de code) | contracts |
| `ActualStatusWebDto` | `PENDING`, `CONFIRMED`, `ABSENT`, `OVERDUE`, `CANCELLED` | actuals |
| `EmployeeInvitationStatus` | `ACTIVE`, `PENDING`, `COMPLETED`, `CANCELED`, `EXPIRED` (laatste deprecated) | invitations |
| `JobStatus` | import job tracking | imports |
| `CustomerRole` | `COMPANY_USER`, `GROUP_USER` | company users |
| `SupportedStatutes` | `WHITE_COLLAR`, `LABOUR`, `STUDENT`, `STUDENT_WORKER`, `FLEX_WHITE_COLLAR`, `FLEX_LABOUR`, `EXTRA`, `SEASONAL_LABOUR` (10 in totaal) | wages, contracts |
| `ContractSourceWebDto` | `FLASH`, `COMPANY_FUNCTION`, `EAGLE`, `DPS` | contracts |
| `CoefficientTypeDto` | `DEFAULT`, `HOLIDAY`, `MINIMAL`, `COMPANY`, `BANK_HOLIDAY`, `MIN_ADMIN`, `MIN_USER` | coefficients |
| `CompanyStatusDto` / `StatusWebDto` | `ACTIVE`, `BLOCKED`, `PROCESSING` | companies (twee bijna-duplicate enums) |

## Idempotency

Geen idempotency-key header convention gevonden. POST-create is niet idempotent. Voor batch contract create (`POST /api/contracts/batch`) is gedrag: als ALLE contracts falen krijgt de hele response 500 met error per item; als sommige slagen geeft hij 200 met de geslaagde subset terug. Voorzichtigheid geboden.

## Multipart imports

`/api/companies/import`, `/api/employees/import`, `/api/employeewages/import` aanvaarden allemaal een Excel-file via multipart. `EmployeeWageController.importEmployeeWages` heeft een bug: hij gebruikt `@RequestBody MultipartFile` ipv `@RequestPart`. Test eerst of een normale `multipart/form-data` upload werkt; mogelijk moet je raw bytes met content-type sturen.

Returnt `ImportJobWebDto` met een `jobId` om later status op te vragen (geen status endpoint zichtbaar in `dps-service-controllers.md`, vermoedelijk via een notification of email).

## Tracing

Spring sleuth + brave + zipkin zijn aan, dus `b3` headers worden gepropageerd:

```
X-B3-TraceId: 65ff8ec60ec9f2be36ad2f8859801597
X-B3-SpanId: ...
X-B3-Sampled: 1
```

W3C `traceparent` ook ondersteund. Voor PoC niet relevant maar handig voor debugging.

## Locale + i18n

`Accept-Language` header wordt gerespecteerd door `messages.properties`. Belgische context: NL is default, FR ondersteund, EN en DE in de codebase aanwezig (via MyStaffler). Voor server-side errors zoals validatiefouten krijg je de message in de Accept-Language die je opgaf.

Default als header ontbreekt: server-default = English (Spring default), maar `messages.properties` is in NL. Test of dit klopt.
