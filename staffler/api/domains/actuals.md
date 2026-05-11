# Domain: Actuals

## Wat is een Actual

Een Actual is de uitgevoerde-werkelijkheid spiegel van een Contract na de planningsweek. Voor elke geplande werkblok ontstaat één Actual record dat in PENDING start, en door de klant bevestigd of aangepast moet worden voor payroll-encodage.

Confluence: 2541977601 (DPS: Actuals), 2725937155 (Actuals lifecycle), 2992275457 (Actuals confirmation), 3279880197 (Actuals Encodage), 3039526918 (Who can confirm).

## Status enum (`ActualStatusWebDto`)

```
PENDING
CONFIRMED
ABSENT
OVERDUE
CANCELLED
```

## Endpoints

### Read

```http
GET /api/companies/{companyId}/actuals?startDate=&endDate=&employeeIds=&statuses=&ids=&contractId=&page=&size=
```

Permission `ACTUALS_VIEW_ANY`. Returnt `PageWebDto<ActualWebDto>`. Alle filters optioneel; gebruikelijke combo is `startDate + endDate` voor een week-view, of `contractId` voor één contract.

```http
GET /api/companies/{companyId}/actuals/notificationCount
```

Aantal actuals dat aandacht nodig heeft (PENDING die binnen confirmation-window vallen, OVERDUE). Returnt `NotificationCountWebDto`.

### Update / Confirm

```http
PATCH /api/companies/{companyId}/actuals/{actualId}/workTimes
Content-Type: application/json

[ {
    "fromTime": "18:05",
    "toTime": "23:00",
    ...
} ]
```

Permission `ACTUALS_EDIT_ANY`. Body is `List<WorkTimeWebDto>` (de aangepaste werkelijke tijden). Backend zet status naar CONFIRMED en triggert encodage via SQS naar Brightstaffing.

Geen aparte "confirm" of "absent" endpoint zichtbaar in dit commit; status-transities gebeuren waarschijnlijk via dit `workTimes` endpoint of via een service-side state-machine die nog niet als REST endpoint exposed is. Confluence 3278897155 ("Update / Confirm Actual") is het canonical document hier maar zit waarschijnlijk grotendeels in de UI-flow.

## ActualWebDto shape (samenvatting)

Volledig in `sources/dps-service-dtos.md` § 7.1.

```
id (UUID)
contractId (UUID)
companyId (UUID)
employeeId (UUID)
status (ActualStatusWebDto)
contractDate (LocalDate)
contractEndDate (LocalDateTime, format "yyyy-MM-dd HH:mm:ss" — uitzondering!)
plannedFromTime, plannedToTime (LocalTime, "HH:mm")
plannedPauseFromTime, plannedPauseToTime (LocalTime)
workTimes (List<WorkTimeWebDto>)
absences (List<AbsenceWebDto>)
partialAbsenceDetails (PartialAbsenceDetailsWebDto)
details (ActualDetailsWebDto)
encodageCode (String, vb "1010" voor gewerkt)
locked (Boolean)
overdueAt (LocalDateTime)
```

## WorkTimeWebDto

```
fromTime, toTime (LocalTime "HH:mm")
date (LocalDate)
type ("REGULAR" | "OVERTIME" | "BREAK")
hours (BigDecimal)
```

## AbsenceWebDto + AbsenceReason

Een AbsenceWebDto representeert dat de employee deels of volledig afwezig was:

```
reason (AbsenceReasonWebDto)
fromTime, toTime (LocalTime)
hours (BigDecimal)
```

Reasons komen uit dictionary endpoint `/api/absenceReasons?statuteCode=` per statuut.

## Confirmation cycle

Wekelijkse cron-keten op de actuals:

| Cron | Trigger | Effect |
|---|---|---|
| `ActualsAutoConfirmSchedule` | Mon 03:00, Tue 03:00 | Auto-confirm waar timereg matcht met planning |
| `ActualsLockForPaymentSchedule` | Mon 12:59, Mon 23:59 | Lock voor payroll encodage |
| `ActualsUnlockAfterPaymentSchedule` | Tue 20:00 | Unlock na payroll |
| `ActualsUpdateToOverdueSchedule` | Tue 00:01 | Flag onbetaalde als OVERDUE → blokkeert nieuwe contracts |
| `ActualsDemoCleanupSchedule` | Elke 11 min | Reset demo company actuals |
| `CompanyActualsConfirmationEmailSchedule Morning` | Mon 07:00 | Confirmation reminder email |
| `CompanyActualsConfirmationEmailSchedule Afternoon` | Mon 14:00 | Tweede reminder |

Voor een PoC die alleen een lees-dashboard wil: deze cron is jouw implicit gegeven, niet iets om te triggeren. De cron-endpoints onder `/internalapi/actuals/*` zijn extern niet bereikbaar.

## Encodage push naar Brightstaffing

Wanneer een Actual wordt geconfirmd zet dps-service een SQS message op queue `qa-dps-actuals-encodage-sync`. Een Lambda (`encodage-lambda` of via `actualsEncodageSyncSqsQueueName` flow in dps-service zelf) post naar:

```
POST https://{customer-subdomain}.b-bright.be/backend/index.php/api/encodage/addEncodage
{ "code": "1010", "date": "2026-05-09", "amount": 8.0 }
```

Codes (niet exhaustief):
- 1010 = gewerkt
- diverse absentie-codes (wettig verlof, ziekte, afwezig zonder loon, etc.)

Volledige matrix in Confluence 3279880197.

## Time-gates voor klanten

Wanneer mag de COMPANY_USER nog actuals confirmeren of wijzigen?

- Default: tot Mon 23:59 voor de week die afgelopen zaterdag eindigde
- Daarna OVERDUE → klant kan niet meer wijzigen, BOEMM-medewerker moet helpen
- Confluence 3039526918: "Who can confirm or update actuals and until when?"

## Verwante endpoints

- Cancel demo actuals: `POST /internalapi/actuals/cancel?companyId=` (intern alleen)
- Confirmation email: `POST /internalapi/companies/confirmationEmail` (intern)
- Reports: `domains/reports.md`
