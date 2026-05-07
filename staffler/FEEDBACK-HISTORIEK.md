# Feedback-historiek per ronde

Tijdslijn van wat Laurens gevraagd, gecorrigeerd of bevestigd heeft. Helpt om de evolutie van het ontwerp te begrijpen en te vermijden dat we cirkels gaan trekken in een nieuwe chat.

## Ronde 1, eerste verkenning

Onderwerp: hoe Staffler vandaag werkt + drie mockups voor de nieuwe richting.

Bevestigd:

- Eén blok per dag in een contract, alleen pauze variabel, multi-day mogelijk via datumrange
- Team-planning bewust niet gebouwd, klanten hebben max 1-2 mensen per rol
- Pool-concept staat overeind
- Groepen is opt-in feature per klant

Belangrijkste prikkel: drie planning-werkwijzen moeten in één scherm samenkomen, geen mode-switch.

## Ronde 2, antwoorden op eerste vragen-set

Onderwerp: 12 vragen om mockup-richting te kiezen.

Antwoorden:

1. Locatie als entity: vraag onduidelijk, later via vraag 27 bevestigd dat geen aparte Locatie-entity nodig is, gebruiken Vestiging-tag concept
2. Functie loskoppelen van Loonpakket: nee, te veel aanpassingen
3. Wat met groepen: klanten gebruiken die nu vaak als regio-naam
4. Beschikbaarheid eenvoudig houden: één range per dag
5. Shift-capaciteit > 1: ja
6. Multi-day shifts: ja
7. Broadcast-target op groep-niveau: ja, maar dan zit je vast voor klanten zonder groepen
8. Na deadline 0 kandidaten: niets gebeurt, klant ziet zelf
9. Default loonpakket bij eerste contract: vraag aan klant
10. Real-time vs cron: huidige 15min behouden
11. Mockup-richting: nog niet kiezen, eerst meer denken. Cruciale randvoorwaarde: niet alles herbouwen
12. MVP-scope: nog te bepalen

## Ronde 3, research-correctie

Laurens corrigeerde mij:

- Flashes is een WorkToday-concept (broadcast naar buiten de pool, interim-kantoren, Facebook), out of scope. Komt later als 4de type.
- availabilityScore zit in Eagle (lead-scoring met decay), out of scope.

Daarmee viel mijn aanname weg dat we 50% konden hergebruiken. Niveau 2 en 3 zijn vrijwel volledig nieuw te bouwen voor Staffler, additief op bestaand contract-model.

## Ronde 4, levensloop uitwerken

Vraag: schrijf state diagram met ingangen en levenslopen.

Resultaat: visie/levensloop-blokjes.md met Mermaid + .html versie. Drie objecten (Shift, Beschikbaarheid, Contract) elk met eigen state-machine, plus consolidatie-diagram.

## Ronde 5, vereenvoudiging

Laurens reageerde op mockup 06 (selectie-picker met 287 mensen, 5 filters, 6 bulk-buttons) met "veel te vol en veel te complex". Vraag: gebruiksvriendelijke tool zonder opleiding.

Belangrijke nieuwe insights:

- Klant sleept blokje op het bord (niet via knop)
- Per slot binaire keuze: persoon kiezen of open shift
- Bij open shift: zien wie beschikbaar is doorgaegeven
- Bij heropenen: zien wie kandidaat is
- "Stap 2 kan misschien gecombineerd?" → ja, één dialog, per slot een knop-keuze

Plus voorstel: Groepen schrappen, vervangen door Vestiging + Functie als concepten. Nog te verifiëren bij klantdata.

## Ronde 6, dialog-vereenvoudiging

Mockup 7 v2: bouwde simpele dialog met capaciteit-input en autocomplete in slot.

Feedback Laurens:

- Capaciteit-veld lelijk, fancier maken (werd pill-rij 1-6 + overflow)
- "Typ een naam of laat open" vreemd, binaire knoppen "Persoon kiezen / Open" maken
- Autosuggest: "past op shift" abstract, gebruik "beschikbaar tussen 9u en 18u"
- Broadcast: niet filteren op vestiging+functie, gewoon "iedereen in de pool" of "specifieke namen"

