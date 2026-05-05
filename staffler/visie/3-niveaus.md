# Drie niveaus van plannen, één geïntegreerd scherm

## Wat de drie niveaus zijn (intern denken)

Niveau 1: Klant-gedreven, manueel.
De klant kent zijn mensen en plant ze één voor één in. Hij kiest een naam, kiest een dag, kiest werkuren. Dit is wat Staffler vandaag doet. Output is rechtstreeks een Contract.

Niveau 2: Klant-gedreven, vraag-eerst.
De klant weet welk werk hij heeft, niet noodzakelijk wie het gaat doen. Hij maakt blokjes voor wie hij nodig heeft (functie + uren), zet daar een deadline op, broadcast naar de pool of naar een selectie. Bijverdieners stellen zich beschikbaar via MyStaffler. Na de deadline kiest de klant uit de kandidatenlijst. Bij selectie wordt automatisch een Contract aangemaakt.

Niveau 3: Medewerker-gedreven, aanbod-eerst.
De bijverdiener geeft in MyStaffler aan wanneer hij beschikbaar is. Die beschikbaarheid is zichtbaar voor elk bedrijf waar hij in de pool zit. Wanneer een klant een blokje begint te maken, ziet hij meteen welke medewerkers passen op dat tijdstip. Hij kiest, het Contract wordt direct aangemaakt.

## Het uitgangspunt voor de bouw

De drie zijn voor ons drie werkwijzen, voor de gebruiker zijn het geen aparte modi. Eén planscherm, drie ingangen die natuurlijk in elkaar overlopen.

Concreet betekent dat:

- Geen tab-switch tussen "manueel" en "shift" en "beschikbaarheid"
- Geen instellingsschakelaar per bedrijf om een niveau aan of uit te zetten (behalve eventueel features die echt extra zijn, zoals broadcast-naar-pool)
- Wel slimme defaults: een klant die nooit met shifts werkt ziet shifts niet in de weg staan, een bijverdiener die geen beschikbaarheid invult valt gewoon niet voor in de aanbod-lijst

De grid blijft een grid. Wat verandert is wat er op de blokjes staat en hoe je ze maakt.

## Drie soorten blokjes in dezelfde grid

Vandaag heeft elk blokje één staat: Contract.

In het nieuwe model heeft een blokje een levensloop:

```
Open Shift  →  Met kandidaten  →  Toegewezen Contract  →  Bevestigde Prestatie
```

Plus een bypass-pad voor niveau 1:

```
                       Direct Contract  →  Bevestigde Prestatie
```

Plus voor niveau 3:

```
Beschikbaarheid (zwevend, niet-bedrijfsgebonden)
        ↓ (klant pikt)
Direct Contract  →  Bevestigde Prestatie
```

Visueel onderscheid op het blokje:

- Open Shift: gestreept of ghost-style, geen naam, wel functie + uren + deadline + kandidaten-teller
- Toegewezen Contract: vol gekleurd, naam zichtbaar (zoals vandaag)
- Beschikbaarheid: enkel zichtbaar in een aanbod-laag of side panel, niet in het hoofdraster (anders wordt het te druk)

## Wat is de rij-as?

Vandaag staan namen links. Voor niveau 1 is dat logisch: je weet wie je inplant. Voor niveau 2 en 3 is dat onlogisch: je begint zonder naam, of je hebt meer kandidaten dan rijen.

Drie kandidaten voor de rij-as:

1. Medewerker (huidig).
   Voordeel: continuïteit met vandaag, snelle scan "wie werkt er deze week".
   Nadeel: open shifts horen niet thuis bij een persoon, beschikbaarheden moeten als overlay bovenop.

2. Locatie + Functie (gegroepeerd).
   Voordeel: de planning toont de vraag van het bedrijf, los van wie het uitvoert. Voor IzyKoffie met 3 zaken in Gent is dat veel cleaner: rij "Korenmarkt - Bar", rij "Korenmarkt - Afwas", rij "Sint-Pieters - Bar", enz. Open shifts en toegewezen contracten staan in dezelfde rij omdat ze op dezelfde plek hetzelfde werk vragen.
   Nadeel: je verliest het persoon-eerst overzicht, je moet filteren of een tweede view om "wat doet Anouk deze week" te zien.

