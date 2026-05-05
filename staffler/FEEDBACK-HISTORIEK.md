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
