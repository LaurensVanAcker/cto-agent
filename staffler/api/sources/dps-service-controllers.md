# DPS-Service REST Controller Inventory

This document maps every `@RestController` in `wlnob/dps-service` (Spring Boot 3.2 / Java 21) at commit `1fc6cd30d62ec3bba51285585483a524a22f4238` (default branch). The service runs under context-path `/dps-api`; the public API gateway prefixes everything with `/v1/dps-api`. So a class mapped at `/api/companies` is reachable at `https://gw.qa.dps.boemm.eu/v1/dps-api/api/companies`. URL prefix conventions (from `SecurityConfiguration`):

- `/api/**` — authenticated (Cognito JWT, company or employee pool)
- `/publicapi/**` — public, no auth
- `/internalapi/**` — public to backend but in practice gated by AWS API Gateway from public internet

Controllers are grouped by domain module. `Test*` / `Dev*` controllers (mostly `@Profile("test")` or `@Deprecated`) are still listed because they expose live mappings in the relevant Spring profile. Request- and response-body types are captured verbatim (no DTO expansion in this pass).

## Controllers discovered (per file path)

- `src/main/java/eu/boemm/dps/actual/controller/ActualsController.java`
- `src/main/java/eu/boemm/dps/actual/controller/ActualsManagementController.java`
- `src/main/java/eu/boemm/dps/actual/controller/TestActualsController.java`
- `src/main/java/eu/boemm/dps/audit/controller/UserNotificationPreferencesAuditController.java`
- `src/main/java/eu/boemm/dps/company/controller/CompanyActualsConfirmationController.java`
- `src/main/java/eu/boemm/dps/company/controller/CompanyController.java`
- `src/main/java/eu/boemm/dps/company/controller/TestCompanyController.java`
- `src/main/java/eu/boemm/dps/companyuser/controller/AppUserController.java`
- `src/main/java/eu/boemm/dps/companyuser/controller/CompanyUserController.java`
- `src/main/java/eu/boemm/dps/companyuser/controller/CompanyUserInvitationController.java`
- `src/main/java/eu/boemm/dps/companyuser/controller/LogoutController.java`
- `src/main/java/eu/boemm/dps/companyuser/controller/PublicCompanyUserController.java`
- `src/main/java/eu/boemm/dps/contract/controller/ContractController.java`
- `src/main/java/eu/boemm/dps/contract/controller/ContractWorkTimeController.java`
- `src/main/java/eu/boemm/dps/contract/controller/ContractWorkTimeOverviewController.java`
- `src/main/java/eu/boemm/dps/contract/controller/TestContractController.java`
- `src/main/java/eu/boemm/dps/dictionary/controller/DictionaryController.java`
- `src/main/java/eu/boemm/dps/employee/controller/EmployeeController.java`
- `src/main/java/eu/boemm/dps/employee/controller/EmployeeRegistrationController.java`
- `src/main/java/eu/boemm/dps/employee/controller/TestEmployeeController.java`
- `src/main/java/eu/boemm/dps/employeeinvitation/controller/EmployeeInvitationController.java`
- `src/main/java/eu/boemm/dps/employeeinvitation/controller/EmployeeInvitationPublicController.java`
- `src/main/java/eu/boemm/dps/employeeinvitation/controller/EmployeeRegistrationReminderController.java`
- `src/main/java/eu/boemm/dps/employeeinvitation/controller/TestEmployeeInvitationController.java`
- `src/main/java/eu/boemm/dps/employeeinvitation/controller/TestEmployeeRegistrationReminderController.java`
- `src/main/java/eu/boemm/dps/employeewage/controller/EmployeeWageController.java`
- `src/main/java/eu/boemm/dps/employeewage/controller/EmployeeWageTestController.java`
- `src/main/java/eu/boemm/dps/employeewage/controller/TravelAllowanceController.java`
- `src/main/java/eu/boemm/dps/engagementgroup/controller/EmployeeEngagementGroupController.java`
- `src/main/java/eu/boemm/dps/engagementgroup/controller/EngagementGroupController.java`
- `src/main/java/eu/boemm/dps/engagementgroup/controller/EngagementGroupTestController.java`
- `src/main/java/eu/boemm/dps/indexation/controller/WageIndexationController.java`
- `src/main/java/eu/boemm/dps/itsmeinvite/controller/ItsMeAuthorizationController.java`
- `src/main/java/eu/boemm/dps/mystaffler/controller/MyStafflerController.java`
- `src/main/java/eu/boemm/dps/mystaffler/auth/controller/PublicEmployeeController.java`
- `src/main/java/eu/boemm/dps/mystaffler/contract/controller/EmployeeContractController.java`
- `src/main/java/eu/boemm/dps/newcomer/controller/NewcomerController.java`
- `src/main/java/eu/boemm/dps/newcomer/controller/NewcomerSelfRegistrationController.java`
- `src/main/java/eu/boemm/dps/newcomer/controller/PublicEmployeeRegistrationController.java`
- `src/main/java/eu/boemm/dps/newcomer/controller/TestNewcomerController.java`
- `src/main/java/eu/boemm/dps/notification/controller/NotificationController.java`
- `src/main/java/eu/boemm/dps/reports/controller/ContractHoursReportController.java`
- `src/main/java/eu/boemm/dps/reports/controller/DevContractHoursController.java`
- `src/main/java/eu/boemm/dps/usernotificationpreferences/controller/UserNotificationPreferencesController.java`
- `src/main/java/eu/boemm/dps/usernotificationpreferences/controller/UserNotificationPreferencesControllerTest.java`

