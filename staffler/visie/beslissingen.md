# Beslissingen na eerste antwoordrondje

Datum: 04/05/2026. Antwoorden van Laurens op de 12 vragen, plus mijn interpretatie en consequenties.

## Per vraag

### 1. Locatie als first-class entity, ja of nee?

Antwoord: vraag werd niet begrepen.

Herformulering:
"Voegen we een nieuw veld 'Locatie' toe aan een bedrijf, naast Functie en Groep? Een bedrijf zoals IzyKoffie kan dan zeggen: ik heb 3 vestigingen, Korenmarkt / Sint-Pieters / Sluizeken, en je plant per locatie. Of laten we Locatie zoals nu in de groepsnaam zitten?"

Ik vermoed dat het antwoord uit q3 en q11 al volgt: nee, geen nieuwe Locatie-entity. We werken met wat er is. Maar bevestig me dit eens expliciet wanneer je terug bent.

### 2. Functie loskoppelen van Loonpakket?

Antwoord: nee, te veel aanpassingen.

Consequentie: Functie blijft in de Loonpakket-naam zitten zoals vandaag ("Barmedewerker - Flexijob Bediende - Leest (Lievegem)"). Functie wordt geen aparte entity. Geen migratie nodig.

### 3. Wat doen we met Groepen?

Antwoord: vandaag worden Groepen in de praktijk vaak misbruikt als Locatie. Klanten vullen de groepsnaam in als locatienaam.

Consequentie: Groepen zijn een overloaded concept. Ze fungeren als skill-tag, locatie-tag, en doelgroep-tag, afhankelijk van hoe een klant ze invult. We laten het zo. Wel: we accepteren dat Groep onze beste proxy is voor Locatie wanneer de feature aanstaat.

### 4. Beschikbaarheid-grain.

Antwoord: eenvoudig, één range per dag die de medewerker kiest.

Consequentie: één Beschikbaarheid-record per (medewerker, datum), met start- en einduur. Geen overlap, geen meerdere blokken per dag, geen patronen of presets in MVP.

Open subvraag voor mij: als klant een deel van die range boekt (medewerker zegt 12-19, klant boekt 12-17), wat gebeurt er met 17-19? Twee simpele opties: (a) helemaal Vastgelegd, rest weg, (b) blijft Open voor andere klanten. Ik leun naar (b), want dat eert wat de medewerker echt aanbiedt. Voorkeur?

### 5. Shift-capaciteit groter dan 1?

Antwoord: ja.

Consequentie: capaciteit is een veld op Shift, default 1. Een Shift met capaciteit 2 spawnt 2 Contracten zodra 2 kandidaten gekozen zijn. Tot dan blijft de Shift in Met Kandidaten of Open.

### 6. Multi-day shifts?

Antwoord: ja.

Consequentie: een Shift kan een datumrange dragen, niet enkel één datum. Werkblok herhaalt zich per dag, zoals vandaag bij Contract.

### 7. Broadcast-target op groep-niveau?

Antwoord: ja, maar dan zit je vast voor klanten die Groepen niet aanstaan hebben.

Consequentie: targets op een Shift kunnen zijn:
- ALL_POOL (iedereen in de pool van het bedrijf)
- SELECTION (expliciete lijst medewerker-ids)
- GROUP (verwijzing naar één of meer groepen, alleen beschikbaar als bedrijf Groepen aan heeft)

Voor klanten zonder Groepen verdwijnt de GROUP-optie uit het verzendformulier. Geen probleem.

### 8. Wat na deadline zonder kandidaten?

Antwoord: niets.

Consequentie: Shift gaat naar status Closed, blijft daar zichtbaar. Geen automatische re-broadcast, geen alarm, geen auto-uitbreiden naar volledige pool. De klant ziet zelf wel dat er 0 reacties waren en kiest manueel een vervolgactie (heropenen, manueel kiezen, annuleren).

