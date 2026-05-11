# Staffler werkmap

Twee parallelle sporen leven hier:

1. Visie en uitbreidingen op huidige Staffler (mockups, 3-niveaus, vestigingen+functies)
2. Externe PoC die op de Staffler/DPS backend praat (mei 2026, doel: laten zien aan klanten)

## Eerste oriëntatie

| Wat zoek je? | Lees |
|---|---|
| Beslissingen over uitbreiding huidige Staffler | `visie/beslissingen.md`, `visie/prioritering.md` |
| Hoe Staffler vandaag werkt | `huidige-werking.md`, `screenshots/` |
| 3-niveaus planning visie | `visie/3-niveaus.md`, mockups in `mockups/` |
| Hoe Staffler API werkt (auth, endpoints, DTOs) | `api/README.md`, dan `api/auth.md` |
| Lopende PoC bouwwerk | `poc/CONCLUSIONS.md`, dan `poc/PLAN.md` (de scope-autoriteit), dan `poc/TODAY-CHECKLIST.md` |
| Welk framework + stack we kozen | `stack-decision.md` |
| Open vragen aan dev-ops voor PoC start | `api/monday-checklist.md`, `api/known-gaps.md` |
| Sessie-context tussen chats | `CONTEXT-VOOR-NIEUWE-CHAT.md` |
| Geschiedenis van correcties | `FEEDBACK-HISTORIEK.md` |

## Onderdelen

```
staffler/
├── AGENTS.md                  je leest dit
├── README.md                  oude visie-leidraad
├── CONTEXT-VOOR-NIEUWE-CHAT.md
├── FEEDBACK-HISTORIEK.md
├── stack-decision.md          Fastify + Angular, met A2N migration optie
├── huidige-werking.md         wat Staffler vandaag doet
├── jira-pool-groups-mystaffler.md
├── api/                       API kennisbank (37 md files + OpenAPI)
│   ├── README.md
│   ├── auth.md, environments.md, conventions.md, errors.md
│   ├── endpoints-index.md     95 endpoints platte lijst
│   ├── live-findings.md       PROD-getest, correcties op de docs
│   ├── known-gaps.md          open vragen voor dev-ops
│   ├── monday-checklist.md    shopping list voor PoC start
│   ├── poc-recipe.md          stap-voor-stap recipe
│   ├── domains/               16 domain pages (companies, contracts, ...)
│   ├── openapi/openapi.json   OpenAPI 3.1 spec, 85 operations
│   └── sources/               ruwe bron-files (controllers, dtos, confluence, jira, error codes, cfn)
├── poc/                       LIVE skeleton, Fastify + Angular
│   ├── AGENTS.md              entry-point voor PoC werk
│   ├── CONCLUSIONS.md         handoff document, stand van zaken
│   ├── PLAN.md                3-niveaus scope met mockup-mapping (autoriteit)
│   ├── TODAY-CHECKLIST.md     run commando's voor dag 1
│   ├── README.md
│   ├── src/                   Fastify backend
│   └── frontend/              Angular 18 app
│       ├── AGENTS.md
│       └── ARCHITECTURE.md
├── visie/                     3-niveaus uitbreiding, domeinmodel
│   ├── 3-niveaus.md
│   ├── beslissingen.md
│   ├── domeinmodel-evolutie.md
│   ├── levensloop-blokjes.md (+ html)
│   ├── open-vragen.md
│   ├── prioritering.md
│   ├── research-bevindingen.md
│   ├── vereenvoudiging.md
│   └── vestigingen-functies.md
├── mockups/                   HTML mockups van planscherm
│   ├── 01-shift-board.html
│   ├── 02-resource-lanes.html
│   ├── 03-hybrid-timeline.html
│   ├── 04-resource-lanes-v2.html
│   ├── 05-create-shift-modal.html
│   ├── 06-selectie-picker.html
│   ├── 07-simpele-dialog.html
│   └── 08-planscherm-staffler-stijl.html
└── screenshots/               UI-foto's van huidige werking
```

## Conventies voor werk in deze map

- Belgisch Nederlands (Vlaams), behalve in `api/` waar mixed NL/EN omdat die kennisbank ook door niet-NL teamleden gelezen kan worden
- Geen em-dashes (—) in documenten
- Geen bold formatting
- Markdown structuur: prose-eerst, lijst alleen bij 3 of meer items
- File names lowercase met streepjes (kebab-case)
- Code conventies en stack zie `stack-decision.md` en `poc/AGENTS.md`

## Naming in code en database

Bewuste regel voor alle code (in het bijzonder `poc/`):

- Code-identifiers (variabelen, functies, types, klassen, modules): enkel Engels
- Database (tabelnamen, kolomnamen, enum-values): enkel Engels
- API-paden en query-parameters: enkel Engels
- Geen mix Engels/Nederlands binnen één identifier. Niet: `vast_employees`, `vestiging_group_id`, `loonpakket_id`. Wel: `permanent_employees`, `branch_group_id`, `wage_package_id`.
- Markdown/prose blijft Belgisch Nederlands

Vaste vertaaltabel voor de Staffler-context:

- vast → permanent (mensen met contract van onbepaalde duur, via ander sociaal secretariaat, niet door BOEMM gepayrolled)
- temporary = elke DPS-employee, BOEMM-payrolled, contract van bepaalde duur. Statuut-label (`WHITE_COLLAR`, `LABOUR`, `FLEX_LABOUR`, `STUDENT`, ...) is niet relevant voor de temporary-versus-permanent axis
- "flexi" vermijden in code want te dubbelzinnig met `FLEX_LABOUR`-statuut. Mag wel in prose
- vestiging → branch
- functie → function (vermijd als var-naam wegens SQL-keyword, kolom-suffix `_label` is OK)
- loonpakket → wage_package
- beschikbaarheid → availability
- bedrijf → company
- medewerker → employee
- shift, contract, kandidaat → shift, contract, candidate

Voor bestaande DPS-entiteiten volgen we de DPS-namen (Engagement, ShiftTemplate, Actual, etc.) om verwarring bij joins en API-calls te vermijden.

## Geschiedenis

Mei 2026 is de PoC kennisbank gebouwd in `api/`. Begin als reactie op een WT-proxy klant die hetzelfde deed op WorkToday. Eerste skeleton in `poc/` is Fastify + Angular 18. Niet-trivial stack-overweging (Remix 3 onderzocht, afgewezen, daarna A2N stack als toekomst-target gemarkeerd) staat in `stack-decision.md`.

April-mei 2026 is in parallel het visie-werk voor de uitbreiding van het bestaande Staffler product verder uitgewerkt. Zie `visie/` voor de 3-niveaus aanpak (manuele planning + shift broadcast + beschikbaarheden combineren in één scherm).
