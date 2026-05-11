# DPS-Service Wire-Level DTO Reference

This document captures every DTO consumed or produced by the controllers documented in `dps-service-controllers.md`. Source: `wlnob/dps-service` at commit `1fc6cd30d62ec3bba51285585483a524a22f4238` (default branch). Field names, types, validation annotations, and Jackson hints are quoted verbatim from the Java source.

Cross-cutting conventions worth knowing before reading the rest:

- Almost every WebDto is a Lombok `@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)` immutable record-like class. That means: Jackson can deserialise unknown JSON properties without throwing, and the wire shape exposes private fields as JSON properties under their Java name.
- There are essentially **no Jakarta validation annotations** on the WebDtos themselves. The only `@NotNull / @NotBlank / @Email` discovered on a request body in this pass is on `InviteAppUserRequest`. Validation is mostly enforced via `@PreAuthorize` (security) and bespoke service-layer business rules. So a PoC that posts a half-built `EmployeeWebDto` will be accepted by Jackson and rejected (or partially merged) by the service layer.
- Date / time fields use `java.time.LocalDate`, `LocalDateTime`, `LocalTime`. JSON shapes:
  - `LocalDate` → ISO `yyyy-MM-dd` (default Jackson Java time)
  - `LocalTime` → forced `HH:mm` via `@JsonFormat(shape = STRING, pattern = "HH:mm")` on every contract/actual time field
  - `LocalDateTime` → default ISO-with-T unless explicitly overridden (see `ActualWebDto.contractEndDate` which uses `"yyyy-MM-dd HH:mm:ss"`)
- Money / coefficients are `BigDecimal`. UUIDs are real `java.util.UUID` (string `"xxxx-xxxx-..."` on the wire).
- Pagination wrapper is `PageWebDto<T>` (see Generic section). Sort parameters are passed as a single `sortBy=field:asc,other:desc` string parsed by `SortingOrderParser` — they are NOT Spring's standard multi-`sort` parameters.
- Authentication: every `/api/**` endpoint expects either the company-pool Cognito JWT or the employee-pool Cognito JWT; the response of `POST /publicapi/companies/users/login` and `POST /publicapi/employees/users/login` sets `X-BOEMM-SKEY` cookie + header carrying an opaque session key (`skey`) that the gateway exchanges for the JWT.

---

## 1. Core Auth

### 1.1 `AuthResultWebDto`

Package: `eu.boemm.dps.companyuser.model.dto`. Returned by every login / setPassword endpoint (both company-user and employee pools). NOT used for reset-password (which returns `void`).

```java
@Value @Builder(toBuilder = true) @Jacksonized
public class AuthResultWebDto {
    String username;
    String session;          // populated only when authStatus = FORCE_PASSWORD_RESET
    AuthStatus authStatus;   // SUCCESS | FORCE_PASSWORD_RESET
    String skey;             // populated only when authStatus = SUCCESS

    public enum AuthStatus { SUCCESS, FORCE_PASSWORD_RESET }
}
```

Used by: `PublicCompanyUserController.loginCustomer`, `PublicCompanyUserController.setPermanentPassword`, `PublicEmployeeController.login` (mystaffler).

When `authStatus = SUCCESS`, the same value of `skey` is also sent as a cookie (`SKEY`, domain = `rootUri`, secure, max-age 4320h) and as the response header `X-BOEMM-SKEY`. When `authStatus = FORCE_PASSWORD_RESET`, only `username` and `session` are populated and the client must follow up with `POST /publicapi/companies/users/setPassword`.

### 1.2 `CompanyUserAuthorizationService.CompanyUserLoginRequest`

Inner record on `CompanyUserAuthorizationService`. Request body for `POST /publicapi/companies/users/login`.

```java
public record CompanyUserLoginRequest(String username, String password) {}
```

No validation annotations. Username is the email registered in Cognito.

### 1.3 `CompanyUserAuthorizationService.SetPasswordRequestDto`

Inner record on `CompanyUserAuthorizationService`. Body for `POST /publicapi/companies/users/setPassword`. Used to satisfy the `NEW_PASSWORD_REQUIRED` Cognito challenge.

```java
public record SetPasswordRequestDto(String session, String username, String password) {}
```

`session` is the value previously returned in `AuthResultWebDto.session`.

### 1.4 `CompanyUserAuthorizationService.ResetPasswordRequestDto`

Inner record on `CompanyUserAuthorizationService`. Body for `POST /publicapi/companies/users/resetPassword`.

```java
public record ResetPasswordRequestDto(String username) {}
```

Triggers Cognito `ForgotPassword` flow which emails a confirmation code.

### 1.5 `CompanyUserAuthorizationService.ConfirmResetPasswordRequestDto`

Inner record on `CompanyUserAuthorizationService`. Body for `POST /publicapi/companies/users/confirmResetPassword`.

```java
public record ConfirmResetPasswordRequestDto(String username, String newPassword, String confirmationCode) {}
```

### 1.6 `EmployeeAuthorizationService.EmployeeLoginRequest`

Inner record on `EmployeeAuthorizationService` (package `eu.boemm.dps.mystaffler.auth.service`). Body for `POST /publicapi/employees/users/login`.

```java
public record EmployeeLoginRequest(String username, String password) {}
```

Note: there is **no employee-pool reset password endpoint** in this commit. Forgot-password flows for employees go through the company-pool itsme registration, not Cognito ForgotPassword.

### 1.7 `CompanyUserAuthResult` (internal, Cognito-shaped)

Package: `eu.boemm.dps.companyuser.model.dto`. Internal model holding the raw Cognito tokens used to back the `skey` lookup. Not directly exposed on any endpoint, but the field naming reveals what the gateway swaps for the `X-BOEMM-SKEY` value:

```java
@Value @Builder(toBuilder = true) @Jacksonized
public class CompanyUserAuthResult {
    @JsonProperty("access_token")  String accessToken;
    @JsonProperty("id_token")      String idToken;
    @JsonProperty("refresh_token") String refreshToken;
    @JsonProperty("expires_in")    Integer expiresIn;
    @JsonProperty("token_type")    String tokenType;
}
```

### 1.8 `AppUserDto`

Package: `eu.boemm.dps.companyuser.model.dto`. Returned by `POST /api/users/companies/{companyId}/invite`.

```java
@Builder
public record AppUserDto(
    UUID id,
    String email,
    AppUserStatus status,                                 // CONFIRMED | FORCE_CHANGE_PASSWORD
    LocalDateTime lastLoginAt,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    List<UserCompanyMembershipDto> companyMemberships
) {}
```

### 1.9 `UserDto` (current-user)

Package: `eu.boemm.dps.companyuser.model.dto`. The closest thing to a "current user" projection in this commit — note there is **no GET /api/users/currentuser endpoint** in the controller inventory; this DTO is reused inside `CompanyCustomerWebDto` and is what `AppUserService` produces for `lookups`.

```java
@Builder(toBuilder = true) @Jacksonized
public record UserDto(
    UUID id,
    String email,
    AppUserStatus status,
    LocalDateTime lastLoginAt,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}
```

### 1.10 `UserCompanyMembershipDto`

Package: `eu.boemm.dps.companyuser.model.dto`. Embedded inside `AppUserDto`.

```java
@Builder
public record UserCompanyMembershipDto(
    UUID id,
    UUID userId,
    UUID companyId,
    String companyName,
    LocalDateTime lastViewedAt,
    UserRole role        // see Enums section
) {}
```

### 1.11 `InviteAppUserRequest`

Package: `eu.boemm.dps.companyuser.model.dto`. Body for `POST /api/users/companies/{companyId}/invite`. **The only WebDto in the codebase with Jakarta validation annotations.**

```java
@JsonIgnoreProperties(ignoreUnknown = true)
@Builder
public record InviteAppUserRequest(
    @NotBlank
    String companyName,
    @NotBlank @Email
    String email,
    @NotNull
    UUID companyId,
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    List<EngagementGroupWebDto> accessGroups,            // null is silently coerced to []
    @NotNull
    CustomerRole role                                    // COMPANY_USER | GROUP_USER
) {
    public InviteAppUserRequest {
        accessGroups = (accessGroups == null) ? List.of() : List.copyOf(accessGroups);
    }
}
```

### 1.12 `CompanyUserDto`

