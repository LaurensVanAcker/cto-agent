# OpenAPI export

Reconstructed OpenAPI 3.1 spec voor de Staffler / dps-service API. Gegenereerd uit de controller-inventaris in `../sources/dps-service-controllers.md`, niet uit een live `/v3/api-docs` (gateway authorizer blokkeert die voor externen).

## Status

- 68 paths, 84 operations, 44 component schemas (waarvan 41 stubs)
- Auth flow gemapt op `BoemmSkey` security scheme (`x-boemm-skey` header)
- DTO refs zijn placeholders. Volledige veld-definities staan in `../sources/dps-service-dtos.md`. Voor full type generation moet je de DTOs daar overzetten naar deze spec.

## Gebruik

### Type generation (TypeScript)

```bash
npm i -D openapi-typescript
npx openapi-typescript ./openapi.json -o ./src/staffler-types.ts
```

Stub schemas geven `{}` types. Vul ze handmatig aan vanuit `dps-service-dtos.md` zodra je een specifieke flow opbouwt.

### Stoplight / Swagger UI / Redoc

Open `openapi.json` in:

- https://editor.swagger.io
- https://redocly.github.io/redoc/
- Stoplight Studio

Voor `BoemmSkey` security: voer een geldige skey in als API key.

### Postman / Insomnia / Bruno

Import `openapi.json`. De requests staan klaar met juiste paths en body refs. Headers moet je zelf aanvullen.

## Generatie-script

`/tmp/build-openapi.py` (binnen Cowork sessie). Parses `dps-service-controllers.md` regex-stijl. Niet super robuust, maar voldoende voor een eerste spec. Verbeteringen:

- Volledige DTO inlining vanuit `dps-service-dtos.md`
- Response codes 4xx (uit error envelope shape)
- Tag descriptions per module

Zodra dit nuttig is voor het bouwteam: laat dps-service zelf de spec exposen via `springdoc-openapi-starter-webmvc-ui` (al in pom.xml, versie 2.3.0). Open de gateway authorizer voor `/v3/api-docs` op een interne route, of bewaar de spec als build artifact.

## Pinned commit

Source: `wlnob/dps-service` commit `1fc6cd30d62ec3bba51285585483a524a22f4238` (default branch op 9 mei 2026). De `info.version` field reflecteert dit. Voor toekomstige refresh: regenerate met dezelfde script tegen een nieuwe controllers-inventaris.

## Bekende beperkingen

1. Query parameter types staan default op `string`. Reality: `LocalDate`, `UUID`, enums, etc.
2. Response examples ontbreken.
3. Errors zijn alleen via x-error referenties beschikbaar, niet als 4xx response definities op elke operatie.
4. Multipart upload schemas zijn vereenvoudigd tot `{file: binary}`. Echte form-fields kunnen verschillen.
5. PageWebDto's `content[]` items zijn niet getypeerd (gebruik `x-page-of` extension om de inner type te zien).
