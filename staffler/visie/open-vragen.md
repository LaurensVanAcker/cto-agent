# Open vragen voor uitbreiding

Een lijst van knopen die we eerst moeten doorhakken voor we échte schermen of API's bouwen. Genummerd zodat we ze één voor één kunnen behandelen.

## Domeinmodel en concepten

1. Locatie als first-class entity, ja of nee?
   Mijn voorstel: ja, optioneel per bedrijf. Bedrijven met één plek negeren het, bedrijven als IzyKoffie krijgen Locatie expliciet. Voorkeursrichting?

2. Functie loskoppelen van Loonpakket?
   Vandaag zit functie in de loonpakket-naam. Ik stel voor: Functie wordt aparte entity (per bedrijf), Loonpakket koppelt Functie + Statuut + Paritair Comité + Locatie + barema. Zie je daar bezwaren in (juridisch, payroll-engineering)?

3. Wat doen we met de huidige groepen?
   Als Locatie en Functie aparte entities worden, is "Locatie A/B" als groep redundant. Migreren we groepen-die-eigenlijk-locaties-zijn? Wat met groepen die andere indelingen vertegenwoordigen (vaardigheid, voorkeur)?

## Beschikbaarheden

4. Beschikbaarheid-grain.
   In welke blokken duidt een bijverdiener beschikbaarheid aan? Vrije range (12u-19u), dagdeel-knoppen (voormiddag/namiddag/avond), of hele dag? Ik zou starten met vrije range, eventueel later quick-presets.

5. Beschikbaarheid-vervaldatum.
   Vervalt een beschikbaarheid automatisch op de datum, of moet de medewerker ze actief intrekken? Wat met patronen (elke donderdag beschikbaar)?

6. Locatie-voorkeur op beschikbaarheid.
   Mag een medewerker zeggen "ik ben donderdag beschikbaar maar enkel voor Korenmarkt"? Of is beschikbaarheid altijd locatie-agnostisch en kies je dat per shift-applicatie?

7. Conflict bij gedeeltelijke booking.
   Medewerker zegt "donderdag 12-19 beschikbaar". Klant A boekt hem 12-17. Blijft 17-19 nog zichtbaar als beschikbaar voor Klant B (waar hij ook in pool zit)? Logisch ja, maar wel een edge case in de UI.

## Shifts

8. Shift-capaciteit en multi-fulfilment.
   Mag een shift capaciteit > 1 hebben (vb 2 afwassers tegelijk, voor dezelfde uren), of is 1 shift = 1 contract = 1 persoon? Mijn neiging: capaciteit als veld toelaten, vereenvoudigt veel.

9. Wat na de deadline zonder kandidaten?
   Geen reactie op een open shift na deadline. Wat gebeurt er? Re-broadcast? Notificatie naar klant ("je shift heeft 0 kandidaten")? Auto-uitbreiden naar volledige pool als de selectie kleiner was? Ik zou starten met simpel: alarm naar klant, hij beslist zelf.

10. Multi-day shift.
    Vandaag is een Contract multi-day mogelijk. Mag een Shift dat ook? Vb "elke dag van maandag tot vrijdag, 12-17, 1 afwasser nodig". Of moet zo'n vraag 5 aparte shifts zijn?

11. Shift-target precisie.
    Bij verzending kies je hele pool of selectie. Mag die selectie ook op groep-niveau (vb "stuur naar groep flexi's")? Ik denk ja.

12. Mag een medewerker zich kandidaat stellen voor een shift waar hij niet expliciet voor uitgenodigd is?
    Edge case: shift is naar selectie verstuurd, medewerker uit de pool ziet 'm via een omweg. Veronderstel ik dat alleen uitgenodigden de shift zien, period.

## UI-fundamenten

13. Wat wordt de primaire rij-as?
    Dit is de grote knoop. Drie kandidaten:
    - Medewerker (huidig)
    - Locatie + Functie
    - Mengvorm met expansion
    Of: configureerbare "group by" zoals databases (medewerker / locatie / functie / status). Mijn voorstel: default Locatie + Functie wanneer Locatie aanstaat, anders Functie, met optie om naar Medewerker te switchen. Sterk?