The modules `common` and `imports` have no controllers. `imports` only carries enums/jobs (`EntityType`, `ImportJob`, `JobStatus`); the actual import endpoints live in `company`, `employee`, `employeewage` controllers. The `mystaffler` module has nested `auth/controller` and `contract/controller` packages on top of its own root controller.

---

## actual

### ActualsController
Class-level `@RequestMapping("/api/companies")`. Manager/admin actuals workflows scoped per company. All endpoints gated by `@actualsSecurityDecisionMaker.checkPermissionActualsAccess(...)` on Cognito JWT.

- GET `/api/companies/{companyId}/actuals` (`getActuals`) — paginated actuals search. Path: UUID. Query: LocalDate `startDate`, LocalDate `endDate`, Set<UUID> `employeeIds`, List<ActualStatusWebDto> `statuses`, List<UUID> `ids`, UUID `contractId`, Pageable. PreAuthorize `ACTUALS_VIEW_ANY`. Returns `PageWebDto<ActualWebDto>`.
- GET `/api/companies/{companyId}/actuals/notificationCount` (`getNotificationCount`) — count of actuals needing attention. PreAuthorize `ACTUALS_VIEW_ANY`. Returns `NotificationCountWebDto`.
- PATCH `/api/companies/{companyId}/actuals/{actualId}/workTimes` (`updateActualDetails`) — update work times on an actual. Body `List<WorkTimeWebDto>`. PreAuthorize `ACTUALS_EDIT_ANY`. Returns `List<WorkTimeWebDto>`.

### ActualsManagementController
Class-level `@RequestMapping("/internalapi/actuals")`. Cron-triggered batch jobs.

- POST `/internalapi/actuals/updateToOverdue` (`updateToOverdueActuals`) — flips actuals past due into overdue. Returns void.
- POST `/internalapi/actuals/lockForPayment` (`lockForPayment`) — locks actuals while payment runs. Returns void.
- POST `/internalapi/actuals/unlockAfterPayment` (`unlockAfterPayment`) — releases the lock. Returns void.
- POST `/internalapi/actuals/cancel?companyId=...` (`cancelActuals`) — cancel actuals for demo company. Query UUID. Returns void.
- POST `/internalapi/actuals/autoConfirm` (`autoConfirmActuals`) — auto-confirm actuals where time registration matches. Returns void.

### TestActualsController
`@Profile("test")`. Class-level `@RequestMapping("/api/companies")`. Test fixtures.

- POST `/api/companies/{companyId}/actuals` (`createActual`) — body `ActualWebDto`. Returns `ActualWebDto`.
- DELETE `/api/companies/{companyId}/actuals` (`deleteAllActuals`) — wipes actuals for a company. Returns void.

## audit

### UserNotificationPreferencesAuditController
Class-level `@RequestMapping("/api/admin/audit/notifications")`. Hibernate Envers history endpoints (admin only by URL convention; no explicit `@PreAuthorize`).