Package: `eu.boemm.dps.companyuser.model.dto`. Returned by `GET /api/companies/{companyId}/users` (paged) and `PATCH /api/companies/{companyId}/users/{userId}`.

```java
@Value @Builder(toBuilder = true) @Jacksonized
public class CompanyUserDto {
    UUID id;
    UUID companyId;
    UUID userId;
    UserRole role;                                        // SUPER_ADMIN | DPS_DIRECTOR | DPS_SALES | SALES_ADMIN | CREDIT_CONTROLLER | PREVENTION_ADVISOR | RECRUITER | FULL_ADMIN | COMPANY_USER | GROUP_USER | EMPLOYEE_USER
    String email;
    String companyName;
    AppUserStatus status;                                 // CONFIRMED | FORCE_CHANGE_PASSWORD
    LocalDateTime lastLoginAt;
    @Builder.Default
    List<EngagementGroupWebDto> accessGroups = new ArrayList<>();
}
```

### 1.13 `CompanyUserRoleDto`

Package: `eu.boemm.dps.companyuser.model.dto`. Body for `PATCH /api/companies/{companyId}/users/{userId}` — note role here is `CustomerRole` (small enum), not `UserRole` (the full DPS-internal enum), so the wire vocabulary for changing a user's company-level role is just `COMPANY_USER` or `GROUP_USER`.

```java
@Value @Builder(toBuilder = true) @Jacksonized
public class CompanyUserRoleDto {
    CustomerRole role;                                    // COMPANY_USER | GROUP_USER
    @Builder.Default
    List<EngagementGroupWebDto> accessGroups = new ArrayList<>();
}
```

---

## 2. Companies

### 2.1 `CompanyWebDto`

Package: `eu.boemm.dps.company.model.dto`. Used as both request (`PUT /api/companies/{uuid}`) and response (`GET /api/companies/{companyId}`, also created via `POST /api/companies/{vat}` indirectly through `CompanyCreateResultWebDto`). This is the canonical company resource — the same shape on read and write, no separate Create/Update DTOs.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyWebDto {
    UUID id;
    String name;
    String nickName;
    String vat;
    String vatCountryCode;
    AddressWebDto address;
    @Builder.Default
    List<DictionaryItemWebDto> paritairComites = new ArrayList<>();
    String officeCode;
    CommunicationWebDto communication;
    @Builder.Default
    List<PersonalContactWebDto> personalContacts = new ArrayList<>();
    DictionaryItemWebDto blockingReason;
    LocalDateTime blockedOn;
    String blockingExtraInfo;
    ConsultantWebDto blockedBy;
    CompanyStatusDto status;                              // ACTIVE | BLOCKED | PROCESSING
    ConsultantWebDto revenueConsultant;
    GeneralCompanyCoefficientsWebDto coefficients;
    CompanyCoefficientsPerStatuteWebDto holidayCoefficientsPerStatute;
    CompanyCoefficientsPerStatuteWebDto coefficientsPerStatute;
    CompanyInvoiceInfoWebDto companyInvoiceInfo;
    GeneralCompanyTravelAllowanceWebDto travelAllowance;
    GeneralCompanyMealVoucherWebDto mealVoucher;
    String externalService;
    String externalServiceRegNumber;
    Boolean isOnboarded;
    Boolean isTimeRegistrationEnabled;
    Boolean isGroupsEnabled;
    Boolean isActualsEnabled;
    @Builder.Default
    boolean actualsBlockEnabled = true;
    LocalDate presumedStartDate;
    DictionaryItemWebDto socialSecurityCategory;
}
```

There is **no separate `CompanyOnboardingWebDto` / `CompanyCreateWebDto`**. Onboarding goes through `POST /api/companies/{vat}` (no body) which returns `CompanyCreateResultWebDto`; the company is then progressively filled in via `PUT /api/companies/{uuid}` on the same `CompanyWebDto`.

### 2.2 `CompanyCreateResultWebDto`

Package: `eu.boemm.dps.company.model.webdto`. Returned by `POST /api/companies/{vat}`.

```java
@Value @Jacksonized @Builder(toBuilder = true)
public class CompanyCreateResultWebDto {
    UUID uuid;
    StatusWebDto status;                                  // ACTIVE | PROCESSING | BLOCKED
}
```

### 2.3 `CompanyWebSearchResultWebDto`

Package: `eu.boemm.dps.company.model.webdto`. Returned by `GET /api/companies/external` (Credit Safe lookup).

```java
@Value @Jacksonized @Builder(toBuilder = true)
public class CompanyWebSearchResultWebDto {
    String vat;
    UUID uuid;
    String companyName;
    String street;
    String city;
    Boolean isActive;
    Boolean isExisting;                                   // already in DPS DB
    StatusWebDto status;
    String formattedAddress;
    Boolean isOnboarded;
}
```

### 2.4 `CompanyBaseInfoWebDto`

Package: `eu.boemm.dps.company.model.dto`. Returned in pages by `GET /api/companies/engagements`.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyBaseInfoWebDto {
    UUID companyId;
    String companyName;
    String vat;
}
```

### 2.5 `AddressWebDto`

Package: `eu.boemm.dps.common.model`. Shared by company, contract, employee, invitation.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class AddressWebDto {
    String streetNumber;
    String street;
    String postalCode;
    String city;
    String country;
    String countryCode;
    BigDecimal latitude;
    BigDecimal longitude;
    String bus;
    String formattedAddress;
}
```

### 2.6 `CommunicationWebDto`

Package: `eu.boemm.dps.company.model.dto`. Embedded in `CompanyWebDto`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class CommunicationWebDto {
    String email;
    String phoneNumber;
    String invoicePhoneNumber;
    @Builder.Default List<String> selfServiceEmails = new ArrayList<>();
    @Builder.Default List<String> eremindersEmails = new ArrayList<>();
    @Builder.Default List<String> einvoicesEmails = new ArrayList<>();
    DictionaryItemWebDto language;
}
```

### 2.7 `PersonalContactWebDto`

Package: `eu.boemm.dps.company.model.dto`. Embedded as a list on `CompanyWebDto.personalContacts`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class PersonalContactWebDto {
    String fullName;
    String phoneNumber;
    String email;
    String position;
}
```

### 2.8 `CompanyCoefficientsWebDto`

Package: `eu.boemm.dps.company.model.dto`. Returned by `GET /api/companies/{companyId}/coefficients?types=...`.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyCoefficientsWebDto {
    UUID companyId;
    GeneralCompanyCoefficientsWebDto generalCompanyCoefficients;
    Map<CoefficientTypeDto, CompanyCoefficientsPerStatuteWebDto> generalCoefficientsPerStatute;
    Map<CoefficientTypeDto, CompanyCoefficientsPerStatuteWebDto> holidayCoefficientsPerStatute;
    CompanyInvoiceInfoWebDto companyInvoiceInfo;
    GeneralCompanyTravelAllowanceWebDto travelAllowance;
    GeneralCompanyMealVoucherWebDto mealVoucher;
}
```

### 2.9 `GeneralCompanyCoefficientsWebDto`

Package: `eu.boemm.dps.company.model.dto`.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class GeneralCompanyCoefficientsWebDto {
    BigDecimal coefficientTravelAllowance;
    BigDecimal dimonaCost;
    BigDecimal dimonaAddon;
    BigDecimal coefficientMealVouchers;
    BigDecimal coefficientEcoVouchers;
    DictionaryItemWebDto defaultTaxRate;
}
```

### 2.10 `CompanyCoefficientsPerStatuteWebDto`

Package: `eu.boemm.dps.company.model.dto`. The same DTO is reused for both holiday and general coefficient maps. Each field is the per-statute coefficient.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyCoefficientsPerStatuteWebDto {
    BigDecimal coefficientWhiteCollar;
    BigDecimal coefficientBlueCollar;
    BigDecimal coefficientWhiteCollarJobStudent;
    BigDecimal coefficientBlueCollarJobStudent;
    BigDecimal coefficientFlextimeWhiteCollar;
    BigDecimal coefficientFlextimeBlueCollar;
    BigDecimal coefficientWhiteCollarStudentWorker;
    BigDecimal coefficientBlueCollarStudentWorker;
    BigDecimal coefficientExtra;
    BigDecimal coefficientSeasonalWorker;
    BigDecimal coefficientConstructionWorker;
    BigDecimal coefficientConstructionJobStudent;
}
```