14. Statuut-zichtbaarheid in kandidatenlijst.
    Welke statuten onderscheiden we exact in de UI? Flexi, jobstudent, werkstudent, bediende, arbeider? Komen die uit het paritair comité van het loonpakket of uit een aparte Statuut-tabel? Ik zou een vaste enum maken en die mappen naar bestaande loonpakketten.

15. Default loonpakket bij eerste contract.
    Als een medewerker nog geen "laatst gekozen" heeft, wat is de default? Hoofdvraag aan klant, of automatisch het enige beschikbare loonpakket? Bij meerdere: dropdown verplicht.

## Notificaties en push

16. Notification-aggregatie.
    Stuurt MyStaffler één push per shift (kan storend worden als klant 20 shifts in één batch maakt), of geaggregeerd ("3 nieuwe shifts deze week")? Ik leun naar geaggregeerd met klikbare detail.

17. Real-time vs cron.
    Vandaag werkt de NotificationServiceSchedule elke 15min. Volstaat dat voor shift-broadcast en kandidatenlijst-update, of moeten we naar real-time (websocket of push direct)? 15min lag voor een klant die wacht op kandidaten kan vervelend zijn als de deadline kort is.

## Operations en governance

18. Annulatie na toewijzing.
    Bijverdiener heeft een toegewezen contract maar trekt zich terug. Wat is de flow? Contract terug naar Open Shift status, automatisch opnieuw broadcasten? Waarschijnlijk een aparte vraag: "vervangen of niets doen".

19. Edit van toegewezen contract.
    Mag de klant een contract dat uit een shift kwam nog wijzigen (uren, pauze)? Of is dat verboden zonder wederzijds akkoord van de medewerker? Wettelijk gezien zit hier een grijze zone.

20. Audit-trail.
    We willen wellicht traceerbaar maken: deze contract komt uit deze shift, er waren X kandidaten, Y is gekozen om reden Z (optioneel motivatie). Voor klant-discussies en latere analytics. Hoe diep gaan we?

## Strategisch

21. Verhouding Staffler ↔ MyStaffler.
    MyStaffler-epics in BCJ zijn al lopende (auth, planning, clock in/out). Past de uitbreiding hierin als één gecoördineerd traject, of zijn dit twee parallelle producten die af en toe synchroniseren?

22. Klant-rollen voor planning.
    In een keten als IzyKoffie kan een lokale manager mogen plannen voor zijn locatie maar niet voor andere. Hebben we per-locatie planning-rechten nodig, of blijft alles op bedrijf-niveau?

23. Pricing en marges in beeld bij planning.
    Bij shift-toewijzing aan medewerker met statuut "flexi" vs "student" verschilt de kost voor de klant. Tonen we die kost (preview) op het moment van keuze, of pas op factuur? Marketing-edge of complexiteit?

24. MVP-scope.
    Welke van bovenstaande vragen mogen we voor de eerste release uitstellen, en wat zit er minimaal in? Mijn ruwe MVP:
    - Locatie als optionele entity
    - Shifts en ShiftApplicaties
    - Beschikbaarheden zonder locatie-voorkeur
    - Default loonpakket
    - Eén nieuw planscherm met Locatie + Functie als default rij-as
    - Notificaties via bestaande NotificationService (15min)
    - Géén pricing-preview, géén multi-day shifts, géén locatie-rollen
    Wat sneuvelt of komt erbij?

## Externe nice-to-knows

25. IzyKoffie als referentieklant.
    Moeten we hen tijdens de uitwerking actief betrekken (interview, prototyp testen) of pas bij uitrol? Andere klanten met meerdere locaties die ook nuttig zijn als beta?

26. Concurrentievergelijking.
    Tools als Shyfter, Combo, Resource Guru hebben elk een eigen take op multi-flow planning. Wil je dat ik daar een korte vergelijking van maak voor we mockups vasttimmeren?
