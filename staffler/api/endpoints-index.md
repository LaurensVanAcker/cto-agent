# Endpoints index

Platte lijst van alle 94 endpoints uit `dps-service`. Voor request/response detail zie `domains/<module>.md` of `sources/dps-service-controllers.md`.

Test/Dev controllers (`@Profile("test")` of `@Deprecated`) zijn meegenomen voor volledigheid maar niet bruikbaar in QA/PROD.

Notatie: de URL hieronder is wat je vanaf gateway moet roepen, dus prefix met `https://gw.<env>.dps.boemm.eu/v1/dps-api`. Bijvoorbeeld `/api/contracts` -> `https://gw.qa.dps.boemm.eu/v1/dps-api/api/contracts`.

## Auth (publicapi)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/publicapi/companies/users/login` | `{username, password}` | `AuthResultWebDto` |
| POST | `/publicapi/companies/users/setPassword` | `{session, username, password}` | `AuthResultWebDto` |
| POST | `/publicapi/companies/users/resetPassword` | `{username}` | 204 |
| POST | `/publicapi/companies/users/confirmResetPassword` | `{username, newPassword, confirmationCode}` | 204 |
| POST | `/publicapi/employees/users/login` | `{username, password}` | `AuthResultWebDto` |

## App users + memberships

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/users/logout` | – | 200 |
| POST | `/api/users/companies/{companyId}/invite` | `InviteAppUserRequest` | `AppUserDto` |
| POST | `/api/users/{userId}/companies/{companyId}/last-viewed` | – | 204 |
| GET | `/api/companies/{companyId}/users?page=&size=` | – | `PageWebDto<CompanyUserDto>` |
| PATCH | `/api/companies/{companyId}/users/{userId}` | `CompanyUserRoleDto` | `CompanyUserDto` |
| DELETE | `/api/companies/{companyId}/users/{userId}` | – | 204 |
| POST | `/api/companies/{companyId}/users/{userId}/resendInvitation` | – | 200 |

## Companies

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/companies/{companyId}` | – | `CompanyWebDto` |
| GET | `/api/companies/external?term=&postCode=&page=&size=` | – | `List<CompanyWebSearchResultWebDto>` |
| GET | `/api/companies/engagements?employeeId=&companyId=&page=&size=` | – | `PageWebDto<CompanyBaseInfoWebDto>` |
| POST | `/api/companies/{vat}` | – | `CompanyCreateResultWebDto` |
| PUT | `/api/companies/{uuid}` | `CompanyWebDto` | `CompanyWebDto` |
| GET | `/api/companies/{companyId}/coefficients?types=...` | – | `CompanyCoefficientsWebDto` |
| POST | `/api/companies/import` | multipart | `ImportJobWebDto` |
| DELETE | `/api/companies/{companyId}/employees/{employeeId}` | – | 200 |

## Contracts

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/contracts/{id}` | – | `ContractWebDto` |
| POST | `/api/contracts` | `ContractWebDto` | `ContractWebDto` |
| POST | `/api/contracts/batch` | `List<ContractWebDto>` | `List<ContractWebDto>` |
| PUT | `/api/contracts/{id}` | `ContractWebDto` | `ContractWebDto` |
| GET | `/api/contracts/notificationCount?companyId=` | – | `NotificationCountWebDto` |
| GET | `/api/contracts?startDate=&endDate=&companyId=&employeeIds=&statuses=&page=&size=` | – | `PageWebDto<ContractBaseWebDto>` |
| GET | `/api/contracts/shiftTemplates?companyId=&nameLike=&page=&size=&sortBy=` | – | `PageWebDto<ShiftTemplateWebDto>` |
| DELETE | `/api/contracts/shiftTemplates/{id}` | – | 200 |
| POST | `/api/contracts/{contractId}/workTimes` | – | `ContractWorkTimeWebDto` |
| GET | `/api/contracts/{contractId}/workTimes?page=&size=` | – | `PageWebDto<ContractWorkTimeWebDto>` |
| GET | `/api/companies/{companyId}/contracts/workTimes?startDate=&endDate=` | – | `List<ContractWorkTimeOverviewDto>` |

## Actuals

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/companies/{companyId}/actuals?startDate=&endDate=&employeeIds=&statuses=&ids=&contractId=&page=&size=` | – | `PageWebDto<ActualWebDto>` |
| GET | `/api/companies/{companyId}/actuals/notificationCount` | – | `NotificationCountWebDto` |
| PATCH | `/api/companies/{companyId}/actuals/{actualId}/workTimes` | `List<WorkTimeWebDto>` | `List<WorkTimeWebDto>` |

