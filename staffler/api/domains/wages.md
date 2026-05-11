# Domain: Employee Wages

## Wat is een Loonpakket

Een EmployeeWage = combinatie functie + statuut + paritair comité + locatie waarvoor één Employee bij één Company een vast uurloon en bijbehorende voordelen heeft. Eén Employee kan meerdere loonpakketten hebben binnen hetzelfde bedrijf, en voor elk loonpakket kan je apart contracten maken (met bijhorend uurloon).

UI-naam: "Loonpakket". Confluence 2541846529 (DPS: Employee wage), 2656338016 (Auth rules op employee wage list/create/update).

## Endpoints

```http
POST   /api/employeewages              <EmployeeWageWebDto>
PUT    /api/employeewages/{id}         <EmployeeWageWebDto>
DELETE /api/employeewages/{id}                                  → 204
GET    /api/employeewages?companyId=&employeeId=&page=&size=&sortBy=
POST   /api/employeewages/import       multipart, let op @RequestBody bug
```

Plus:

```http
GET /api/travelallowance/calculate?origin=<adres>&destination=<adres>&transportCode=<code>
```

Returnt `TravelAllowanceWebDto` met afstand + forfaitvergoeding.

## EmployeeWageWebDto shape

Bron: `sources/dps-service-dtos.md` § 5.

```
id (UUID)
companyId (UUID)
employeeId (UUID)
isActive (Boolean)
isPrimary (Boolean) -- één pakket per employee+company is primary
function (String, vrije tekst zoals "Barmedewerker")
statute (StatuteItemWebDto)
paritairComite (DictionaryItemWebDto)
companyInfo (EmployeeWageCompanyInfoWebDto)
hourlyWage (BigDecimal, 4 decimalen, range [8.50, 100.00])
weeklyWage (BigDecimal)
monthlyWage (BigDecimal)
mealVoucher (EmployeeWageMealVoucherWebDto)
travelAllowance (EmployeeWageTravelAllowanceWebDto)
defaultTaxRate (DictionaryItemWebDto)
location (DictionaryItemWebDto, vb "Leest (Lievegem)")
costCenter (DictionaryItemWebDto)
employmentReason (DictionaryItemWebDto)
absencesAllowed (Boolean)
ecoWeekly (Boolean)
recoupment (Boolean)
... ev. velden voor specifieke statutes
```

Validatie-noten (per Confluence + code):

- `hourlyWage` strikt in `[8.50, 100.00]` voor entity (8.30 voor invitation, discrepantie genoteerd)
- `statute.code` moet match met `paritairComite.code` (PC code statute validation, Confluence 2656534623)
- Eén `isPrimary = true` per (employee, company) tegelijk

## Travel allowance

`POST /api/travelallowance/calculate` rekent een afstand tussen twee adressen (Google Maps Distance Matrix) en mapt op de `transportCode` (TRAIN, CAR, BIKE, ...) naar het wettelijk forfait.

Returnt:

```json
{
  "distanceKm": "12.4",
  "forfait": "3.50",
  "transportType": "PUBLIC_TRANSPORT",
  "details": { "originLat": ..., "destinationLat": ..., "polyline": "..." }
}
```

Gebruikt door de UI bij contract-aanmaak om automatisch de travel allowance te suggereren.

## Indexation

Loonpakketten worden periodiek geïndexeerd (CPI of PC-specifiek). Endpoint:

```http
POST /internalapi/indexations/wages/execute
Content-Type: application/json

<WageIndexationWebDto>
```

Body bevat coefficient + scope (alle wages of per PC). Niet extern bereikbaar.

Recent Jira werk:

- BCJ-19242 "BE: endpoint to save wage indexation (all wages)"
- BCJ-19246 "BE: Retrieve and delete saved indexations endpoint"
- BCJ-19250 "BE: endpoint indexation History"
- BCJ-19024 "Indexation app: Wages transactional indexing endpoint"
- BCJ-19030 "Travel Allowance Indexation Endpoint"

Het Indexations Module epic (BCJ-18930) beoogt de manuele maandelijkse loonindexaties te automatiseren. Voor een PoC niet relevant tenzij je dashboards rond toekomstige indexaties wil tonen.

## Bulk import

```http
POST /api/employeewages/import
Content-Type: multipart/form-data
```

Body in source code: `@RequestBody MultipartFile` (i.p.v. `@RequestPart`). Dit is een bekende bug; in praktijk werkt de standaard multipart upload meestal toch. Bij twijfel test eerst met één rij voor je een grote batch stuurt.

Returnt `ImportJobWebDto`.
