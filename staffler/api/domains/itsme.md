# Domain: itsme integratie

## Wat is itsme

itsme = Belgische digitale identiteitsapp, gebruikt voor sterke authenticatie en eID-data prefill. Staffler gebruikt itsme voor employee-registratie zodat naam, adres, geslacht, geboortedatum en SSN automatisch ingevuld worden zonder dat de employee zelf hoeft te typen.

Confluence (canonical): 2779676695 "Itsme integration: source of truth of data".

## Endpoints

```http
GET /publicapi/oauth/itsme/codeLink?state=<state>
```

Genereert een autorisatie-URL die de employee moet bezoeken (met itsme app op telefoon). Returnt `CodeLinkDto`:

```json
{
  "codeLink": "https://oidc.itsme.be/oauth2/authorize?client_id=...&state=<state>&...",
  "state": "<state>"
}
```

`state` is een opaque waarde gegenereerd door de backend, bewaard tijdens de roundtrip.

```http
GET /publicapi/oauth/itsme/callback?code=<authcode>&state=<state>&error=<optional>
```

Het redirect-target dat itsme oproept na succesvolle authentication. Backend doet:

1. Wisselt `code` voor itsme tokens via OIDC
2. Trekt de UserInfo (SSN, name, address, ...) uit
3. Maakt een (mini) skey aan voor de newcomer flow
4. Redirect (302) naar de SPA registration stepper URL met die skey

Geen body, geen JSON response. Alleen redirect.

## Configuratie env vars

```
ITSME_BASE_URI       https://oidc.itsme.be (PROD) of staging
ITSME_REDIRECT_URI   https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi/oauth/itsme/callback
ITSME_CLIENT_ID      ${ITSME_CLIENT_ID}
ITSME_CLIENT_SECRET  ${ITSME_CLIENT_SECRET}
ITSME_SERVICE_NAME   ${ITSME_SERVICE_NAME}
```

## Recent Jira

- BCJ-19111 "ITSME update to v2 endpoint" (on hold per may 2026)
- BCJ-19468 "Migrate all lambdas on v2 itsme endpoints"
- BCJ-19285 (testing task voor v2 update)

itsme heeft v2 OIDC endpoints uitgerold. Migratie nog niet klaar in Staffler.

## itsmeAuthorizationWebDto shape

Bron: `sources/dps-service-dtos.md` § 8.8.

```
id (UUID)
sub (String, itsme subject identifier)
authorizedAt (LocalDateTime)
verified (Boolean)
```

Dit is wat in `EmployeeWebDto.itsmeAuthorization` zit om aan te tonen dat de employee een geldige itsme authorization heeft.

## Implicaties voor PoC

itsme integreren in een PoC is complex (OIDC + Belgische compliance + sandbox testing met itsme test-app). Waarschijnlijk slechte keuze voor een eerste PoC. Beter:

- PoC werknemer-flow: gebruik gewone email/wachtwoord login op de employee Cognito pool
- Voor employees die al via itsme bestaan: werkt automatisch want hun JWT komt al van employee pool