### 2.11 `CompanyInvoiceInfoWebDto`

Package: `eu.boemm.dps.company.model.dto`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyInvoiceInfoWebDto {
    @Builder.Default Boolean invoiceEcoWeekly = true;
    DictionaryItemWebDto compensationHours;
    BigDecimal companyHoursPerWeek;
    Boolean isSickInvoicingEnabled;
    Boolean holidayInvoicingEnabled;
}
```

### 2.12 `GeneralCompanyTravelAllowanceWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class GeneralCompanyTravelAllowanceWebDto {
    @Builder.Default Boolean isEnabled = false;
}
```

### 2.13 `GeneralCompanyMealVoucherWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class GeneralCompanyMealVoucherWebDto {
    BigDecimal shareEmployee;
    BigDecimal shareCompany;
    BigDecimal shareTotal;
    BigDecimal minimumHours;
    @Builder.Default Boolean isEnabled = false;
}
```

### 2.14 `CompanyCustomerWebDto`

Package: `eu.boemm.dps.company.model.dto`. Internal projection of company users (not listed in controller inventory directly but reused by `EmployeeContractController` flows).

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyCustomerWebDto {
    String companyName;
    String email;
    UUID companyId;
    @Builder.Default List<EngagementGroupWebDto> accessGroups = new ArrayList<>();
    CustomerRole role;
    UserDto user;
}
```

### 2.15 `CompanyActualsConfirmationDto`

Package: `eu.boemm.dps.company.model.dto`. Used internally by `CompanyActualsConfirmationController` to enumerate companies that need a confirmation email.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyActualsConfirmationDto {
    UUID companyId;
    String companyName;
    String vat;
    String communicationEmail;
}
```

### 2.16 `CompanyRevenueInfoStreamDto`

Package: `eu.boemm.dps.company.model.webdto`. Used by background streaming jobs (test controller path).

```java
@Value @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true) @Builder(toBuilder = true)
public class CompanyRevenueInfoStreamDto {
    UUID id;
    String name;
    String nickName;
    String vat;
    String vatCountryCode;
    String revenueConsultantId;
    LocalDate presumedStartDate;
}
```

> Note: there is **no `CompanyOfficeWebDto`, `SubofficeWebDto`, `CompanyTimeTableWebDto`, or `CompanyDocumentWebDto`** in this commit. Office data is exposed only as the bare `String officeCode` field on `CompanyWebDto` and `ContractWebDto`, and there is no document-management surface on the API. If a Confluence page promised these DTOs, they have not landed in code yet.

---

## 3. Contracts

### 3.1 `ContractWebDto`

Package: `eu.boemm.dps.contract.model.dto`. Used as both request (POST/PUT) and response on `ContractController`. Single canonical shape — no separate Create/Update DTO. Carries embedded result holder for batch responses.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractWebDto {
    UUID id;
    UUID employeeId;
    UUID companyId;
    UUID allocationId;
    String position;
    UUID parentId;
    ContractStatusWebDto status;                          // see Enums
    ContractStatusWebDto previousStatus;
    LocalDate dateFrom;
    LocalDate dateTo;
    ContractTimetableWebDto timetable;
    Boolean flexibleTimetable;                            // // todo NULL no scope (per source comment)
    String officeCode;
    ConsultantWebDto consultant;
    String revenueOfficeCode;
    ConsultantWebDto revenueConsultant;
    BigDecimal wageHour;
    DictionaryItemWebDto compensationHours;
    Boolean invoiceEcoWeekly;
    ContractEmployeeWageMealVoucherWebDto mealVoucher;
    ContractEmployeeWageTravelAllowanceWebDto travelAllowance;
    ContractInvoicingWebDto invoicing;
    AddressWebDto employmentAddress;
    DictionaryItemWebDto paritairComite;
    StatuteItemWebDto statute;
    DictionaryItemWebDto reason;
    BigDecimal employeeHoursPerWeek;
    BigDecimal companyHoursPerWeek;
    DictionaryItemWebDto cancelReason;
    String cancelExtraInfo;
    Boolean isLate;
    ContractSourceWebDto sourceType;                      // FLASH | COMPANY_FUNCTION | EAGLE | DPS
    ShiftTemplateWebDto shiftTemplate;
    MutualAgreementContractCancellationWebDto mutualAgreementContractCancellation;
    ContractBatchCreationResultWebDto result;             // populated only on POST /batch responses
    DictionaryItemWebDto socialSecurityCategory;

    // Inner static class — flat shape on the wire under "travelAllowance"
    @Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
    public static class ContractEmployeeWageTravelAllowanceWebDto {
        DictionaryItemWebDto travelAllowance;
        BigDecimal distanceKm;
        BigDecimal forfait;
        @JsonProperty("isEnabled") public Boolean isEnabled() { ... }    // derived
    }

    // Inner static class
    @Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
    public static class ContractEmployeeWageMealVoucherWebDto {
        BigDecimal minimumHours;
        BigDecimal shareEmployee;
        BigDecimal shareCompany;
        BigDecimal shareTotal;
        @JsonProperty("isEnabled") public Boolean isEnabled() { ... }    // derived
    }
}
```

There is **no separate `ContractCreateWebDto` or `ContractUpdateWebDto`** — both POST and PUT consume the same `ContractWebDto`. There is also **no `ContractCopyRequestWebDto`** in this commit (the `/api/contracts/batch` endpoint takes `List<ContractWebDto>` directly).

### 3.2 `ContractBaseWebDto`

Package: `eu.boemm.dps.contract.model.dto`. Returned by paginated `GET /api/contracts` and embedded in `ContractWorkTimeOverviewDto`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractBaseWebDto {
    UUID id;
    UUID employeeId;
    UUID companyId;
    String position;
    LocalDate dateFrom;
    LocalDate dateTo;
    ContractTimetableWebDto timetable;
    ContractStatusWebDto status;
}
```

### 3.3 `ContractTimetableWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractTimetableWebDto {
    @Builder.Default
    List<ContractTimetableDayItemWebDto> schedule = new ArrayList<>();
}
```

### 3.4 `ContractTimetableDayItemWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractTimetableDayItemWebDto {
    @EqualsAndHashCode.Exclude UUID shiftTemplateId;
    @EqualsAndHashCode.Exclude String shiftTemplateName;
    @EqualsAndHashCode.Exclude boolean createShiftTemplate;     // tells server to upsert as a template
    LocalDate date;
    @EqualsAndHashCode.Exclude DayOfWeek dayOfWeek;             // FE doesn't send this; server derives
    @JsonFormat(pattern = "HH:mm") LocalTime fromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime toTime;
    @JsonFormat(pattern = "HH:mm") LocalTime pauseFromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime pauseToTime;
    Integer changeCredit;
}
```

### 3.5 `ContractTimetableScheduleItemWebDto`

Variant used outside the `ContractTimetableWebDto` schedule (e.g. shift-template generation flows). Keyed by `dayOfWeek` instead of `date`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractTimetableScheduleItemWebDto {
    DayOfWeek dayOfWeek;
    @JsonFormat(pattern = "HH:mm") LocalTime fromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime toTime;
    Integer changeCredit;
}
```

### 3.6 `ContractTimetablePauseItemWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractTimetablePauseItemWebDto {
    DayOfWeek dayOfWeek;
    @JsonFormat(pattern = "HH:mm") LocalTime fromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime toTime;
}
```

### 3.7 `ContractWorkTimeWebDto`

Package: `eu.boemm.dps.contract.model.dto`. Used by `ContractWorkTimeController` (`POST /api/contracts/{contractId}/workTimes`, `GET /api/contracts/{contractId}/workTimes`).

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractWorkTimeWebDto {
    UUID id;
    UUID contractId;
    @JsonFormat(pattern = "HH:mm") LocalTime fromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime toTime;
    @JsonFormat(pattern = "yyyy-MM-dd") LocalDate contractDate;
    LocalDateTime createdAt;
    String status;                                        // free-form, not enum-typed on wire
}
```

### 3.8 `ContractWorkTimeOverviewDto`

