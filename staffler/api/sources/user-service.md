# user-service (BOEMM internal staff/office directory)

`wlnob/user-service` (Java 11 / Spring Boot 2.2.6, Maven artifactId `eu.boemm:user-service`).
This is BOEMM's internal directory of consultants/offices, sourced from Microsoft Azure AD via Graph API. It is **not** the service that backs `/api/users/currentuser` for the Staffler/DPS frontend (that endpoint lives in `dps-service` itself, see "Diff" section below).

The service is a separate Spring Boot app:
- Context-path: `/users` (NOT `/dps-api`)
- Port: `8080`
- Database: PostgreSQL (own `userservice` DB, separate from dps)
- Behind the same internal NLB as dps-service (boemm-ecs-primary, target `/users/*` on port `8088`)
- Auth backend: Microsoft Azure AD (tenant `1e784702-5ccb-4999-81c6-b2af103badd0`), client_credentials OAuth2 to Graph API
- Inbound auth: NOT documented here as a JWT cognito-protected endpoint. The service is reachable internally by other services (dps-service uses it via `userService.uri`). It exposes the AD-synced data over plain HTTP behind the gateway.

The data model: it consumes Microsoft Graph (groups = "offices", users = staff users) and persists locally with Flyway migrations. SQS queues `dev-update-OFFICE` and `dev-update-USER` drive incremental sync. A scheduled refresh service can be triggered via the `/api/sync` endpoint.

## Tech stack and infra (from pom.xml + cfn)

- Spring Boot Parent `2.2.6.RELEASE`
- Spring Cloud `Hoxton.SR4`, Spring Security OAuth2 `2.3.5.RELEASE`
- Java 11, Lombok, MapStruct `1.3.1.Final`
- Flyway, Hibernate JPA, PostgreSQL driver
- AWS SDK (SQS), Spring Cloud AWS, Sleuth + Zipkin
- `eu.boemm:user-service-dto:0.0.33` is the wire DTO module (consumed by dps-service via `user-service-rest-client`)
- ECS Fargate (`boemm-ecs-primary`), CPU 1024, Memory 4096, AutoScaling 0..2 with `MorningUp` (Mon-Fri 04:00 UTC) and `NightlyDown` (21:00 UTC) on non-prod
- Docker image `490618042986.dkr.ecr.eu-central-1.amazonaws.com/boemm/user-service`
- ECS service-discovery name `user-service` in the boemm internal namespace; dps-service can reach it via that DNS

## Controllers

All controllers live under `eu.boemm.userservice.rest`. There are exactly four controllers and **no `currentuser` endpoint**.

### `UserRestController` — `/api/users`

```java
@RestController
@RequestMapping(path = "/api/users")
public class UserRestController {

    @GetMapping("/{id}")
    public UserDto getUser(@PathVariable String id) { ... }

    @GetMapping
    public List<UserDto> getUsers(
        @RequestParam(required = false) List<String> officeIds,
        @RequestParam(required = false) Set<UserRoleDto> role,
        @RequestParam(required = false, name = "niche") Set<UserNicheDto> niche,
        @RequestParam(required = false) String email,
        @RequestParam(required = false) String name,
        @RequestParam(required = false) UserStatusDto status,
        @RequestParam(required = false) List<String> ids
    ) { ... }

    @PostMapping
    public UserDto createUser(@RequestBody UserDto user) { ... }
}
```

Combined with the context-path the wire URLs are:
- `GET  /users/api/users/{id}`
- `GET  /users/api/users` (filterable by `officeIds`, `role`, `niche`, `email`, `name`, `status`, `ids`)
- `POST /users/api/users`

### `OfficeRestController` — `/api/offices`

```java
@RestController
@RequestMapping(path = "/api/offices")
public class OfficeRestController {

    @GetMapping("/{id}")
    public OfficeDto getOffice(@PathVariable String id) { ... }

    @GetMapping("/code/{shortName}")
    public OfficeDto getOfficeByShortName(@PathVariable String shortName) { ... }

    @GetMapping
    public List<OfficeDto> getOffices(
        @RequestParam(required = false) String userId,
        @RequestParam(required = false) List<OfficeStatusDto> statuses,
        @RequestParam(required = false) List<String> ids,
        @RequestParam(required = false) List<String> shortNames,
        @RequestParam(required = false) List<String> niches,
        @RequestParam(required = false) List<NicheCompanyDto> nicheCompanies,
        @RequestParam(required = false) List<String> postalCodes,
        @RequestParam(required = false) List<LegalEntityDto> legalEntities,
        @RequestParam(required = false) Float areaRadius,
        @RequestParam(required = false) Float areaLatitude,
        @RequestParam(required = false) Float areaLongitude
    ) { ... }
}
```

