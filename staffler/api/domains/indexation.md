# Domain: Indexation

## Wat is Wage Indexation

België indexeert lonen periodiek volgens CPI of paritair-comité-specifieke regels. In Staffler gebeurt dat door alle `EmployeeWageWebDto` records met een coefficient te vermenigvuldigen en een nieuwe versie te bewaren.

Tot mei 2026 is dit grotendeels een manueel maandelijks proces. Het Indexations Module epic (BCJ-18930) automatiseert dit. Recente Jira-tickets:

- BCJ-19024 "Wages transactional indexing endpoint"
- BCJ-19030 "Travel Allowance Indexation Endpoint"
- BCJ-19124 "save indexation params for execution"
- BCJ-19242 "endpoint to save wage indexation (all wages)"
- BCJ-19243 "endpoint to save Travel Allowance"
- BCJ-19246 "Retrieve and delete saved indexations endpoint"
- BCJ-19250 "endpoint indexation History"
- BCJ-19329 "endpoint to execute wage indexation for normal pc codes"

## Huidig endpoint (intern)

```http
POST /internalapi/indexations/wages/execute
Content-Type: application/json

<WageIndexationWebDto>
```

NIET extern bereikbaar. Wordt getriggered door cron of door een ops-tool aan BOEMM-zijde.

## WageIndexationWebDto shape

Bron: `sources/dps-service-dtos.md` § 11.1. LET OP: dit DTO leakt JPA entity types (`employeewage.model.entity.Statute`), wat suggereert dat het niet strikt voor wire-gebruik bedoeld is.

```
id (UUID)
coefficient (BigDecimal)
applyDate (LocalDate)
pcCodes (List<String>)
statutes (List<Statute>)         // JPA entity, slechte API design
description (String)
```

## Voor PoC

Niet relevant tenzij PoC indexatie-historiek wil tonen. Verwacht dat de indexation API surface in mei-juni 2026 aanzienlijk uitbreidt; volg BCJ-18930 epic voor up-to-date endpoint-documentatie.
