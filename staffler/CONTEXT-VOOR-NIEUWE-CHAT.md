# Context voor een nieuwe chat in deze map

Lees dit eerst als je terugkomt op dit project. Het bevat de hele draad van werk en denken samengeperst in één plek.

## Wat we doen

Uitbreiding van Staffler (BOEMM/Jobfixers payroll-tool, vroeger DPS) met een nieuw planning-concept dat drie werkwijzen combineert in één scherm zonder mode-switch:

1. Niveau 1, manueel inplannen, klant kiest naam (= huidige Staffler)
2. Niveau 2, shift-broadcast: klant maakt blokje, broadcast naar pool, kandidaten reageren via MyStaffler-app, klant kiest, contract wordt aangemaakt
3. Niveau 3, beschikbaarheid-pull: bijverdiener post beschikbaarheid in MyStaffler-app, klant kiest direct uit aanbod-lijst

Doel: één planscherm waar alle drie de werkwijzen natuurlijk in elkaar overlopen. Geen tab-switch, geen "kies modus".

## Beslissingen die genomen zijn

Grote richtingen die vast staan na meerdere feedback-rondes:

- Domein groeit additief, niet refactoren. Loonpakket blijft volledig ongemoeid (vraag 2).
- Groepen-concept wordt vermoedelijk vervangen door Vestiging + Functie als twee aparte tag-categorieën (vraag G1, te bevestigen na klantdata-check). Klanten gebruiken Groepen vandaag de facto al als locatie-tag.
- Beschikbaarheid blijft simpel: één range per dag (vraag 4).
- Shift-capaciteit > 1 mag (2 afwassers tegelijk), multi-day shifts mogen (vraag 5, 6).
- Broadcast-targets: ALL_POOL of expliciete medewerker-selectie. Geen Vestiging+Functie-filter, gewoon "iedereen in de pool" of "specifieke namen". Niet versturen mag ook (vraag 7, vereenvoudiging).
- Na deadline zonder kandidaten: niets gebeurt automatisch, klant beslist zelf (vraag 8).
- Default loonpakket bij eerste contract = vraag aan klant (vraag 9).
- 15min cron-architectuur blijft, geen real-time push (vraag 10).
- Niveau 2 livegang wacht op basis MyStaffler-implementatie. Q2.2 sprint had de basis-mockups (BCJ-19432).

UX-keuzes die door iteratie gegroeid zijn:

- Eén dialog voor shift-aanmaak, geen aparte "selectie-picker"
- Per slot binaire knoppen "Iemand kiezen" of "Open shift", geen modus-keuze vooraf
- Capaciteit als pill-rij 1-6 met overflow naar "+"
- Autosuggest bij naam-typen: bovenaan mensen met beschikbaarheid (met expliciete uren), daaronder andere medewerkers, met search-filter in de popup
- Broadcast-keuze: drie radio's, De volledige pool / Specifieke namen / Niet versturen
- "Specifieke namen" toont een lijst van toegevoegde mensen, per persoon ofwel een groene WhatsApp "Verstuur"-knop ofwel "Verzonden HH:MMu" status
- Bij heropenen na deadline: shift-popup met status-bar bovenaan en één gedeelde kandidatenlijst voor de hele shift (kandidaten zijn niet per slot gescheiden)
- Beschikbaarheidsstrip onderaan, geen filter Beschikbaar/Iedereen, gewoon de mensen die iets hebben doorgegeven
- Geen "+ Nieuwe shift"-knop in toolbar, klant sleept altijd op het bord
- Plusjes inline om Vestiging en Functie aan te maken

## Stijl-tokens uit live Staffler (Chrome MCP-extractie)

- Font: Inter (Google Fonts), letter-spacing 0.5px, font-smoothing auto, text-rendering auto
- Body font-size: 16px, font-weight 400 default
- Primary actie-kleur: rgb(60, 81, 240) #3C51F0 indigo (Planning-pill, actieve sidebar)
- Brand-kleur: rgb(252, 7, 79) #FC074F magenta (S-logo, "IzyCoffee" tekst, Vandaag-cell, vestiging-headers)
- Banner-bg: rgba(60, 81, 240, 0.20) light indigo, border-radius 6px 6px 0 0 (joins met grid)
- Banner-icon-square: 56x56 indigo solid met witte calendar-svg
- Border-color: #E2E8F0
- Default tekst: #334155 slate
- Sidebar: 89px breed, witte achtergrond, actieve link 56x56 met 6px border-radius en padding 16px
- Topbar: 8-12px verticale padding, 12px horizontale, border-bottom 1px #E2E8F0
- Demobedrijf/IzyCoffee H3: font-size 18.72px, font-weight 400 (regular), kleur magenta
- Block (Bryntum-canvas): bg rgba(30, 24, 100, 0.10), border 2px solid rgb(30, 24, 100), border-radius 8px, font-size 14px