Wire URLs:
- `GET /users/api/offices/{id}`
- `GET /users/api/offices/code/{shortName}`
- `GET /users/api/offices` (filterable by lots; geo-area requires all three of `areaRadius`, `areaLatitude`, `areaLongitude`)

### `SyncController` — `/api/sync`

```java
@RestController
@RequestMapping(path = "/api/sync")
public class SyncController {
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public RefreshJobScheduleResponse scheduleJob(@RequestBody RefreshJobSchedulingRequest request) { ... }

    @GetMapping("/status/{jobId}")
    public RefreshJobDto getJobStatus(@PathVariable UUID jobId) { ... }
}
```

`RefreshJobTypeDto` values: `ALL`, `OFFICE`, `USER`. For `OFFICE`/`USER` the body must include the `id`.

### `UserTestController` — `/api/users` (test profile only)

`@Profile("test")` — exposes `DELETE /api/users/{id}`. Not present in QA/prod.

### No `/publicapi/...` routes

There are no `/publicapi/users/...` routes in user-service. (`publicapi` is a dps-service convention, not used here.)

## DTOs (from `wlnob/user-service-dto` 0.0.33)

### `UserDto`

```java
package eu.boemm.userservice.dto.user;

@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonDeserialize(builder = UserDto.DTOBuilder.class)
public class UserDto {
    String id;
    UserStatusDto status;
    ZonedDateTime createdAt;
    ZonedDateTime updatedAt;

    String firstName;
    String lastName;
    String jobTitle;
    String mail;
    String mobilePhone;
    String managerId;
    String linkedEmployeeId;
    String businessPhone;
    UserNicheDto niche;

    @Builder.Default List<OrganisationDto> organisations = new ArrayList<>();
    @Builder.Default List<UserRoleDto> roles = new ArrayList<>();
    @Builder.Default List<String> primaryOfficeIds = new ArrayList<>();
    @Builder.Default List<String> followUpOfficeIds = new ArrayList<>();
}
```

`id` is the AD object id (string). `linkedEmployeeId` is the bridge to a dps-service employee.

### `OrganisationDto`

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class OrganisationDto {
    String id;
    String name;
}
```

### `OfficeDto`

```java
package eu.boemm.userservice.dto.office;

@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class OfficeDto {
    String id;
    OfficeStatusDto status;
    ZonedDateTime createdAt;
    ZonedDateTime updatedAt;
    String description;
    String telephoneNumber;
    String shortName;
    String email;
    String niche;
    NicheCompanyDto nicheCompany;
    LegalEntityDto legalEntity;
    OfficeAddressDto address;
    String managerId;
    List<String> postalCodes;
    String vdabReference;
}
```

### `OfficeAddressDto`

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class OfficeAddressDto {
    String streetNumber;
    String street;
    String formattedAddress;
    String postalCode;
    String city;
    Float latitude;
    Float longitude;
}
```

NOTE: field is `street`, NOT `streetName`. Also `postalCode` (camelCase), not `postCode`.

### Enums

```java
public enum UserRoleDto {
    UZC, ACCOUNT_MANAGER, CC, CC_ZONED, SALES_MANAGER, SALES_ADMIN,
    FULL_ADMIN, SUPER_ADMIN, RECRUITER, PAYROLL_ADMIN, PAYROLL_SALES,
    PAYROLL_MANAGEMENT, PREVENTION_ADVISOR, CREDIT_CONTROLLER,
    COMPANY_USER, EMPLOYEE_USER
}

public enum UserStatusDto { ACTIVE, INACTIVE }

public enum UserNicheDto { JFX_INDUSTRY, JFX_CONSTRUCT, WMR, PAYROLL, FALCON, DSR }

public enum OfficeStatusDto { ACTIVE, TO_OPEN, TO_REOPEN, CLOSED }

public enum LegalEntityDto { JOB_FIXERS, JOB_FIXERS_CONSTRUCT, WHITE_MOORE, DPS_NV, BOEMM_NV }

public enum NicheCompanyDto { JFX_CONSTRUCT, JFX_INDUSTRY, JFX_TECHNICAL, WMR, PAYROLL_SERVICES, JFX_FOOD, JFX_LOGISTICS }
```