Package: `eu.boemm.dps.contract.model.dto`. Used by `ContractWorkTimeOverviewController` (`GET /api/companies/{companyId}/contracts/workTimes`).

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractWorkTimeOverviewDto {
    ContractBaseWebDto contract;
    List<ContractWorkTimeWebDto> workTimes;
}
```

### 3.9 `ShiftTemplateWebDto`

Package: `eu.boemm.dps.contract.model.dto`. Returned by `GET /api/contracts/shiftTemplates` (paged) and embedded in `ContractWebDto`.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class ShiftTemplateWebDto {
    UUID id;
    String name;
    @JsonFormat(pattern = "HH:mm") LocalTime fromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime toTime;
    @JsonFormat(pattern = "HH:mm") LocalTime pauseFromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime pauseToTime;
}
```

### 3.10 `ContractInvoicingWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractInvoicingWebDto {
    BigDecimal coefficient;
    BigDecimal coefficientTravelAllowance;
    BigDecimal coefficientMealVouchers;
    BigDecimal coefficientEcoVouchers;
    BigDecimal coefficientBankHoliday;
    BigDecimal dimonaCost;
    DictionaryItemWebDto defaultTaxRate;
}
```

### 3.11 `MutualAgreementContractCancellationWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class MutualAgreementContractCancellationWebDto {
    Boolean isMutualAgreement;
    String email;
    LocalDateTime cancellationTime;
}
```

### 3.12 `ContractBatchCreationResultWebDto`

Package: `eu.boemm.dps.contract.model.dto`. Embedded in `ContractWebDto.result` and returned per-item in `POST /api/contracts/batch`. Conveys partial-failure details when batch contracts cannot be inserted atomically.

```java
@Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public record ContractBatchCreationResultWebDto(
    ContractCreationStatus status,                        // SUCCESS | ERROR
    String errorCode,
    String errorMessage
) {}
```

### 3.13 `ContractConsultantWebDto`

Package: `eu.boemm.dps.contract.model.dto`. Note: only contains `String id`. The "real" consultant DTO with first/last name lives in `eu.boemm.dps.common.user.model.webdto.ConsultantWebDto` (used by `CompanyWebDto` and `ContractWebDto`). This one looks vestigial.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractConsultantWebDto {
    String id;
}
```

---

## 4. Employees

### 4.1 `EmployeeWebDto`

Package: `eu.boemm.dps.employee.model.webdto`. Used as both request (`PUT /api/employees/{id}`, `POST /api/registrations/employees/{employeeId}/companies/{companyId}`) and response (`GET /api/employees/{id}`, paged `GET /api/employees`).

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeWebDto {
    UUID id;
    String name;
    String firstName;
    String lastName;
    String socialSecurityNumber;
    ContactWebDto contact;
    GenderWebDto gender;                                  // MALE | FEMALE | OTHER
    LocalDate dateOfBirth;
    String placeOfBirth;
    DictionaryItemWebDto countryOfBirth;
    DictionaryItemWebDto countryOfOrigin;
    EmployeeStatusWebDto status;                          // ACTIVE | BLOCKED
    Boolean isDraft;
    DictionaryItemWebDto maritalStatus;
    DictionaryItemWebDto dependentPartner;
    Integer dependentChildren;
    DictionaryItemWebDto taxLevel;
    String iban;
    StudentBalanceWebDto studentBalance;
    @Builder.Default List<ExpirableMediaWebDto> creditCardMedia = new ArrayList<>();
    @Builder.Default List<ExpirableMediaWebDto> identityMedia = new ArrayList<>();
    NewcomerInfoWebDto newcomerInfo;
    @JsonIgnore boolean registrationFlow;                 // server-side flag; never on wire
}
```

There is **no separate "short" / "long" EmployeeWebDto variant**. Pagination uses the same DTO. The "list view" filter is parameterised by `baseView=true|false` query param consumed by `EmployeeSearchFilterDto`.

### 4.2 `EmployeeSearchFilterDto`

Package: `eu.boemm.dps.employee.model.dto`. Internal projection of the `GET /api/employees` query parameters; not on the wire as a body but useful as documentation of the supported filters.

```java
@Builder(toBuilder = true) @Value
public class EmployeeSearchFilterDto {
    UUID companyId;
    String nameLike;
    Boolean isBaseView;
    List<UUID> ids;
    List<UUID> engagementGroupIds;
    LocalDate hasContractFrom;
    LocalDate hasContractUntil;
    LocalDate actualFrom;
    LocalDate actualUntil;
    Boolean unassigned;
    List<ActualStatusWebDto> actualsStatuses;
}
```

### 4.3 `ContactWebDto`

Package: `eu.boemm.dps.employee.model.webdto`. Embedded in `EmployeeWebDto.contact` and `NewcomerWebDto.contact`.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class ContactWebDto {
    UUID employeeUuid;
    Boolean esigning;
    Boolean electronicDocuments;
    AddressWebDto address;
    AddressWebDto residenceAddress;
    String email;
    String mobileNumber;
    String homeNumber;
    DictionaryItemWebDto communicationLanguage;
    Boolean hasCustomResidencyAddress;
}
```

### 4.4 `StudentBalanceWebDto`

```java
@Value @JsonIgnoreProperties(ignoreUnknown = true) @Builder(toBuilder = true) @Jacksonized
public class StudentBalanceWebDto {
    UUID employeeId;
    Integer balance;
    LocalDateTime updatedAt;
    EmployeeConsultantWebDto changedByConsultant;
    EmployeeContractWebDto changedByContract;
}
```

### 4.5 `EmployeeConsultantWebDto`

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeConsultantWebDto {
    String id;
    String firstName;
    String lastName;
}
```

### 4.6 `EmployeeContractWebDto`

Package: `eu.boemm.dps.employee.model.webdto`. Returned by `GET /api/my-staffler/employees/{id}/contracts` and embedded in `StudentBalanceWebDto`.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeContractWebDto {
    UUID id;
    UUID allocationId;
    String contractNumber;
}
```

### 4.7 `EmployeeDrivingLicenseWebDto`

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeDrivingLicenseWebDto {
    String drivingLicenseCode;
    String drivingLicenseName;
    String restrictions;
    @JsonFormat(pattern = "yyyy-MM-dd") LocalDate validUntil;
}
```

### 4.8 `EmployeeTransportWebDto`

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeTransportWebDto {
    String transportCode;
    String transportName;
    Integer radius;
}
```

### 4.9 `ImportJobWebDto`

Package: `eu.boemm.dps.employee.model.webdto`. Returned by every bulk-import endpoint (`POST /api/companies/import`, `POST /api/employees/import`, `POST /api/employeewages/import`).

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class ImportJobWebDto {
    UUID id;
    JobStatus status;                                     // NOT_STARTED | IN_PROGRESS | FINISHED | FAILED
}
```

### 4.10 `ExpirableMediaWebDto`

Package: `eu.boemm.dps.common.model`. Embedded in `EmployeeWebDto.identityMedia` / `creditCardMedia`.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class ExpirableMediaWebDto {
    MediaWebDto media;
    LocalDate validUntil;
    MediaTypeWebDto type;                                 // IDENTITY | CREDIT_CARD
}
```

### 4.11 `MediaWebDto`

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class MediaWebDto {
    String key;                                           // S3 object key
    String name;
}
```

---

## 5. Employee Wages

### 5.1 `EmployeeWageWebDto`

Package: `eu.boemm.dps.employeewage.model.webdto`. Both request (POST/PUT) and response on `EmployeeWageController`.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeWageWebDto {
    UUID id;
    UUID employeeId;
    String ssn;
    UUID allocationId;
    EmployeeWageCompanyInfoWebDto companyInfo;
    String position;
    BigDecimal wageHour;
    DictionaryItemWebDto compensationHours;
    Boolean invoiceEcoWeekly;
    EmployeeWageMealVoucherWebDto mealVoucher;
    EmployeeWageTravelAllowanceWebDto travelAllowance;
    DictionaryItemWebDto statute;
    DictionaryItemWebDto paritairComite;
    DictionaryItemWebDto reason;
    AddressWebDto employmentAddress;
    ConsultantWebDto revenueConsultant;
    String revenueOfficeCode;
}
```

### 5.2 `EmployeeWageCompanyInfoWebDto`

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeWageCompanyInfoWebDto {
    UUID companyId;
    String companyName;
    String vat;
}
```

### 5.3 `EmployeeWageMealVoucherWebDto`

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class EmployeeWageMealVoucherWebDto {
    BigDecimal minimumHours;
    BigDecimal shareEmployee;
    BigDecimal shareCompany;
    BigDecimal shareTotal;
    Boolean isEnabled;
}
```

