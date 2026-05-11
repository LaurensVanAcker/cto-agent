# PoC recipe

Praktisch startpunt voor een externe PoC die op Staffler draait. Doel: zo snel mogelijk een werkende client die een echt contract kan aanmaken op QA.

## Stap 0: pre-conditions

Vraag aan het Staffler team:

1. Een test-account in QA met username + password (een COMPANY_USER van een test-bedrijf)
2. Het `companyId` van dat test-bedrijf
3. PoC-origin toevoegen aan `boemm.allowedOrigins` in QA env vars (bv `https://staffler-poc.vercel.app` of localhost dev)

## Stap 1: login en skey verkrijgen

```bash
curl -i -X POST https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi/companies/users/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test@example.be","password":"TestPassword123"}'
```

Verwacht response:

```json
{
  "username": "test@example.be",
  "session": null,
  "authStatus": "SUCCESS",
  "skey": "abc123..."
}
```

Bewaar de skey. Vanaf nu zet je hem op elke call:

```
x-boemm-skey: <skey>
```

Indien `authStatus = FORCE_PASSWORD_RESET`: roep `setPassword` aan met de `session` value.

## Stap 2: dictionary lookups (geen auth nodig)

```bash
curl "https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi/dictionaries?types=PCCODE,STATUTE,LANGUAGE"
```

Cache deze in je PoC frontend voor de duur van de session.

## Stap 3: company info ophalen

```bash
curl -H "x-boemm-skey: <skey>" \
  "https://gw.qa.dps.boemm.eu/v1/dps-api/api/companies/<companyId>"
```

Returnt `CompanyWebDto`. Hier zit alle info die je voor contract-creatie nodig hebt: `paritairComite`, statutes-mix, address, coefficients.

## Stap 4: employees in pool ophalen

```bash
curl -H "x-boemm-skey: <skey>" \
  "https://gw.qa.dps.boemm.eu/v1/dps-api/api/employees?companyId=<companyId>&page=0&size=20&sortBy=lastName:asc"
```

Returnt `PageWebDto<EmployeeWebDto>`. Pak een employeeId uit de response.

## Stap 5: deze week's contracten ophalen

```bash
curl -H "x-boemm-skey: <skey>" \
  "https://gw.qa.dps.boemm.eu/v1/dps-api/api/contracts?companyId=<companyId>&startDate=2026-05-04&endDate=2026-05-10&page=0&size=50"
```

Returnt `PageWebDto<ContractBaseWebDto>`. Voor de rijke shape per contract: `GET /api/contracts/{id}`.

## Stap 6: een contract aanmaken

Dit is het echte werk. Eerst employee + company info hebben, dan:

```bash
curl -i -X POST -H "x-boemm-skey: <skey>" \
  -H "Content-Type: application/json" \
  https://gw.qa.dps.boemm.eu/v1/dps-api/api/contracts \
  -d '{
    "employeeId": "<employeeId>",
    "companyId": "<companyId>",
    "position": "Barmedewerker",
    "dateFrom": "2026-05-15",
    "dateTo": "2026-05-15",
    "timetable": {
      "schedule": [{
        "date": "2026-05-15",
        "fromTime": "18:00",
        "toTime": "23:00",
        "pauseFromTime": "20:00",
        "pauseToTime": "20:30",
        "createShiftTemplate": false
      }]
    },
    "statute": { "code": "FLEX_LABOUR" },
    "paritairComite": { "code": "302" },
    "wageHour": "13.0500",
    "officeCode": "DPS100"
  }'
```

Verwacht 200 met de volledige `ContractWebDto` terug, inclusief `id` en gegenereerde `workTimes`.

Mogelijke fouten:
- 400 met `code: CONTRACT_OVERLAP` → er is al een contract op dat tijdslot
- 400 met `code: CONTRACT_BEFORE_NOW` → dateFrom is < 29 min in toekomst
- 400 met `code: WAGE_OUT_OF_RANGE` → wageHour buiten `[8.50, 100.00]`
- 403 → user heeft geen `checkContract` permission

## Stap 7: client library kiezen

Voor TypeScript / Vercel:

```typescript
class StafflerClient {
  constructor(private gateway: string, private skey: string | null = null) {}

  async login(username: string, password: string) {
    const res = await fetch(`${this.gateway}/v1/dps-api/publicapi/companies/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    if (body.authStatus !== 'SUCCESS') {
      throw new Error(`Auth status: ${body.authStatus}`);
    }
    this.skey = body.skey;
    return body;
  }

  private async authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.skey) throw new Error('Not logged in');
    const res = await fetch(`${this.gateway}/v1/dps-api${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        'x-boemm-skey': this.skey,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json();
  }

  getContracts(companyId: string, startDate: string, endDate: string) {
    return this.authedFetch<PageWebDto<ContractBaseWebDto>>(
      `/api/contracts?companyId=${companyId}&startDate=${startDate}&endDate=${endDate}&page=0&size=100`
    );
  }

  createContract(contract: ContractWebDto) {
    return this.authedFetch<ContractWebDto>(`/api/contracts`, {
      method: 'POST',
      body: JSON.stringify(contract),
    });
  }

  // ... rest van de endpoints
}
```

Bouw types vanuit `openapi/openapi.json` (zie `openapi/README.md`) met `openapi-typescript`:

```bash
npx openapi-typescript ./openapi.json -o ./src/types/staffler.ts
```

## Stap 8: storage voor PoC-eigen data

Voor data die niet in Staffler hoort (zoals "beschikbaarheid" tot Staffler MyStaffler-API klaar heeft) gebruik je een eigen store:

- Vercel KV / Upstash Redis voor lichte key-value
- Supabase voor relationele tables
- Of een simpele JSON file in S3 zoals de WT-proxy doet

De WT-proxy in `WT-proxy/proxy.js` is een goed voorbeeld: hij gebruikt platte JSON files in een Docker volume. Voor Vercel is dat te ephemeraal, kies daar een managed store.

## Stap 9: deployment

- Vercel: zet env vars `STAFFLER_GATEWAY=https://gw.qa.dps.boemm.eu`, `STAFFLER_USERNAME`, `STAFFLER_PASSWORD`. Login bij cold-start van een serverless function, cache skey in KV.
- Netlify: idem.
- Eigen VPS/Docker: vergelijkbaar met WT-proxy aanpak.

CORS: zolang je PoC origin in `boemm.allowedOrigins` staat krijg je geen problemen. Anders krijg je preflight 403. 

## Stap 10: error handling

Centraliseer in één parser (zie `errors.md`):

```typescript
async function parseError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  if (body?.apiErrors) {
    return new Error(`Business: ${body.apiErrors.map((e: any) => e.code).join(', ')} (trace ${body.traceId})`);
  }
  if (body?.message) {
    return new Error(`Gateway: ${body.message} (HTTP ${res.status})`);
  }
  return new Error(`HTTP ${res.status}`);
}
```

## Stap 11: skey lifecycle

- Skey is geldig tot DynamoDB-row uitsterft (nooit auto-expiry getoond, default Cognito refresh van 30 dagen voor refresh_token gebruikt door authorizer)
- Bij 401 op een call: skey weggooien en opnieuw inloggen
- Bewaar skey enkel server-side bij PoC (geen browser-localStorage), tenzij je een full-trust SPA bouwt

## Veelvoorkomende valstrikken

1. CORS preflight wordt eerst geweigerd. Check `boemm.allowedOrigins`.
2. Tijden in `HH:mm` met 24h notatie. `08:30` werkt, `8:30 AM` niet.
3. `LocalDateTime` van `ActualWebDto.contractEndDate` gebruikt `yyyy-MM-dd HH:mm:ss` met spatie, niet `T`. Andere LocalDateTime fields gebruiken wel `T`.
4. Permission errors zien er anders uit dan business errors. 403 heeft geen `apiErrors` envelope.
5. Page response is een custom envelope, geen Spring default. Sortering gaat via één `sortBy=field:asc` parameter.
6. EXTRA statuut limiteert 1 dag, max 2 opeenvolgende. Check je timetable.
7. Time-gates op actuals: na maandag 23:59 lock je niets meer in de afgelopen week. Test contracten in toekomstige week.

## Wat je NIET moet doen in PoC v0

- Geen itsme integratie
- Geen multipart imports
- Geen contract cancellation flow (mutual agreement, signature)
- Geen indexation
- Geen admin invite van nieuwe Company users
- Geen interne `/internalapi` paths

Focus op één flow: list employees, list contracts, create contract. De rest komt later.
