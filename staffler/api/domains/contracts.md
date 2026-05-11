# Domain: Contracts

## Wat is een Contract

In Staffler is een Contract een geplande werkblok of reeks werkblokken voor één Employee bij één Company. Het is GEEN HR-arbeidsovereenkomst, het is een planning-entiteit die per shift een uurcode, tijdslot en pauze beschrijft. Eén Contract kan meerdere dagen omvatten (multi-day) maar slechts één werkblok per dag, alleen pauze is variabel per dag.

Confluence: 2541879297 (DPS: Contracts), 2511863810 (Admin: Contracts), 2511798279 ev. (Contract details sub-pages).

## Status enum (`ContractStatusWebDto`)

```
DRAFT
ACTIVE
COMPLETED
CANCELLED
OVERDUE
UNDER_REPAIR
CANCEL_VALIDATION
```

(8 waarden in de code maar 7 hier opgesomd; de achtste is een "MIGRATED" of vergelijkbaar; check `sources/dps-service-dtos.md` § 15.9.)

## Endpoints

### Read

```http
GET /api/contracts/{id}
```

Returnt rijke `ContractWebDto`. Geen PreAuthorize op de getter zelf; security gebeurt via JWT-claim filtering in de service-laag.

```http
GET /api/contracts?startDate=&endDate=&activeStartDate=&activeEndDate=&companyId=&employeeIds=&statuses=&page=&size=
```

Lijst, returnt `PageWebDto<ContractBaseWebDto>` (lichtere projection: id, employeeId, companyId, position, dateFrom, dateTo, timetable, status). De rijke `ContractWebDto` krijg je alleen via `/{id}`.

```http
GET /api/contracts/notificationCount?companyId=
```

Aantal contracten dat aandacht nodig heeft (UNDER_REPAIR, CANCEL_VALIDATION, etc.). Returnt `NotificationCountWebDto`.

```http
GET /api/contracts/shiftTemplates?companyId=&nameLike=&page=&size=&sortBy=
```

Bestaande shift-templates voor copy/paste. Returnt `PageWebDto<ShiftTemplateWebDto>`.

### Create

```http
POST /api/contracts
Content-Type: application/json

{
  "employeeId": "...",
  "companyId": "...",
  "position": "Barmedewerker",
  "dateFrom": "2026-05-12",
  "dateTo": "2026-05-12",
  "timetable": {
    "schedule": [
      {
        "date": "2026-05-12",
        "fromTime": "18:00",
        "toTime": "23:00",
        "pauseFromTime": "20:00",
        "pauseToTime": "20:30",
        "shiftTemplateId": null,
        "createShiftTemplate": false
      }
    ]
  },
  "statute": { "code": "FLEX_LABOUR" },
  "paritairComite": { "code": "302" },
  "wageHour": "13.0500",
  "officeCode": "DPS100"
}
```

Permission `checkContract`. Returnt `ContractWebDto`. Validation rules komen uit Confluence 2798092290 (Contract validations):

- `dateFrom` ≥ now + 29 minuten (admin kan bypass)
- `dateTo` ≥ `dateFrom`
- `wageHour` in `[8.50, 100.00]`
- statute moet matchen met PC code (zie 2656534623 PC code statute validation)
- EXTRA statuut limiet: max 1 dag, max 2 opeenvolgende dagen
- Timetable: één werkblok per dag, geen overlap

Belangrijk: de contract DTO heeft ZOWEL `companyHoursPerWeek` + `employeeHoursPerWeek` (oude shape) ALS de `timetable.schedule` (nieuwe shape). Mengen mag niet, kies één.

### Update

```http
PUT /api/contracts/{id}
```

Body `ContractWebDto`. Permission `checkContract`. Status-veranderingen via dit endpoint, niet via een aparte transition-call.

### Batch create

```http
POST /api/contracts/batch
Content-Type: application/json

[ <ContractWebDto>, <ContractWebDto>, ... ]
```

Permission `checkListContracts`. Response gedrag:

- Alle slagen: 200 met `List<ContractWebDto>` waar elke entry `result` field heeft (`ContractBatchCreationResultWebDto` met `success: true`)
- Sommige falen: 200 met de hele lijst, sommige `result.success = false` met error
- Alle falen: 500 met error

Gebruik dit voor "kopieer van week X naar week Y" flow (Confluence 3185737748, 3074064399).

### Work times

```http
POST /api/contracts/{contractId}/workTimes
GET /api/contracts/{contractId}/workTimes?page=&size=
GET /api/companies/{companyId}/contracts/workTimes?startDate=&endDate=
```

