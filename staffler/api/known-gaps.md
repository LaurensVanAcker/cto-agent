# Known gaps en open vragen

Lijstje van dingen die we tijdens het opbouwen van deze kennisbank niet hard hebben kunnen verifiëren, of waar de bron-informatie inconsistent was. Een PoC-bouwer moet deze één voor één bevragen voor hij/zij erop bouwt.

## Auth + Cognito

1. (RESOLVED 2026-05-09) Pool names zijn `DPS` en `MyDPS-qa` (qa) of `MyDPS` (prod/dev). Reële IDs `eu-central-1_xxxxx` staan in AWS SSM, niet in git. Vraag dev-ops of decode een live JWT.
2. Zit MFA aan op de Cognito Company-pool? Login endpoint code lijkt enkel USER_PASSWORD_AUTH; bij MFA krijg je waarschijnlijk een NEW challenge die niet via setPassword opgelost wordt. Test met een echt account.
3. Is er een `client_credentials` grant beschikbaar voor server-to-server, los van de skey-flow? In `dps-external-auth/lambda/lambda_authorizer.py` zit alleen user-pool token logic. CFN bevestigt: `AllowedOAuthFlows: [code]` enkel. Geen client_credentials. Voor een PoC zonder UI: gebruik een service-account user (klant credentials in PoC env vars).

## API endpoints die ontbreken in dps-service maar door SPA gecald

4. (RESOLVED 2026-05-09) `GET /api/users/currentuser` IS aanwezig in dps-service, in `eu.boemm.dps.common.security.controller.UserController`. Geen aparte routing naar user-service. Returnt `DpsUserDetailsWebDto` met `user`, `userRoles`, `companyMemberships`, `managedEmployeeId`, `employeeId`, `userId`. Bron: dps-service-controllers-extra.md.
5. Endpoints voor "switch active company" voor multi-company users (BCJ-18103 done). Niet zichtbaar in `dps-service-controllers.md`. Mogelijk via `last-viewed` endpoint (`POST /api/users/{userId}/companies/{companyId}/last-viewed`) plus client-side switch via `companyMemberships[]` uit currentuser.
6. Forgot password endpoint voor employee Cognito pool — bestaat niet in dps-service. Hoe reset een MyStaffler werknemer zijn wachtwoord? Per Confluence: via itsme of admin re-invite. BCJ-19535 bouwt een aparte first-login password endpoint.

## Validation gedrag

7. Bijna geen `@Valid` op de Web DTOs. Welke service-laag validators worden geraakt voor `EmployeeWebDto.PUT`? De Confluence-pagina's (Contract validations 2798092290, Employee fields 2563112961) geven business rules maar niet exhaustief.
8. `EmployeeWageWebDto.hourlyWage` range: code zegt `[8.50, 100.00]`, invitation zegt `[8.30, 100.00]`. Discrepantie. Welke geldt waar?
8b. (RESOLVED 2026-05-09) Volledige error-codes lijst staat in `sources/error-codes.md`. 53 codes, alleen NL bestaat (geen EN/FR translations).

## Multipart bug

9. `EmployeeWageController.importEmployeeWages` gebruikt `@RequestBody MultipartFile` ipv `@RequestPart`. Werkt dit met standaard multipart upload vanuit een gewone HTTP client? Test eerst met één rij.

## Missing DTOs

10. `SubofficeWebDto`, `CompanyTimeTableWebDto`, `CompanyDocumentWebDto` worden in Confluence genoemd maar bestaan niet in code. Zijn er endpoints voor suboffices? Of zit dit verborgen in andere fields?
11. `ContractCopyRequestWebDto` bestaat niet — `/api/contracts/batch` accepteert direct `List<ContractWebDto>`. Confluence pagina 3185737748 ("Copy contracts from one week to another week") suggereert anders. Mogelijk werk-in-uitvoering, niet uitgerold.
12. `ContractHoursReportWebDto` bestaat niet in code, alleen interne types. Voor een PoC die report-data wil: gebruik actuals endpoint en aggregate zelf.

## Error semantics

13. Volledige set error codes. We hebben een onvolledige lijst. Voor robuuste PoC: pull `messages.properties` uit dps-service en parse alle keys.
14. 401 vs 403 vs 400-met-ApiErrors: drie verschillende body shapes. Een PoC moet ze alle drie afhandelen (zie `errors.md`).

## CORS

15. (PARTIALLY RESOLVED 2026-05-09) `application-qa.yml` haalt origins uit env vars (`${ORIGIN}`, `${MY_STAFFLER_ORIGIN}`). Localhost is NIET allowlisted in QA/PROD. Voor je PoC op Vercel of localhost: vraag aan devops om je exacte URL toe te voegen, OF gebruik een server-side proxy zoals WT-proxy doet.

## Rate limiting

16. Niet zichtbaar in code of gateway config. Veronderstelling: API Gateway throttle defaults (10000 rps account-wide, geen per-key throttle). Voor PoC die batches doet: opletten met rps spikes.

## OpenAPI publiek beschikbaar

17. Springdoc UI zit op `/dps-api/swagger-ui/index.html` (intern) maar gateway authorizer blokkeert hem. Optie: vraag een staging-omgeving zonder authorizer voor `/v3/api-docs` zodat externe tooling de spec kan pullen. Of gebruik onze offline export in `openapi/openapi.json`.

## Niet onderzocht in deze ronde

18. `media-service` voor file upload/download (`mediaBaseUrl`). Apart deployment, eigen repo. Niet in scope vandaag.
19. `boemm-core` REST client paths (Credit Safe lookups). Niet rechtstreeks bereikbaar voor PoC, alle calls gaan via dps-service.
20. `staffler-hs-integration` (HubSpot sync). Niet gebruikt door externe consumenten.
21. `digi-sign` + `digi-docs` (e-signing + e-docs). Niet onderzocht; vraag aan team als PoC documenten wil ondertekenen.
22. Audit endpoints voor andere entities dan notification preferences. Geen generieke audit endpoint zichtbaar.

## Vragen voor team voor PoC start

Een paar concrete vragen om vóór PoC-bouw aan te kaarten met Lieven of het backend-team:

- Mag je een testaccount krijgen op QA met een testbedrijf? Welke email + wachtwoord?
- Kunnen we de PoC origin (bv `https://staffler-poc.vercel.app`) toevoegen aan `boemm.allowedOrigins` in QA?
- Bestaat er een service-account / API-key flow, of moeten we via een gewone user-skey blijven?
- Is `/api/users/currentuser` echt op user-service gerouteerd, of moet de PoC die info uit het Cognito id_token zelf halen?
- Welke endpoints worden binnen 1-3 maanden breaking-changed (MyStaffler suite, Indexation module, ITSME v2)? Zodat we ze in PoC niet als load-bearing nemen.