### Sync DTOs

`RefreshJobTypeDto`: `ALL`, `OFFICE`, `USER`.
`RefreshJobStatusDto`, `RefreshJobDto`, `RefreshJobScheduleResponse`, `RefreshJobSchedulingRequest` exist under `eu.boemm.userservice.rest.dto`.

## Auth model

The user-service does NOT enforce the same Cognito JWT that the public Staffler/DPS frontend uses. From the codebase:

- Inbound: no Spring Security filter chain; relies on the boemm internal NLB / VPC for isolation. Other services call it via service-discovery DNS `user-service.{env}.boemm.local` on port 8080 (path `/users/...`).
- Outbound: `OAuth2RestTemplate` with `client_credentials` against `login.microsoftonline.com/1e784702-5ccb-4999-81c6-b2af103badd0/oauth2/v2.0/token` (BOEMM Azure AD tenant), scope `https://graph.microsoft.com/.default`. Used to read groups (offices) and users from MS Graph.
- The `dps-service` consumes user-service via the `user-service-rest-client` dependency, internally only.

Conclusion: a public PoC client should NOT be calling user-service directly. It should call dps-service `currentuser` (which proxies to user-service inside the VPC), or whichever publicapi endpoint dps-service exposes.

## Diff with what dps-service exposes

The headline finding: **`/api/users/currentuser` is implemented by dps-service itself, not by user-service.** The dps-service `eu.boemm.dps.common.security.controller.UserController` is:

```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    private final AuthenticationService authenticationService;

    @GetMapping("/currentuser")
    public DpsUserDetailsWebDto getCurrentUserInfo() {
        return authenticationService.currentUserInfo();
    }
}
```

`AuthenticationService` is an interface in dps-service:

```java
public interface AuthenticationService {
    String APP_USER_ID = "dps-api";
    String currentUserId();
    DpsUserDetailsWebDto currentUserInfo();
}
```

The DTO returned (`DpsUserDetailsWebDto`) is also a dps-service DTO, NOT a user-service DTO:

```java
@Value @Jacksonized @Builder(toBuilder = true)
public class DpsUserDetailsWebDto {
    DpsUserWebDto user;                                        // {id, email, name}
    @Builder.Default List<UserRole> userRoles = new ArrayList<>();
    @Builder.Default List<UserCompanyMembershipDto> companyMemberships = new ArrayList<>();
    UUID managedEmployeeId;
    UUID employeeId;
    @JsonIgnore String idpUserId;
    UUID userId;
}
```

with sub-DTO

```java
public record UserCompanyMembershipDto(
    UUID id,
    UUID userId,
    UUID companyId,
    String companyName,
    LocalDateTime lastViewedAt,
    UserRole role
) {}
```

Implications for the PoC:
- The `${apiBaseUrl}/users/currentuser` call from `wlnob/dps` resolves to `https://qa.dps.boemm.eu/dps-api/api/users/currentuser` (dps-service `/dps-api` context-path), NOT to the user-service.
- The `userService.uri` setting in dps-service `application.yml` points to user-service for OTHER calls (employee lookups, office lookups, sync). The dps `currentUserInfo()` flow likely combines the JWT subject from Cognito + a user-service lookup + companyuser lookups, then returns the dps-shaped DTO.
- A PoC that needs "who am I" should call dps-service, not user-service.
- A PoC that needs office or staff data could call user-service indirectly via dps-service endpoints (or, if standing up a backend with the same VPC posture, directly via service-discovery DNS).
- Field-shape diffs: the dps frontend's mental model of "user" is `DpsUserDetailsWebDto`. The user-service's `UserDto` is unrelated and has different field names (`mail` not `email`, `firstName`/`lastName` not `name`, `id` is AD GUID string, no `userRoles`/`companyMemberships` lists).