### 9. Default loonpakket bij eerste contract.

Antwoord: vraag.

Consequentie: bij het eerste contract van een medewerker waar nog geen "laatst gebruikt" bestaat, moet de klant expliciet een Loonpakket kiezen uit de medewerker-loonpakketten voor dat bedrijf. Voor latere contracten blijft default = laatst gebruikt, eventueel overrijdbaar.

### 10. Real-time push of huidige 15min cron behouden?

Antwoord: huidige behouden.

Consequentie: NotificationServiceSchedule blijft elke 15min draaien. Shift-broadcast naar MyStaffler heeft dus tot 15min vertraging. Voor korte deadlines (< 1u) wordt dat krap. We accepteren dat.

Aandachtspunt: als een klant 's morgens om 8u een shift broadcast met deadline om 10u, krijgen kandidaten pas om 8:15 een push. Dat is net OK voor 2u deadline, eng kort voor 30min deadline. Eventueel later upgraden, maar niet in MVP.

### 11. Mockup-richting?

Antwoord: nog niet kiezen, eerst meer praten en doordenken.

Cruciale uitspraak in dit antwoord: "We willen ook niet alles herbouwen, en het toevoegen zonder ELK dingetje te moeten herbouwen zoals een loonpakket."

Dit is een ontwerpsleutel. Verwerk ik in de hele uitwerking: additief bouwen, niet refactoren.

### 12. MVP-scope.

Antwoord: nog te bepalen.

Komt later, na meer overleg.

## Wat dit verandert in het ontwerp

### Domeinmodel: additief, niet refactor

Gevolg van q2 + q11: Loonpakket blijft ongewijzigd. Functie blijft in de Loonpakket-naam zitten. Locatie blijft impliciet (deels in Loonpakket-naam, deels in Groepsnaam).

Wat we toevoegen, zonder bestaande tabellen aan te raken:

```
Shift (NIEUW)
  ← Bedrijf
  + functie_label (vrije tekst, of optioneel een gekozen Loonpakket-template uit het bedrijf)
  + locatie_label (vrije tekst, of optioneel een gekozen Groep)
  + datumrange (start, eind)
  + werkuren van/tot
  + pauze
  + capaciteit (default 1)
  + deadline
  + targets (ALL_POOL, SELECTION met ids, of GROUP-ids)
  + status (draft / open / closed / fulfilled / cancelled)

ShiftApplicatie (NIEUW)
  ← Shift
  ← Medewerker
  + applicatie-tijdstip
  + status (kandidaat / geselecteerd / afgewezen / ingetrokken)

Beschikbaarheid (NIEUW)
  ← Medewerker
  + datum
  + uren van/tot
  + status (open / vastgelegd / ingetrokken / vervallen)

Contract (UITGEBREID, niet vervangen)
  + source (NIVEAU_1_DIRECT / NIVEAU_2_SHIFT / NIVEAU_3_BESCHIKBAARHEID)
  + shift_id (nullable)
  + beschikbaarheid_id (nullable)
```

Geen wijzigingen aan: Bedrijf, Pool, Medewerker, Loonpakket, Groep, Groep-medewerker-tag.

### Loonpakket-koppeling op Shift

Tricky punt: Shift heeft géén directe Loonpakket-koppeling, want Loonpakket is per (medewerker, bedrijf). Bij Shift-aanmaak weet je nog niet wie het wordt.

Twee opties:
- Optie A: Shift draagt enkel een vrije functie_label tekst. Bij toewijzen aan kandidaat moet de klant het Loonpakket kiezen uit de loonpakketten van die medewerker.
- Optie B: Shift draagt een Loonpakket-template-referentie naar één van de bestaande Loonpakketten in het bedrijf (gekopieerd uit een willekeurige medewerker waar dat Loonpakket op staat). Bij toewijzen kijken we of de gekozen kandidaat dezelfde Loonpakket-naam in zijn lijst heeft. Zo ja, automatisch koppelen. Zo niet, klant kiest uit de loonpakketten van die medewerker.