Block-kleur is in het mockup VERZACHT (gebruiker vond de navy uit Staffler niet mooi):

- bg: #EEF2FF
- border: 1.5px solid #A5B4FC
- name-tekst: #312E81
- time-tekst: #4F46E5

## Domeinmodel (additief)

Bestaande tabellen ongewijzigd: Bedrijf, Pool, Medewerker, Loonpakket, Contract.

Nieuw:

- Vestiging (per Bedrijf, optioneel)
- Functie (per Bedrijf, optioneel)
- Vestiging-tags en Functie-tags op Medewerker (n-op-n)
- Shift: Bedrijf + Vestiging + Functie + datumrange + werkuren + pauze + capaciteit + deadline + targets (ALL_POOL of SELECTION)
- ShiftApplicatie: Shift + Medewerker + applicatie-tijdstip + status (kandidaat/geselecteerd/afgewezen/ingetrokken)
- Beschikbaarheid: Medewerker + datum + uren van/tot + status (open/vastgelegd/ingetrokken/vervallen). Cross-bedrijf zichtbaar voor pools waar de medewerker in zit.

Contract krijgt extra optionele velden:

- source enum: NIVEAU_1_DIRECT / NIVEAU_2_SHIFT / NIVEAU_3_BESCHIKBAARHEID
- shift_id (nullable)
- beschikbaarheid_id (nullable)

## Levensloop van een blokje

Drie ingangen, één convergentiepunt (Contract):

- Niveau 1: klikt cel + kiest naam → Contract Toegewezen → Prestatie Bevestigd
- Niveau 2: Shift Draft → Open → Met Kandidaten → Fulfilled → Contract Toegewezen → Prestatie Bevestigd
- Niveau 3: Beschikbaarheid Open → Vastgelegd → Contract Toegewezen → Prestatie Bevestigd

Mengvormen ondersteund: Shift Closed met 0 kandidaten kan teruggrijpen naar manuele keuze of beschikbaarheid-pull. Volledige state diagram in visie/levensloop-blokjes.md (en .html met Mermaid).

## Mockups

Aanbevolen om te tonen:

- mockups/08-planscherm-staffler-stijl.html, het hoofdscherm pixel-perfect na live Chrome-extractie. Vestiging+Functie rij-as. Drie blokje-types. Beschikbaarheidsstrip met 9 mensen.
- mockups/07-simpele-dialog.html, vijf states (A-E) van de shift-aanmaak en -beheer dialog naast elkaar.

Oudere mockups (1, 2, 3, 4, 5, 6) staan er nog als referentie maar zijn opgevolgd. Mockup 4 ondersteunt het laatste planscherm-concept structureel maar mockup 8 v2 is de pixel-perfecte versie.

## Open vragen die nog beantwoord moeten

Uit visie/prioritering.md (categorieën A t/m I, ~56 items): de meeste moeten Laurens nog doorlopen.

Uit visie/beslissingen.md vraag 27-34 en uit visie/research-bevindingen.md vraag 35-37: nog niet allemaal beantwoord.

Belangrijkste open knopen:

- Bevestiging Vestiging + Functie ipv Groepen na klantdata-check
- MVP-scope, wat sneuvelt en wat blijft
- Gedeeltelijke booking van een Beschikbaarheid: hele blok vastleggen of resterend deel open laten
- Cross-bedrijf conflict-detectie tonen of niet
- Tech-lead/designer bij MyStaffler voor inpassen van Niveau 2 acceptatie-flow
- Shift Templates uitbreiden vs nieuwe Shift-entity bouwen

## Volgende stap (na deze chat)

Laurens legt de mockups morgen voor aan CEO Lieven en Legal. Verwacht feedback over:

- Compliance-aspecten van shift-broadcast naar pool (privacy, arbeidsrecht)
- Strategische prioriteit tegenover andere lopende werken (Indexations Module, MyStaffler basis)
- Goedkeuring om Groepen-concept te schrappen na data-verificatie

Daarna: keuze van MVP-scope, verdere mockups indien gevraagd, en Jira-tickets opmaken voor het bouw-traject.

## Belangrijke randvoorwaarden om te onthouden

- Niet alles herbouwen, additief op bestaand model
- Loonpakket niet aanraken
- 15min cron behouden, geen real-time push
- Eenvoud boven volledigheid: gebruiker zonder opleiding moet het kunnen
- Belgische conventies: 24u-tijd, datum DD/MM/YYYY, "u" als tijdsscheidingsteken (18u00)
- Pool kan tot 300 mensen bevatten, maar UI moet dat zonder filter aankunnen
- Klant sleept op het bord om een nieuwe shift te maken, geen aparte knop
