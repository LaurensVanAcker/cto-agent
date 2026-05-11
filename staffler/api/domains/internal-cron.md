# Domain: Internal cron endpoints (`/internalapi`)

## Niet voor PoC-gebruik

Deze endpoints zijn alleen door AWS EventBridge Scheduler / interne lambda-flows aan te roepen. De API Gateway authorizer blokkeert externe calls naar deze paths. Documentatie hier voor volledigheid en debugging.

## Volledige lijst

| Endpoint | Cron / Trigger | Functie |
|---|---|---|
| `POST /internalapi/actuals/updateToOverdue` | ActualsUpdateToOverdueSchedule (Tue 00:01) | Flag onbevestigde actuals als OVERDUE → blokkeert nieuwe contracts |
| `POST /internalapi/actuals/lockForPayment` | ActualsLockForPaymentSchedule (Mon 12:59 + 23:59) | Lock voor payroll encodage |
| `POST /internalapi/actuals/unlockAfterPayment` | ActualsUnlockAfterPaymentSchedule (Tue 20:00) | Unlock na payroll |
| `POST /internalapi/actuals/cancel?companyId=` | ActualsDemoCleanupSchedule (every 11 min) | Reset demo company actuals |
| `POST /internalapi/actuals/autoConfirm` | ActualsAutoConfirmSchedule (Mon/Tue 03:00) | Auto-confirm waar timereg matcht met planning |
| `POST /internalapi/companies/confirmationEmail` | CompanyActualsConfirmationEmailSchedule | Stuur actuals overdue confirmation email |
| `POST /internalapi/employees/invitations/checkEmailReminder` | EmployeeRegistrationReminderSchedule (every 10 min) | Mail-reminder voor itsme-registratie incomplete |
| `POST /internalapi/notifications/sendNotification` | NotificationServiceSchedule (every 15 min) | Verstuur SCHEDULED groep-notificaties |
| `POST /internalapi/notifications/sendMandatoryNotification` | NotificationServiceSchedule | Verstuur MANDATORY notificaties |
| `POST /internalapi/indexations/wages/execute` | Manueel of indexation-cron | Voer wage indexation uit |
| `POST /internalapi/companies/weeklyContractHoursReport` | CompanyActualsConfirmationEmailSchedule Morning | Per-bedrijf hours report mail |
| `POST /internalapi/companies/adminWeeklyContractHoursReport` | CompanyActualsConfirmationEmailSchedule Afternoon | Admin hours report mail |

## Authorizer

De Lambda authorizer (zie `auth.md`) heeft een policy die `/internalapi/*` paths van externe origins denyt zelfs met geldige skey. Alleen interne VPC-flows komen door.

Voor BOEMM-medewerkers die handmatig willen triggeren: gebruik `aws lambda invoke` of EventBridge "run now".

## Test vs prod gedrag

In test profile (`@Profile("test")`) zijn er extra controllers met DELETE en POST helpers om cron-state te seeden, allemaal onder `/internalapi/...`. Niet bruikbaar in QA/PROD.