Optie B is gebruiksvriendelijker (auto-match in de meeste gevallen) maar vraagt een extra concept "Loonpakket-template" of een query over alle Loonpakketten in het bedrijf om unieke combinaties te vinden. Dat laatste is technisch eenvoudig.

Mijn neiging: Optie B met de query-aanpak. Geen nieuw entity, gewoon een soft-referentie via naam of ID die we resolven bij toewijzing.

### UI-implicaties

Geen Locatie-entity betekent:

- Rij-as kan niet "Locatie + Functie" zijn als die niet bestaan
- We kunnen wel "Groep" gebruiken als rij-as voor klanten die Groepen aan hebben
- Voor klanten zonder Groepen valt de groepering weg, en blijft Medewerker als rij-as logischer

Nieuwe richting voor de mockups:

- Default rij-as = Medewerker (zoals vandaag)
- Optioneel: groeperen op Groep, bovenaan de Medewerker-rijen, voor klanten met Groepen aan
- Open shifts en beschikbaarheden krijgen een eigen plek (bovenstrook of side panel), niet in de Medewerker-rijen
- Mockup 3 (Hybrid Timeline) past hier het best, want die behoudt Medewerker als grid-axis en gooit Open Shifts als strip bovenaan
- Mockup 1 en 2 vragen Locatie+Functie als axis, dat klopt niet meer met "niet herbouwen"

Conclusie voor mockup-keuze, voorlopig: ik herwerk Mockup 3 naar de nieuwe randvoorwaarden. Mockup 1 en 2 blijven staan als referentie van wat had gekund mits Locatie/Functie als entiteiten.

### Beschikbaarheid simpel houden

Q4 zegt: één range per dag. Dat sluit ook automatisch uit dat je op één dag twee niet-aaneensluitende blokken kan aanbieden ("9-12 én 14-17"). Niet erg voor MVP.

Vraag die overblijft: bij gedeeltelijke booking, hele Beschikbaarheid Vastgelegd of resterend stuk Open?

Voorstel: hele Beschikbaarheid Vastgelegd. Dat is consistent met "eenvoudig houden" en vermijdt edge cases. Als de medewerker daarna nog wil aangeven dat hij die avond toch nog kan, kan hij voor diezelfde dag een nieuwe Beschikbaarheid maken (mits de UI dat toelaat, bijv. door te zien dat zijn vorige is Vastgelegd).

Wacht, dat conflicteert met "één range per dag". Hmm.

Beter voorstel: Beschikbaarheid heeft een uniqueness-constraint op (medewerker, datum, status=Open). Vastgelegd / Ingetrokken / Vervallen blokken tellen niet mee. Zo kan een medewerker na een gedeeltelijke booking opnieuw beschikbaar worden voor de resterende uren als hij dat wil, door manueel een nieuwe Beschikbaarheid in te dienen voor 17-19.

### Tijds-as: cron blijft 15min

Geen real-time push voor MVP. Blijft binnen de bestaande EventBridge-architectuur:

- ShiftCloseSchedule: nieuwe cron of eventbridge-rule om Shifts naar Closed te zetten op deadline. Nauwkeurigheid 15min OK.
- BeschikbaarheidExpireSchedule: dagelijks 03:00 om Open Beschikbaarheden voor verstreken datums op Vervallen te zetten.
- NotificationServiceSchedule (bestaand) verzendt push voor nieuwe shift-broadcasts en kandidatenlijst-updates.

## Mijn eigen vervolg-doordenken

Hieronder thema's waar ik nu nog over nadenk los van de antwoorden. Geen vragen aan jou nodig in deze ronde, maar wel zaken die voor de definitieve architectuur cruciaal worden.

### A. Hoe zit Shift-aanmaak in de UI met "vrije tekst" voor functie en locatie?

