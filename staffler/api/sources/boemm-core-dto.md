# boemm-core-dto

`wlnob/boemm-core-dto` (Java 11, Maven artifactId `eu.boemm:core-dto`, current pom version `0.1.214-SNAPSHOT`; dps-service depends on `0.1.210`).

This is the shared DTO library used across BOEMM backend services (dps-service, eagle, payroll-service, etc.) for the canonical shape of company/contract/allocation/employee data. Pure Jackson + Lombok, no Spring, no JPA. Two transitive deps only: `lombok` and `jackson-databind 2.6.6`.

The package root is `eu.boemm.core.dto`.

## Top-level packages

```
eu.boemm.core.dto
├── PagedResource              (top-level paging wrapper)
├── allocation/                (10 files: AllocationDTO, SalaryTermDTO, WiosMinWageDTO, ...)
├── common/dictionary/         (CoreDictionaryItem interface, CollarTypeDTO, CountryDTO, ReasonDTO, SyncStatusDTO)
├── company/                   (~30 files: CompanyDTO, AddressDTO, ContactDTO, PersonalContactDTO, ...)
├── company/search/
├── contract/                  (~33 files: ContractDTO, AddressDTO (separate!), MealVoucherDTO, ...)
├── employee/                  (StatuteDTO, GenericStatuteDTO, LanguageDTO, AllocationRegimeDTO, ShiftRegimeDTO, ...)
├── indexation/                (WageIndexationDTO)
└── search/                    (SearchResultEntryDTO)
```

There is NO `ConsultantDTO`, NO `CompanyBaseInfoDTO`, NO `PersonalContactDTO` named that way at top level (the personal-contact DTO is here, see below). The `Consultant*WebDto` shapes live in dps-service, not core-dto, and are dps-shaped re-projections.

## Dictionary package — `common/dictionary`

```java
public interface CoreDictionaryItem {
    String getCode();
    String getName();
}
```

This is the universal contract for all dictionary lookups: every dictionary item is `{code, name}`. There is NO `description`, NO `label` field anywhere in the canonical shape. Sub-classes add their own extras.

### `CollarTypeDTO`

```java
@Value @JsonIgnoreProperties(ignoreUnknown = true)
@Builder(builderClassName = "DTOBuilder", toBuilder = true)
@JsonDeserialize(builder = CollarTypeDTO.DTOBuilder.class)
public class CollarTypeDTO implements CoreDictionaryItem {
    String name;
    String code;
}
```

So when the dps API returns a "collar" object, the JSON shape is `{"name": "...", "code": "..."}`. Plain string `"WHITE"` or `"BLUE"` (as observed in live data on dps-service `StatuteItemWebDto.collar`) is NOT a `CollarTypeDTO` — that is a separate string field on `StatuteDTO` itself (see below). Both representations exist and they are not the same thing.

### `CountryDTO`

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class CountryDTO implements CoreDictionaryItem {
    String code;
    String name;
    String regionCode;
    String regionName;
}
```

### `ReasonDTO`

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class ReasonDTO implements CoreDictionaryItem {
    String name;
    String code;
}
```

### `SyncStatusDTO` (enum)

```java
public enum SyncStatusDTO {
    NOT_SYNCED,
    SUCCESS,
    TEMPORARY_ERROR,
    PERMANENT_ERROR
}
```

## Company package — `company`

### `AddressDTO` (company variant!)

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonDeserialize(builder = AddressDTO.DTOBuilder.class)
public class AddressDTO {
    private final UUID uuid;

