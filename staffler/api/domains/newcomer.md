# Domain: Newcomer (employee zelf-registratie)

## Wat is een Newcomer

Een Newcomer is een Employee die nog niet volledig is uitgerust met een geverifieerd profiel. De flow:

1. Company stuurt invitation
2. Employee (of itsme) creëert een Employee-record in DRAFT status
3. Newcomer flow vult stappen in: General, Contact, Payment, Documents
4. BOEMM-medewerker valideert, vult `verifiedFields` aan
5. Employee gaat naar ACTIVE, mag in contracten

## Endpoints

```http
GET /api/newcomers?companyId=&verifiedValues=&page=&size=&sortBy=
GET /api/newcomers/{id}
PUT /api/newcomers/{id}                <NewcomerWebDto>
POST /publicapi/employees/self-registration   <NewcomerWebDto>
```

`NewcomerSelfRegistrationController` heeft een verrassend mapping: `GET /api/employees/invitations/{invitationId}` (onder `/api/employees`, niet `/api/newcomers`) returnt een `EmployeeWebDto` voor de invited newcomer.

## Filter `verifiedValues`

Query param accepteert `List<Boolean>`:

- `verifiedValues=true` → alleen geverifieerde newcomers
- `verifiedValues=false` → alleen niet-geverifieerd
- `verifiedValues=true,false` (default) → beide

## NewcomerWebDto shape

Bron: `sources/dps-service-dtos.md` § 8.6. Subset van `EmployeeWebDto` met aparte verificatie-vlaggen per veldgroep:

```
id (UUID)
companyId (UUID)
firstName, lastName, middleName (String)
email, phone (String)
nationalNumber (String)
gender (GenderWebDto)
dateOfBirth (LocalDate)
placeOfBirth (String)
nationality (DictionaryItemWebDto)
address (AddressWebDto)
languages (List<LanguageItemWebDto>)
generalVerified (Boolean)
contactVerified (Boolean)
paymentVerified (Boolean)
documentsVerified (Boolean)
isStudent (Boolean)
studentBalance (StudentBalanceWebDto)
itsmeAuthorization (ItsmeAuthorizationWebDto)
employmentReason (EmploymentReasons enum value)
... 
```

## Self-registration flow

```http
POST /publicapi/employees/self-registration
Content-Type: application/json

{
  "id": "<invitation-id>",  // van publicapi invitation get
  "firstName": "...", 
  "lastName": "...",
  "address": { ... },
  "nationalNumber": "...",
  ...
}
```

Geen auth nodig. Returnt `NewcomerWebDto`. Hierna stuurt de backend een mail die de employee verder verwijst naar de admin-app.

Confluence pagina's: 2563244037 (stepper), 2656632846 (STEP 1: General), 2656337968 (STEP 2: Contact), 2656337978 (STEP 3: Payment), 2656141386 (STEP 4: Documents), 2656337994 (Validation of employees after onboarding).

## Field formats

Confluence 2563112961 "Employee fields: format + validations" en 2705948675 "Field formats to use in migration file" geven de canonical formats. Belangrijke patronen:

- `nationalNumber`: `YY.MM.DD-XXX.CC` Belgisch (met punten en dash). De backend valideert checksum.
- `phone`: alle formaten geaccepteerd, server normaliseert naar `+32...`
- `email`: standaard RFC validatie
- `bankAccount`: IBAN format

## itsme integratie

Voor employees die via itsme komen: zie `domains/itsme.md`. Het itsme callback endpoint pre-vult voornaam, naam, adres, SSN en geslacht in de NewcomerWebDto via een lookup-key (de skey wordt na callback gezet).