Klant maakt Shift. Hij moet een Functie-label kiezen. Opties:

- Vrij tekstveld
- Dropdown met "alle Loonpakket-namen die in het bedrijf bestaan" (afgeleid uit Loonpakket-tabel)
- Dropdown met "alle unieke functie-prefix uit Loonpakket-namen"

Mijn voorkeur: dropdown van bestaande Loonpakketten in het bedrijf. De klant ziet "Barmedewerker - Flexijob Bediende - Leest (Lievegem)". Hij kiest die. De Shift krijgt een soft-referentie naar dat Loonpakket-template. Bij kandidaat-keuze probeert het systeem de match te maken; lukt het niet, dan vraagt het de klant te kiezen uit de loonpakketten van de gekozen medewerker.

Voor locatie-label: niet apart vragen, het zit al in de Loonpakket-naam.

### B. Cross-bedrijf zichtbaarheid van Beschikbaarheid

Een medewerker in pool van Bedrijf A en Bedrijf B post Beschikbaarheid donderdag. Beide bedrijven zien die. Privacy-wise OK, want elke medewerker heeft via pool-membership impliciet toegestemd dat zijn beschikbaarheid voor die bedrijven zichtbaar is.

Edge case: medewerker zit in pool van Café X en Café Y, twee concurrenten. Hij is bij Café X gepland op donderdag (Contract Toegewezen voor Café X), en heeft beschikbaarheid voor donderdag staan voor Café Y. Café Y ziet dat, klikt, krijgt geen conflict-melding (want het is bij een andere klant), boekt ook. Resultaat: dubbel geboekt.

Voorstel: bij weergave van beschikbaarheid in Bedrijf-X-context filteren we op tijdsoverlap met bestaande Contracten van die medewerker, ongeacht het bedrijf. Tijdens de boeking-bevestiging tonen we een waarschuwing "deze medewerker heeft al een contract bij een ander bedrijf op deze tijden". Klant beslist zelf om door te gaan of niet.

Dit vraagt een query over alle Contracten van een medewerker. Database-overhead beperkt mits indexering.

### C. Privacy van applicaties

Wanneer Klant X een shift broadcast naar de pool, en kandidaat Y meldt zich, ziet Klant X wie Y is en zijn statuut. Maar Klant X zou óók kunnen leren: "Y meldt zich bij ons aan, dus Y heeft mogelijk minder werk vandaag". Dat is informatie die Y niet noodzakelijk wil geven.

Niet onmiddellijk een blokker, maar wel iets om te documenteren. Geen prioriteit voor MVP.

### D. Rebroadcast bij annulatie

Contract Toegewezen wordt geannuleerd door de medewerker (zegt af). Het blokje moet terug naar de markt. Vraag: behouden we de oorspronkelijke Shift, of maken we een nieuwe?

Voorstel: behouden. De originele Shift gaat terug naar Met Kandidaten of Open. Andere kandidaten die destijds gemeld werden (en niet gekozen waren) blijven in de lijst (status Kandidaat). Klant kan opnieuw kiezen, of nieuwe kandidaten afwachten.

Voor het Contract: status Annulatie, blijft als historie bestaan met rede.

### E. Hoe zien klanten zonder MyStaffler-pool dit?

Sommige klanten hebben een kleine vaste pool waar nog geen MyStaffler-app actief is. Die kunnen niet broadcasten (er is niemand om naar te broadcasten). Voor hen: de UI-functies "verstuur" en "kandidaten" worden grijs of weggemoffeld. Default flow blijft Niveau 1.

Dit volgt natuurlijk uit feature-flag op pool-niveau: heeft minstens 1 medewerker MyStaffler geactiveerd? Zo nee, geen broadcast.

### F. Migratie / activatie

