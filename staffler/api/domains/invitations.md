# Domain: Employee Invitations

## Wat is een Invitation

Wanneer een Company een nieuwe Employee wil toevoegen die nog niet in Staffler bestaat, stuurt ze een email-uitnodiging. Die genereert een `EmployeeInvitationWebDto` met een geheime `id` die in de mail-link zit. De employee klikt, vult zijn data in (newcomer flow), en pas dan ontstaat de echte Employee.

Confluence: 2816507907 (Invitation lifecycle), 2656010268 (Invite an employee), 2563244037 (Onboarding stepper), 2567209814 (Registration: Opening page), 2567210045 (Unhappy paths registration invite).

## Status enum (`EmployeeInvitationStatus`)

```
ACTIVE
PENDING
COMPLETED
CANCELED
EXPIRED   (deprecated, vervangen door CANCELED met reden)
```

## Endpoints (admin side)

```http
POST   /api/employees/invitations                  <EmployeeInvitationWebDto>
GET    /api/employees/invitations?companyId=&status=&page=&size=&sortBy=
PATCH  /api/employees/invitations/{id}             <EmployeeInvitationStatusWebDto>
```

Permissions:
- POST: `EMPLOYEE_CREATE_INVITATION` + `checkPermissionEmployeeInvitationAccess`
- GET: `EMPLOYEE_INVITATIONS_VIEW_ANY`
- PATCH: `EMPLOYEE_INVITATIONS_EDIT_STATUS`

## Endpoint (public side voor employee)

```http
GET /publicapi/employees/invitations/{id}
```

Geen auth nodig, alleen de geheime invitation ID werkt. Returnt `EmployeeInvitationWebDto`.

## EmployeeInvitationWebDto shape

Bron: `sources/dps-service-dtos.md` § 8.

```
id (UUID, geheim)
companyId (UUID)
companyName (String, gedupliceerd voor UI)
firstName, lastName (String)
email (String)
phoneNumber (String, +32... format na normalisatie)
language (String, "NL"|"FR"|"EN"|"DE")
status (EmployeeInvitationStatus)
expiresAt (LocalDateTime)
createdAt (LocalDateTime)
updatedAt (LocalDateTime)
companyInfo (EmployeeInvitationCompanyWebDto)
mealVoucher (InvitationMealVoucherWebDto)
travelAllowance (InvitationTravelAllowanceWebDto)
itsmeRequired (Boolean) -- als true, employee moet itsme doen
sendByItsme (Boolean) -- alternatieve link via itsme app push
nationalNumber (String, vooringevuld als itsme of import al SSN had)
```

## Re-invite

```http
POST /api/companies/{companyId}/users/{userId}/resendInvitation
```

Werkt voor company-USER invitations (admin invites), NIET voor employee invitations. Voor employee re-invite: PATCH op invitation status terug naar `ACTIVE` met nieuwe expiry, of cancel + create een nieuwe.

## Reminder cron

`EmployeeRegistrationReminderSchedule` (every 10 min) triggert `POST /internalapi/employees/invitations/checkEmailReminder` die mails uitstuurt naar nog-niet-voltooide invitations. Die cron is intern, niet voor externe trigger.

## Invitation flow voor een PoC

Voor een PoC die een nieuwe employee wil onboarden zonder volledig email-flow:

1. POST naar `/api/employees/invitations` met de employee-info
2. Backend antwoordt met `EmployeeInvitationWebDto` met de invitation ID
3. PoC kan zelf een eigen mail of in-app link genereren met die ID
4. Employee landt op een PoC-pagina, die roept `GET /publicapi/employees/invitations/{id}` om de prefill te halen
5. Employee vult aan, PoC roept `POST /publicapi/employees/self-registration` met de body als `NewcomerWebDto`

Zie ook `domains/newcomer.md`.

## itsmeRequired

Als de Company aan heeft staan dat employees verplicht via itsme moeten registreren, is `itsmeRequired = true` in de invitation. De employee MOET dan via de itsme link gaan (zie `domains/itsme.md`). Een PoC die dit wil omzeilen heeft Company-instellingen aan te passen, of een testaccount te gebruiken zonder itsmeRequired.