    private final String bus;
    private final String streetNumber;
    private final String street;
    private final String postalCode;
    private final String city;
    private final String country;
    private final String countryCode;
    private final String formattedAddress;
    private final Float latitude;
    private final Float longitude;
}
```

CRITICAL FIELD-NAME REALITY:
- The field is `street` — NOT `streetName`.
- The field is `postalCode` — NOT `postCode`.
- The field is `city` — NOT `cityName`.
- The field is `bus` — NOT `boxNumber`. (`bus` is BE Dutch for the box/apartment number.)
- There is NO `state` field.
- There IS a `formattedAddress`, plus the redundant `country` (full name) and `countryCode`.

So if the documented `AddressWebDto` for dps-service uses `streetName / postCode / cityName / boxNumber / state`, that is a re-mapping done in dps-service WebDto layer (or a documentation drift). The canonical core shape is the one above.

### `ContactDTO`

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class ContactDTO {
    private final UUID companyUuid;

    private final String phoneNumber;
    private final String faxNumber;
    private final String email;
    private final String website;

    private final AddressDTO address;
    private final AddressDTO invoiceAddress;
}
```

This is what the dps "CommunicationWebDto" likely re-projects. The canonical core has a single flat object with phone/email/fax/website, plus two `AddressDTO` (visiting + invoice). It is NOT a list of channel objects with `type` discriminators in the canonical shape.

### `PersonalContactDTO`

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class PersonalContactDTO {
    UUID uuid;
    String fullName;
    String phoneNumber;
    String email;
    String position;
    LocalDateTime createdAt;

    @JsonProperty("firstName") public String getFirstName() { ... }   // derived from fullName.split(" ")[0]
    @JsonProperty("lastName")  public String getLastName()  { ... }   // derived from rest of split
}
```

So on the wire you see BOTH `fullName` AND derived `firstName`/`lastName` fields, where the derived ones are computed by splitting on the first space. There is no canonical first/last storage — only `fullName`.

### `CompanyDTO` (excerpt)

The canonical company shape:

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class CompanyDTO {
    UUID uuid;
    Integer version;
    Integer contentVersion;
    Boolean isMigrated;
    StatusDTO status;
    String vat;
    CountryDTO vatCountry;
    String name;
    String nickName;
    LanguageDTO documentLanguage;
    CompanyTypeDTO type;
    ContactDTO contact;
    ActivityDTO activity;
    Boolean hasVca;
    Boolean hasTradeUnion;
    String preventionAdvisor;
    String externalService;
    String externalServiceRegNumber;
    String rateAccidents;
    NaceDTO mainActivityNace;

    String selfServiceTimeSheetRecipientEmail;
    String electronicContractsRecipientEmail;
    String invoicesRecipientEmail;
    String paymentNotificationsRecipientEmail;
    String invoicePhoneNumber;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd") LocalDate startDate;
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd") LocalDate endDate;

    LegalFormDTO legalForm;
    SafetyChapterDTO safetyChapter;
    EmployeeIntroductionDTO employeeIntroduction;
    CompanyVcaDTO companyVca;

    @Builder.Default List<CommercialTermsDTO> commercialTerms = new ArrayList<>();
    @Builder.Default List<CreditLimitDTO> creditLimitHistory = new ArrayList<>();
    @Builder.Default List<CreditScoreDTO> creditScoreHistory = new ArrayList<>();
    @Builder.Default List<ParitairComiteDTO> paritairComites = new ArrayList<>();
    @Builder.Default List<NaceDTO> naces = new ArrayList<>();
    @Builder.Default List<TimetableDTO> timetables = new ArrayList<>();
    @Builder.Default List<SubOfficeDTO> subOffices = new ArrayList<>();
    @Builder.Default List<BalanceDTO> balances = new ArrayList<>();
    @Builder.Default List<PersonalContactDTO> personalContacts = new ArrayList<>();

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime registrationDate;
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime legalRegistrationDate;

    @Builder.Default List<CommercialTermsCompanyMediaDTO> commercialTermsMedia = new ArrayList<>();
    @Builder.Default List<CustomerContractsCompanyMediaDTO> customerContractsMedia = new ArrayList<>();
    @Builder.Default List<InternalAuditCompanyMediaDTO> internalAuditMedia = new ArrayList<>();
    @Builder.Default List<OtherCompanyMediaDTO> otherMedia = new ArrayList<>();
    @Builder.Default List<WorkstationDocumentCompanyMediaDTO> workstationDocumentMedia = new ArrayList<>();

    String officeCode;
    String consultantId;          // <— the link to a user-service user, by AD id string
    String legacySectors;
    String internalInfo;

    CompanyContractReminderDTO contractReminder;
    SyncStatusDTO syncStatus;
    String syncStatusMessage;

    String blockedBy;
    BlockingReasonDTO blockingReason;
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime blockedOn;
    String blockingExtraInfo;

    Boolean costCentersEnabled;

    @Builder.Default Set<CompanyInfoCompetenceDTO> companyInfoCompetences = new HashSet<>();
    @Builder.Default Set<CompanyTagDTO> tags = new HashSet<>();

    @JsonProperty("pcCodes") public String getPcCodes() { ... }    // joined CSV of paritairComite codes
}
```

