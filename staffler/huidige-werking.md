# Staffler huidige werking

Geobserveerd uit screenshots myplanning.digitalpayrollservices.be op 04/05/2026, demo-bedrijf "Demobedrijf".

URL-domein zit nog op digitalpayrollservices.be (DPS-erfenis), branding is Staffler (S-logo, magenta). Migratie van URL is dus nog niet gebeurd.

## Hoofdnavigatie (linker sidebar)

Acht iconen, in volgorde:

- gebouw, vermoedelijk bedrijfsoverzicht
- sleutel, rechten of rollen
- groep mensen, Groepen
- mens+, medewerker toevoegen
- kalender, Planning
- euro, Prestaties
- stopwatch, mogelijk tijdregistratie of timesheet
- vergrootglas, zoeken

Headerknop wisselt mee per pagina (Planning, Prestaties, Groepen, Medewerkersprofiel). Wereldbol-icoon rechts is taalswitch.

## Centrale entiteiten

Bedrijf staat bovenaan elke pagina. Hier "Demobedrijf - 0000000000" (BTW-nummer als suffix). De UUID in de URL bepaalt context.

Medewerker is gekoppeld aan een bedrijf via een pool. Onderaan profiel staat "Verwijder uit pool", dus medewerkers zitten in een pool per bedrijf.

Loonpakket is de combinatie functie + statuut + paritair comité + locatie. Voorbeeld: "Barmedewerker - Flexijob Bediende - Leest (Lievegem)". Eén medewerker kan meerdere loonpakketten hebben binnen hetzelfde bedrijf (Anouk heeft er drie). Bij contract-aanmaak kies je welk loonpakket geldt voor die specifieke prestatie.

Contract = medewerker + loonpakket + datumrange + werkuren + pauze. Eén werkblok per dag, enkel de pauze is variabel. Wel multi-day mogelijk: één contract kan over meerdere dagen lopen, dan herhaalt het werkblok zich. Visueel als kaartje per dag in het planning-grid.

Groep is een tag voor medewerkers, vrij configureerbaar per bedrijf. Opt-in feature: niet alle klanten hebben groepen aanstaan. Voorbeelden uit demo: flexi's, jobstudent, Pizzabaker, technische dienst, winkel, Koerier, Arbeiders, Barmedewerkers, Locatie "A", Locatie "B", receptie. Eén medewerker kan meerdere groepen hebben. Toelating "Nog niet toegewezen aan een groep" bestaat (Muriel).

## Planning-pagina

Grid: medewerkers links (paginatie 1-11/11), dagen horizontaal (Vandaag highlighted, weekend grijs). Default-view is één week, knop "Toon twee weken" voor langer venster. Pijltjes voor navigatie tussen weken. URL houdt startDate/endDate bij.

Filters: zoek medewerker, "Ingepland op" dropdown, "Filter op groep" dropdown.

Klik op lege cel opent "Nieuw contract" dialog:

- datumrange (start > eind, default zelfde dag)
- loonpakket dropdown (gevuld vanuit medewerkersprofiel)
- keuze tussen "Geplande uren gebruiken" of "Nieuwe uren ingeven"
- uurcode dropdown (zag "05U" als voorbeeld, lijkt op een prestatiecode)
- werkuren van/tot, pauze van/tot
- knop "Bevestig contract"

## Prestaties-pagina

Zelfde grid-layout als planning, maar de kaartjes zijn gearceerd grijs. Header zegt: "Prestaties - gewerkte uren bevestigen". Dit lijkt de spiegel van planning: na de prestatie-datum schuiven contracten naar deze view om bevestigd te worden.

Filters: zoek medewerker, "Filter op groep", "Soort prestaties".

Past in de actuals-cyclus uit Confluence: maandag/dinsdag is bevestiging-window, met cron jobs voor auto-confirm en lock voor payroll-encodage.

## Medewerkersprofiel

Tabs:

- Algemeen, persoonsgegevens
- Contactgegevens
- Betalingsgegevens
- Documenten
- Loonpakketten

Algemeen-velden gezien op Anouk Staelens:

- rijksregisternummer (volledig zichtbaar in demo)
- voornaam, naam
- geslacht (dropdown)
- geboortedatum, geboorteplaats, geboorteland
- nationaliteit
- Student@Work veld (optionele code)
- E-signing toggle
- E-documents toggle

Onderaan: "Verwijder uit pool" links, "Terug" + "Opslaan" rechts.

