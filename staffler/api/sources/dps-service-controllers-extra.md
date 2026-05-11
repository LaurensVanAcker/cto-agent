# dps-service: extra controllers in `eu/boemm/dps/common/security/controller/`

Source: `wlnob/dps-service` @ `1fc6cd30`.

## Directory listing

The directory `src/main/java/eu/boemm/dps/common/security/controller/` contains exactly ONE file:

- `UserController.java`

There are NO other files in this directory. Other controllers around `/api/users/...` live elsewhere (notably `eu/boemm/dps/companyuser/controller/AppUserController.java` and `eu/boemm/dps/companyuser/controller/LogoutController.java`).

## UserController

```java
package eu.boemm.dps.common.security.controller;

@Slf4j
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final AuthenticationService authenticationService;

    @GetMapping("/currentuser")
    public DpsUserDetailsWebDto getCurrentUserInfo() {
        return authenticationService.currentUserInfo();
    }
}
```

### Endpoints

| Method | Path | Returns | Auth |
|--------|------|---------|------|
| GET | `/api/users/currentuser` | `DpsUserDetailsWebDto` | Bearer (Cognito JWT) |

That is the ONLY endpoint exposed by this controller. It is the canonical "who am I" endpoint for the DPS frontend. Behaviour is delegated to `AuthenticationService.currentUserInfo()`, which derives the user from the SecurityContext (the JWT subject) and hydrates the membership/role data from DB.

`/api/users/me` does NOT exist on this controller.
`/api/users/{id}` does NOT exist on this controller.

If `/api/users/me` or `/api/users/{id}` are needed, they would be on `AppUserController` (in `eu/boemm/dps/companyuser/controller/`); not pulled in this slice but worth verifying. The earlier scan only saw `AppUserController` and missed this one because they live in different packages and the package name `companyuser` does not include "security".

## DpsUserDetailsWebDto

Source: `eu/boemm/dps/common/security/model/dto/DpsUserDetailsWebDto.java`.

```java
package eu.boemm.dps.common.security.model.dto;

@Value
@Jacksonized
@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class DpsUserDetailsWebDto {

    DpsUserWebDto user;
    @Builder.Default
    List<UserRole> userRoles = new ArrayList<>();
    @Builder.Default
    List<UserCompanyMembershipDto> companyMemberships = new ArrayList<>();
    UUID managedEmployeeId;
    UUID employeeId;
    @JsonIgnore
    String idpUserId;          // NOT serialised
    UUID userId;

    // helper methods (not on the wire):
    boolean hasPermission(UserPermission, UUID companyId);
    boolean hasPermission(UserPermission);
    boolean hasRole(List<UserRole>, UUID companyId);
    boolean hasRole(List<UserRole>);
    boolean hasCompanyAccess(UUID companyId);
    boolean hasCompanyAccess(List<UUID> companyIds);
    List<UserRole> resolveUserRoles(UUID companyId);
}
```

### Fields on the wire

| Field | Type | Notes |
|-------|------|-------|
| user | DpsUserWebDto | nested object, see below |
| userRoles | List<UserRole> | global / cross-company roles; enum |
| companyMemberships | List<UserCompanyMembershipDto> | per-company role bindings |
| managedEmployeeId | UUID | populated when this user manages a single employee account (proxy login) |
| employeeId | UUID | populated when this user IS an employee |
| userId | UUID | DPS-internal user PK (NOT the Cognito sub) |
| idpUserId | String | `@JsonIgnore` — Cognito sub, deliberately not exposed to the FE |

### DpsUserWebDto (nested)

Source: `eu/boemm/dps/common/security/model/dto/DpsUserWebDto.java`.

```java
@Value
@Jacksonized
@Builder(toBuilder = true)
@JsonIgnoreProperties
public class DpsUserWebDto {
    String id;       // String, not UUID — beware
    String email;
    String name;
}
```

Three fields only. `id` is typed as String here while the parent's `userId` is `UUID`. They are the same value semantically; the String form is what the legacy clients expected.

### UserCompanyMembershipDto (referenced)

Not pulled in this slice — lives in `eu/boemm/dps/companyuser/model/dto/UserCompanyMembershipDto.java`. Known accessors used here: `companyId(): UUID`, `role(): UserRole`. Worth a separate pull if the PoC needs the full shape.

### UserRole / UserPermission (enums, referenced)

Both in `eu/boemm/dps/common/security/model/role/`. Not pulled here. `hasPermission` derives from role-permission mapping inside `UserRole.hasPermission(permission)`.

## What `/api/users/currentuser` returns in practice

A roughly:

```json
{
  "user": { "id": "<uuid-as-string>", "email": "...", "name": "..." },
  "userRoles": ["ADMIN", "..."],
  "companyMemberships": [
    { "companyId": "<uuid>", "role": "PLANNER" }
  ],
  "managedEmployeeId": "<uuid|null>",
  "employeeId": "<uuid|null>",
  "userId": "<uuid>"
}
```

(`idpUserId` is dropped by `@JsonIgnore`.)