Bestaande bedrijven krijgen niets in hun gezicht. Pas wanneer een medewerker MyStaffler activeert OF de klant in instellingen "Shift-broadcast" aanvinkt, verschijnen de extra UI-elementen. Niveau 1 blijft volledig functioneel.

### G. Mobiele zijde MyStaffler

De medewerker-app krijgt drie schermen erbij voor deze flow:

1. Beschikbaarheid invullen (kalender + range per dag)
2. Aangeboden shifts ontvangen (lijst met details, ja/nee-actie)
3. Mijn contracten zien (over alle bedrijven heen waar hij in pool zit)

Plus de bestaande clock in/out, profile, documents (al in BCJ-roadmap).

## Open follow-up vragen aan jou

Genummerd vanaf 27, in vervolg op de eerste lijst.

27. Bevestig: geen nieuwe Locatie-entity, klanten met meerdere vestigingen vullen dat verder via Groepen of Loonpakket-naam. Akkoord?

28. Loonpakket-template op Shift: optie A (vrij tekstveld voor functie) of optie B (dropdown van bestaande Loonpakketten in het bedrijf)?

29. Beschikbaarheid bij gedeeltelijke booking: wordt het hele blok Vastgelegd en moet medewerker zelf een nieuw blok maken voor de resterende uren? Of splitsen wij automatisch?

30. Conflict-detectie cross-bedrijf: tonen we een waarschuwing "deze medewerker is al gepland bij een ander bedrijf op die uren" bij beschikbaarheids-pull en shift-toewijzing? Tegen meerwerk in de query, maar voorkomt dubbel-booken.

31. Status van rebroadcast na annulatie: behouden we de Shift en gaat die terug naar Open / Met Kandidaten, of maakt het systeem een nieuwe Shift?

32. Activatie-trigger voor de uitbreidings-UI bij bestaande klanten: automatisch zichtbaar zodra 1 medewerker MyStaffler activeert, of expliciete opt-in via instellingen?

33. Mockup 1 en 2 verlaten of als referentie behouden voor "wat had gekund"? Mijn voorkeur: bewaren in de map, expliciet markeren als alternatieve toekomstrichting indien Locatie/Functie ooit wel gepromoveerd worden.

34. MVP-scope, cut-list. Wat denk je dat sneuvelt: capaciteit > 1, multi-day shifts, group-targeting, cross-bedrijf conflict, rebroadcast-bij-annulatie? Mijn neiging: MVP doet capaciteit = 1, single-day shifts, ALL_POOL of SELECTION targeting, geen conflict-detectie, geen rebroadcast. Versie 2 erbovenop.

## Feedback ronde mockups (04/05/2026)

Laurens doorloopt de drie mockups en geeft richting per element. Verwerkt in mockup 04 (resource-lanes-v2) en 05 (create-shift-modal).

Wat blijft staan uit mockup 2:

- Hierarchy Locatie > Functie als rij-as werkt
- Beschikbaarheidsstrip onderaan met visuele tijdsbalk per medewerker
- Klik op blokje opent kandidaten-popover

Wat verandert ten opzichte van mockup 2:

- Statuten worden NIET meer onder de functienaam getoond. Statuut zie je sowieso in de kandidatenlijst en bij beschikbaarheid. Te ingewikkeld onder de functie.
- Plusjes voor het aanmaken van Locaties en Functies inline in de grid: "+ Nieuwe functie" onder elke locatie, "+ Nieuwe locatie" onderaan
- Een blokje kan partial-filled zijn: voor capaciteit > 1 kan je 1 of meer namen ingevuld hebben en de rest open laten. In de grid tonen we de slots gestapeld in het blokje (toegewezen + open + open). Voorbeeld: Afwas wo 6/5, 13:00-20:00, capaciteit 3, met 2 namen toegewezen en 1 open plaats met 1 kandidaat

Wat verandert ten opzichte van mockup 3:

- De "open shifts strip" bovenaan vervalt. Bij volume (20+ shifts) wordt dat onhanteerbaar
- De rechter side panel met Beschikbaar/Iedereen/Kandidaten-tabs wordt gereduceerd tot Beschikbaar/Iedereen, en die filter komt op de strip onderaan in plaats van in een aparte side panel
- "Kandidaten" als filter is verwarrend en valt weg. Kandidaten zie je per shift wanneer je erop klikt, niet als globale filter

Broadcast-mechanisme in de create-shift modal:

- Per slot kan je ofwel een naam kiezen (direct toegewezen), ofwel "Open" laten
- Per gekende naam: een send-icoon naast hen, om individueel een WhatsApp-uitnodiging te versturen. Indicator "WhatsApp verzonden om 14:32" wordt zichtbaar zodra het bericht weg is
- Voor open plaatsen: in de modal verschijnt een aparte "Voor open plaatsen, naar wie verstuur je?"-sectie met radio-keuze: Volledige pool / Selectie / Niet versturen
- In de toolbar van het planscherm: een batch-knop "📤 Verstuur 3 open shifts" om alle open shifts van de week in één keer naar de volledige pool te sturen

Visuele states van een blokje (vereenvoudigde versie):

- Toegewezen contract (blauw, naam zichtbaar)
- Partial-filled (witte achtergrond, slots gestapeld: ●Anouk ●Jeff ○Open)
- Open shift, geen toegewezene (amber dashed, kandidaten-badge)
- Open shift, 0 kandidaten en deadline verstreken (rood)

## Status mockup-evolutie

- Mockup 1, 2, 3: eerste verkenning, blijven staan als referentie
- Mockup 4: Resource Lanes v2, primaire kandidaat voor het hoofdscherm
- Mockup 5 en 6: vervallen als richting, opgevolgd door 7
- Mockup 7 v2: simpele combineerde dialog na vereenvoudigingsfeedback, primaire kandidaat voor de shift-aanmaak

## Vereenvoudigingsfeedback ronde 2 (verwerkt in mockup 7 v2)

- Capaciteit-input is een pill-row 1-6 met overflow naar "+", geen vrij nummerveld
- Per slot binaire keuze met twee knoppen "Iemand kiezen" en "Open shift". Geen vrije input vooraf, geen radio-button vooraf
- In autosuggest tonen we expliciete uren ("beschikbaar 12u - 22u") ipv abstract "past op shift"
- Broadcast-keuze is gereduceerd tot drie radio's: De volledige pool / Specifieke namen / Niet versturen. Geen "iedereen met functie X in vestiging Y" smart-filter, geen extra filters
- Specifieke namen = chip-input met autocomplete. Geen aparte fullscreen-picker (mockup 6 valt weg)

## Selectie-picker (mockup 6) ontwerpkeuzes

Klant kan een pool tot 300 medewerkers hebben en wil daar soms 20+ uit selecteren voor een broadcast. Daarom een aparte fullscreen-picker, geen kleine inline lijst.

Drie pijlers:

- Filter sneller dan scrollen. Search + statuut + groep + beschikbaar-deze-week-toggle + recent-gewerkt-toggle. Filters cumuleren.
- Bulk-selectie boven individuele klikken. Knoppen "+ Beschikbaar deze week (23)", "+ Alle flexi's (45)", "+ Groep Bar (38)", "+ Volledige pool (287)" voegen telkens toe aan bestaande selectie. Niet vervangen.
- Beschikbaarheid voorop in elke rij. De badge naast elke medewerker toont meteen of die past op de shifturen: past (groen), past deels (amber), geen doorgegeven (grijs), conflict ergens (rood).

Selected-bar met chips bovenaan, eerste 5 zichtbaar, rest achter "+ X anderen tonen". Klant kan per chip uitvinken en alle selecties wissen in één klik.

De "Niet versturen"-keuze in mockup 5 vervalt niet, dat blijft een geldige scope-optie naast Volledige pool en Selectie.
