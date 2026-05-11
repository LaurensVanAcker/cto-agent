# Domain: Employees

## Wat is een Employee

Een persoon die kan ingepland worden door één of meer Companies. In Staffler-domein is "Employee" niet "werknemer-bij-één-werkgever" maar een persoon-record dat in meerdere company pools tegelijk kan zitten (denk: een flexi die voor 3 horeca-zaken werkt). Vandaar het concept Pool en Engagement.

ID = UUID. Status enum `EmployeeStatusWebDto` (DRAFT, ACTIVE, ...). De employee kan via 4 wegen ontstaan:

1. Excel-import (`POST /api/employees/import`)
2. Email-uitnodiging die de employee invult (newcomer flow, zie `newcomer.md`)
3. itsme-flow (zie `itsme.md`)
4. Zelf-registratie via `POST /publicapi/employees/self-registration`

## Endpoints

### Read

```http
GET /api/employees/{id}
```

Returnt `EmployeeWebDto` (de "rijke" shape met alle velden). Permission `EMPLOYEE_VIEW`.

```http
GET /api/employees?companyId=&groupIds=&nameLike=&baseView=&hasContractFrom=&hasContractUntil=&actualFrom=&actualUntil=&actualsStatuses=&page=0&size=20&sortBy=lastName:asc
```

Pageable lijst van employees in een company pool. Filters:

- `companyId` (verplicht voor company-scoped users)
- `groupIds` engagement group filter (multi)
- `nameLike` substring search
- `baseView` boolean of de "lichte" projection terug moet
- `hasContractFrom`/`hasContractUntil` filter op employees met contract in periode
- `actualFrom`/`actualUntil` op employees met actual in periode
- `actualsStatuses` actual-status filter (multi)

Returnt `PageWebDto<EmployeeWebDto>` (custom paging).

### Update

```http
PUT /api/employees/{id}
Content-Type: application/json

<EmployeeWebDto>
```

Volledig replace. Permission `EMPLOYEE_EDIT`. De server doet wel selectieve persistence per veld omdat sommige fields bewust read-only zijn (bv. `studentBalance`).

### Bulk import

```http
POST /api/employees/import
Content-Type: multipart/form-data
```

Returnt `ImportJobWebDto`. Excel-formaat is gedocumenteerd in Confluence pagina 2705948675 ("Field formats to use in migration file") en 2627567617 ("Migration: Parse import excel file").

### Registration / Newcomer flows

```http
POST /api/registrations/employees/{employeeId}/companies/{companyId}
```

Bevestigt registratie van een newly-invited employee voor een specifieke company. Body `EmployeeWebDto`. Permission `EMPLOYEE_EDIT`.

```http
GET /api/employees/invitations/{invitationId}
```

Ophalen van employee-data via invitation ID (geheime link in mail). Returnt `EmployeeWebDto`. Geen auth nodig op dit publieke pad als de invitatieID geldig is.

## EmployeeWebDto shape (samenvatting)

Volledig in `sources/dps-service-dtos.md` § 4.1. Belangrijkste velden:

```
id (UUID)
firstName, lastName, middleName (String)
nationalNumber (String, "YY.MM.DD-XXX.CC" Belgisch rijksregister)
gender (GenderWebDto: MALE | FEMALE | X)
dateOfBirth (LocalDate)
placeOfBirth (String)
nationality (DictionaryItemWebDto)
address (AddressWebDto)
contact (ContactWebDto: email + phone + private/work)
languages (List<LanguageItemWebDto>)
status (EmployeeStatusWebDto)
isDraft (Boolean) -- gates registration emails
itsmeAuthorization (ItsmeAuthorizationWebDto)
studentBalance (StudentBalanceWebDto) -- jobstudent uren-saldo
drivingLicense (EmployeeDrivingLicenseWebDto)
transport (EmployeeTransportWebDto)
documents (List<MediaWebDto> + List<ExpirableMediaWebDto>)
consultant (EmployeeConsultantWebDto)
hubspotId (String)
verifiedFields (Set<String>) -- welke velden zijn officieel geverifieerd door BOEMM
```

`isDraft` is critical: zolang dit true is stuurt de backend GEEN registratie-emails. Bij elke import set je dit eerst true en pas na validatie naar false.

`verifiedFields` is gevuld door BOEMM-medewerkers. Voor Newcomer flow zit dit in `verifiedValues` query param.

## Engagement (employee-in-company-pool)

Niet expliciet als endpoint zichtbaar maar conceptueel:

- `POST /api/employees/engagements` (TestEmployee, niet productie-bedoeld)
- Via Company endpoint: `DELETE /api/companies/{companyId}/employees/{employeeId}`

In de praktijk wordt engagement gemaakt door Company-side membership endpoints, niet rechtstreeks. De employee bestaat onafhankelijk; Companies "trekken" hem in hun pool.

## Wage subkant

Een Employee kan meerdere `EmployeeWageWebDto` records hebben binnen één Company (één per loonpakket = functie+statuut+PC+locatie). Zie `domains/wages.md`.

## Documents

Employee documenten zitten als `MediaWebDto` in lijsten:

- `documents` algemeen
- `expirableDocuments` met expiry date

Wegens privacy worden documenten gestreamd via een aparte media service onder `mediaBaseUrl`, niet via dps-service rechtstreeks.

## Confluence-context

Pagina's voor diepere domein-uitleg:

- 2562785289 DPS: Employees
- 2563244037 Employee onboarding stepper
- 2563112961 Employee fields: format + validations
- 2515075089 Employee details: General + sub-pagina's voor Documents, Education, Experience, etc.
- 2515206146 Employee details: Education
- 2514780172 Employee details: @WORK
- 2705948675 Field formats migration
- 2656010268 Invite an employee