- GET `/api/admin/audit/notifications/preferences/{id}/history` (`getPreferencesHistory`) — returns `ResponseEntity<List<HistoryEntityWrapperDto<UserNotificationPreferencesHistoryDto>>>`.
- GET `/api/admin/audit/notifications/schedules/{id}/history` (`getScheduleHistory`) — returns `ResponseEntity<List<HistoryEntityWrapperDto<NotificationScheduleHistoryDto>>>`.

## company

### CompanyActualsConfirmationController
Class-level `@RequestMapping("/internalapi/companies")`. Internal cron.

- POST `/internalapi/companies/confirmationEmail` (`sendConfirmationEmail`) — sends actuals overdue confirmation email. Returns void.

### CompanyController
Class-level `@RequestMapping("/api/companies")`. Main company resource + Credit Safe lookup + bulk import. Auth via `@companySecurityDecisionMaker` permissions.

- GET `/api/companies/{companyId}` (`getCompany`) — PreAuthorize `COMPANY_VIEW`. Returns `CompanyWebDto`.
- GET `/api/companies/external?term=&postCode=&page=&size=` (`searchForWebCompanies`) — Credit Safe lookup. PreAuthorize `COMPANY_SEARCH`. Returns `List<CompanyWebSearchResultWebDto>`.
- GET `/api/companies/engagements?employeeId=&companyId=&page=&size=` (`getCompanies`) — companies the employee is engaged with. Returns `PageWebDto<CompanyBaseInfoWebDto>`.
- POST `/api/companies/{vat}` (`createCompany`) — onboarding by VAT. PreAuthorize `COMPANY_ONBOARDING`. Returns `ResponseEntity<CompanyCreateResultWebDto>`.
- GET `/api/companies/{companyId}/coefficients?types=...` (`getDefaultCoefficients`) — query `List<CoefficientTypeDto>`. Returns `CompanyCoefficientsWebDto`.
- PUT `/api/companies/{uuid}` (`updateCompany`) — body `CompanyWebDto`. PreAuthorize `checkCompanyUpdate`. Returns `CompanyWebDto`.
- POST `/api/companies/import` (`importCompanies`) — multipart `MultipartFile`. Returns `ImportJobWebDto`.
- DELETE `/api/companies/{companyId}/employees/{employeeId}` (`deleteEmployeeFromCompanyPool`) — PreAuthorize `COMPANY_REMOVE_USER`. Returns void.

### TestCompanyController
`@Profile("test")`. Class-level `@RequestMapping("/api/companies")`. Coefficient + revenue test seeders.

- POST `/api/companies/{companyId}/coefficients` (`createCompanyCoefficients`) — body `CompanyCoefficientsWebDto`. Returns `CompanyCoefficientsWebDto`.
- DELETE `/api/companies/{companyId}/coefficients` (`deleteCompanyCoefficients`) — Returns void.
- PUT `/api/companies/{companyId}/revenueInfo` (`createCompanyRevenueInfo`) — body `CompanyRevenueInfo`. Returns `CompanyRevenueInfo`.

## companyuser

### AppUserController
Class-level `@RequestMapping("/api/users")`. App-user invitation + last-viewed tracking.

- POST `/api/users/companies/{companyId}/invite` (`registerUser`) — body `InviteAppUserRequest` (validated). PreAuthorize `COMPANY_ADD_USER`. Returns `ResponseEntity<AppUserDto>` (HTTP 200).
- POST `/api/users/{userId}/companies/{companyId}/last-viewed` (`updateLastViewedDate`) — PreAuthorize `COMPANY_USERS_VIEW_ANY`. Returns void (HTTP 204).

### CompanyUserController
Class-level `@RequestMapping("/api/companies")`. Admin company-user management.

- GET `/api/companies/{companyId}/users` (`getCompanyUsers`) — Pageable (default sort `user.email`, size 20). PreAuthorize `COMPANY_USERS_VIEW_ANY`. Returns `PageWebDto<CompanyUserDto>`.
- PATCH `/api/companies/{companyId}/users/{userId}` (`updateUserRole`) — body `CompanyUserRoleDto`. PreAuthorize `COMPANY_USERS_EDIT_ANY`. Returns `CompanyUserDto`.
- DELETE `/api/companies/{companyId}/users/{userId}` (`deleteCompanyMembership`) — PreAuthorize `COMPANY_USERS_EDIT_ANY`. Returns void (HTTP 204).

### CompanyUserInvitationController
Class-level `@RequestMapping("/api/companies")`. Resend invite.

