# Domeinmodel evolutie

## Vandaag

```
Bedrijf
  └── Pool (1 per bedrijf)
        └── Medewerker (n)
              └── Loonpakket (n, scoped op bedrijf)

Bedrijf
  └── Groep (n, opt-in feature)
        └── Medewerker-tag (n-op-n)

Contract
  ← Medewerker
  ← Loonpakket
  + datumrange (1 of meer dagen)
  + werkuren van/tot (1 blok per dag)
  + pauze van/tot
  + uurcode (vb 05U)

Prestatie = bevestigde Contract-instantie per dag
```

Geen Locatie als entity. Geen Functie als entity. Geen Shift. Geen Beschikbaarheid.

## Voorstel nieuwe structuur

```
Bedrijf
  ├── Locatie (n, optioneel)              [NIEUW]
  ├── Functie (n)                          [NIEUW, gepromoveerd uit loonpakket-naam]
  ├── Pool (1)
  │     └── Medewerker (n)
  │           ├── Loonpakket (n, scoped op bedrijf)
  │           └── default_loonpakket = laatst gebruikte  [AFGELEID, niet apart veld]
  └── Groep (n, opt-in)
        └── Medewerker-tag (n-op-n)

Medewerker
  └── Beschikbaarheid (n, cross-bedrijf zichtbaar)  [NIEUW]
        + datum
        + uren van/tot
        + status (open / ingetrokken / vervallen / vastgelegd)

Shift                                       [NIEUW]
  ← Bedrijf
  ← Locatie (optioneel)
  ← Functie
  + datum
  + werkuren van/tot
  + pauze
  + capaciteit (default 1)
  + deadline
  + targets: ALL_POOL of subset (lijst medewerker_id's of groep_id's)
  + status (draft / open / closed / fulfilled / cancelled)
  └── ShiftApplicatie (n)
        ← Medewerker
        + applicatie-tijdstip
        + status (kandidaat / geselecteerd / afgewezen / ingetrokken)

Contract (uitgebreid)
  ← Medewerker
  ← Loonpakket
  ← Shift (optioneel, alleen als uit shift-flow)   [NIEUW]
  ← Beschikbaarheid (optioneel, alleen als uit aanbod-flow)  [NIEUW]
  + datumrange
  + werkuren
  + pauze
  + uurcode
```

## Toelichting per nieuwe entity

### Locatie

Optioneel veld op Bedrijf. Bedrijven met één werkplek zetten dit niet aan en planning werkt zonder. Bedrijven met meerdere werkplekken (IzyKoffie Gent: Korenmarkt, Sint-Pieters, Sluizeken, ...) krijgen Locatie als first-class concept.

Effect:

- Loonpakket-naam hoeft niet langer de locatie te bevatten. "Barmedewerker - Flexijob Bediende" volstaat. Locatie wordt apart gekozen op contract of shift
- Planning kan gegroepeerd worden op locatie
- Beschikbaarheden kunnen optioneel locatie-voorkeur dragen (medewerker zegt: ik ben enkel beschikbaar voor Korenmarkt)
- Groepen blijven bestaan voor andere indelingen (vaardigheid, status, voorkeur), niet voor locatie als die als Locatie-entity bestaat

Migratie: bestaande loonpakketten met locatie in de naam moeten geparsed of manueel toegewezen worden. Niet triviaal.

### Functie

Vandaag zit functie in de loonpakket-naam ("Barmedewerker - Flexijob Bediende"). Functie en statuut zijn nu twee verschillende dingen die samen één string zijn.

Voorstel: Functie wordt een aparte entity per Bedrijf. Statuut blijft gekoppeld aan Loonpakket (want dat bepaalt het paritair comité). Eén Functie kan meerdere statuten hebben (een Barmedewerker kan flexi, student, of bediende zijn).

Loonpakket koppelt dan: Functie + Statuut + Paritair Comité + Locatie + barema-coefficient.

Effect:

- Bij shift-aanmaak kies je Functie + Locatie zonder dat je per se een specifiek loonpakket moet kiezen
- Pas bij toewijzen aan een medewerker pikt het systeem het juiste loonpakket op (op basis van statuut van die medewerker, default = laatst gebruikte voor die functie)
- Statuut is zichtbaar in de kandidatenlijst, want dat bepaalt de prijs voor de klant

### Beschikbaarheid

Eigenschap van de Medewerker, niet van een Bedrijf. Cross-bedrijf zichtbaar voor elk bedrijf waar die medewerker in de pool zit.

Velden:

- datum + uren van/tot
- optioneel: locatie-voorkeur per bedrijf
- optioneel: functie-voorkeur (kan ik een afwas-shift, of enkel bar?)
- status: open, ingetrokken, vervallen (na datum), vastgelegd (een contract kreeg deze beschikbaarheid als bron)

Conflict-handling: één beschikbaarheidsblok kan maar één keer "vastgelegd" worden. Wanneer Klant A een beschikbaarheid omzet in een contract, verdwijnt die uit de beschikbare-lijst voor Klant B.

Vraag voor later: als de medewerker ingegeven heeft "donderdag 12-19" en Klant A boekt 12-17, blijft 17-19 dan beschikbaar voor Klant B?

### Shift

Een vraag van de klant zonder concrete medewerker. Pre-contractueel.

Velden:

- bedrijf, locatie, functie
- datum + uren + pauze
- capaciteit (1 in de meeste gevallen, maar 2 voor "ik wil 2 afwassers")
- deadline (na deadline blijft de shift Open maar verstuurt geen reminders meer)
- targets: ALL_POOL of selectie van medewerkers / groepen
- status:
  - draft: klant aan het bouwen, nog niet verzonden
  - open: verzonden, accepteert applicaties
  - closed: deadline voorbij of klant heeft sluiten geforceerd, geen nieuwe applicaties
  - fulfilled: alle capaciteit ingevuld door contracten
  - cancelled: klant trekt shift in

Een Shift kan na fulfilment nog 1 of meer Contracten hebben. Bij capaciteit 2 zijn er 2 Contracten gelinkt aan dezelfde Shift.

### ShiftApplicatie

Een kandidatuur van een medewerker op een shift. Dit ontbreekt in geen ATS-systeem en hier ook niet.

Velden:

- shift_id, medewerker_id
- applicatie-tijdstip
- status: kandidaat (default na klikken), geselecteerd, afgewezen (klant heeft expliciet andere gekozen), ingetrokken (medewerker trekt zich terug)

Bij selectie van een ShiftApplicatie wordt een Contract aangemaakt met shift_id als bron. Het loonpakket wordt automatisch gekozen: default_loonpakket van die medewerker voor die functie, of de eerste passende.

## Wat dit betekent voor de UI

De grid toont voor één cel mogelijk:

- 0 contracten en 0 shifts: leeg, klikbaar voor manuele aanmaak (niveau 1)
- 1 shift in status open: gestreept blokje, badge met aantal kandidaten, deadline-icoon
- 1 shift in status closed met capaciteit 2 en 2 contracten: vol gekleurd, 2 namen
- 1 contract zonder shift-bron: vol gekleurd, 1 naam (niveau 1 of 3)

In een side panel:

- Beschikbaarheden voor de zichtbare week, gefilterd op (bedrijf-pool, functie-voorkeur als die er is)
- Lopende open shifts met status

## Datavolumes en performantie

Beschikbaarheden zijn potentieel veel records (medewerker x dagen x weken). Indexeren op (medewerker, datum) en (datum, status). Cleanup-cron voor vervallen beschikbaarheden, analoog aan ActualsDemoCleanupSchedule.

ShiftApplicaties zijn proportioneel aan shifts x reagerende medewerkers. Niet kritiek qua volume, wel qua realtime push.

Cross-bedrijf zichtbaarheid van beschikbaarheid is een nieuwe query-pattern. Die joint over alle bedrijven waar de medewerker in pool zit. Materialized view of cache te overwegen.

## API-implicaties (BE)

Nieuwe endpoints (minstens):

- POST /shifts (klant maakt en verzendt)
- GET /shifts?bedrijf=&datum= (klant ziet eigen shifts)
- POST /shifts/{id}/applicaties (medewerker reageert)
- POST /shifts/{id}/select (klant kiest, maakt contract)
- POST /beschikbaarheden (medewerker registreert)
- GET /beschikbaarheden?bedrijf=&datum= (klant queryt aanbod, scope = pool van bedrijf)
- DELETE /beschikbaarheden/{id} (medewerker trekt in)

Webhook of push naar MyStaffler bij shift-broadcast.

## Backward compatibility

Bestaande contracten blijven contracten. Geen Shift, geen Beschikbaarheid als bron. Niveau 1 blijft volledig functioneel.

Klanten die niet aan niveau 2 of 3 willen krijgen de extra UI-elementen niet te zien (bijv. shift-knop blijft verborgen tot feature aanstaat). Of: een Bedrijf-flag "shift_planning_enabled" en "availability_enabled" als aparte features. Te bespreken: opt-in of standaard mee.
