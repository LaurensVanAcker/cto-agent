Dag Anouk en Philippe,

Korte neerslag van onze meeting over de indexations module. Klopt onderstaande lijst voor jullie?

Algemeen:
* Waar dient het veld minimumloon precies voor? Waarom kan dat niet leeg blijven? Wat doet het juist?

Reisvergoeding, bugs die we vastgesteld hebben:
* Frontendvalidatie zegt dat elke waarde groter moet zijn dan de vorige. Volgens mij moet dat 'groter of gelijk aan' zijn?
* Eén tab zou genoeg moeten zijn om naar het volgende veld te springen, geen twee.
* Bij zo'n 150 rijen kan je niet meer scrollen.
* Geen enkele toewijzing reisvergoeding kon ik bewaren, ongeacht de input.
* De input toont coëfficiënt 1,05 gevolgd door een %-teken. Volgens mij moet dat ofwel 5% ofwel 1,05 zijn. Het %-teken eruit?

Reisvergoeding, extra:
* Als fail-safe de waarden begrenzen? Bv. coëfficiënt min 0,85 en max 1,15.
* Horeca Flex toevoegen met vaste waarden. Anouk, jij briefde Serkan hierover, kan dat?
* Afrondingsregels en de regel voor afstanden <1 km documenteren en naar jullie sturen ter validatie. Zo hebben we een paper trail.

Release:
* Idealiter eerste live run op 1 juni (maandag). Dan hebben we 7 dagen om de databank recht te zetten indien nodig.
* Voor die datum: interne IT-tests + admintests + release klaar.

Iets vergeten of verkeerd begrepen? Laat maar weten.

Alvast bedankt
Laurens