## Employees

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/employees/{id}` | – | `EmployeeWebDto` |
| GET | `/api/employees?companyId=&groupIds=&nameLike=&hasContractFrom=&hasContractUntil=&actualFrom=&actualUntil=&actualsStatuses=&page=&size=&sortBy=` | – | `PageWebDto<EmployeeWebDto>` |
| PUT | `/api/employees/{id}` | `EmployeeWebDto` | `EmployeeWebDto` |
| POST | `/api/employees/import` | multipart | `ImportJobWebDto` |
| POST | `/api/registrations/employees/{employeeId}/companies/{companyId}` | `EmployeeWebDto` | `EmployeeWebDto` |
| GET | `/api/employees/invitations/{invitationId}` | – | `EmployeeWebDto` |

## Employee invitations

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/employees/invitations` | `EmployeeInvitationWebDto` | `EmployeeInvitationWebDto` |
| GET | `/api/employees/invitations?companyId=&status=&page=&size=&sortBy=` | – | `PageWebDto<EmployeeInvitationWebDto>` |
| PATCH | `/api/employees/invitations/{id}` | `EmployeeInvitationStatusWebDto` | `EmployeeInvitationWebDto` |
| GET | `/publicapi/employees/invitations/{id}` | – | `EmployeeInvitationWebDto` |

## Newcomers (registratie zelfdienst)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/newcomers?companyId=&verifiedValues=&page=&size=&sortBy=` | – | `PageWebDto<NewcomerWebDto>` |
| GET | `/api/newcomers/{id}` | – | `NewcomerWebDto` |
| PUT | `/api/newcomers/{id}` | `NewcomerWebDto` | `NewcomerWebDto` |
| POST | `/publicapi/employees/self-registration` | `NewcomerWebDto` | `NewcomerWebDto` |

## Employee wages

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/employeewages` | `EmployeeWageWebDto` | `EmployeeWageWebDto` |
| PUT | `/api/employeewages/{id}` | `EmployeeWageWebDto` | `EmployeeWageWebDto` |
| DELETE | `/api/employeewages/{id}` | – | 204 |
| GET | `/api/employeewages?companyId=&employeeId=&page=&size=&sortBy=` | – | `PageWebDto<EmployeeWageWebDto>` |
| POST | `/api/employeewages/import` | multipart (let op `@RequestBody`) | `ImportJobWebDto` |
| GET | `/api/travelallowance/calculate?origin=&destination=&transportCode=` | – | `TravelAllowanceWebDto` |

## Engagement groups

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/companies/{companyId}/groups` | `EngagementGroupCreateRequestWebDto` | `EngagementGroupWebDto` |
| GET | `/api/companies/{companyId}/groups/{groupId}` | – | `EngagementGroupWebDto` |
| PUT | `/api/companies/{companyId}/groups/{groupId}` | `EngagementGroupWebDto` | `EngagementGroupWebDto` |
| GET | `/api/companies/{companyId}/groups?ids=&employeeNameLike=&nameLike=&page=&size=` | – | `PageWebDto<EngagementGroupWebDto>` |
| DELETE | `/api/companies/{companyId}/groups/{groupId}` | – | 200 |
| GET | `/api/companies/{companyId}/groups/employees?groupIds=&nameLike=&unassigned=&page=&size=&sortBy=` | – | `PageWebDto<EngagementGroupEmployeeWebDto>` |
| POST | `/api/companies/{companyId}/employees/{employeeId}/groups` | `List<EngagementGroupWebDto>` | 200 |

## Dictionary (zowel /api als /publicapi)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/dictionaries?types=...` | – | `DictionariesHolder` |
| GET | `/taxLevels?isFrontier=` | – | `List<TaxLevelDTO>` |
| GET | `/languages?onlyPrimary=` | – | `List<LanguageItemWebDto>` |
| GET | `/{resourceType}` | – | `List<?>` (catch-all) |
| GET | `/statutes?pcCode=&collar=` | – | `List<StatuteItemWebDto>` |
| GET | `/absenceReasons?statuteCode=` | – | `List<AbsenceReasonWebDto>` |
| GET | `/paritaircomites?showBlocked=` | – | `List<ParitairComiteDTO>` |

