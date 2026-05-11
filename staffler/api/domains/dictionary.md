# Domain: Dictionary

## Wat is Dictionary

Reference-data lookups: lijsten van enums met code + label per taal. Bijvoorbeeld: paritair comités, statuten, talen, taxlevels, absentie-redenen, transport types. Wordt gebruikt om dropdowns in de UI te vullen.

Dit is de enige controller die zowel onder `/api/...` als `/publicapi/...` is gemapt — beide URLs werken voor elke endpoint.

## Endpoints (alles werkt onder /api en /publicapi)

```http
GET /api/dictionaries?types=PCCODE,STATUTE,LANGUAGE,...
GET /api/taxLevels?isFrontier=true
GET /api/languages?onlyPrimary=true
GET /api/{resourceType}                          ← catch-all, gebruik specifieke endpoints liever
GET /api/statutes?pcCode=302&collar=LABOUR
GET /api/absenceReasons?statuteCode=FLEX_LABOUR
GET /api/paritaircomites?showBlocked=false
```

## Bekende `DictionaryType` waarden (canonical, getest tegen PROD)

De `types=` query parameter en de catch-all `/{resourceType}` gebruiken DEZELFDE waarden, namelijk de lowercase resource names uit de Java enum `DictionaryType`. NIET de SCREAMING_SNAKE enum keys.

```
statutes
countries
languages
paritaircomites    (waarschuwing: returnt 500 op PROD per 9 mei 2026, intern gebroken)
naces
blockingreasons
travelallowances
cancelreasons
reasons
defaulttaxrates
compensationhours
socialsecuritycategories
transports
drivinglicenses
dependentpartners
maritalstatuses
taxlevels
```

De server geeft een netjes onderscheidbare error voor onbekende types: `404 NOT_FOUND` met `code: "Dictionary with type=<X> is not supported"`. Test je naam dus eerst.

Voorbeeld werkende calls (allemaal PROD-geverifieerd):

```bash
curl https://gw.myplanning.digitalpayrollservices.be/v1/dps-api/publicapi/transports
# [{"code":"PEDELEC","name":"Speedpedelec"},{"code":"BICYCLE","name":"Fiets of step"},...]

curl https://gw.myplanning.digitalpayrollservices.be/v1/dps-api/publicapi/maritalstatuses
# [{"code":"NOT_MARRIED","name":"ongehuwd"},{"code":"MARRIED","name":"gehuwd"},...]

curl 'https://gw.myplanning.digitalpayrollservices.be/v1/dps-api/publicapi/dictionaries?types=statutes,countries,languages'
# {"dictionaries":{"languages":[{"code":"aa","name":"Afar","primary":false},...],"countries":[...],...}}
```

BCJ-19554 ("Dictionary for STATUTE") werkt aan een dynamische dictionary voor statutes (in plaats van hardcoded enum) per may 2026.

## Response shapes (PROD-getest)

### `DictionariesHolder` (van `/dictionaries?types=...`)

Envelope: `{"dictionaries": { "<resourceName>": [<items>], ... }}`. NIET een flat object met de types als top-level keys.

```json
{
  "dictionaries": {
    "languages": [{"code":"aa","name":"Afar","primary":false}, ...],
    "countries": [{"code":"AF","name":"Afghanistan"}, ...],
    "statutes":  [{"code":"FLEX_LABOUR","name":"Flexijob Arbeider","isStudent":false,"collar":"BLUE","genericStatute":{...}}, ...]
  }
}
```

### Item shapes per type

`/languages` items: `{code, name, primary}` waarbij `primary` een Boolean is. NIET `isPrimary`.

```json
[{"code":"en","name":"Engels","primary":true},
 {"code":"fr","name":"Frans","primary":true},
 {"code":"nl","name":"Nederlands","primary":true}]
```

`/statutes` items: `{code, name, isStudent, collar, genericStatute}`. `collar` is `"WHITE"` of `"BLUE"`. `genericStatute` is een nested object `{code, name, statutes: []}` (de inner `statutes` array is leeg in nested context).

```json
{
  "code": "FLEX_LABOUR",
  "name": "Flexijob Arbeider",
  "isStudent": false,
  "collar": "BLUE",
  "genericStatute": {
    "code": "FLEX",
    "name": "Flexi",
    "statutes": []
  }
}
```

