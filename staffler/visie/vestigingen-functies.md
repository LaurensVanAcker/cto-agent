# Voorstel: Groepen schrappen, vervangen door Vestiging + Functie

Datum: 04/05/2026.

## De aanleiding

Jij ziet in de praktijk dat klanten Groepen overwegend gebruiken als regio- of locatienaam. Een paar voorbeelden uit de huidige Demobedrijf-data: "Locatie A", "Locatie B", "Korenmarkt", "Sint-Pieters". Plus daarnaast functie-achtige namen zoals "Bar", "Afwas", "Service", "Koerier".

Groepen zijn dus de facto twee dingen tegelijk: vestiging-tags en functie-tags. Eén veld voor twee betekenissen. Dat maakt elke filter, elk overzicht, en elke uitbreiding onnodig moeilijk.

Onder voorbehoud van jouw verificatie (klanten-data scannen): de meerderheid gebruikt Groepen op een manier die zich laat opdelen in Vestiging of Functie.

## Het voorstel

Schrap het Groepen-concept als feature en vervang door twee aparte tags-categorieën:

- Vestiging: een werkplek binnen het bedrijf. Optioneel. Bedrijven met één locatie laten dit leeg.
- Functie: een rol of taak. Bar, Afwas, Service, Koerier. Optioneel maar bijna altijd nuttig.

Een medewerker krijgt:

- 0, 1 of meer Vestiging-tags (bijvoorbeeld "Korenmarkt", "Sluizeken")
- 0, 1 of meer Functie-tags (bijvoorbeeld "Bar", "Service")

Geen relatie tussen de twee, het is gewoon n-op-n tagging in twee categorieën.

## Waarom dit beter werkt

### Voor de klant

- Hij denkt al in deze termen, hoeft niet meer te improviseren met een veld dat eigenlijk niet voor zijn use-case bedoeld is
- Filters in de planning hebben twee aparte assen: filter op vestiging EN filter op functie
- Bij shift-aanmaak kan hij zeggen "Bar in Korenmarkt" en de tool stuurt naar exact de juiste subset

### Voor het ontwerp

- Vestiging + Functie geeft ons een natuurlijke rij-as in de planning-grid (Vestiging-secties met Functies eronder)
- Default broadcast bij Niveau 2 wordt "iedereen met functie X in vestiging Y" zonder dat de klant moeite hoeft te doen
- Beschikbaarheid wordt slimmer: medewerker geeft eventueel beschikbaarheid per vestiging-functie-combo door (later)

### Voor migratie

- Per groep, per klant, één keuze: dit was eigenlijk een Vestiging, of een Functie, of allebei niet (rare gevallen)
- Tooling om de huidige Groep-tags te re-classificeren in twee batches (vestiging-tags, functie-tags)
- Klanten zonder Groepen aan: krijgen niets te zien, niets verandert voor hen, behalve dat ze later de tags wel kunnen invoeren als ze willen

## Wat raakt dit niet

- Loonpakket blijft volledig ongewijzigd. Statuut, paritair comité, locatie-in-naam, functie-in-naam, alles blijft zoals het is. Vestiging en Functie zijn parallel-tags, geen vervanging
- Pool-concept blijft. Medewerker hoort bij de pool van een Bedrijf
- Contract-structuur blijft

## Wat raakt dit wel

- Bestaande Groepen-tabel en Groep-Medewerker-link verdwijnt op termijn (na migratie)
- Twee nieuwe tabellen: Vestiging (per bedrijf) en Functie (per bedrijf), plus n-op-n koppelingen naar Medewerker
- UI in pool-beheer: klant kiest vestiging-tags en functie-tags per medewerker (tag-style)
- UI in planning: rij-as gegroepeerd op Vestiging > Functie
- Migratie-tooling: éénmalige actie per klant om Groep-tags op te splitsen

## Risico's en zorgen

### Klanten die Groepen écht voor iets anders gebruikten

Als 10% van de klanten Groepen voor "skill-tagging" of "voorkeur-shifts" gebruikt, hebben we een rest-categorie nodig. Optie: een derde "Vrije tag"-categorie behouden, of die mensen tijdens migratie informeren dat hun groep verdwijnt.

Verifieer dit eerst in de data. Een query op alle Groep-namen per klant zou snel duidelijk maken hoeveel gevallen écht uniek zijn.

### Migratie-effort

Niet niets. Per klant moeten we hun groep-namen presenteren met "wat hoort dit te worden". Eventueel automatisch op basis van naam-patronen ("Locatie A" → Vestiging, "Bar" → Functie), maar elk geval blijft handmatige bevestiging.

Tijdsinschatting voor migratietooling + uitvoering: paar dagen ontwikkeling, plus support-tijd om klanten doorheen te begeleiden.

### "Niet alles herbouwen"-randvoorwaarde

Dit overschrijdt de eerdere "niet alles herbouwen". Maar het raakt niet aan Loonpakket, Contract, Pool of Medewerker-structuur. Het vervangt enkel Groepen. Een goede compromis: meer dan minimale ingreep, minder dan refactor van Loonpakket.

## Vraag aan jou

Vooraleer ik dit verwerk in alle visie-documenten en in de mockups:

- Is het in orde dat ik dit concept verder gebruik als basis (Vestiging + Functie ipv Groepen)?
- Of wil je eerst de data verifiëren bij echte klanten en dan beslissen?
- Of hou je liever een vluchtweg "Vrije tag" voor edge cases naast Vestiging en Functie?
