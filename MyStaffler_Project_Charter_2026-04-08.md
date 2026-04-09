# Project Charter: MyStaffler

Datum verslag: 2026-04-08
Status: IN PROGRESS

## Executive summary

We bouwen een mobiele app waar uitzendkrachten hun planning kunnen inzien en weigeren, hun prikklok kunnen starten en stoppen en hun meest recente loondocumenten kunnen raadplegen.

## Challenges and opportunities

De app vormt de basis voor latere potentiele uitbreidingen zoals beschikbaarheden doorgeven, exact gestort loon raadplegen en andere self-service functionaliteit voor uitzendkrachten. Met deze eerste release leggen we het platform, de authenticatie en de integratie met de backoffice vast, zodat volgende features sneller gebouwd kunnen worden.

## Business value / benefits

### Waarom dit project?

Concurrentiepositie. Concurrerende uitzendkantoren bieden vandaag al mobiele apps aan hun uitzendkrachten. Zonder eigen app lopen we risico op verlies van talent en klanten die een moderne digitale ervaring verwachten.

### Hoe meten we de business value?

- Aantal actieve gebruikers in de app versus totaal aantal actieve uitzendkrachten
- NPS van uitzendkrachten voor en na introductie
- Daling van het aantal telefoontjes en mails richting consulenten over planning en loondocumenten
- Behoud van marktaandeel ten opzichte van concurrenten met een vergelijkbaar aanbod

## Scope / results

### In scope

- Login via gebruikersnaam en wachtwoord
- Shiften zien van deze week en toekomstige weken
- Een contract annuleren langs de kant van de uitzendkracht
- Melding wanneer je ingepland bent
- Melding wanneer je contract bijna begint
- Persoonlijke gegevens raadplegen (alleen lezen)
- Upload avatar / profielfoto
- Foto nemen bij starten shift
- Optioneel locatie opslaan bij starten shift, indien beschikbaar
- Salarisoverzicht (meest recente loondocumenten)

### Niet in scope

- Historische shiften raadplegen
- Beschikbaarheden doorgeven
- Dagweergave (enkel weekweergave)
- Inloggen met itsme
- Registratie door de uitzendkracht zelf (enkel uitnodiging door een klant)
- Aantal geplande shifts
- Aantal geplande of gepresteerde uren
- Aanpassen van persoonlijke gegevens
- Urenoverzicht

## T.E.A.M. (RASCI)

| Rol | Persoon |
| --- | --- |
| Leader | Laurens Van Acker |
| Sponsor | Lieven (CEO) |
| Team | IT ontwikkelafdeling + Philippe Norman |
| Consultant | Joke |
| Stakeholders | Klanten en uitzendkrachten Staffler |

## Milestones / deliverables

| Milestone | Datum | Status |
| --- | --- | --- |
| Analyse klaar | 2026-04-08 | COMPLETED |
| Start ontwikkeling | 2026-04-15 | ON TRACK |
| Teksten aangeleverd door Philippe (dialogen, help, ...) | 2026-04-15 | ON TRACK |
| Boilerplate + login klaar | 2026-04-22 | ON TRACK |
| Design klaar + authenticatie en onboarding | 2026-05-06 | ON TRACK |
| Shift scheduling en planning | 2026-05-20 | ON TRACK |
| Clock in en clock out | 2026-06-03 | ON TRACK |
| MyStaffler notifications | 2026-06-17 | ON TRACK |
| Eerste versie beschikbaar in app stores | 2026-06-18 | ON TRACK |
| Project END | 2026-06-30 | ON TRACK |

## Budget (resources, periode van 2 maanden)

| Rol | Capaciteit |
| --- | --- |
| Business Analyst | 0,7 FTE |
| Scrum Master | 0,25 FTE |
| CTO | 0,5 FTE |
| Backend developers | 3,0 FTE |
| Frontend developers | 1,5 FTE |
| DevOps | 0,2 FTE |

## Critical success factors / risks

- Andere prioriteiten die ervoor geschoven worden, zoals aanpassingen vanuit admin of vanuit de overheid
- Veel wijzigingen rond de komende uitbreiding van de flexi-statuten
- Support die nog steeds bij het ontwikkelteam zit en die zal toenemen in het kader van de verhuis
- Indexatie module die dreigt uit te lopen en capaciteit wegneemt

## Status vandaag (2026-04-08)

Project staat op IN PROGRESS. Analyse is afgerond op 8 april 2026. Alle volgende mijlpalen staan op ON TRACK. Start ontwikkeling en aanlevering teksten door Philippe zijn voorzien op 15 april 2026.