Statutes die ik heb gezien op PROD voor pcCode=302: `WHITE_COLLAR_STUDENT`, `LABOUR_STUDENT`, `FLEX_WHITE_COLLAR`, `FLEX_LABOUR`, `WHITE_COLLAR`, `LABOUR`, `EXTRA`, `SEASONAL_LABOUR`, en meer. Geen `pcCode` filter is in de response, dus de query param is informatief eerder dan filterend.

`/taxlevels` items: `{name, code}` (ja, name eerst).

```json
[{"name":"11.11%","code":"11P"},
 {"name":"15%","code":"15P"},
 {"name":"Grensarbeider","code":"FRONT"}]
```

`/transports` items: `{code, name}`.

```json
[{"code":"PEDELEC","name":"Speedpedelec"},
 {"code":"BICYCLE","name":"Fiets of step"},
 {"code":"PUBLIC_TRANSPORT","name":"Openbaar vervoer"}]
```

`/maritalstatuses`: `{code, name}` met codes als `NOT_MARRIED`, `MARRIED`, `WIDOW`, `ACTUALLY_SEPARATED`, `LEGALLY_DIVORCED`, `LIVING_TOGETHER` etc.

`/drivinglicenses`: `{code, name}` met codes A3, A, B, BE, C1, C1E, C, CE, D1, D1E, D, DE, etc.

`/dependentpartners`: `[{"code":"NONE","name":"geen"},{"code":"WITH_INCOME","name":"met inkomsten"},{"code":"WITHOUT_INCOME","name":"zonder inkomsten"}]`.

`/compensationhours`: `[{"code":"NONE","name":"Geen"},{"code":"PAID","name":"Betaald"},{"code":"NOT_PAID","name":"Niet betaald"}]`.

`/blockingreasons`: o.a. `BANKRUPTCY`, `BAD_PAYER`, `NO_COOPERATION_ANYMORE`, `NOT_CREDITWORTHY`, `WCO`.

`/cancelreasons`: redenen voor contract-annulatie zoals `EMPLOYEE_NOT_APPEAR` ("UZK niet opgestart/No Show"), `EMPLOYEE_REFUSES_TO_WORK`, `COMPANY_DONT_WANT_WORK_TOGETHER`, etc.

`/reasons` (employment reason): `TEMPORAL_EXTRA_WORK`, `SUBSTITUTION`, `EXCEPTION_WORK`, `INFLOW`.

`/defaulttaxrates`: `{code, name}` met codes 0, 6, 12, 21, 0_SHIFTED, 0_SHIFTED_EU.

`/socialsecuritycategories`: een aantal codes 224, 226, 244, 254 voor bouw-categorieën.

`/absenceReasons?statuteCode=FLEX_LABOUR`: `[{"code":"JUSTIFIED_ABSENCE",...},{"code":"UNLAWFULLY_ABSENT",...},{"code":"NATIONAL_HOLIDAY",...}]`.

`/absenceReasons?statuteCode=LABOUR`: groter (LEAVE_OF_ABSENCE, SICK, JUSTIFIED_ABSENCE, UNLAWFULLY_ABSENT, BAD_WEATHER, NATIONAL_HOLIDAY, FAMILY_LEAVE, ...).

### Belangrijk

- DictionaryItem op de wire is `{code, name}` ALLEEN. Geen `label`, geen `description` (zoals eerder vermoed).
- Voor sommige types heb je een verrijkt object met extra velden (StatuteItem heeft genericStatute, LanguageItem heeft primary).
- Errors gaan via de standaard `apiErrors` envelope met code = "Dictionary with type=<X> is not supported".

## Catch-all gevaar

`GET /{resourceType}` is een fallback die elke single-segment path probeert te resolven via `DictionaryType.findByResourceName`. Dat kan botsen met sibling controllers (bv. `/api/employees` zou hier onderschept worden als er ooit een DictionaryType met dezelfde resourceName komt). Spring routing matched specifiekere routes eerst, dus in praktijk zelden een probleem, maar nieuwe endpoints toevoegen onder `/api/<naam>` met overlapping resourceName moet je vermijden.

## Voor PoC

Als je dropdown-data nodig hebt: gewoon `GET /publicapi/dictionaries?types=...` zonder skey. Geen auth, geen rate limit zichtbaar in code. Cache voor je app session (data verandert zelden).

```bash
curl "https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi/dictionaries?types=PCCODE,STATUTE,LANGUAGE"
```
