# Domain: Reports

## Wat is dit

Server-side gegenereerde rapporten die per email als PDF worden uitgestuurd. Geen rest-document-download flow voor klanten — de SPA toont enkel de "trigger send" knoppen, de PDFs landen in inbox.

## Endpoints

```http
POST /api/companies/weeklyContractHoursReport            (+ /internalapi/companies/...)
POST /api/companies/adminWeeklyContractHoursReport       (+ /internalapi/companies/...)
```

Beide returnen 200 zonder body. De server doet:

1. Voor elk bedrijf in scope: bereken geregistreerde uren voor de afgelopen week
2. Genereer PDF via OpenHTML to PDF
3. Stuur per email via AWS SES

Internal cron `CompanyActualsConfirmationEmailSchedule Morning/Afternoon` draait deze op Mon 07:00 en Mon 14:00. Externe trigger gebruikt typisch de `/api/...` variant met admin-skey.

## Deprecated GET endpoints

```http
GET /api/companies/weeklyContractHoursNotification        (+ internalapi)
GET /api/companies/weeklyContractHoursNotificationPdf     (+ internalapi)
```

`@Deprecated(forRemoval = true)`. Returnen JSON of PDF rechtstreeks zonder mail. Voor debugging gebruik door BOEMM, niet voor PoC.

`DevContractHoursController` is de class. Verwacht dat dit verdwijnt in een toekomstige release.

## DTOs

Bron: `sources/dps-service-dtos.md` § 10.

`CompanyEmailEntry`:
```
companyId (UUID)
companyName (String)
emails (List<String>)
employeeEntries (List<EmployeeEmailEntry>)
```

`EmployeeEmailEntry`:
```
employeeId (UUID)
employeeName (String)
contractEntries (List<ContractHoursEntry>)
totalHours (BigDecimal)
```

`ContractHoursEntry`:
```
contractId (UUID)
date (LocalDate)
fromTime, toTime (LocalTime)
plannedHours (BigDecimal)
registeredHours (BigDecimal)
status (ActualStatusWebDto)
```

## Voor PoC

Niet kritiek. Voor een dashboard met "totaal uren deze week per medewerker": gewoon `GET /api/companies/{companyId}/actuals?startDate=monday&endDate=sunday` en client-side aggregeren.
