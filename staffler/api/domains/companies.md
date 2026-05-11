# Domain: Companies

## Wat is een Company

Een Company is een klant van Staffler, een onderneming die werknemers plant. In de UI is dit het bedrijf dat bovenaan staat in de sidebar. Een Company heeft één hoofdadres, een lijst suboffices, een lijst app-users (admin), een pool van employees, een paritair comité, een statuten-mix.

ID = UUID. Status enum `CompanyStatusDto`: `ACTIVE`, `BLOCKED`, `PROCESSING`. Geblokkeerde bedrijven kunnen geen nieuwe contracten meer aanmaken (zie `actuals.md` voor de OVERDUE-keten).

## Endpoints

### Read

```http
GET /api/companies/{companyId}
```

Returnt `CompanyWebDto`. Permission `COMPANY_VIEW`.

```http
GET /api/companies/external?term=<naam>&postCode=<pc>&page=0&size=20
```

Credit Safe lookup voor onboarding flow. Returnt `List<CompanyWebSearchResultWebDto>`. Permission `COMPANY_SEARCH`. De backend praat hierachter naar boemm-core, die op zijn beurt Credit Safe API queryt.

```http
GET /api/companies/engagements?employeeId=<uuid>&companyId=<uuid>&page=0&size=20
```

Lijst van bedrijven waar deze employee in de pool zit. Returnt `PageWebDto<CompanyBaseInfoWebDto>`.

```http
GET /api/companies/{companyId}/coefficients?types=DEFAULT,HOLIDAY,COMPANY,...
```

Coefficient-set op bedrijfsniveau (factuurmultiplier per shift-type). Returnt `CompanyCoefficientsWebDto` met `general` (`GeneralCompanyCoefficientsWebDto`) en `perStatute` (`List<CompanyCoefficientsPerStatuteWebDto>`).

### Create / Update

```http
POST /api/companies/{vat}
```

Onboarding-by-VAT. Geen body, de backend zoekt het bedrijf op via VAT in core/Credit Safe en spawnt een nieuwe Company met basisinfo. Returnt `CompanyCreateResultWebDto`. Permission `COMPANY_ONBOARDING`.

```http
PUT /api/companies/{uuid}
Content-Type: application/json

<CompanyWebDto>
```

Volledig replace. Permission `checkCompanyUpdate`. Niet-doorgegeven velden worden null gezet (JSON merge gebeurt niet).

### Bulk import

```http
POST /api/companies/import
Content-Type: multipart/form-data
```

Excel-file met companies. Returnt `ImportJobWebDto` met `jobId` voor latere status-tracking.

### Membership

```http
DELETE /api/companies/{companyId}/employees/{employeeId}
```

Verwijdert een employee uit de pool van het bedrijf. Permission `COMPANY_REMOVE_USER`. Returnt 200.

## CompanyWebDto shape

Top-level velden (zie `sources/dps-service-dtos.md` § 2.1 voor exacte def):

```
id (UUID)
name (String)
vatNumber (String, format BE0123456789)
status (CompanyStatusDto)
companyAddress (AddressWebDto)
billingAddress (AddressWebDto)
suboffices (List<SubofficeWebDto>) -- ZIT NIET in CompanyWebDto, zie hieronder
contactPersons (List<PersonalContactWebDto>)
communications (List<CommunicationWebDto>) -- email + telefoon kanalen
revenueOfficeCode (String) -- voor analytische omzet-toewijzing FIX/WT
revenueConsultantId (UUID)
generalCoefficients (GeneralCompanyCoefficientsWebDto)
travelAllowance (GeneralCompanyTravelAllowanceWebDto)
mealVoucher (GeneralCompanyMealVoucherWebDto)
invoiceInfo (CompanyInvoiceInfoWebDto)
customer (CompanyCustomerWebDto) -- subset van Brightstaffing klant-info
actualsConfirmation (CompanyActualsConfirmationDto)
revenueInfo (CompanyRevenueInfoStreamDto)
defaultTaxRate (DictionaryItemWebDto)
demoCompany (Boolean)
... veel meer
```

Het `SubofficeWebDto` type bestaat NIET in de codebase. De Confluence-pagina's noemen suboffices, maar in de wire-shape zitten ze waarschijnlijk impliciet via address-lijsten. Verifieer voor je suboffices probeert te modelleren.

## AddressDTO shape

LET OP: de canonical address-shape leeft in `boemm-core-dto` (`company.AddressDTO`), niet in dps-service. De dps-service WebDtos exposeren ze direct of via re-mapping. De feitelijke veldnamen zijn:

```
uuid (UUID, mag null)
street (String)
streetNumber (String)
bus (String)              -- NIET boxNumber
postalCode (String)        -- NIET postCode
city (String)              -- NIET cityName
country (String)
countryCode (String)
formattedAddress (String)
latitude (Double)
longitude (Double)
```

Adres-resolutie via Google Maps (`googleMaps.apiKey` env var). Confluence noteert dat ambiguous adressen geen fallback hebben (BCJ-16811 open sinds juli 2025).

Twee `AddressDTO` classes in core-dto: één in `eu.boemm.coredto.company`, één in `eu.boemm.coredto.contract`. Niet door elkaar gebruiken.

## Demo company

Op PROD is er één hard-coded demo company met ID `bde29951-1b8e-4d60-b3f6-642a6a6c167e`. DPS_SALES en DPS_DIRECTOR mogen daar mee spelen, andere users niet. De cron `ActualsDemoCleanupSchedule` reset hem elke 11 minuten via `POST /internalapi/actuals/cancel?companyId=bde29951-...`.

## Onboarding flow

Confluence pagina's relevant: 2524119041 (Company onboarding), 2546139219 (Add new company - Credit Safe), 2541682736 (Company profile).

Stappen vanuit UI:

1. User vult VAT in
2. SPA roept `GET /api/companies/external?term=<vat>` om in Credit Safe te zoeken
3. Als gevonden: SPA roept `POST /api/companies/{vat}` om aan te maken met prefilled data
4. Daarna PUT om aan te vullen (subofficecodes, contactpersonen, coefficients)
5. Status gaat naar `PROCESSING` tot een BOEMM-medewerker valideert
6. Daarna `ACTIVE`

Voor een PoC die alleen lezen wil is `GET /api/companies/{companyId}` voldoende.

## Coefficients

Coefficient = factuur-multiplier op de bruto-loonkost. `CoefficientTypeDto` enum:

- `DEFAULT` standaard shift
- `HOLIDAY` op feestdagen
- `MINIMAL` bij minimum hours
- `COMPANY` company-specifiek
- `BANK_HOLIDAY` op zon- en feestdagen
- `MIN_ADMIN` minimum gezet door admin
- `MIN_USER` minimum gezet door user

Een Company heeft één general-set en optioneel per-statute overrides (`CompanyCoefficientsPerStatuteWebDto.statute = SupportedStatutes`).

## Verwante endpoints

- Company users: zie `domains/company-users.md`
- Engagement groups in een company: zie `domains/engagement-groups.md`
- Actuals confirmation per company: zie `domains/actuals.md`
- Cron: `POST /internalapi/companies/confirmationEmail` stuurt overdue-mails