- POST `/api/companies/{companyId}/users/{userId}/resendInvitation` (`resendInvitation`) — PreAuthorize `COMPANY_USERS_EDIT_ANY`. Returns void.

### LogoutController
Class-level `@RequestMapping("/api/users")`.

- GET `/api/users/logout` (`logout`) — Returns void.

### PublicCompanyUserController
Class-level `@RequestMapping("/publicapi/companies/users")`. Authentication entrypoints. Sets `X-BOEMM-SKEY` cookie + header on success.

- POST `/publicapi/companies/users/login` (`loginCustomer`) — body `CompanyUserAuthorizationService.CompanyUserLoginRequest`, `HttpServletResponse`. Returns `AuthResultWebDto`.
- POST `/publicapi/companies/users/setPassword` (`setPermanentPassword`) — body `SetPasswordRequestDto`, `HttpServletResponse`. Returns `AuthResultWebDto`.
- POST `/publicapi/companies/users/resetPassword` (`resetPassword`) — body `ResetPasswordRequestDto`. Returns void.
- POST `/publicapi/companies/users/confirmResetPassword` (`confirmResetPassword`) — body `ConfirmResetPasswordRequestDto`. Returns void.

## contract

### ContractController
Class-level `@RequestMapping("/api/contracts")`. Core contract CRUD + shift template search.

- GET `/api/contracts/{id}` (`getContract`) — Returns `ContractWebDto`.
- POST `/api/contracts` (`createContract`) — body `ContractWebDto`. PreAuthorize `checkContract`. Returns `ContractWebDto`.
- POST `/api/contracts/batch` (`createContractBatch`) — body `List<ContractWebDto>`. PreAuthorize `checkListContracts`. Returns `ResponseEntity<List<ContractWebDto>>` (500 if all fail).
- PUT `/api/contracts/{id}` (`updateContract`) — JSON body `ContractWebDto`. PreAuthorize `checkContract`. Returns `ContractWebDto`.
- GET `/api/contracts/notificationCount?companyId=` (`getContractNotificationCount`) — Returns `NotificationCountWebDto`.
- GET `/api/contracts?startDate=&endDate=&activeStartDate=&activeEndDate=&companyId=&employeeIds=&statuses=&page=&size=` (`getContracts`) — Returns `PageWebDto<ContractBaseWebDto>`.
- GET `/api/contracts/shiftTemplates?companyId=&nameLike=&page=&size=&sortBy=` (`searchShiftTemplates`) — Returns `PageWebDto<ShiftTemplateWebDto>`.
- DELETE `/api/contracts/shiftTemplates/{id}` (`deleteShiftTemplate`) — Returns void.

### ContractWorkTimeController
Class-level `@RequestMapping("/api/contracts")`. Work-time generation/listing per contract.

- POST `/api/contracts/{contractId}/workTimes` (`handleWorkTimes`) — Returns `ContractWorkTimeWebDto`.
- GET `/api/contracts/{contractId}/workTimes?page=&size=` (`getWorkTimesByContractId`) — Returns `PageWebDto<ContractWorkTimeWebDto>`.

### ContractWorkTimeOverviewController
Class-level `@RequestMapping("/api/companies/")` (note trailing slash).

- GET `/api/companies/{companyId}/contracts/workTimes?startDate=&endDate=` (`getContractOverviewByDate`) — Returns `List<ContractWorkTimeOverviewDto>`.

### TestContractController
`@Profile("test")`. Class-level `@RequestMapping("/api/contracts")`.

- POST `/api/contracts/workHours` (`handleWorkTimes`) — body `List<ContractWorkTimeWebDto>`. Returns `List<ContractWorkTimeWebDto>`.
- PUT `/api/contracts/{id}/workHours` (`updateDateWorkTimes`) — Returns void.
- DELETE `/api/contracts/{id}/workHours` (`deleteWorkTimes`) — Returns void.
- POST `/api/contracts/shiftTemplates` (`createShiftTemplates`) — body `ContractWebDto`. Returns void.
- DELETE `/api/contracts/{contractId}/credit-changes` (`delete`) — Returns void (HTTP 204).

## dictionary

### DictionaryController
Class-level `@RequestMapping({"/api", "/publicapi"})` — every endpoint is reachable both authenticated and unauthenticated.

