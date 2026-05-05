# Mockups

Drie alternatieven voor het nieuwe planscherm dat niveau 1, 2 en 3 in één view combineert. Demoset: IzyKoffie Gent, week 4-10 mei 2026, 3 locaties (Korenmarkt, Sint-Pieters, Sluizeken), 5 medewerkers.

Open de HTML's in een browser. Zelfde data over de drie zodat je ze kunt vergelijken.

## 01 - Shift Board

Locatie + Functie als rij-secties. Dagen als kolommen. Open shifts en toegewezen contracten staan in dezelfde rij omdat ze hetzelfde stuk vraag invullen. Side panel rechts met "Beschikbaar deze week" als sleepbare kaartjes.

Sterk wanneer:

- Klant denkt vanuit zijn werkplek (waar moet wat gebeuren?)
- Veel locaties, veel functies
- Pool is groter dan wat je in één scherm wil zien

Zwak wanneer:

- Je wil persoon-eerst kunnen scannen ("wat doet Anouk deze week?")
- Eén locatie en weinig functies (overdesigned)

## 02 - Resource Lanes

Hiërarchisch: Locatie als parent-rij, Functie als sub-rij. Klik op een open shift opent een popover met kandidaten. Beschikbaarheden in een aparte strook onderaan, niet in een side panel.

Sterk wanneer:

- Veel locaties, expliciete hierarchie
- Klant wil locaties kunnen collapsen om alleen relevante te zien
- Beschikbaarheid-overzicht apart van planning, minder visuele ruis

Zwak wanneer:

- Schermhoogte beperkt (sub-rijen + strook eronder vraagt veel verticale ruimte)
- Pool is zeer groot (de strook onderaan wordt lang)

## 03 - Hybrid Timeline

Twee panelen onder elkaar. Bovenaan een strook "Open shifts deze week" als compacte tijdlijn (per dag). Daaronder klassiek medewerker-grid voor toegewezen contracten. Side panel rechts met de pool en beschikbaarheden, met tabs (Beschikbaar / Iedereen / Kandidaten).

Sterk wanneer:

- Je continuïteit wil bewaren met huidige UX (medewerker-grid blijft)
- Open shifts moeten heel zichtbaar zijn ("vraag-eerst" attentie krijgt prominent plaats bovenaan)
- Klant denkt vooral persoon-eerst

Zwak wanneer:

- Heel veel locaties (open shifts strook wordt rommelig)
- Veel parallelle open shifts op dezelfde dag (verticaal stapelen kan storend ogen)

## Belangrijkste verschilpunten

| Vraag | Mockup 1 | Mockup 2 | Mockup 3 |
|---|---|---|---|
| Primary axis | Locatie+Functie | Locatie > Functie | Mensen onderaan, slots bovenaan |
| Open shifts | inline in lane | inline in functie-rij | apart in strip bovenaan |
| Beschikbaarheid | side panel | strook onderaan | side panel met tabs |
| Continuïteit met huidig | laag | medium | hoog |
| Visuele densiteit | medium | hoog | medium |
| Geschikt voor multi-locatie | ja | sterk | matig |
| Geschikt voor enkele locatie | matig | overkill | sterk |

## 04 - Resource Lanes v2 (na feedback ronde 04/05)

Doorontwikkeling van mockup 2, met de feedback verwerkt:

- Statuten weg uit de functie-labels (te ingewikkeld, statuut zie je elders)
- Plusjes om Locatie en Functie aan te maken inline in de grid
- Blokjes kunnen partial-filled zijn: 1 toegewezen naam + 2 open plaatsen samen in één blokje
- Beschikbaarheidsstrip onderaan met filter "Beschikbaar / Iedereen", side panel rechts vervalt
- Toolbar-knop "Verstuur 3 open shifts" voor batch-broadcast naar volledige pool

Open shifts strip uit mockup 3 is niet behouden, want bij volume onhanteerbaar.

## 08 - Nieuw planscherm in Staffler-stijl

Hoofdpagina, gestyled volgens het echte Staffler-uitzicht uit de screenshots:

- Linker sidebar met S-logo en navigatie-iconen, magenta active state
- Topbar met "IzyKoffie Gent" in magenta en blauwe Planning-pill
- Toolbar met zoekveld, vestiging-filter, functie-filter, magenta "+ Nieuwe shift"-knop, week-navigatie
- Indigo info-banner zoals in de screenshots
- Grid met Vestiging > Functie als rij-as (Korenmarkt, Sint-Pieters, Sluizeken)
- Drie soorten blokjes: contract (lavender), partial-filled (wit met slot-lijst binnenin), open shift (roze dashed met badge)
- Beschikbaarheidsstrip onderaan met filter "Beschikbaar / Iedereen"
- Plusjes om functies en vestigingen toe te voegen
- Paginering onderaan zoals in Staffler

Voor pixel-perfecte styling: open Staffler in Chrome en ik kan via Claude in Chrome MCP de live HTML/CSS lezen en daarvan vertrekken. Voor nu volstaat dit op screenshot-basis.

## 07 - Simpele combineerde dialog (v2 na tweede ronde feedback)

Drie staten van dezelfde dialog naast elkaar, om de flow te tonen:

- A: lege dialog, capaciteit-pillen 1-6 (3 actief), 3 slots elk met binaire keuze "Iemand kiezen / Open shift"
- B: klant heeft slot 1 op "Iemand kiezen" gezet, autosuggest open met search-filter, "beschikbaar 12u - 22u" naast naam
- C: slot 1 toegewezen aan Anouk, 2 en 3 op Open, broadcast-sectie met simpele radiokeuze: De volledige pool / Specifieke namen / Niet versturen
- D: "Specifieke namen" geselecteerd, 4 namen toegevoegd, 2 met groene "Verstuur"-knop (WhatsApp-stijl), 2 met "Verzonden 14:32" status
- E: bestaande shift heropent na deadline, status-bar toont "Deadline verstreken", per open plaats een lijst met kandidaten die via WhatsApp bevestigd hebben, plus tijdstip van bevestiging en "Kies"-knop

Vereenvoudigingen v2:

- Capaciteit-input vervangen door pill-row 1-6 (+ overflow), eenvoudiger te tikken
- Per slot binaire knoppen "Iemand kiezen / Open shift" ipv vrije input. Pas na keuze verschijnt input of open-tag
- In autosuggest expliciete uren ("beschikbaar 12u - 22u") ipv abstract "past op shift"
- Broadcast vereenvoudigd tot "De volledige pool" of "Specifieke namen" (chip-input). Geen filters, geen functie-vestiging-mix in de uitleg

Vervangt mockups 05 en 06 als ontwerprichting.

## 06 - Selectie-picker

Wanneer in de create-shift modal gekozen wordt voor "Selectie van medewerkers" opent deze fullscreen-picker. Ontworpen voor pools tot 300 medewerkers waar de klant er 20+ wil uitnodigen.

Onderdelen:

- Filter-balk: zoek, statuut-filter, groep-filter, toggles "Beschikbaar deze week" en "Recent gewerkt op deze functie", sortering
- Beschikbaarheids-legende per medewerker: past / past deels / geen / conflict
- Bulk-selectie-knoppen: "+ Beschikbaar deze week (23)", "+ Alle flexi's (45)", "+ Groep Bar (38)", "+ Volledige pool (287)"
- Selected-bar bovenaan met chips, "+ X anderen tonen"-knop voor compactheid bij grote selecties
- Per-rij info: naam, statuut-tag, groepen, beschikbaarheid-badge voor de specifieke shifturen
- Voettekst met counter en "Klaar, terug naar shift"-knop

## 05 - Create-shift modal

Twee scenario's naast elkaar in één pagina, om te tonen hoe dezelfde modal beide flows dekt:

- Scenario A: alle plaatsen direct ingevuld (Niveau 1), geen broadcast-sectie
- Scenario B: gemengd, 1 naam gekend en 2 open plaatsen, broadcast-sectie zichtbaar

Eén form-structuur. Broadcast-sectie verschijnt alleen wanneer er open plaatsen zijn. Per gekende naam: send-icoon en WhatsApp-status. Voor open plaatsen: radio Volledige pool / Selectie / Niet versturen, plus deadline.

## Te bespreken

Ik heb nog niet gemaakt:

- Mobile view (deze zijn desktop-only voor nu)
- Edit-dialog voor shift-aanmaak (drag-on-grid → modal flow)
- Status-states tijdens broadcast (wachten op eerste kandidaat)
- View "Mijn lege medewerkers deze week" (welke medewerkers in pool zijn niet geboekt)
- Conflict-indicator (medewerker beschikbaar bij twee bedrijven tegelijk)

Eerst de hoofdrichting kiezen, dan deze edge-views toevoegen.