### 5.4 `EmployeeWageTravelAllowanceWebDto`

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized @EqualsAndHashCode
public class EmployeeWageTravelAllowanceWebDto {
    DictionaryItemWebDto travelAllowance;
    BigDecimal distanceKm;
    BigDecimal forfait;
    Boolean isEnabled;
}
```

### 5.5 `TravelAllowanceWebDto`

Package: `eu.boemm.dps.employeewage.model.webdto`. Returned by `GET /api/travelallowance/calculate`.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class TravelAllowanceWebDto {
    Long distanceMeters;
    String link;
}
```

### 5.6 `DistanceDetailsWebDto`

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class DistanceDetailsWebDto {
    String origin;
    String destination;
    Long distanceMeters;
    Long durationSeconds;
    String transportCode;
}
```

---

## 6. Engagement Groups

### 6.1 `EngagementGroupWebDto`

Package: `eu.boemm.dps.engagementgroup.model.webdto`. The "lite" group reference embedded everywhere (CompanyUser, NewcomerInfo, etc.).

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class EngagementGroupWebDto {
    UUID id;
    UUID companyId;
    String name;
}
```

### 6.2 `EngagementGroupCreateRequestWebDto`

Body for `POST /api/companies/{companyId}/groups`. Embeds a tiny inner record for the employee references.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class EngagementGroupCreateRequestWebDto {
    UUID id;
    UUID companyId;
    String name;
    @Builder.Default
    List<EmployeeGroupCreateRequestWebDto> employees = new ArrayList<>();

    @Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EmployeeGroupCreateRequestWebDto {
        UUID id;
    }
}
```

### 6.3 `EngagementGroupEmployeeWebDto`

Returned (paged) by `GET /api/companies/{companyId}/groups/employees`.

```java
@Value @Builder(toBuilder = true) @Jacksonized @JsonIgnoreProperties(ignoreUnknown = true)
public class EngagementGroupEmployeeWebDto {
    UUID id;
    String firstName;
    String lastName;
    @Builder.Default List<EngagementGroupWebDto> engagementGroups = new ArrayList<>();
}
```

> Note: there is **no `EmployeeEngagementGroupWebDto`** — the controller name `EmployeeEngagementGroupController` simply reuses `EngagementGroupEmployeeWebDto` and `List<EngagementGroupWebDto>`.

---

## 7. Actuals

### 7.1 `ActualWebDto`

Package: `eu.boemm.dps.actual.model.dto`. Returned by paged `GET /api/companies/{companyId}/actuals` and accepted as body by the test-only `POST /api/companies/{companyId}/actuals`. Production endpoints **do not** accept this DTO directly — the only mutation in production is `PATCH /api/companies/{companyId}/actuals/{actualId}/workTimes` whose body is `List<WorkTimeWebDto>`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ActualWebDto {
    UUID id;
    UUID contractId;
    UUID employeeId;
    UUID companyId;
    String position;
    LocalDate dateFrom;
    LocalDate dateTo;
    String statuteCode;
    @JsonFormat(shape = STRING, pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime contractEndDate;
    @Builder.Default List<WorkTimeWebDto> workTime = new ArrayList<>();
    CompensationHours compensationHours;                  // PAID | NOT_PAID | NONE
}
```

### 7.2 `WorkTimeWebDto`

Package: `eu.boemm.dps.actual.model.dto`. The mutable unit of an actual's day. Body of `PATCH /api/companies/{companyId}/actuals/{actualId}/workTimes` is `List<WorkTimeWebDto>`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class WorkTimeWebDto {
    UUID id;
    LocalDate date;
    @JsonFormat(pattern = "HH:mm") LocalTime fromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime toTime;
    @JsonFormat(pattern = "HH:mm") LocalTime pauseFromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime pauseToTime;
    AbsenceWebDto absence;
    ActualStatusWebDto status;                            // PENDING | CONFIRMED | ABSENT | CANCELLED | OVERDUE
    boolean prefilledFromTimeRegistration;
}
```

### 7.3 `AbsenceWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class AbsenceWebDto {
    AbsenceTypeWebDto type;                               // PARTIAL | FULL
    AbsenceReasonWebDto reason;
    PartialAbsenceDetailsWebDto partialAbsenceDetails;
}
```

### 7.4 `AbsenceReasonWebDto`

Package: `eu.boemm.dps.actual.model.dto`. Also returned standalone by `GET /api/absenceReasons?statuteCode=...`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class AbsenceReasonWebDto {
    String code;
    String name;
}
```

### 7.5 `PartialAbsenceDetailsWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class PartialAbsenceDetailsWebDto {
    @JsonFormat(pattern = "HH:mm") LocalTime fromTime;
    @JsonFormat(pattern = "HH:mm") LocalTime toTime;
}
```

### 7.6 `ActualDetailsWebDto`

Internal projection (not returned directly by current controllers but used by the actuals service layer).

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ActualDetailsWebDto {
    @Builder.Default List<WorkTimeWebDto> workTime = new ArrayList<>();
    ActualStatusWebDto status;
}
```

### 7.7 `ActualSearchRequest`

Internal (`@Value @Builder` only — not Jacksonized; built from query params). Documents the supported filters of `GET /api/companies/{companyId}/actuals`.

```java
@Value @Builder(toBuilder = true)
public class ActualSearchRequest {
    @Builder.Default List<UUID> ids = new ArrayList<>();
    UUID companyId;
    @Builder.Default Set<UUID> employeeIds = new HashSet<>();
    LocalDate startDate;
    LocalDate endDate;
    @Builder.Default List<ActualStatusWebDto> statuses = new ArrayList<>();
    UUID contractId;
}
```

---

## 8. Invitations & Newcomers

### 8.1 `EmployeeInvitationWebDto`

Package: `eu.boemm.dps.employeeinvitation.model.webdto`. Body of `POST /api/employees/invitations`, body of `GET /publicapi/employees/invitations/{id}`, returned by `GET /api/employees/invitations` (paged) and `PATCH /api/employees/invitations/{id}`.

```java
@Value @Jacksonized @Builder(toBuilder = true)
public class EmployeeInvitationWebDto {
    String id;                                            // String, not UUID — invitations have a public-shareable token
    String referenceName;
    EmployeeInvitationCompanyWebDto company;
    String position;
    Boolean useMinimumWage;
    BigDecimal wageHour;
    InvitationMealVoucherWebDto mealVoucher;
    InvitationTravelAllowanceWebDto travelAllowance;
    DictionaryItemWebDto reason;
    AddressWebDto employmentAddress;
    EmployeeInvitationStatus status;                      // EXPIRED | ACTIVE | CANCELED | COMPLETED
    DictionaryItemWebDto paritairComite;
    DictionaryItemWebDto statute;
    Boolean invoiceEcoWeekly;
    LocalDateTime createdAt;
    String email;
    String oauthState;                                    // round-trip state for itsme
    @Builder.Default List<EngagementGroupWebDto> groups = new ArrayList<>();
}
```

### 8.2 `EmployeeInvitationCompanyWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class EmployeeInvitationCompanyWebDto {
    UUID id;
    String name;
    String vat;
    String vatCountryCode;
}
```

### 8.3 `EmployeeInvitationStatusWebDto`

Body of `PATCH /api/employees/invitations/{id}`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class EmployeeInvitationStatusWebDto {
    String id;
    UUID companyId;
    EmployeeInvitationStatus status;
}
```

### 8.4 `InvitationMealVoucherWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class InvitationMealVoucherWebDto {
    BigDecimal shareEmployee;
    BigDecimal shareCompany;
    BigDecimal shareTotal;
    Boolean isEnabled;
}
```

### 8.5 `InvitationTravelAllowanceWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class InvitationTravelAllowanceWebDto {
    DictionaryItemWebDto travelAllowance;
    BigDecimal distanceKm;
    BigDecimal forfait;
    Boolean isEnabled;
}
```

### 8.6 `NewcomerWebDto`

Package: `eu.boemm.dps.newcomer.model.dto`. Body of `POST /publicapi/employees/self-registration`, returned by `GET /api/newcomers/{id}`, `PUT /api/newcomers/{id}`, paged `GET /api/newcomers`. Almost identical shape to `EmployeeWebDto` — newcomers are pre-employee records pending verification.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class NewcomerWebDto {
    UUID id;
    String name;
    String firstName;
    String lastName;
    String socialSecurityNumber;
    ContactWebDto contact;
    GenderWebDto gender;
    LocalDate dateOfBirth;
    String placeOfBirth;
    DictionaryItemWebDto countryOfBirth;
    DictionaryItemWebDto countryOfOrigin;
    EmployeeStatusWebDto status;
    DictionaryItemWebDto maritalStatus;
    DictionaryItemWebDto dependentPartner;
    Integer dependentChildren;
    DictionaryItemWebDto taxLevel;
    String iban;
    StudentBalanceWebDto studentBalance;
    @Builder.Default List<ExpirableMediaWebDto> creditCardMedia = new ArrayList<>();
    @Builder.Default List<ExpirableMediaWebDto> identityMedia = new ArrayList<>();
    UUID companyId;
    String employeeInvitationId;
    boolean agreeToStatuteTerm;
    String summary;
    boolean verified;
}
```