Resultaat in mockup 7 v3: pill-capaciteit, binaire slot-keuze, expliciete uren in autosuggest, drie radios voor broadcast.

## Ronde 7, styling polish

Vraag: kleuren, iconen, lettertypes, spacing matchen aan Staffler-screenshots.

Resultaat: SVG-iconen ipv emoji, magenta+indigo+navy palette, Inter-font, generous spacing.

## Ronde 8, popup-clip + 24u-tijd

Feedback:

- In B viel de popup buiten de modal en was niet zichtbaar (overflow:hidden)
- Deadline gebruikte AM/PM-formaat, in België is altijd 24u

Fix: overflow visible op modal met juist border-radius op header/footer. Deadline omgezet naar twee tekstvelden "04/05/2026" + "18u00".

## Ronde 9, schermen D en E + mockup 8

Vraag:

- D: Specifieke namen geselecteerd, deels verzonden, deels nog niet (WhatsApp-knop vs verzonden-status)
- E: bestaande shift heropenen na deadline, kandidaten zichtbaar
- Mockup 8: nieuw planscherm in dezelfde Staffler-layout

Resultaat:

- Mockup 7 met 5 staten (A-E) horizontaal scrollbaar
- Mockup 8 op screenshot-basis, vestiging+functie axis

Vraag van mij: wil je pixel-perfect via Chrome MCP? Antwoord: ja, Chrome staat open.

## Ronde 10, scherm E correctie + Chrome-extractie

Feedback:

- E: kandidaten zijn shift-breed, niet per slot. Alle 4 reageerders gelden voor de open plaatsen samen
- Klant heet IzyCoffee (niet IzyKoffie)
- Filter Beschikbaar/Iedereen op de strip is raar, gewoon weglaten
- Ga pixel-perfect met live Chrome

Resultaat: 

- E heeft één gepoolde kandidatenlijst onder de slots
- Naam corrigeerd
- Filter weg
- Mockup 8 v2 op basis van live DOM-extractie. Belangrijkste vondsten:
  - Primary kleur is INDIGO #3C51F0 (sidebar actief, Planning-pill), magenta #FC074F is voor brand-accenten
  - Banner heeft bg rgba(60, 81, 240, 0.20), border-radius 6px 6px 0 0
  - Block in echte Staffler heeft navy border #1E1864 op lavender bg (10% alpha)
  - Inter-font met letter-spacing 0.5px

## Ronde 11, finale poets

Feedback:

- "4 reageerden" badge in scherm E mag weg
- Lettertype-tweak in mockup 8 (letter-spacing 0.5px en font-smoothing auto)
- "+ Nieuwe shift" knop weg, klant sleept altijd
- Meer mensen in beschikbaarheidsstrip (was 3, nu 9)
- Block-kleur: navy uit huidige tool is lelijk, vervang door zachter indigo (#EEF2FF/#A5B4FC/#312E81)

## Wat morgen gepresenteerd wordt

Aan CEO Lieven en Legal:

- Mockup 8 v2 (planscherm)
- Mockup 7 met 5 staten (shift-aanmaak en heropenen)

Verwachte vragen voor Legal:

- Privacy bij shift-broadcast: hoe wordt toestemming geregeld?
- Cross-bedrijf zichtbaarheid van beschikbaarheid: kunnen klanten zien dat hun medewerker ook elders werkt?
- Audit-trail bij annulatie en kandidaat-keuze
- Arbeidsrechtelijke status van een Open Shift voor toewijzing

Verwachte vragen voor CEO:

- Strategische prioriteit tov MyStaffler basis-uitrol
- Gefaseerde MVP en welke klanten als beta
- Migratie van Groepen naar Vestiging+Functie, hoe ondersteunen we dat

## Ronde 12, business-feedback op mockups (in progress)

Onderwerp: business heeft mockup 7 (dialog) en mockup 8 (planscherm) gereviewd. Nieuwe richting in 6 punten:

1. Dropdown autocomplete krijgt drie groepen ipv twee: groen-beschikbare, oranje-of-geen-label-medewerkers, en nieuw vaste werknemers
2. Share-component verhuist van per-shift dialog naar batch-knop op planscherm-niveau
3. Eindresultaat na dialog moet per persoon een eigen blok geven (regel: blok = Dimona created), open slots blijven 1 gemeenschappelijk virtueel blok met slot-counter en opted-in counter
4. Bottom availability-strip gaat weg, view-toggle bovenaan wordt Names vs Vestiging+Service location
5. Nieuwe day-view met giant charts naast bestaande week+2week view
6. Nieuw blok-type fixed employees, derde virtuele type naast contract en open shift

Sub-ronde 12.1, fixed employees fundamentals (beslist 05/05/2026):

- Aangemaakt door klant zelf in nieuwe Pool-scherm (BCJ-19425), aparte filter temp/fixed
- Velden: enkel naam + email, geen andere eigenschappen, geen validatie behalve email-uniek per pool
- Geen import vanuit sociaal secretariaat
- Eens aangemaakt blijven ze in de pool tot wissing
- Echte entity FixedEmployee in DDD
- Geen Vestiging-tag of Functie-tag op de entity zelf, wel op het virtueel contract per planning-instantie
- Per Bedrijf, scope email-uniciteit is pool van die klant
- Geen validaties in het algemeen, klant doet wat hij wil
- Met huidige wetgeving fixed OF extra earner, niet beide tegelijk voor zelfde persoon
- Geen cross-company conflict-detectie
- Visueel: andere kleur dan Anouk-blok en open-shift-blok, wel zelfde shape, klikbaar voor edit (uren of wissen)
- Dropdown: aparte sectie "Vaste werknemers" zonder labels, niet mengen met andere groepen
- Virtueel contract enkel in DPS DDD context, geen sync naar Core/ISI/BrightStaffing

Open knopen na ronde 12.1:

- Kleurkeuze fixed-blok: nog visueel voorstel te doen
- Of temp/fixed-filter binnen scope BCJ-19425 valt of nieuw ticket nodig is
- Afstemming met Serkan (designer Pool-scherm) of fixed-rij past bij MyStaffler-status filters

Sub-ronde 12.2, oranje labels in dropdown (beslist 05/05/2026):

- Definitie non-ideal match: persoon gaf uren door voor die dag, maar start later of stopt vroeger dan wat de klant vraagt (geen volledige dekking)
- Groen blijft: persoon dekt volledig (start ≤ klant-start én eind ≥ klant-eind)
- Oranje label toont ook de doorgegeven range, niet enkel een icoon
- Sortering binnen oranje: alfabetisch op naam
- Oranje en geen-label samen in één onderste groep, onderling alfabetisch gemengd
- Volgorde top-down: groen → oranje + geen-label-mengeling → vaste werknemers (aparte sectie)
- Geen max per groep, search-filter bovenaan dropdown bestaat al en dekt dat

Sub-ronde 12.3, service location als concept (beslist 05/05/2026):

- Service location is een EXTRA dimensie naast Functie/loonpakket, niet een hernoeming. Datamodel additief: nieuwe entity ServiceLocation per Vestiging
- Voorbeeld: Vestiging "Gent Dok Noord" heeft service locations Toog, Kassa, Terras. Loonpakketten blijven onafhankelijk (Barista, Kelner, Afwasser)
- Optioneel per klant. Enkel klanten op de nieuwe planning-view gebruiken het. Klanten met 5 bijverdieners en links-namen-view zien dit niet
- Klanten zonder service locations: ofwel maken ze één generieke aan, ofwel blijven ze op de Names-view (links namen, zoals huidig Staffler)
- Geen service-location-tags op medewerker. Iedereen kan overal werken
- Geen mapping tussen service location en loonpakket. Klant kiest beide apart bij contract-aanmaak
- Bij contract-creatie zelf moet de bestaande Staffler-popup-functionaliteit nog gecombineerd worden met de nieuwe dialog: loonpakket, pauze, begin/einduur, multi-day datumrange. Ontbreekt nog in mockup 7

Sub-ronde 12.4, gecombineerde dialog (beslist 05/05/2026):

- Loonpakket is persoonsgebonden (verplaatsingsvergoeding, woon-werk afstand, etc.). Tonen pas als de klant een persoon selecteert in een slot, niet bovenaan de dialog
- Bij Niveau 1 (klant kiest direct iemand): loonpakket-veld verschijnt inline in dat slot
- Bij Niveau 2 (open shift broadcast): loonpakket pas tonen wanneer kandidaat gekozen is
- Uren en pauze: uniform voor alle slots binnen één shift
- Pauze: geen nieuwe UI verzinnen, hou exact zoals huidige Staffler doet
- Multi-day capaciteit > 1: levert 2 multi-day contracts (1 contract per persoon, beide dekken volledige range), niet 6 daycontracts
- Persoon moet volledige multi-day range opnemen, gedeeltelijke periodes (bv. enkel maandag) niet toegelaten
- Voor multi-day shifts: groene/oranje labels vereenvoudigen tot "Beschikbaar" / "Gedeeltelijk beschikbaar" ipv exacte uren tonen
- Open shift broadcast naar medewerker: enkel uren + plaats tonen, geen loonpakket-bedrag
- Service location: afleiden uit positie in grid (rij waar het blok staat). Klant kan blok verslepen tussen service locations, persoon en uren blijven dan ongewijzigd

Sub-ronde 12.5, batch-share knop (beslist 05/05/2026):

- Scope: alle open shifts in current week-view. Knop NIET tonen op 2-week view (te veel)
- Re-share: alle open shifts mee, ongeacht of eerder gedeeld
- Nieuw mechanisme: in de batch-dialog kies je een deadline. Die deadline wordt op elke open shift in die week overschreven naar de gekozen datum
- Expired deadlines worden zo gewoon naar voren geduwd, geen aparte exception-flow nodig
- Knop-positie: bovenaan toolbar naast week-navigatie, tekst zoals "Open shifts delen (8)", disabled bij 0 open shifts
- Dialog-design: behoud bestaande contract-niveau dialog uit mockup 7, met aanpassingen
- Eén "Verstuur naar selectie" knop ipv per-persoon WhatsApp-knoppen. Selectie kan zijn volledige pool of specifieke gebruikers
- "Last sent" tracking valt voorlopig weg, niet tonen in dialog
- Bericht-inhoud: gaat NIET meer via WhatsApp, wordt getoond in MyStaffler-app. Hoe en wat exact wordt later beslist
- Re-share gedrag: simpel houden, details later samen met MyStaffler-implementatie

Open knopen na ronde 12.5:

- Per-shift override (urgent last-minute share): blijft of verdwijnt? Niet expliciet beslist, vermoeden = verdwijnt
- Zichtbaarheid batch-knop wanneer enkel beschikbaarheid-blokjes (Niveau 3) zonder open shifts: vermoedelijk verborgen want counter = 0

Sub-ronde 12.6, contract-blok split na dialog (beslist 05/05/2026):

- Visuele layout: optie B, twee blokken onder elkaar in dezelfde cel, rij wordt automatisch hoger om beide te tonen
- Open-shift-blok counter-1 (slots): als tekst in het blok zelf, bv. "2 open shifts"
- Open-shift-blok counter-2 (opted-in): als getal in een ronde bol/badge op de kaart
- Opted-in telt zowel ShiftApplicaties (Niveau 2 reacties) als Beschikbaarheden (Niveau 3) samen op
- Klik naam-blok: bestaande Staffler contract-edit dialog
- Klik open-shift-blok: state E uit mockup 7, maar toont enkel de open slots, niet meer de reeds-ingevulde namen (die zijn afgesplitst)
- Drag-and-drop blokken: enkel verticaal (andere Vestiging of Service location), NIET horizontaal naar andere dag of tijdslot
- Zelfde regel voor open-shift-blokken: verplaatsen of annuleren, enkel verticaal verslepen
- Tijd of dag wijzigen gebeurt via klik op blok en wijziging in dialog, niet via drag
- Multi-day: 1 langgerekt naam-blok per persoon (over alle dagen), 1 langgerekt open-shift-blok over alle dagen (zoals huidig Staffler doet)
- Counter-status: zodra alle slots ingevuld zijn, open-shift-blok verdwijnt automatisch, enkel naam-blokken blijven

Sub-ronde 12.7, view-toggle Names vs V+SL (beslist 05/05/2026):

- Segment toggle (2 knoppen naast elkaar), niet dropdown. Positie: ik kies in mockup
- 2 views: Names en Vestiging+Service location
- V+SL-view heeft een sub-toggle voor week / 2 weken / dag. Dag-view is volledig nieuw, week en 2week bestaan al
- Names-view: open shifts EN beschikbaarheden zijn onzichtbaar en onbruikbaar in deze view. Enkel naam-blokken (contract) en fixed-blokken zichtbaar. Niveau 2 en 3 vereisen V+SL-view
- Mental model dus: Names-view = "klassiek" Staffler (Niveau 1 only). V+SL-view = nieuwe geïntegreerde view (Niveau 1+2+3)
- Fixed-blokken in Names-view: zelfde rij als de fixed employee (want fixed staat in pool met een naam), in lijn met overige blokken
- Klanten zonder service locations: NIET automatisch op Names-view gezet. Toggle blijft zichtbaar voor iedereen
- Beschikbaarheid in Names-view: gekleurde achtergrond op cellen waar medewerker beschikbaar is doorgegeven
- Toggle-keuze onthouden per gebruiker (persistence)
- Default view bij eerste login: V+SL

Open knopen na ronde 12.7:

- Sub-toggle (week/2week/dag): enkel in V+SL of ook in Names-view beschikbaar?
- Specifieke positie van de segment-toggle (mijn keuze, voorstel volgt in mockup)

Sub-ronde 12.8, mockup-deliverables (gebouwd 05/05/2026):

Vijf nieuwe mockups gemaakt op basis van alles uit ronde 12.1 t/m 12.7:

- 09-dialog-volledig.html: shift-dialog met geïntegreerde Staffler-velden. Datumrange (multi-day), Plaats tewerkstelling, toggle Bestaande shift / Nieuwe uren, Werkuren Van/Tot HH:MM, Pauze Van/Tot HH:MM, capaciteit-pills, 3 slots (1 ingevuld met loonpakket-veld zichtbaar, 1 open, 1 binaire keuze), broadcast-sectie met deadline. Plus aparte autosuggest-dropdown met 3 groepen (groen/gemengd/vaste werknemers)

- 10-planning-names.html: klassieke Names-view. Rijen = medewerkers, enkel naam-blokken (indigo) en fixed-blokken (teal). Beschikbaarheid als kleine washed-out labels per cel (groen/oranje, met tijdframe), niet meer als gekleurde achtergrond. Segment-toggle Names | V+SL bovenaan

- 11-planning-vsl.html: V+SL-view met segment-toggle, sub-toggle Week|2week|Dag, batch-knop "Open shifts delen (8)" in toolbar. Drie blok-types zichtbaar: contract (indigo), open-shift (amber gestreept met ronde primary-blauwe opted-in badge), fixed (teal met "Vast"-pre-badge). Stacking van naam-blok + open-shift in dezelfde cel wanneer mixed (di 5 mei en wo 6 mei bij Toog Gent illustreren). Bottom strip verwijderd

- 12-batch-dialog.html: batch-share popup, 2 varianten naast elkaar. Variant A "Volledige pool" toont info over de 28 medewerkers + waarschuwing dat vaste werknemers geen bericht krijgen. Variant B "Specifieke namen" toont zoekbare lijst met checkboxes en "4 van 28" counter. Deadline-picker bovenaan met info-banner dat dit alle open shifts overschrijft. Eén "Verstuur naar selectie" knop

- 13-planning-dag.html: dag-view met giant chart. Y-as = V+SL rijen (gegroepeerd per Vestiging), X-as = uren 6u-22u in 1u-kolommen. Blokken absoluut gepositioneerd via grid-column. Magenta now-line op 14u als visuele indicator. Stacking in lanes wanneer blokken overlappen. Datum-navigatie met Vandaag-knop + pijlen

Kleurkeuze blok-types (op basis van live Staffler-tokens, esthetische coherentie):
- Contract: bg #EEF2FF + border #A5B4FC + text #312E81 (indigo, bestaand)
- Open shift: bg #FEF3C7 + border #FCD34D + text #92400E (amber/oranje warm, dashed)
- Fixed: bg #F0FDFA + border #5EEAD4 + text #115E59 (teal gedempt). User mag nog kantelen naar slate-grijs als teal te uitgesproken voelt

Open knopen / verfijning na review:

- Sub-toggle in Names-view: nu enkel in V+SL voorzien (week-only Names). Bevestiging nodig
- Per-shift override (urgent share) volledig geschrapt
- Color of fixed: teal vs slate, na visuele check
- Day-view granulariteit 1u vs 30min, beslist op 1u voor mockup, evt fijner indien gevraagd
- BCJ-19425 Pool-scherm uitbreiden met temp/fixed-filter: nieuw ticket of binnen scope?
- Afstemming met Serkan voor consistente UI tussen Pool-scherm en V+SL planscherm

Bestanden in /cto/staffler/mockups/. Alle 5 mockups gebruiken dezelfde tokens en font-stack als mockup 8 v2 voor visuele coherentie.

## Ronde 12.9, business-feedback v2 (verwerkt 05/05/2026)

Klant gaf gerichte feedback per mockup en zei expliciet dat de mockups niet op de huidige Staffler-look leken. Ik heb live extractie gedaan via Chrome MCP en alle 6 mockups herwerkt.

Live ontdekkingen tijdens extractie:

- DPS gebruikt eigen icoon-font "dps-icons" met namen die mappen op Material Icons (apartment, vpn_key, groups, person_add, event_note, euro, timer, search, logout). In mockups gebruik ik nu Material Icons via Google Fonts CDN voor visuele identiteit
- Multi-day contracten zijn ÉÉN lang blok dat over meerdere kolommen loopt, met titel links bovenaan en tijden herhaald per dag (bv. "Verhuizer 10:00 > 18:00 / 10:00 > 18:00 / 10:00 > 18:00")
- Block-styling live: bg rgba(30, 24, 100, 0.10), border-color #1E1864 navy 2px solid, border-radius 8px, font-size 14px
- Vandaag-cell bovenaan grid is solid magenta brand met witte tekst (geen verzachte capsule)
- Pauze in dialog is een TIJDRANGE Van/Tot HH:MM (bv. 12:00 > 12:30), geen minuten-veld

Mockup-aanpassingen v2:

- 09-dialog-volledig.html: tot-uren overflow gefixt, broadcast/MyStaffler sectie en deadline weg (batch-only), capaciteit-pills vervangen door "Slot toevoegen" plus-knop onder laatste slot, Plaats tewerkstelling weggelaten, email weg onder vaste werknemer namen, avatars met initialen voor IEDERE rij in dropdown (consistent), statuten ipv functies (Flexijob bediende, Arbeider, Student, Extra, Bediende, ...)
- 10-planning-names.html: pixel-match met Material Icons sidebar + magenta brand + Inter-font, multi-day contract rendering voor Sarah (di-vr) en Thomas (di-za), beschikbaarheid-labels enkel in cellen ZONDER contract, alle labels groen (geen oranje meer in Names-view want we weten niet wat klant wil inplannen)
- 11-planning-vsl.html: pixel-match basis, multi-day rendering voor alle contract+open-shift+fixed blokken, sub-toggle volgorde Dag/Week/2 weken (klein → groot), Material Icons consistent
- 12-batch-dialog.html: deadline-overschrijver melding ook bij variant B toegevoegd, statuten ipv functies in name-list
- 13-planning-dag.html: sub-toggle volgorde Dag/Week/2 weken, pixel-match basis met sidebar+topbar+banner uit live Staffler
- NIEUW 14-locatie-eigenschappen.html: settings-dialog die opent via tandwiel-icoon naast service location-rij in V+SL planscherm. Velden: Naam, Icoon-picker (8 horeca-iconen), Vestiging (verplaatsbaar), Plaats tewerkstelling (adres + sub-tekst zoals "Bovenverdieping"), Verwijder-knop met soft-delete (bestaande contracten blijven)

Open knopen na ronde 12.9:

- Stylized S-logo gebruikt nu een eenvoudige rect-stack als placeholder. Echte logo SVG nog te exporteren uit Staffler indien gewenst voor pixel-perfect match
- Plaats tewerkstelling op service location: bevestiging dat adres + sub-tekst (bv. Bus, Verdieping) de juiste velden zijn
- Tandwiel-icoon naast service location-rij: blijft altijd zichtbaar of enkel bij hover?
