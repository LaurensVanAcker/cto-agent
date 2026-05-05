# Radicale vereenvoudiging

Datum: 04/05/2026, na feedback dat mockup 06 te complex was.

## Wat ik fout deed

Ik bouwde een power-tool. Pool met 287 mensen, 5 filters, 6 bulk-buttons, 4 beschikbaarheids-categorieën, sort-dropdown, selected chips bar, weglaat-actie, etc. Dat is hoe je een tool bouwt voor mensen die hem dagelijks 4 uur gebruiken. Niet voor een kassiermedewerker die maandag 's morgens snel een planning moet doorzetten.

De vraag is niet "hoe geef ik maximale controle", maar "hoe maakt de tool zelf 80% van de keuzes goed en geeft hij de gebruiker enkel waar hij iets aan toevoegt".

## Vier kernvereenvoudigingen

### 1. Eén dialog, één pad

Mockup 05 had twee scenario's naast elkaar (alles direct ingevuld vs. mengvorm). Mockup 06 was een aparte fullscreen-picker. Drie pagina's voor één actie.

Het wordt: één dialog, altijd hetzelfde stramien:

- shift-info bovenaan (wat, waar, wanneer, hoeveel personen)
- een lijst met N slots, per slot een combobox waar je ofwel een naam typt, ofwel niets invult (= open plaats)
- onderaan, alleen zichtbaar als er open plaatsen zijn: één regel "Voor open plaatsen, naar wie verstuur je dit?" met een sensible default

Geen radio "direct vs open". Geen aparte fullscreen-picker. Geen modes.

### 2. Sensible default voor broadcast

Wanneer Vestiging en Functie als eerste-rangs concepten bestaan, kunnen we als default zeggen "iedereen in mijn pool met functie Afwas in vestiging Korenmarkt". Dat is vrijwel altijd de juiste vraag.

Klant kan optioneel:

- Specifieke namen toevoegen (autocomplete chip-input, type "An" → "Anouk Staelens" suggestie)
- "Niet versturen, ik vul later in" aanvinken

Dat dekt 95% van de gevallen. Geen 287-persoon-lijst, geen filters, geen bulk-buttons. De default IS de bulk.

### 3. Naam-invul = autosuggest

In de slot-rijen typt de klant een paar letters en krijgt suggesties. Bovenaan in de suggestie-lijst staan mensen die voor deze functie/vestiging beschikbaarheid hebben doorgegeven (kleine groen-icoon). Dat is het "zien wie beschikbaar was"-aspect uit jouw stap 3, geintegreerd in de typing-flow.

Geen aparte side panel met chips. Geen aparte tab. Gewoon: typ, kies.

### 4. Klikken op een blokje = wat is hier de stand van zaken

Voor jouw stap 4 ("zien wie al uitnodiging kreeg of zich beschikbaar gesteld heeft"): klik op een blokje in de planning, een popover toont:

- per slot: ofwel naam (toegewezen), ofwel "open + N kandidaten" met klikbare lijst
- onder: "Verstuurd naar 27 mensen, 4 hebben gereageerd, deadline is over in 8u"

Niet alle onderhoudbare metadata, alleen wat de klant nu wil weten.

## De combinatie van stap 2 die jij voorstelde

Jouw stappen waren:

1. Planscherm, sleep een blokje
2. Binaire keuze: persoon inplannen of open shift
3. Bij open shift: zien wie beschikbaar was
4. Later: zien wie uitnodiging kreeg

Stap 2 hoeft géén binaire keuze te zijn. In de dialog die opent na slepen staat onmiddellijk een lijst met N slots (capaciteit). Per slot kan je:

- Een naam typen (= direct toegewezen, scenario "persoon inplannen")
- Niets invullen (= open shift voor die slot, scenario "open shift")

De keuze is impliciet, per slot, en mengvormen ontstaan natuurlijk. Geen radio-button vooraf.

Onderaan de dialog: alleen als minstens één slot open is, verschijnt de broadcast-regel.

## Wat blijft van de oude mockup 04 (resource lanes v2)

Het hoofdscherm blijft grotendeels zoals in mockup 04:

- Vestiging > Functie als rij-as (mits we dat concept aanvaarden, zie volgend doc)
- Planning-grid met blokjes
- Beschikbaarheidsstrip onderaan met visuele tijdsbalk
- Knop "+ Nieuwe shift" of klik op cel om de simpele dialog te openen

Wat verdwijnt of verandert:

- Geen aparte "Verstuur 3 open shifts deze week" batch-knop in de toolbar (te niche, kan een "Acties"-menu later worden)
- Geen plusjes voor functie/vestiging inline (komen in een instellingenscherm, niet permanent in de planning-toolbar)
- Selectie-picker (mockup 06) verdwijnt volledig in zijn huidige vorm

## Hoe veel mensen kun je dan inviteren in de simpele flow?

Als de default = "iedereen met functie+vestiging in pool" dan zit je sowieso al bij 27 mensen of zo. Plus optioneel een paar specifiek toegevoegde namen. Dat is meer dan voldoende voor de meeste gevallen.

Voor het edge-geval "ik wil 50 specifieke mensen kiezen die niet onder een functie/vestiging vallen" hebben we even later nog een "Beheer pool"-flow waar je kunt selecteren. Maar dat is een andere taak (pool-beheer), niet shift-aanmaak.

## Resultaat

Drie schermen vervangen door één:

- Mockup 05 (create-shift) + Mockup 06 (selectie-picker) → één eenvoudige dialog
- De "Gemengd"-variant uit mockup 05 wordt gewoon de default-flow
- 287-rijen-picker verdwijnt, vervangen door autocomplete in de slot-velden
