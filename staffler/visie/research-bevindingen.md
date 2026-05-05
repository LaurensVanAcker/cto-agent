# Research-bevindingen Jira + Confluence (ronde 2, gecorrigeerd)

Datum: 04/05/2026.

## Belangrijke correctie tegenover de eerste versie van dit document

Twee zaken die ik in de eerste versie verkeerd geinterpreteerd had, en die expliciet OUT OF SCOPE zijn voor dit project:

- Flashes zijn een concept in WorkToday, niet in Staffler. Flashes = je open shift versturen naar mensen BUITEN je pool (interim-kantoren, Facebook, ...). Dat zal pas in een latere fase als 4de type in Staffler komen, om een Niveau 2 shift met 0 reacties extern te broadcasten. Niet voor nu. We bespreken het zelfs niet.
- availabilityScore zit in Eagle, niet in Staffler. Het is een lead-scoring met decay-logica gebaseerd op recente interactie. Heeft niets te maken met onze Beschikbaarheid-entity.

Beide moeten dus uit ons ontwerp- en discussie-perimeter blijven.

## Wat dan wél bruikbaar is uit de research

### MyStaffler-app heeft mockups voor de medewerker-zijde (BCJ-19432)

Epic BCJ-19432 in Jira bevat 6 child stories en 4 high-fidelity mockup-attachments. Deze zijn relevant omdat MyStaffler de medewerker-tegenhanger is van Staffler-admin in onze uitbreiding.

Mockups in attachments:

- BCJ-19433 image-20260416-133609.png (16 KB), week-kalender met shift-blokjes per dag
- BCJ-19436 image-20260416-133609.png (46 KB), full shift detail modal scheduled state, met datum/tijd/locatie/rol/loon en acties
- BCJ-19436 image-20260416-135055.png (39 KB), full shift detail modal completed state
- BCJ-19438 image-20260416-135637.png (32 KB), shift-annulatie modal, dropdown rede

Stories:

| Key | Status | Story |
|---|---|---|
| BCJ-19433 | DEV TESTING | FE View my weekly shift schedule |
| BCJ-19435 | In Progress | View shift card details in the schedule list |
| BCJ-19436 | To Do | View full shift details |
| BCJ-19437 | To be refined | See empty state when no shifts |
| BCJ-19438 | To Do | Cancel a scheduled shift |
| BCJ-19425 | In Progress | MyStaffler Pool Overview & Invite Management |

Wat ontbreekt: hoe een medewerker een nieuwe Niveau 2 shift-broadcast ontvangt en accepteert in MyStaffler. Geen ticket of mockup gevonden voor die specifieke flow.

### Shift-states in MyStaffler-tickets

Beschreven in BCJ-19438 en omliggend:

```
Scheduled → Completed (na clock out)
Scheduled → Cancelled (medewerker of planner annuleert, met rede: Niet beschikbaar / Ziek / Andere)
```

Cancelled shifts blijven zichtbaar als historiek.

Past bij onze eigen Contract-states (Toegewezen → Bevestigd / Annulatie / Overdue) en validateert de richting. Geen tegenstrijdigheid.

### Shift Templates in Staffler bestaan al (DPS Confluence 2656862230)

Reusable shift-hours per bedrijf, gebruikt bij contract-creatie:

- Velden: naam, van-tot, pauze-van-tot
- UI: radio "Use existing template" of "Enter new hours"
- Side-effect: bij "Enter new hours" + checkbox "Ik wil opslaan" → template wordt aangemaakt

Dit is Staffler-eigen (DPS-space), niet WorkToday. Wij kunnen dit hergebruiken bij Niveau 2 shift-aanmaak: klant kiest een Shift Template als basis voor zijn open shift. Geen nieuw concept, gewoon hergebruik.

## Wat ik dus NIET kan claimen op basis van research

- Het flash-patroon van WorkToday is geen valide referentie, want andere applicatie en ander scope.
- availabilityScore uit Eagle is geen voeding voor onze Beschikbaarheid-entity.
- Pages uit de DPSSS1 Confluence-space (Pool of candidates for a flash, Pool of new flashes for employees, etc.) gaan over WorkToday, niet over Staffler. Niet bruikbaar als ontwerp-input.

## Wat dat betekent voor het ontwerp

Onze drie-niveaus-uitbreiding voor Staffler is voor het overgrote deel genuin nieuw:

- Niveau 1 (manueel) bestaat al, blijft.
- Niveau 2 (klant maakt shift, broadcast naar pool, kandidaat reageert via MyStaffler) is voor Staffler nieuw. We kunnen Shift Templates hergebruiken voor de uren-input, maar het concept Shift-met-broadcast en ShiftApplicatie zijn nieuw.
- Niveau 3 (medewerker post Beschikbaarheid in MyStaffler, klant pikt) is volledig nieuw, geen bestaand concept om op te leunen.

Voor de medewerker-zijde van Niveau 2 (ontvangen en accepteren van een shift-broadcast) zit er nog géén ontwerp in BCJ-19432. Dat moeten we dus aanleveren bovenop wat MyStaffler nu plant.

## Open vragen die wel relevant blijven

Vraag 27 t/m 34 uit beslissingen.md blijven volledig staan.

Eén nieuwe vraag, vervanger van mijn eerdere foutieve 35-37:

35. Voor de medewerker-zijde van Niveau 2 (ontvangst en acceptatie van een shift-broadcast in MyStaffler): is er een tech-lead / designer die we hierbij betrekken zodat onze shift-broadcast-flow naadloos in de MyStaffler-roadmap past?

36. MyStaffler-roadmap. ✅ Beslist 04/05/2026: Niveau 2 acceptatie-flow in MyStaffler komt pas NA de basis MyStaffler-implementatie (de 4 mockups uit BCJ-19432). Dit betekent dat onze Staffler-admin-uitrol van Niveau 2 wacht op MyStaffler-basis livegang.

37. Shift Templates van vandaag (DPS Confluence 2656862230). Uitbreiden met capaciteit-veld (Niveau 2 shift met capaciteit > 1) en datumrange-toelating, of nieuwe entity Shift bouwen?

## Conclusie van deze ronde

De research leverde niet wat ik er aanvankelijk in las. Het flash-spoor en de score-koppeling waren mijn fout. Wat overblijft:

- MyStaffler bouwt een medewerker-app met mobiele shift-views, dat is parallel werk dat we moeten meenemen
- Shift Templates in Staffler-DPS zijn een bestaand patroon dat we kunnen recycleren voor de uren-input van Niveau 2
- Voor de rest: Niveau 2 en 3 zijn voor Staffler genuin nieuw te bouwen, additief op het bestaande contractmodel

Geen short-cuts via WorkToday of Eagle te halen. Dat scheelt verwarring later.