Notes:
- `consultantId` (a String, not a UUID) is the canonical pointer to a user-service `UserDto.id`. So the "consultant" data on a dps WebDto is hydrated server-side from user-service by id; there is no embedded consultant object in core's CompanyDTO.
- `pcCodes` is a derived getter — on the wire it appears as a `pcCodes` string.

### Other notable company classes (not all opened, listed for awareness)

`ActivityDTO`, `BalanceDTO`, `BlockingReasonDTO`, `CommercialTermsCompanyMediaDTO`, `CommercialTermsDTO`, `CompanyContractReminderDTO`, `CompanyExistenceStatusDTO`, `CompanyInfoCompetenceDTO`, `CompanySyncResultDTO`, `CompanyTagDTO`, `CompanyTypeDTO`, `CompanyVcaDTO`, `CreditLimitDTO`, `CreditScoreDTO`, `CustomerContractsCompanyMediaDTO`, `EmployeeIntroductionDTO`, `InternalAuditCompanyMediaDTO`, `LegalFormDTO`, `NaceDTO`, `OtherCompanyMediaDTO`, `ParitairComiteDTO`, `PersonalContactDTO`, `SafetyChapterDTO`, `StatusDTO`, `SubOfficeDTO`, `TimetableDTO`, `TimetablePauseDTO`, `TimetablePauseItemDTO`, `TimetableScheduleItemDTO`, `WorkstationDocumentCompanyMediaDTO`.

## Contract package — `contract`

### `ContractDTO` (excerpt)

