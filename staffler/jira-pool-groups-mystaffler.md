# BCJ-19425 — MyStaffler Pool Overview & Invite Management

Status: In Progress
Assignee: Dmytro Biletskyi (Dima)
Priority: High
Parent epic: BCJ-19424 (MyStaffler authentication & onboarding)
Created: 03/04/2026, last update 06/05/2026
URL: https://boemm.atlassian.net/browse/BCJ-19425

## User story

As an employer/company user, I want to manage my employee pool from the Staffler DPS app, so that I can easily create MyStaffler accounts, manage invites, and open the profile of the employee when I click on their name.

## Wijzigingen aan de bestaande view

Navigation: het huidige "Groups" item wordt vervangen door "Pool", met een nieuw icoon. Zichtbaar voor alle users, ook non-group users (= bedrijven die "Uses groups" aan/uit hebben in profile).

Filter options: drie filterknoppen bovenaan om de lijst te filteren op MyStaffler status:
- MyStaffler inactive
- MyStaffler active
- MyStaffler pending

## Tabel-kolommen (in volgorde)

| Kolom | Zichtbaar voor |
| --- | --- |
| Employee | Iedereen |
| Assigned groups | Enkel group-users |
| MyStaffler account | Iedereen |
| Last login | Iedereen |
| Actions (...) → Assign groups | Enkel group-users |
| Actions (...) → Resend invite | Iedereen, enkel zichtbaar bij status "Invitation sent" |

## Kolom-gedrag

Assigned groups: toont de groep(en) waartoe de employee behoort. Kolom + "Create new group"-knop enkel zichtbaar voor users met group permissions. Header heeft een lock-icoon (vraag van Laurens: ?).

MyStaffler account (NIEUW):
- No account → "Invite employee" knop
- Invite sent → "Invitation sent"
- Account active → groene "Account active"

Last login (NIEUW): datum + tijd van laatste login. Bij never logged in → "Never logged in" in muted/italic.

Actions menu (...):
- Active account → Assign groups + Reset password
- Invite sent → Assign groups + Resend invite
- No account → Assign groups
- (Assign groups enkel zichtbaar als feature aan staat.)

## Invite-flow

Bij klik op "Invite employee":
1. System maakt automatisch een MyStaffler-account, geen self-registration nodig.
2. Employee krijgt een invite-mail met:
   - employer-naam
   - MyStaffler app naam
   - tijdelijk wachtwoord
   - directe link naar app/play store
   - login-instructies
3. Invite-link is 7 dagen geldig. Daarna of bij issue → "Resend invite".
4. Als employee al een actief account heeft, vertelt mail om bestaande credentials te gebruiken.

## FE Acceptance Criteria

- Klik op naam → redirect naar employee profile
- "Groups" wordt "Pool" met nieuw icoon, voor iedereen zichtbaar
- Filterknoppen MyStaffler inactive/active/pending filteren correct
- "Assigned groups" kolom + "Create new group" enkel voor group-enabled profielen
- MyStaffler account status correct per employee: invite-knop, pending badge, of active indicator
- "Last login" toont juiste datum of "Never logged in"
- Actions-menu toont juiste opties op basis van account status
- Resend invite enkel zichtbaar bij status "Invitation sent"

## BE Acceptance Criteria

- Verzenden invite maakt automatisch een MyStaffler-account
- Invite-mail bevat alle info (employer-naam, app-naam, temp wachtwoord, login-link, instructies)
- Invite-link verloopt na X dagen, dan wordt "Resend invite" beschikbaar
- Als employee al een account heeft, mail verwijst naar bestaande credentials
- API geeft correcte MyStaffler-status per employee (inactive/active/pending)
- API geeft de gelinkte loonpakketten per employee
- API geeft last login-datum per employee

## Open vragen voor jou

- "Last login": is dat de laatste login op MyStaffler-app, of laatste activiteit (push ontvangen, shift bekeken)?
- Lock-icoon op "Assigned groups" header: standaard kennen we lock = vergrendeld/admin-only. Klopt dat hier? Of bedoelen ze iets anders?
- Direct link naar app store: één link of OS-detect (App Store voor iOS, Play Store voor Android)?
- Wat is het beleid bij employee die de invite weigert (mail genegeerd 7 dagen)? Resend triggert nieuwe temp wachtwoord of dezelfde?
- BE AC zegt "API returns linked salary packages per employee" - was dat vroeger niet al zo? Of is dat nieuw werk?
- "Pool" met nieuw icoon: welk icoon? Materialicons of custom?

## Gerelateerd

- BCJ-19524 SPIKE: how to implement 2 pools (Dmytro, In Progress, parent BCJ-19481 setup+devops). Dit raakt waarschijnlijk hoe we 1 employee in meerdere pools/groups krijgen.
- BCJ-19424 epic auth & onboarding: alle login/account-flows hangen hier samen.
- BCJ-19426 Login with email and password (In Progress, Vanessa Nunes)
- BCJ-19535 Force password reset on first login (Highest priority, Dmytro)