3. Mengvorm: Locatie + Functie als primary, met expanding sub-lanes per persoon waar nodig.
   Voordeel: beste van beide.
   Nadeel: visueel druk, vraagt nadenken over collapse-states.

Voor de drie mockups exploreren we elk een dominante richting:

- Mockup 1, Shift Board: Locatie + Functie als rij-secties, met open en toegewezen blokjes naast elkaar. Beschikbare medewerkers in side panel.
- Mockup 2, Resource Lanes: Locatie als parent-row, Functie als sub-row. Open shifts als ghosts. Klik op shift = kandidatenlijst-popover. Beschikbaarheid-panel onder de grid.
- Mockup 3, Hybrid Timeline: bovenaan een strook "Open shifts deze week", daaronder het klassieke medewerker-grid voor de toegewezen contracten, rechts een panel met beschikbaarheden die je kunt slepen.

## Hoe de flows in één scherm samenkomen

Niveau 1 in het nieuwe scherm:
Klant klikt in een lege cel of op een rij. Dialog opent. Hij kiest een naam, kiest of vult werkuren in, kiest loonpakket (default = laatst gebruikte). Klikt bevestigen. Contract direct aangemaakt, blokje verschijnt.

Niveau 2 in het nieuwe scherm:
Klant sleept in de grid om een blokje te maken op een rij Locatie+Functie zonder naam. Dialog opent. Hij vult uren, deadline, target (hele pool of selectie). Klikt "Verstuur". Het blokje krijgt status Open Shift. Bijverdieners krijgen push. Wanneer kandidaten reageren verschijnt een teller op het blokje. Klant klikt het blokje na de deadline (of vroeger), ziet kandidatenlijst met statuut, kiest één, blokje wordt Contract.

Niveau 3 in het nieuwe scherm:
Klant begint een blokje te maken, ziet onmiddellijk in een suggestie-lijst (panel rechts of inline tooltip) wie er beschikbaar is op dat tijdstip met hun statuut. Hij selecteert direct iemand, blokje is meteen Contract. Geen broadcast-stap.

De drie flows zijn dus opvolgers van elkaar in vrijheidsgraden:

- Niveau 1 = ik weet wie en wanneer
- Niveau 3 = ik weet wanneer, ik kies uit wie kan
- Niveau 2 = ik weet wat en wanneer, ik laat de pool reageren

Niveau 3 heeft maar zin als bijverdieners actief beschikbaarheden invullen. Niveau 2 heeft meer zin voor klanten met grotere pools waar ze niet iedereen op naam kennen. Niveau 1 blijft de basisflow voor kleine of vaste teams.

## Mengvormen die we moeten ondersteunen

- Klant maakt een Open Shift, géén kandidaten, deadline verstrijkt → klant haalt iemand uit beschikbaarheden of plant zelf manueel iemand in (val terug op niveau 3 of 1)
- Klant ziet een beschikbare medewerker en wil expres een tweede afwasser toevoegen → hij sleept of klikt die medewerker en maakt een nieuw Contract op die rij
- Klant heeft 3 kandidaten op één Open Shift, kiest één, wil de andere 2 nog gebruiken op een andere shift → zij blijven zichtbaar in een "nog beschikbaar uit deze broadcast" lijst totdat de week voorbij is
- Bijverdiener trekt beschikbaarheid in vóór toewijzing → blokje verdwijnt uit aanbod-lijst, geen contract
- Bijverdiener heeft toegewezen contract maar wil annuleren → blokje gaat terug naar Open Shift, broadcast opnieuw aanmaakbaar (separate flow nodig, te bespreken)

## Wat dit betekent voor MyStaffler

MyStaffler wordt de medewerker-app voor:

- Beschikbaarheden invullen (niveau 3 voeding)
- Aangeboden shifts ontvangen en accepteren (niveau 2 reactie)
- Eigen contracten zien (over alle bedrijven heen waar hij in pool zit)
- Clock in/out en prestaties bevestigen

Het admin-scherm in Staffler en MyStaffler zijn twee zijden van dezelfde munt. Wijzigingen aan één moeten quasi-realtime doorslaan naar de andere (via NotificationServiceSchedule of een upgrade naar live push).