Vervang `/dictionaries` door `/api/dictionaries` of `/publicapi/dictionaries` afhankelijk van of je auth wil.

## itsme (publicapi)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/publicapi/oauth/itsme/codeLink?state=` | – | `CodeLinkDto` |
| GET | `/publicapi/oauth/itsme/callback?code=&state=&error=` | – | 302 redirect |

## MyStaffler

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/companies/{companyId}/employees/{employeeId}/mystaffler/invite` | – | 204 |
| GET | `/api/my-staffler/employees/{id}/contracts?startDate=&endDate=&statuses=` | – | `List<EmployeeContractWebDto>` |

Let op de hyphen: `my-staffler` met streepje, niet `mystaffler`.

## User notification preferences

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/users/{userId}/companies/{companyId}/notificationPreferences` | `UserNotificationPreferencesWebDto` | `UserNotificationPreferencesWebDto` |
| GET | `/api/users/{userId}/companies/{companyId}/notificationPreferences` | – | `UserNotificationPreferencesWebDto` |
| PUT | `/api/users/{userId}/companies/{companyId}/notificationPreferences` | `UserNotificationPreferencesWebDto` | `UserNotificationPreferencesWebDto` |
| GET | `/api/users/{userId}/companies/{companyId}/notificationPreferences/{id}/schedule` | – | `List<NotificationScheduleWebDto>` |
| PUT | `/api/users/{userId}/companies/{companyId}/notificationPreferences/{id}/schedule` | `List<NotificationScheduleWebDto>` | `List<NotificationScheduleWebDto>` |

## Audit (admin)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/admin/audit/notifications/preferences/{id}/history` | – | `List<HistoryEntityWrapperDto<...>>` |
| GET | `/api/admin/audit/notifications/schedules/{id}/history` | – | `List<HistoryEntityWrapperDto<...>>` |

## Reports

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/companies/weeklyContractHoursReport` (+ `/internalapi/...`) | – | 200 |
| POST | `/api/companies/adminWeeklyContractHoursReport` (+ `/internalapi/...`) | – | 200 |
| GET | `/api/companies/weeklyContractHoursNotification` (deprecated) | – | `List<CompanyEmailEntry>` |
| GET | `/api/companies/weeklyContractHoursNotificationPdf` (deprecated) | – | PDF bytes |

## Internal cron (NIET extern bereikbaar)

| Method | Path | Wie triggered |
|---|---|---|
| POST | `/internalapi/actuals/updateToOverdue` | EventBridge ActualsUpdateToOverdueSchedule |
| POST | `/internalapi/actuals/lockForPayment` | ActualsLockForPaymentSchedule |
| POST | `/internalapi/actuals/unlockAfterPayment` | ActualsUnlockAfterPaymentSchedule |
| POST | `/internalapi/actuals/cancel?companyId=` | ActualsDemoCleanupSchedule |
| POST | `/internalapi/actuals/autoConfirm` | ActualsAutoConfirmSchedule |
| POST | `/internalapi/companies/confirmationEmail` | CompanyActualsConfirmationEmailSchedule |
| POST | `/internalapi/employees/invitations/checkEmailReminder` | EmployeeRegistrationReminderSchedule |
| POST | `/internalapi/notifications/sendNotification` | NotificationServiceSchedule |
| POST | `/internalapi/notifications/sendMandatoryNotification` | NotificationServiceSchedule |
| POST | `/internalapi/indexations/wages/execute` | IndexationModule |

## Niet in dps-service maar wel door SPA gecald

De SPA-service `auth.api.service.ts` roept `${apiBaseUrl}/users/currentuser` aan maar er is geen controller voor in dps-service. Vermoedelijk gerouteerd door de gateway naar `user-service` (apart deployment, andere repo). Onder dezelfde URL prefix `/v1/dps-api/api/users/currentuser`. Voor een PoC: niet direct cruciaal omdat skey al naam + UUID + email in gateway-context heeft, maar je hebt deze nodig om de huidige user's role en companyMembership te kennen.