### 8.7 `NewcomerInfoWebDto`

Package: `eu.boemm.dps.newcomer.model.dto`. Embedded as `EmployeeWebDto.newcomerInfo` to expose newcomer-flow metadata on the canonical employee resource.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class NewcomerInfoWebDto {
    UUID companyId;
    UUID newcomerId;
    boolean agreeToStatuteTerm;
    String summary;
    boolean verified;
    @Builder.Default List<EngagementGroupWebDto> groups = new ArrayList<>();
}
```

### 8.8 itsme Authorization DTOs

There is no `ItsMeAuthorizationWebDto` per se. The `/publicapi/oauth/itsme/codeLink` endpoint returns:

```java
// eu.boemm.dps.itsmeinvite.model.itsme.CodeLinkDto
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @JsonInclude(NON_NULL)
public class CodeLinkDto {
    String codeLink;                                      // URL to redirect the user-agent to
}
```

The `/publicapi/oauth/itsme/callback` endpoint returns HTTP 302 with `Location: <registrationStepperURI>?skey=...` and no JSON body. Internally the service consumes the itsme `UserInfoDto`:

```java
// eu.boemm.dps.itsmeinvite.model.itsme.UserInfoDto — internal use, never on REST
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @JsonInclude(NON_NULL)
public class UserInfoDto {
    String itsMeId;
    String eidCardNumber;
    String ssn;
    String phoneNumber;
    String email;
    @JsonFormat(pattern = "yyyy-MM-dd") LocalDate birthdayDate;
    String citizenshipIso;
    GenderDto gender;
    String placeOfBirth;
    String countryOfBirth;
    AddressDto address;
    String firstName;
    String lastName;
    LocaleDto locale;
}
```

---

## 9. Dictionary

`DictionaryController` is the only controller mapped on both `/api/**` and `/publicapi/**`. The set of supported `{resourceType}` path segments is enumerated by `DictionaryType` (in `eu.boemm.dps.dictionary.service`) and exposed via the constant `ALL_DICTIONARY_RESOURCE_NAMES_DESC`:

```
statutes,countries,languages,paritaircomites,naces,blockingreasons,
travelallowances,cancelreasons,reasons,defaulttaxrates,compensationhours,
socialsecuritycategories,transports,drivinglicenses,dependentpartners,
maritalstatuses,taxlevels
```

Mapping resourceName → response item type (from `DictionaryType.java`):

| URL segment | Response item DTO |
|---|---|
| `statutes` | `DictionaryItemWebDto` (also overridden by `/statutes` to return `StatuteItemWebDto`) |
| `countries` | `DictionaryItemWebDto` |
| `languages` | `LanguageItemWebDto` (via dedicated `/languages`) |
| `paritaircomites` | `DictionaryItemWebDto` (also `ParitairComiteDTO` from boemm-core via dedicated `/paritaircomites`) |
| `naces` | `DictionaryItemWebDto` |
| `blockingreasons` | `DictionaryItemWebDto` |
| `travelallowances` | `DictionaryItemWebDto` |
| `cancelreasons` | `DictionaryItemWebDto` |
| `reasons` | `DictionaryItemWebDto` |
| `defaulttaxrates` | `DictionaryItemWebDto` |
| `compensationhours` | `DictionaryItemWebDto` |
| `socialsecuritycategories` | `DictionaryItemWebDto` |
| `transports` | `DictionaryItemWebDto` |
| `drivinglicenses` | `DictionaryItemWebDto` |
| `dependentpartners` | `DictionaryItemWebDto` |
| `maritalstatuses` | `DictionaryItemWebDto` |
| `taxlevels` | `DictionaryItemWebDto` (also `TaxLevelDTO` from boemm-core via dedicated `/taxLevels`) |

### 9.1 `DictionaryItemWebDto`

Package: `eu.boemm.dps.common.model`. Implements `DictionaryItem`. The default shape for every dictionary single-item response.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class DictionaryItemWebDto implements DictionaryItem {
    String code;
    String name;
}
```

### 9.2 `LanguageItemWebDto`

Package: `eu.boemm.dps.dictionary.model.webdto`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class LanguageItemWebDto implements DictionaryItem {
    String code;
    String name;
    Boolean primary;
}
```

### 9.3 `StatuteItemWebDto`

Package: `eu.boemm.dps.common.model`. Returned by `GET /api/statutes` and `GET /publicapi/statutes`. Filters per role (non-admins cannot see `SEASONAL`).

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class StatuteItemWebDto implements DictionaryItem {
    String code;
    String name;
    Boolean isStudent;
    GenericStatuteItemWebDto genericStatute;
    String collar;                                        // typically "WHITE" | "BLUE" (free-form string in code)
}
```

### 9.4 `GenericStatuteItemWebDto`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class GenericStatuteItemWebDto implements DictionaryItem {
    String code;
    String name;
    @Builder.Default List<StatuteItemWebDto> statutes = new ArrayList<>();
}
```

### 9.5 `DictionariesHolder`

Returned by `GET /api/dictionaries?types=...`. The map is keyed by the resource-name string (e.g. `"statutes"`).

```java
@Value
public class DictionariesHolder {
    Map<String, List<?>> dictionaries;
}
```

### 9.6 `TaxLevelDTO` and `ParitairComiteDTO`

These two come from `eu.boemm.core.dto.employee.TaxLevelDTO` and `eu.boemm.core.dto.company.ParitairComiteDTO` respectively (boemm-core shared library, not in this repo). They are returned by `GET /api/taxLevels` and `GET /api/paritaircomites`. Treat them as black-box dictionary items unless you need to dig into the core lib.

---

## 10. Reports

### 10.1 `CompanyEmailEntry`

Package: `eu.boemm.dps.reports.model.dto`. Returned by deprecated `GET /api/companies/weeklyContractHoursNotification` (Dev controller). Treat as the documented shape of `ContractHoursReportWebDto` — there is no DTO with that exact name in the codebase; the actual reporting endpoints `POST /api/companies/weeklyContractHoursReport` return `void` (they trigger an email send).

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class CompanyEmailEntry {
    UUID companyId;
    String companyName;
    @Builder.Default List<EmployeeEmailEntry> employees = new ArrayList<>();
}
```

### 10.2 `EmployeeEmailEntry`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class EmployeeEmailEntry {
    UUID employeeId;
    String fullName;
    String ssn;
    List<ContractHoursEntry> contractHours;
}
```

### 10.3 `ContractHoursEntry`

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class ContractHoursEntry {
    UUID id;
    UUID contractId;
    String fromTime;                                       // String, not LocalTime
    String toTime;
    String contractDate;
    String duration;                                       // formatted "HH:mm"
    String decimalDuration;                                // e.g. "8.5"
}
```

> Note: there is no `ContractHoursReportWebDto` class. If a Confluence page mentions one, it is a description not yet realised in code.

---

## 11. Indexation

### 11.1 `WageIndexationWebDto`

Package: `eu.boemm.dps.indexation.model.webdto`. Body of `POST /internalapi/indexations/wages/execute`.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class WageIndexationWebDto {
    UUID id;
    String pcCode;
    String indexationType;                                 // free-form string
    LocalDate contractsStartingFrom;
    List<Statute> statutes;                                // JPA entity reused as DTO (!) — see note
    BigDecimal coefficient;
    BigDecimal newMinimum;
}
```

> Surprise: `statutes` references `eu.boemm.dps.employeewage.model.entity.Statute`, a JPA entity — not a WebDto. On the wire this means whatever Jackson can extract from the Statute entity (typically `code` + linked `absenceReasons`). For a PoC, send `[{"code":"WHITE_COLLAR"},{"code":"LABOUR"}]` and let Hibernate hydrate the rest.

---

## 12. User Notification Preferences

### 12.1 `UserNotificationPreferencesWebDto`

Package: `eu.boemm.dps.usernotificationpreferences.model.dto`. Both request and response on `UserNotificationPreferencesController`.

```java
@Value @Builder(toBuilder = true) @Jacksonized
public class UserNotificationPreferencesWebDto {
    UUID id;
    UUID userId;
    UUID companyId;
    String phoneNumber;
    String email;
}
```

### 12.2 `NotificationScheduleWebDto`

Package: `eu.boemm.dps.usernotificationpreferences.model.dto`. Body and response of the `…/schedule` sub-resource.

```java
@Value @Builder(toBuilder = true) @Jacksonized
public class NotificationScheduleWebDto {
    UUID id;
    UUID userNotificationPreferencesId;
    Integer dayOfWeek;                                    // 1-7
    LocalTime notificationTime;
    NotificationType type;                                // ACTUALS | CONTRACT | ACTUALS_AND_CONTRACT
}
```

---

## 13. Audit / History

### 13.1 `HistoryEntityWrapperDto<T>`

Package: `eu.boemm.dps.audit`. Wraps any audited entity with revision metadata. Returned as `List<HistoryEntityWrapperDto<…>>` by `UserNotificationPreferencesAuditController`.

```java
@Builder @Value
public class HistoryEntityWrapperDto<T> {
    int revision;
    String author;                                        // user that performed the change
    LocalDateTime timestamp;
    String operationType;                                 // typically "ADD" / "MOD" / "DEL"
    T entity;
}
```

### 13.2 `UserNotificationPreferencesHistoryDto`

Package: `eu.boemm.dps.audit.model.dto`. `T` for `/api/admin/audit/notifications/preferences/{id}/history`.

```java
@Data @Builder(toBuilder = true)
public class UserNotificationPreferencesHistoryDto {
    private UUID id;
    private String phoneNumber;
    private String email;
    private CompanyUserBasicDto companyUser;
    @Builder.Default
    private List<NotificationScheduleWebDto> schedules = new ArrayList<>();
}
```

### 13.3 `NotificationScheduleHistoryDto`

```java
@Data @Builder(toBuilder = true)
public class NotificationScheduleHistoryDto {
    private UUID id;
    private UUID userNotificationPreferenceId;
    private Integer dayOfWeek;
    private LocalTime notificationTime;
    private String type;                                  // String here, not the NotificationType enum
    private LocalDateTime nextAttempt;
}
```

### 13.4 `CompanyUserBasicDto`

```java
@Data @Builder(toBuilder = true)
public class CompanyUserBasicDto {
    private UUID id;
    private String companyName;
}
```

> Audit DTOs use `@Data` (mutable POJO) instead of the `@Value @Jacksonized` style used elsewhere — likely because Hibernate Envers needs setters. Treat as response-only.

---

## 14. Generic / Envelopes

### 14.1 `PageWebDto<T>`

Package: `eu.boemm.dps.common.model`. Wrapping shape for every paged response.

```java
@Value @AllArgsConstructor @Builder(toBuilder = true)
public class PageWebDto<T> {
    List<T> content;
    int numberOfElements;
    long totalElements;
    int size;
    int totalPages;
    int number;                                           // current page index, 0-based
}
```

JSON shape on the wire:
```json
{
  "content": [ ... ],
  "numberOfElements": 20,
  "totalElements": 137,
  "size": 20,
  "totalPages": 7,
  "number": 0
}
```

This is **not the standard Spring `Page` envelope** (no `pageable` block, no `sort` block, no `first/last` flags). PoC clients should code directly against this shape rather than expecting Spring's default page serialisation.

### 14.2 `ConsultantWebDto`

Package: `eu.boemm.dps.common.user.model.webdto`. Embedded across company / contract / wage DTOs.

```java
@Value @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true) @Jacksonized
public class ConsultantWebDto {
    String id;
    String firstName;
    String lastName;
}
```

### 14.3 `NotificationCountWebDto`

Package: `eu.boemm.dps.common.model`. Returned by both the actuals and contracts notification-count endpoints.

```java
@Value @Jacksonized @Builder(toBuilder = true) @JsonIgnoreProperties(ignoreUnknown = true)
public class NotificationCountWebDto {
    long notificationCount;
}
```

### 14.4 Error envelope (`ApiErrorResponse` / `ApiError`)

There is **no `ErrorResponseDto` or `ApiErrorWebDto` class in `common/error`**. Instead, error responses are the inner records `GlobalExceptionHandler.ApiErrorResponse` and `GlobalExceptionHandler.ApiError`:

```java
public record ApiErrorResponse(List<ApiError> apiErrors, String traceId) {}

@Builder
private record ApiError(String code, String details, String group) {}
```

Wire shape:
```json
{
  "apiErrors": [
    { "code": "VALIDATION_ERROR", "details": "email: must be a valid email", "group": "VALIDATION_ERROR" }
  ],
  "traceId": "abc123def456"
}
```

Mapping of exception → HTTP status:

| Exception | HTTP | `code` | `group` |
|---|---|---|---|
| `BeanValidationException` | 400 | the validation error code (translated via `MessageSource`) | the validation error group |
| `MethodArgumentNotValidException` | 400 | field error code (e.g. `NotBlank`, fallback `VALIDATION_ERROR`) | `VALIDATION_ERROR` |
| `BadCredentialsException` | 401 | `UNAUTHORIZED` | `UNAUTHORIZED` |
| `AccessDeniedException` | 403 | `FORBIDDEN` | `ACCESS_DENIED` |
| `ResourceNotFoundException` | 404 | reason string | `NOT_FOUND` |
| `ResourceConflictException` | 409 | reason string | `CONFLICT` |
| `NewcomerExistsException` | 409 | `NEWCOMER_ALREADY_EXISTS` | `CONFLICT_ERROR` |
| `Exception` (catch-all) | 500 | `INTERNAL_SERVER_ERROR` | `INTERNAL_ERROR` |

The `traceId` is derived from Brave's current span; falls back to `"N/A"` if no span is in scope.

---

## 15. Enums

Cross-reference of every enum referenced by a DTO field above.

### 15.1 `AuthResultWebDto.AuthStatus`
`eu.boemm.dps.companyuser.model.dto.AuthResultWebDto`
```java
SUCCESS, FORCE_PASSWORD_RESET
```

### 15.2 `AppUserStatus`
`eu.boemm.dps.companyuser.model.entity.AppUserStatus`
```java
CONFIRMED, FORCE_CHANGE_PASSWORD
```

### 15.3 `CustomerRole`
`eu.boemm.dps.company.model.dto.CustomerRole`. The wire-level role on `CompanyUserRoleDto`, `InviteAppUserRequest`, `CompanyCustomerWebDto`.
```java
COMPANY_USER, GROUP_USER
```

### 15.4 `UserRole`
`eu.boemm.dps.common.security.model.role.UserRole`. Internal full role enum used on `CompanyUserDto.role` and `UserCompanyMembershipDto.role`.
```java
FULL_ADMIN, DPS_DIRECTOR, DPS_SALES, SALES_ADMIN, CREDIT_CONTROLLER,
PREVENTION_ADVISOR, SUPER_ADMIN, RECRUITER, COMPANY_USER, EMPLOYEE_USER, GROUP_USER
```
Each value carries a fixed Cognito group UUID (hard-coded, see `UserRole.java`) and a list of `UserPermission` entries (`ACCESS_DPS`, `COMPANY_VIEW`, `EMPLOYEE_EDIT`, `CONTRACT_CREATE`, `ACTUALS_VIEW_ANY`, …).

### 15.5 `CompanyStatusDto`
`eu.boemm.dps.company.model.dto`
```java
ACTIVE, BLOCKED, PROCESSING
```

### 15.6 `StatusWebDto`
`eu.boemm.dps.company.model.webdto` — duplicate of `CompanyStatusDto` with the same values. Used by `CompanyCreateResultWebDto` and `CompanyWebSearchResultWebDto`.
```java
ACTIVE, PROCESSING, BLOCKED
```

### 15.7 `SupportedStatutes`
`eu.boemm.dps.company.model.dto`. Used by `CompanyCoefficientsPerStatuteWebDto.getCoefficient(...)` to switch on statute code.
```java
WHITE_COLLAR_STUDENT, LABOUR_STUDENT, FLEX_WHITE_COLLAR, FLEX_LABOUR,
WHITE_COLLAR, LABOUR, EXTRA, WHITE_COLLAR_STUDENT_WORKER,
LABOUR_STUDENT_WORKER, SEASONAL
```

### 15.8 `CoefficientTypeDto`
`eu.boemm.dps.company.model.dto`. Map keys for `CompanyCoefficientsWebDto.generalCoefficientsPerStatute` and `holidayCoefficientsPerStatute`.
```java
DEFAULT, HOLIDAY, MINIMAL, COMPANY, BANK_HOLIDAY, MIN_ADMIN, MIN_USER
```

### 15.9 `ContractStatusWebDto`
`eu.boemm.dps.contract.model.dto`
```java
DRAFT, VALIDATION, PENDING, ACTIVE, CANCELLED, CANCEL_VALIDATION, DELETED, UNDER_REPAIR
```

### 15.10 `ContractSourceWebDto`
`eu.boemm.dps.contract.model.dto`. Tracks which subsystem originated the contract.
```java
FLASH, COMPANY_FUNCTION, EAGLE, DPS
```

### 15.11 `ContractCreationStatus`
`eu.boemm.dps.contract.model.dto`. Used in `ContractBatchCreationResultWebDto`.
```java
SUCCESS, ERROR
```

### 15.12 `ActualStatusWebDto`
`eu.boemm.dps.actual.model.dto`
```java
PENDING, CONFIRMED, ABSENT, CANCELLED, OVERDUE
```

### 15.13 `AbsenceTypeWebDto`
`eu.boemm.dps.actual.model.dto`
```java
PARTIAL, FULL
```

### 15.14 `CompensationHours`
`eu.boemm.dps.actual.model.dto`
```java
PAID, NOT_PAID, NONE
```

### 15.15 `EmployeeStatusWebDto`
`eu.boemm.dps.employee.model.webdto`
```java
ACTIVE, BLOCKED
```

### 15.16 `GenderWebDto`
`eu.boemm.dps.employee.model.webdto`
```java
MALE, FEMALE, OTHER
```

### 15.17 `MediaTypeWebDto`
`eu.boemm.dps.common.model`
```java
IDENTITY, CREDIT_CARD
```

### 15.18 `EmployeeInvitationStatus`
`eu.boemm.dps.employeeinvitation.model.entity` (entity enum reused on the wire — note non-`WebDto` package)
```java
EXPIRED, ACTIVE, CANCELED, COMPLETED
```

### 15.19 `EmploymentReasons`
`eu.boemm.dps.employeeinvitation.model.entity`
```java
TEMPORAL_EXTRA_WORK, SUBSTITUTION, EXCEPTION_WORK, INFLOW
```

### 15.20 `TravelAllowanceType`
`eu.boemm.dps.employeeinvitation.model.entity`
```java
NONE, SUBSCRIPTION_PRIVATE, SUBSCRIPTION_PUBLIC, COMPANY_CAR
```

### 15.21 `JobStatus`
`eu.boemm.dps.imports`. Used in `ImportJobWebDto`.
```java
NOT_STARTED, IN_PROGRESS, FINISHED, FAILED
```

### 15.22 `EntityType`
`eu.boemm.dps.imports`. Internal classifier used by import jobs.
```java
COMPANY, EMPLOYEE, EMPLOYEE_WAGE
```

### 15.23 `NotificationType`
`eu.boemm.dps.usernotificationpreferences.model.entity`
```java
ACTUALS, CONTRACT, ACTUALS_AND_CONTRACT
```

### 15.24 `DictionaryType`
`eu.boemm.dps.dictionary.service`. Internal enum — not on the wire — but each enum value is what the URL path `{resourceType}` is matched against. See section 9 above for the enumerated resource names.

---

## 16. Items NOT present in the codebase

The following types were on the original priority list but do not exist as discrete classes at this commit:

- `CurrentUserWebDto` / `CurrentUserModel` — there is no `GET /api/users/currentuser` endpoint in the controller inventory; the closest projection is `UserDto` (1.9). Authentication state is conveyed entirely through the JWT.
- `CompanyDetailsWebDto`, `CompanyCreateWebDto`, `CompanyOnboardingWebDto` — only `CompanyWebDto` exists. POST/PUT/GET share the same shape.
- `CompanyOfficeWebDto`, `SubofficeWebDto`, `CompanyTimeTableWebDto`, `CompanyDocumentWebDto` — not yet implemented.
- `ContractCreateWebDto`, `ContractUpdateWebDto`, `ContractCopyRequestWebDto` — only `ContractWebDto` (single shape) and a `List<ContractWebDto>` for `/batch`.
- `ContractHoursReportWebDto` — only the deprecated dev endpoint exposes a JSON shape (`CompanyEmailEntry`).
- `EngagementGroupCreateWebDto` (with the "WebDto" suffix) — actual class is `EngagementGroupCreateRequestWebDto`.
- `EmployeeEngagementGroupWebDto` — controller name only; the DTO is `EngagementGroupEmployeeWebDto` reused.
- `EmployeeWageWebDto` short / long variants — single class.
- `ApiErrorWebDto` / `ErrorResponseDto` — error envelope is the inner `GlobalExceptionHandler.ApiErrorResponse` record.

---

## 17. Sources (relative to repo root, ref `1fc6cd30d62`)

- `src/main/java/eu/boemm/dps/companyuser/model/dto/*.java`
- `src/main/java/eu/boemm/dps/companyuser/service/CompanyUserAuthorizationService.java`
- `src/main/java/eu/boemm/dps/mystaffler/auth/service/EmployeeAuthorizationService.java`
- `src/main/java/eu/boemm/dps/mystaffler/auth/controller/PublicEmployeeController.java`
- `src/main/java/eu/boemm/dps/common/model/*.java`
- `src/main/java/eu/boemm/dps/common/user/model/webdto/ConsultantWebDto.java`
- `src/main/java/eu/boemm/dps/common/security/model/role/UserRole.java`
- `src/main/java/eu/boemm/dps/common/error/GlobalExceptionHandler.java`
- `src/main/java/eu/boemm/dps/company/model/dto/*.java`
- `src/main/java/eu/boemm/dps/company/model/webdto/*.java`
- `src/main/java/eu/boemm/dps/contract/model/dto/*.java`
- `src/main/java/eu/boemm/dps/employee/model/webdto/*.java`
- `src/main/java/eu/boemm/dps/employee/model/dto/EmployeeSearchFilterDto.java`
- `src/main/java/eu/boemm/dps/employeewage/model/webdto/*.java`
- `src/main/java/eu/boemm/dps/engagementgroup/model/webdto/*.java`
- `src/main/java/eu/boemm/dps/actual/model/dto/*.java`
- `src/main/java/eu/boemm/dps/employeeinvitation/model/webdto/*.java`
- `src/main/java/eu/boemm/dps/employeeinvitation/model/entity/*.java`
- `src/main/java/eu/boemm/dps/newcomer/model/dto/*.java`
- `src/main/java/eu/boemm/dps/dictionary/model/webdto/*.java`
- `src/main/java/eu/boemm/dps/dictionary/controller/DictionaryController.java`
- `src/main/java/eu/boemm/dps/dictionary/service/DictionaryType.java`
- `src/main/java/eu/boemm/dps/indexation/model/webdto/WageIndexationWebDto.java`
- `src/main/java/eu/boemm/dps/usernotificationpreferences/model/dto/*.java`
- `src/main/java/eu/boemm/dps/usernotificationpreferences/model/entity/NotificationType.java`
- `src/main/java/eu/boemm/dps/audit/HistoryEntityWrapperDto.java`
- `src/main/java/eu/boemm/dps/audit/model/dto/*.java`
- `src/main/java/eu/boemm/dps/itsmeinvite/controller/ItsMeAuthorizationController.java`
- `src/main/java/eu/boemm/dps/itsmeinvite/model/itsme/*.java`
- `src/main/java/eu/boemm/dps/reports/model/dto/*.java`
- `src/main/java/eu/boemm/dps/imports/{EntityType,JobStatus}.java`