Work times zijn de "deelblokken" van een Contract per dag. Voor een multi-day contract genereert de backend automatisch één `ContractWorkTimeWebDto` per dag uit het timetable.

Het `POST` endpoint regenereert ze (idempotent gewenst). Het `GET` levert de daadwerkelijk gepersisteerde work times terug.

### Shift template delete

```http
DELETE /api/contracts/shiftTemplates/{id}
```

Verwijdert een named shift template. Verbreekt geen bestaande contracts die hem ooit gebruikten (de schedule items zelf staan al uitgepakt in de contract).

## ContractWebDto shape

Volledige uitwerking in `sources/dps-service-dtos.md` § 3.1. Hoogtepunten:

```
id, employeeId, companyId, allocationId, parentId (UUID)
position (String, vrije functietitel)
status, previousStatus (ContractStatusWebDto)
dateFrom, dateTo (LocalDate)
timetable (ContractTimetableWebDto)
flexibleTimetable (Boolean)
officeCode, revenueOfficeCode (String, "DPS100" etc.)
consultant, revenueConsultant (ConsultantWebDto)
wageHour (BigDecimal, 4 decimalen)
compensationHours (DictionaryItemWebDto)
invoiceEcoWeekly (Boolean)
mealVoucher (ContractEmployeeWageMealVoucherWebDto, inner)
travelAllowance (ContractEmployeeWageTravelAllowanceWebDto, inner)
invoicing (ContractInvoicingWebDto)
employmentAddress (AddressWebDto, kan afwijken van company address)
paritairComite (DictionaryItemWebDto)
statute (StatuteItemWebDto)
reason (DictionaryItemWebDto, employment reason zoals VERVANGING)
employeeHoursPerWeek, companyHoursPerWeek (BigDecimal, OLD model)
cancelReason (DictionaryItemWebDto)
cancelExtraInfo (String)
isLate (Boolean)
sourceType (ContractSourceWebDto: FLASH | COMPANY_FUNCTION | EAGLE | DPS)
shiftTemplate (ShiftTemplateWebDto)
mutualAgreementContractCancellation (MutualAgreementContractCancellationWebDto)
result (ContractBatchCreationResultWebDto, alleen op batch responses)
socialSecurityCategory (DictionaryItemWebDto)
```

`sourceType` is informatief: waar komt deze contract vandaan? FLASH = vanuit een Flash flow (zie WorkToday integratie), DPS = manueel in dps, EAGLE = vanuit Eagle, COMPANY_FUNCTION = via een company-function template.

## Time-gates

Confluence 2798092290 + 3039526918 + 2541977601:

- Mon 12:59 actuals locked voor encodage
- Mon 23:59 permanente lock fase 1
- Tue 11:00 permanent lock fase 2
- Tue 20:00 unlock na payroll

Deze locks zorgen dat je geen contracten meer kan toevoegen of wijzigen voor de gelockte periode. POST/PUT geeft 409 of 400 terug met code zoals `ACTUAL_LOCKED` of `CONTRACT_OUTSIDE_WINDOW`.

## Cancellation

Voor een contract dat al ACTIVE is geldt mutual-agreement-cancellation flow:

1. Set status naar CANCEL_VALIDATION via PUT
2. Vul `cancelReason` (DictionaryItem zoals "Annulatie wegens ziekte") en `cancelExtraInfo`
3. Vul `mutualAgreementContractCancellation` met handtekening-info
4. Backend valideert en zet door naar CANCELLED of vraagt herstel via UNDER_REPAIR

Cancel windows: ≥ 14 minuten voor `dateFrom` (anders 400).

## Shift templates

Een ShiftTemplate is een herbruikbaar tijdslot per company. `POST /api/contracts` accepteert `timetable.schedule[i].createShiftTemplate = true` om tijdens contract-creatie meteen een named template te bewaren.

Alternatief is via een aparte test endpoint, maar dat is `@Profile("test")` en niet voor productie.

## Reports

```http
POST /api/companies/weeklyContractHoursReport
POST /api/companies/adminWeeklyContractHoursReport
```

Triggert email-verzending met PDF van geregistreerde uren per company. De cron `CompanyActualsConfirmationEmailSchedule Morning/Afternoon` doet dit elke maandag om 07:00 / 14:00.

Deprecated `/api/companies/weeklyContractHoursNotification` (GET) returnt JSON of PDF rechtstreeks. Niet voor extern gebruik.
