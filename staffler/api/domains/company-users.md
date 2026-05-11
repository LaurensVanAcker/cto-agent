# Domain: Company Users (admin gebruikers per bedrijf)

## Wat is een Company User

Iemand die via Staffler admin app inlogt voor één Company. NIET dezelfde als Employee. Een "Company User" is bv. een HR-medewerker of zaakvoerder die contracten bekijkt en goedkeurt. Per gebruiker kan rol verschillen (`CustomerRole`).

`CustomerRole`:
- `COMPANY_USER` ziet alles binnen het bedrijf
- `GROUP_USER` is gefilterd tot een set Engagement Groups

Internal roles (alleen voor BOEMM-medewerkers): `SUPER_ADMIN`, `SALES_ADMIN`, `FULL_ADMIN`, `PAYROLL_ADMIN`, `DPS_DIRECTOR`, `DPS_SALES`, `CREDIT_CONTROLLER`, `PREVENTION_ADVISOR`, `RECRUITER`. Confluence: 2924773378 (DPS: Types of company users), 2892365825 (Roles and rights), 2925330437 (Manage user accounts).

## Endpoints

### List + manage

```http
GET    /api/companies/{companyId}/users?page=&size=
PATCH  /api/companies/{companyId}/users/{userId}                <CompanyUserRoleDto>
DELETE /api/companies/{companyId}/users/{userId}                                      → 204
```

`PATCH` body wijzigt rol (en voor GROUP_USER ook welke groups):

```json
{
  "role": "GROUP_USER",
  "engagementGroupIds": ["<g1>", "<g2>"]
}
```

`CompanyUserDto` shape:

```
id (UUID, gelijk aan AppUserDto.id)
email (String)
firstName, lastName (String)
role (CustomerRole)
engagementGroups (List<EngagementGroupBaseInfoDto>)
status (AppUserStatus: CONFIRMED | FORCE_CHANGE_PASSWORD)
lastLoginAt (LocalDateTime)
lastViewedAt (LocalDateTime)
membershipCreatedAt (LocalDateTime)
```

Permissions:
- GET: `COMPANY_USERS_VIEW_ANY`
- PATCH/DELETE: `COMPANY_USERS_EDIT_ANY`

### Invite een nieuwe Company User

```http
POST /api/users/companies/{companyId}/invite
Content-Type: application/json

{
  "email": "...",
  "firstName": "...",
  "lastName": "...",
  "language": "NL",
  "companyId": "<companyId>",
  "role": "COMPANY_USER",
  "engagementGroupIds": []
}
```

Het ENIGE request DTO in de hele codebase met validation annotations: `InviteAppUserRequest` heeft `@NotBlank`, `@NotNull`, `@Email`. 

Permission `COMPANY_ADD_USER`. Path `companyId` MOET matchen met body `companyId` (anders 400).

Returnt `AppUserDto` (HTTP 200), inclusief de `companyMemberships` lijst.

### Resend invitation

```http
POST /api/companies/{companyId}/users/{userId}/resendInvitation
```

Permission `COMPANY_USERS_EDIT_ANY`. Returnt 200.

### Last viewed

```http
POST /api/users/{userId}/companies/{companyId}/last-viewed
```

UI-trigger om bij te houden welke company een user laatst bekeek (handig voor multi-company users die switchen). Permission `COMPANY_USERS_VIEW_ANY`. Returnt 204.

## AppUserDto shape

Bron: `sources/dps-service-dtos.md` § 1.8.

```
id (UUID)
email (String)
status (AppUserStatus)
lastLoginAt, createdAt, updatedAt (LocalDateTime)
companyMemberships (List<UserCompanyMembershipDto>)
```

`UserCompanyMembershipDto`:

```
companyId (UUID)
companyName (String)
role (CustomerRole)
engagementGroupIds (List<UUID>)
lastViewedAt (LocalDateTime)
membershipCreatedAt (LocalDateTime)
```

## Cognito interactie

Een AppUser wordt in Cognito Company-pool aangemaakt door `AppUserService.registerUser`. Inviter triggert via Cognito AdminCreateUser, dat stuurt een welcome-mail met temporary password. Bij eerste login krijgt de user `FORCE_CHANGE_PASSWORD` status en moet via `setPassword` flow (zie `auth.md`).

`custom:companyId` claim wordt gezet zodat het JWT meegeeft welk bedrijf default is. Voor multi-company users is er een UI-flow om te switchen (BCJ-18103 "Allow to switch between companies", done).

## Verwante endpoints

- Notification preferences per user-bedrijf: zie `domains/notifications-prefs.md`
- Audit van rol-wijzigingen: `GET /api/admin/audit/notifications/preferences/{id}/history` (alleen voor notification preferences, geen generieke user audit endpoint)