```java
@Value @Builder(builderClassName = "DTOBuilder", toBuilder = true)
public class ContractDTO {

    UUID id;
    Integer version;
    Boolean isMigrated;

    UUID parentId;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime createdAt;

    UUID allocationId;

    String position;        // read-only, inferred from allocation
    UUID companyId;         // read-only, inferred from allocation
    UUID employeeId;        // read-only, inferred from allocation
    UUID subCompanyId;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd") LocalDate dateFrom;
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd") LocalDate dateTo;

    UUID workstationSheetId;
    UUID salaryTermId;
    UUID allocationCommercialTermsId;

    StatuteDTO statute;
    ParitairComiteDTO paritairComite;
    ReasonDTO reason;

    AddressDTO employmentAddress;        // <-- contract.AddressDTO, see note below
    String referencePlace;
    String referenceCustomer;
    SocialSecurityCategoryDTO socialSecurityCategory;

    CompensationHoursDTO compensationHours;
    Float wageHour;

    MealVoucherDTO mealVoucher;
    ContractTravelAllowanceDTO travelAllowance;
    @Builder.Default List<ContractTimeSheetCodeDTO> timeSheetCodes = new ArrayList<>();

    AllocationRegimeDTO allocationRegime;
    String trialPeriod;
    ShiftRegimeDTO shiftRegime;
    ShiftRegimeTypeDTO shiftRegimeType;
    ContractTimetableDTO timetable;
    BigDecimal companyHoursPerWeek;
    Boolean fullTimeWorkSchedule;
    Boolean flexibleTimetable;

    LateContractDTO lateContract;
    ContractInvoicingDTO contractInvoicing;
    @Builder.Default List<DeviatingCoefficientDTO> deviatingCoefficients = new ArrayList<>();
    @Builder.Default List<CostCenterDTO> costCenters = new ArrayList<>();
    Boolean extendCostCenters;

    ContractMedicalExaminationRequirementDTO medicalExaminationRequirement;
    DefaultTaxRateDTO defaultTaxRate;
    Boolean isLate;

    @Builder.Default List<SignedCompanyContractMediaDTO> signedCompanyContractMedia = new ArrayList<>();
    @Builder.Default List<SignedEmployeeContractMediaDTO> signedEmployeeContractMedia = new ArrayList<>();

    ContractStatusDTO status;
    ContractStatusDTO previousStatus;

    @Builder.Default List<CompanyContractTemplateMediaDTO> companyContractTemplateMedia = new ArrayList<>();
    @Builder.Default List<EmployeeContractTemplateMediaDTO> employeeContractTemplateMedia = new ArrayList<>();

    String contractNumber;
    @Builder.Default List<ValidationReasonDTO> validationReasons = new ArrayList<>();

    String cancelReason;
    String cancelExtraInfo;
    RevenueConsultantChangeReasonDTO revenueConsultantChangeReason;

    String officeCode;
    String revenueOfficeCode;
    String consultantId;
    String revenueConsultantId;

    SyncStatusDTO syncStatus;
    String syncStatusMessage;

    BigDecimal employeeHoursPerWeek;
    String internalInfo;
    String contractNote;

    ContractTypeDTO contractType;
    ContractSourceDTO sourceType;

    BigDecimal effectiveHoursEmployee;
    BigDecimal averageHoursEmployee;
    BigDecimal actualHoursEmployee;
    BigDecimal paidRecuperation;
    BigDecimal unpaidRecuperation;
}
```

Note: `contract.AddressDTO` is a SEPARATE class from `company.AddressDTO`. Both exist in core-dto; same package name `AddressDTO` but different fully-qualified class. Don't assume identical fields without checking `eu.boemm.core.dto.contract.AddressDTO` separately when wiring contracts.

## Employee package — `employee`

### `StatuteDTO`

```java
@Value @JsonIgnoreProperties(ignoreUnknown = true)
@Builder(builderClassName = "DTOBuilder", toBuilder = true)
@JsonDeserialize(builder = StatuteDTO.DTOBuilder.class)
public class StatuteDTO implements CoreDictionaryItem {
    String name;
    String code;
    Boolean isStudent;
    GenericStatuteDTO genericStatute;
    String collar;          // <-- raw String, NOT an enum, and NOT a CollarTypeDTO object
}
```

KEY OBSERVATIONS:
- `collar` is a plain `String` field. Live values seen are `"WHITE"` and `"BLUE"`. The wire JSON is e.g. `"collar": "WHITE"`.
- This is DIFFERENT from `CollarTypeDTO` (an object `{code, name}`), which is used for collar dictionary endpoints.
- The dps-service `SupportedStatutes` enum (`WHITE_COLLAR | LABOUR | ...`) is dps-side only and does NOT match this string. Treat `collar` as a free-form string from the API; safe values are `"WHITE"` and `"BLUE"`.
- `isStudent` is a Boolean.
- `genericStatute` is a nested `GenericStatuteDTO`.

### `GenericStatuteDTO`

```java
@Value @JsonIgnoreProperties(ignoreUnknown = true)
@Builder(builderClassName = "DTOBuilder", toBuilder = true)
@JsonDeserialize(builder = GenericStatuteDTO.DTOBuilder.class)
public class GenericStatuteDTO implements CoreDictionaryItem {
    String name;
    String code;
    List<String> statutes;     // codes of the StatuteDTOs that map to this generic
}
```

### Other employee files (listed)