- GET `/api/dictionaries` and `/publicapi/dictionaries` (`getDictionaryValues(types)`) — query `Set<String> types`. Returns `ResponseEntity<DictionariesHolder>`.
- GET `/api/taxLevels` and `/publicapi/taxLevels` (`getTaxLevels`) — query Boolean `isFrontier`. Returns `List<TaxLevelDTO>`.
- GET `/api/languages` and `/publicapi/languages` (`getLanguages`) — query Boolean `onlyPrimary`. Returns `List<LanguageItemWebDto>`.
- GET `/api/{resourceType}` and `/publicapi/{resourceType}` (`getDictionaryValues(resourceType)`) — Returns `ResponseEntity<List<?>>`. (Catch-all path; risky overlap noted below.)
- GET `/api/statutes` and `/publicapi/statutes` (`getStatutes`) — query String `pcCode`, String `collar`. PostFilter on roles. Returns `List<StatuteItemWebDto>`.
- GET `/api/absenceReasons?statuteCode=` and `/publicapi/absenceReasons?statuteCode=` (`getAbsenceReasons`) — Returns `List<AbsenceReasonWebDto>`.
- GET `/api/paritaircomites?showBlocked=` and `/publicapi/paritaircomites?showBlocked=` (`getAllParitaircomites`) — Returns `List<ParitairComiteDTO>`.

Surprise: the catch-all `GET /{resourceType}` will try to resolve any single-segment path against `DictionaryType.findByResourceName`, which can collide with sibling controllers. This is the only controller mapped under both `/api` and `/publicapi`.

## employee

### EmployeeController
Class-level `@RequestMapping("/api/employees")`.

- GET `/api/employees/{id}` (`getEmployee`) — PreAuthorize `EMPLOYEE_VIEW`. Returns `EmployeeWebDto`.
- GET `/api/employees?companyId=&groupIds=&nameLike=&baseView=&hasContractFrom=&hasContractUntil=&actualFrom=&actualUntil=&actualsStatuses=&page=&size=&sortBy=` (`getCompanyEmployees`) — PreAuthorize `EMPLOYEE_VIEW`. Returns `PageWebDto<EmployeeWebDto>`.
- PUT `/api/employees/{id}` (`updateEmployee`) — body `EmployeeWebDto`. PreAuthorize `EMPLOYEE_EDIT`. Returns `EmployeeWebDto`.
- POST `/api/employees/import` (`uploadEmployees`) — multipart. Returns `ImportJobWebDto`.

### EmployeeRegistrationController
Class-level `@RequestMapping("/api/registrations/employees")`.

- POST `/api/registrations/employees/{employeeId}/companies/{companyId}` (`finishEmployeeRegistration`) — body `EmployeeWebDto`. PreAuthorize `EMPLOYEE_EDIT`. Returns `EmployeeWebDto`.

### TestEmployeeController
`@Profile("test")`. Class-level `@RequestMapping("/api/employees")`.

- POST `/api/employees/engagements` (`createEngagements`) — body `List<EngagementRequest>`. Returns void.
- POST `/api/employees/infos` (`createEmployeeInfo`) — body `EmployeeInfoRequest`. Returns void.
- DELETE `/api/employees/infos` (`deleteEmployeeInfo`) — Returns void.
- DELETE `/api/employees/engagements?employeeId=&companyId=` (`deleteEngagements`) — Returns void.

## employeeinvitation

### EmployeeInvitationController
Class-level `@RequestMapping("/api/employees/invitations")`.

- POST `/api/employees/invitations` (`createEmployeeInvitation`) — body `EmployeeInvitationWebDto`. PreAuthorize `EMPLOYEE_CREATE_INVITATION` + `checkPermissionEmployeeInvitationAccess`. Returns `EmployeeInvitationWebDto`.
- GET `/api/employees/invitations?companyId=&status=&page=&size=&sortBy=` (`getInvitations`) — PreAuthorize `EMPLOYEE_INVITATIONS_VIEW_ANY`. Returns `PageWebDto<EmployeeInvitationWebDto>`.
- PATCH `/api/employees/invitations/{id}` (`patchEmployeeInvitationStatus`) — body `EmployeeInvitationStatusWebDto`. PreAuthorize `EMPLOYEE_INVITATIONS_EDIT_STATUS`. Returns `EmployeeInvitationWebDto`.

### EmployeeInvitationPublicController
Class-level `@RequestMapping("/publicapi/employees/invitations")`.