Loonpakketten-tab: collapsible per bedrijf, lijst van loonpakketten met "Details bekijken" en delete-icoon, knop "Loonpakket toevoegen".

## Groepen-pagina

Tabel medewerker → toegewezen groepen. Tags zijn klein-blokjes met delete-x. Per medewerker een drie-puntjes menu (mogelijk "groepen toewijzen" of bulk-actie). "Nieuwe groep maken" bovenaan. URL parameter `unassigned=false` suggereert filter op niet-toegewezen.

## Domeinmodel zoals ik het lees

```
Bedrijf 1 ─── n Pool-medewerker
                    │
                    ├── n Loonpakket  (functie+statuut+PC+locatie)
                    ├── n Groep-tag
                    ├── n Contract     (dag-instantie, ref. loonpakket)
                    └── n Prestatie    (bevestiging contract na uitvoering)
```

Tijdsbeleid:

- Contract = vooraf gepland
- Prestatie = a-posteriori bevestigd, binnen Mon/Tue cycle
- Auto-confirm cron voor wat niet manueel bevestigd raakt (zie EBS schedules)

## Beperkingen die opvallen

- Eén werkblok per dag, multi-shift binnen een dag bestaat niet. Enkel de pauze geeft flexibiliteit
- Multi-day contract bestaat wel, maar herhaalt hetzelfde werkblok per dag
- "Soort prestaties" filter aanwezig op prestaties-pagina, dus categorisering bestaat (ziekte, verlof, gewerkt? niet zichtbaar uit screenshots)
- Bulk batch-copy contracten bestaat wel (release 11/02/2026), niet zichtbaar in basis-grid
- Locatie zit verborgen in loonpakket-naam ("Leest (Lievegem)") en in groepen ("Locatie A/B"), geen apart locatie-veld
- Geen kostenraming of brutoloon-preview zichtbaar bij contract-aanmaak

Team-planning bewust niet geïmplementeerd: bij hun klanten zijn er meestal maar 1 of 2 mensen die hetzelfde doen, planning is individueel.

## Wat Jira erover zegt (BCJ project)

Productwerk zit in BCJ. PRD is enkel voor incidents. Actieve epics begin mei 2026:

- BCJ-19481, MyStaffler setup + devops, Analyzing
- BCJ-19424, MyStaffler authentication & onboarding, Analyzing
- BCJ-19432, MyStaffler shift scheduling & planning, Analyzing
- BCJ-19439, MyStaffler clock in/out, Analyzing
- BCJ-19445, MyStaffler notifications, Analyzing
- BCJ-19452, MyStaffler profile & documents, Analyzing
- BCJ-18930, Indexations Module, Analyzing
- BCJ-19381 / BCJ-19053, Wage indexations 04/2026 / 03/2026

MyStaffler is dus de medewerker-app naast deze admin-front: clock in/out, shift-zicht, notificaties, profiel. Q2.2 sprint 22/04 - 06/05.

Recurring bug-thema's:

- BCJ-19561, geen validations op coefficients op contract-niveau (FE/BE-laag mismatch)
- BCJ-16811, country_iso null bij ambigue adressen (Menenstraat in 4 gemeenten), blokkeert Eagle-sync. Nog open sinds juli 2025
- BCJ-19485, contract PC124 (bouw) mag geen 1-dag zijn, maar maand-grens-splits maakten 1-dag-fragmenten. Extension-validation in testing
- BCJ-18862, originele 1-dag-fix PC124 (Done)
- BCJ-19041, text fields scaling (Done)

Leerpunten qua tech debt:

- Validatielagen niet consistent: FE blokkeert, BE laat door
- Adresresolutie heeft geen fallback bij ambiguïteit
- Maand-grens-splitting van contracten is broze logica
- Wage indexations zijn nog manuele maandklus, geen template/cron-flow
- Coefficient-templating per loonpakket of per medewerker bestaat niet bulk

## Open vragen voor uitbreiding

- Wat is het ambitieniveau? Marktverbreding (sectoren), feature-uitbreiding (shift-planning, kosten, klant-selfservice), of integraties?
- Is de kaartjes-grid de juiste primaire view, of moeten we naar een resource-planner achtige interface (à la Resource Guru, Shyfter)?
- Hoe verhoudt deze front zich tot WorkToday-self-onboarding (memo: per 21/04 focus op MyStaffler en WT)?
- Mobiel-flow voor medewerker (clock-in / actuals confirm) lijkt nog niet gedekt door deze admin-screens