`AllocationRegimeDTO`, `LanguageDTO`, `ShiftRegimeDTO`, plus more (the package listing exceeded the tool token limit, but these three are the ones referenced from CompanyDTO and ContractDTO).

## Allocation package

`AllocationDTO`, `AllocationCommercialTermsDTO`, `AllocationSearchCategoryDTO`, `AllocationWiosDTO`, `AllocationWorkApprovalDTO`, `AllocationWorkApprovalStatusDTO`, `SalaryTermDTO`, `WiosMinWageDTO`, `WiosParitairComiteDTO`, `WorkstationSheetDTO`. (Schemas not opened in detail; these are referenced by ContractDTO via id.)

## Indexation / Search

- `WageIndexationDTO` — single class.
- `SearchResultEntryDTO` — single class.

## Diff with what dps-service exposes

Three significant divergences a PoC builder will hit:

### 1. AddressWebDto field names

dps-service is documented (in our earlier knowledge base) as exposing `streetName / streetNumber / boxNumber / postCode / cityName / countryCode / state / latitude / longitude`. The canonical `core-dto` `company.AddressDTO` actually has:

| dps WebDto (documented) | core-dto canonical |
|---|---|
| `streetName` | `street` |
| `streetNumber` | `streetNumber` (matches) |
| `boxNumber` | `bus` |
| `postCode` | `postalCode` |
| `cityName` | `city` |
| `countryCode` | `countryCode` (matches) |
| `state` | (does not exist; closest is `country` full name) |
| `latitude`/`longitude` | matches |

So either dps-service does an explicit field-name re-mapping in its WebDto layer, or the documented `AddressWebDto` is wrong. Verify against a live `dps-service` JSON response — that is the source of truth for the API caller. Most likely the live dps-service response uses the core-dto names (`street`, `bus`, `postalCode`, `city`).

### 2. CommunicationWebDto

The documented dps shape (channel-list with type discriminator) does NOT match `core-dto` `ContactDTO`, which is a flat object with `phoneNumber`, `faxNumber`, `email`, `website`, plus visiting + invoice `AddressDTO`. The dps WebDto is therefore a re-projection. Confirm by hitting live dps endpoint.

### 3. DictionaryItemWebDto

Live dps data shows `{code, name}`. core-dto `CoreDictionaryItem` interface confirms exactly that: `getCode()` + `getName()`. There is no `description` and no `label` on the canonical core item. Any earlier doc that had `{code, label, description}` was speculative; correct shape is `{code, name}`. Specific dictionary types may add fields:
- `CountryDTO` adds `regionCode`, `regionName`.
- `StatuteDTO` adds `isStudent`, `genericStatute`, `collar`.
- `GenericStatuteDTO` adds `statutes` (List of String codes).

### 4. StatuteItemWebDto.collar

Live dps responses show `"collar": "WHITE"` or `"collar": "BLUE"`. The canonical core `StatuteDTO.collar` is indeed a plain `String`, not an enum and not the `CollarTypeDTO` object. The dps-service `SupportedStatutes` enum (`WHITE_COLLAR`, `LABOUR`) is unrelated and applies to a different field/concept. Treat the `collar` field as `"WHITE" | "BLUE"` at the wire level.

### 5. ConsultantWebDto / PersonalContactDto / CompanyBaseInfoDto

- `core-dto` does NOT contain a `ConsultantDTO` or `CompanyBaseInfoDTO`. These are dps-service-only WebDtos.
- The "consultant" linkage in core-dto is just `String consultantId` on `CompanyDTO` and `ContractDTO`. dps-service hydrates this into a `ConsultantWebDto` by calling user-service.
- `core-dto` `PersonalContactDTO` IS the canonical personal-contact shape: `{uuid, fullName, phoneNumber, email, position, createdAt}` plus the derived `firstName`/`lastName` getters. If dps-service returns a `PersonalContactWebDto`, expect those exact fields plus the two derived strings.