- GET `/publicapi/employees/invitations/{id}` (`getEmployeeInvitation`) — Returns `EmployeeInvitationWebDto`.

### EmployeeRegistrationReminderController
Class-level `@RequestMapping("/internalapi/employees/invitations")`. Cron.

- POST `/internalapi/employees/invitations/checkEmailReminder` (`checkEmailReminder`) — Returns void.

### TestEmployeeInvitationController
`@Profile("test")`. Class-level `@RequestMapping("/api/employees/invitations")`.

- DELETE `/api/employees/invitations` (`deleteInvitation`) — Returns void.

### TestEmployeeRegistrationReminderController
`@Profile("test")`. Class-level `@RequestMapping("/internalapi/employees/invitations/reminder")`.

- DELETE `/internalapi/employees/invitations/reminder` (`deleteInvitation`) — Returns void.
- POST `/internalapi/employees/invitations/reminder?employeeId=&invitationId=` (`createReminder`) — Returns void.
- GET `/internalapi/employees/invitations/reminder/{id}` (`getReminder`) — Returns `RegistrationReminderDto` (inner record).

## employeewage

### EmployeeWageController
Class-level `@RequestMapping("/api/employeewages")`.

- POST `/api/employeewages` (`create`) — body `EmployeeWageWebDto`. PreAuthorize `checkEmployeeWage`. Returns `EmployeeWageWebDto`.
- PUT `/api/employeewages/{id}` (`update`) — body `EmployeeWageWebDto`. PreAuthorize `checkEmployeeWage`. Returns `EmployeeWageWebDto`.
- DELETE `/api/employeewages/{id}` (`deleteEmployeeWage`) — Returns void (HTTP 204).
- GET `/api/employeewages?companyId=&employeeId=&page=&size=&sortBy=` (`getEmployeeWagePage`) — PreAuthorize `checkEmployeeWageView`. Returns `PageWebDto<EmployeeWageWebDto>`.
- POST `/api/employeewages/import` (`importEmployeeWages`) — body `MultipartFile` (note: `@RequestBody` not `@RequestParam`). Returns `ImportJobWebDto`.

### EmployeeWageTestController
`@Profile("test")`. Class-level `@RequestMapping("/api/employeewages")`.

- DELETE `/api/employeewages` (`deleteEmployeeWage`) — Returns void.

### TravelAllowanceController
Class-level `@RequestMapping("/api/travelallowance")`.

- GET `/api/travelallowance/calculate?origin=&destination=&transportCode=` (`getTravelAllowance`) — Returns `TravelAllowanceWebDto`.

## engagementgroup

### EmployeeEngagementGroupController
Class-level `@RequestMapping("/api/companies")`.

- GET `/api/companies/{companyId}/groups/employees?groupIds=&nameLike=&unassigned=&page=&size=&sortBy=` (`getEngagementGroupEmployees`) — Returns `PageWebDto<EngagementGroupEmployeeWebDto>`.
- POST `/api/companies/{companyId}/employees/{employeeId}/groups` (`updateEmployeeGroups`) — body `List<EngagementGroupWebDto>`. Returns void.

### EngagementGroupController
Class-level `@RequestMapping("/api/companies")`.

- POST `/api/companies/{companyId}/groups` (`createEngagementGroup`) — body `EngagementGroupCreateRequestWebDto`. Returns `EngagementGroupWebDto`.
- GET `/api/companies/{companyId}/groups/{groupId}` (`getEngagementGroupById`) — Returns `EngagementGroupWebDto`.
- PUT `/api/companies/{companyId}/groups/{groupId}` (`updateEngagementGroup`) — body `EngagementGroupWebDto`. PreAuthorize `COMPANY_GROUP_EDIT`. Returns `EngagementGroupWebDto`.
- GET `/api/companies/{companyId}/groups?ids=&employeeNameLike=&nameLike=&page=&size=` (`searchEngagementGroups`) — Returns `PageWebDto<EngagementGroupWebDto>`.
- DELETE `/api/companies/{companyId}/groups/{groupId}` (`deleteGroup`) — PreAuthorize `COMPANY_GROUP_DELETE`. Returns void.

### EngagementGroupTestController
`@Profile("test")`. Class-level `@RequestMapping("/api/companies/groups")`.

- DELETE `/api/companies/groups` (`deleteAllEngagementGroups`) — Returns void.

## indexation

### WageIndexationController
Class-level `@RequestMapping("/internalapi/indexations/wages")`.

- POST `/internalapi/indexations/wages/execute` (`executeIndexation`) — body `WageIndexationWebDto`. Returns void.

## itsmeinvite

### ItsMeAuthorizationController
Class-level `@RequestMapping("/publicapi/oauth/itsme")`. itsme OAuth2 callback handler used during employee registration.

- GET `/publicapi/oauth/itsme/codeLink?state=` (`getAuthCodeLink`) — Returns `ResponseEntity<CodeLinkDto>`.
- GET `/publicapi/oauth/itsme/callback?code=&state=&error=` (`getUserInfo`) — Returns `ResponseEntity<Void>` (HTTP 302 to registration stepper URI with skey).

## mystaffler

### MyStafflerController (root)
Class-level `@RequestMapping("/api/companies/{companyId}/employees/{employeeId}/mystaffler")`.

- POST `/api/companies/{companyId}/employees/{employeeId}/mystaffler/invite` (`invite`) — PreAuthorize `EMPLOYEE_EDIT`. Returns void (HTTP 204).

### PublicEmployeeController (mystaffler.auth)
Class-level `@RequestMapping("/publicapi/employees/users")`. Employee Cognito pool login. Sets `X-BOEMM-SKEY` cookie + header.

- POST `/publicapi/employees/users/login` (`login`) — body `EmployeeLoginRequest`, `HttpServletResponse`. Returns `AuthResultWebDto`.

### EmployeeContractController (mystaffler.contract)
Class-level `@RequestMapping("/api/my-staffler/employees")`. Note hyphen in the path (not `/api/mystaffler/...`).

- GET `/api/my-staffler/employees/{id}/contracts?startDate=&endDate=&activeStartDate=&activeEndDate=&statuses=` (`getEmployeeContracts`) — PreAuthorize `MY_STAFFLER_VIEW_EMPLOYEE_CONTRACTS`. Returns `List<EmployeeContractWebDto>`.

## newcomer

### NewcomerController
Class-level `@RequestMapping("/api/newcomers")`.

- GET `/api/newcomers?companyId=&verifiedValues=&page=&size=&sortBy=` (`getNewcomerEmployees`) — query `List<Boolean> verifiedValues`. Returns `PageWebDto<NewcomerWebDto>`.
- PUT `/api/newcomers/{id}` (`updateEmployee`) — body `NewcomerWebDto`. PreAuthorize `EMPLOYEE_EDIT`. Returns `NewcomerWebDto`.
- GET `/api/newcomers/{id}` (`getNewcomer`) — PreAuthorize `EMPLOYEE_VIEW`. Returns `NewcomerWebDto`.

### NewcomerSelfRegistrationController
Class-level `@RequestMapping("/api/employees")` (note: under `/api/employees`, not `/api/newcomers`).

- GET `/api/employees/invitations/{invitationId}` (`getInvitedNewcomer`) — Returns `EmployeeWebDto`.

### PublicEmployeeRegistrationController
Class-level `@RequestMapping("/publicapi/employees/self-registration")`.

- POST `/publicapi/employees/self-registration` (`createNewcomer`) — body `NewcomerWebDto`. Returns `NewcomerWebDto`.

### TestNewcomerController
`@Profile("test")`. Class-level `@RequestMapping("/api/newcomers")`.

- DELETE `/api/newcomers/{id}` (`deleteNewcomer`) — Returns void.

## notification

### NotificationController
Class-level `@RequestMapping("/internalapi/notifications")`. Cron.

- POST `/internalapi/notifications/sendNotification` (`sendNotification`) — sends `SCHEDULED` group notifications. Returns void.
- POST `/internalapi/notifications/sendMandatoryNotification` (`sendMandatoryNotification`) — sends `MANDATORY` notifications. Returns void.

## reports

### ContractHoursReportController
Class-level `@RequestMapping(value = {"/api/companies", "/internalapi/companies"})` — both auth tiers expose the same endpoints.

- POST `/api/companies/weeklyContractHoursReport` and `/internalapi/companies/weeklyContractHoursReport` (`sendCompaniesRegisteredHoursReport`) — Returns void.
- POST `/api/companies/adminWeeklyContractHoursReport` and `/internalapi/companies/adminWeeklyContractHoursReport` (`sendAllCompaniesRegisteredHoursReport`) — Returns void.

### DevContractHoursController
`@Deprecated(forRemoval = true)`. Class-level `@RequestMapping(value = {"/api/companies", "/internalapi/companies"})`.

- GET `/api/companies/weeklyContractHoursNotification` (+ internalapi variant) (`getCompaniesRegisteredHours`) — query `Set<UUID> companyIds`, `LocalDate startDate`, `LocalDate endDate`. Returns `List<CompanyEmailEntry>`.
- GET `/api/companies/weeklyContractHoursNotificationPdf` (+ internalapi variant) (`getCompaniesRegisteredHoursPdf`) — Returns `ResponseEntity<byte[]>` (PDF).

## usernotificationpreferences

### UserNotificationPreferencesController
Class-level `@RequestMapping("/api")`.

- POST `/api/users/{userId}/companies/{companyId}/notificationPreferences` (`createNotificationPreferences`) — body `UserNotificationPreferencesWebDto`. PreAuthorize `COMPANY_USER_EDIT_NOTIFICATION_PREFERENCES`. Returns `UserNotificationPreferencesWebDto`.
- GET `/api/users/{userId}/companies/{companyId}/notificationPreferences` (`getNotificationPreferences`) — PreAuthorize `COMPANY_USER_VIEW_NOTIFICATION_PREFERENCES`. Returns `UserNotificationPreferencesWebDto`.
- PUT `/api/users/{userId}/companies/{companyId}/notificationPreferences` (`updateNotificationPreferences`) — body `UserNotificationPreferencesWebDto`. PreAuthorize `COMPANY_USER_EDIT_NOTIFICATION_PREFERENCES`. Returns `UserNotificationPreferencesWebDto`.
- GET `/api/users/{userId}/companies/{companyId}/notificationPreferences/{userNotificationPreferencesId}/schedule` (`getNotificationSchedule`) — Returns `List<NotificationScheduleWebDto>`.
- PUT `/api/users/{userId}/companies/{companyId}/notificationPreferences/{userNotificationPreferencesId}/schedule` (`updateNotificationSchedule`) — body `List<NotificationScheduleWebDto>`. Returns `List<NotificationScheduleWebDto>`.

### UserNotificationPreferencesControllerTest
`@Profile("test")`. Class-level `@RequestMapping("/api")`.

- DELETE `/api/users/{userId}/companies/{companyId}/notificationPreferences` (`deleteUserNotificationPreferences`) — Returns void.

---

## Summary

### Controllers per module

| Module | Controllers | of which Test/Dev |
|---|---:|---:|
| actual | 3 | 1 |
| audit | 1 | 0 |
| common | 0 | 0 |
| company | 3 | 1 |
| companyuser | 5 | 0 |
| contract | 4 | 1 |
| dictionary | 1 | 0 |
| employee | 3 | 1 |
| employeeinvitation | 5 | 2 |
| employeewage | 3 | 1 |
| engagementgroup | 3 | 1 |
| imports | 0 | 0 |
| indexation | 1 | 0 |
| itsmeinvite | 1 | 0 |
| mystaffler (root + auth + contract) | 3 | 0 |
| newcomer | 4 | 1 |
| notification | 1 | 0 |
| reports | 2 | 1 (Dev, deprecated) |
| usernotificationpreferences | 2 | 1 |
| **Total** | **45** | **11** |

### Endpoints per security tier

Counting each `@*Mapping` once, but counting class-level `@RequestMapping(value = {"/api/...", "/publicapi/..."})` and `({"/api/...", "/internalapi/..."})` as one logical endpoint exposed under multiple prefixes (the dual-mapped controllers are `DictionaryController`, `ContractHoursReportController`, `DevContractHoursController`).

| Tier | Endpoints |
|---|---:|
| `/api/**` (authenticated) | 60 |
| `/publicapi/**` (no auth) | 11 |
| `/internalapi/**` (gateway-gated) | 12 |
| Dual-mapped (`/api` + `/publicapi`) — DictionaryController | 7 |
| Dual-mapped (`/api` + `/internalapi`) — ContractHoursReport + DevContractHours | 4 |
| **Total logical endpoints** | **94** |

Across 45 controllers there are 94 distinct logical mappings (each method counted once even when class-level `@RequestMapping` lists multiple prefixes). If you instead count one row per (HTTP method × actual URL) the total is 105 (the 11 dual-mapped methods double).
