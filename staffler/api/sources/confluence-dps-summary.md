# Confluence DPS Space — Consolidated Reference

Pulled 2026-05-09 from Atlassian cloud `8269a689-2956-4f90-9af2-b1fc7d5ad2d9` (boemm.atlassian.net), space key `DPS` (Digital Payroll Services). Scope: API surface, auth, domain semantics.

This document is a verbatim-leaning condensation of 60+ pages. Field names, role names, status values, codes and validation messages are reproduced exactly so they can be reused when calling the API or mapping to Bright/Partena. Page IDs are listed so each fact can be traced.

---

## A. API + Architecture

### REST API (page 3278962728)
Empty container page. Has one child documenting the actuals update endpoint (see below).

### Update / Confirm Actual (page 3278897155)
- Swagger spec base for actuals controller (dev environment):
  `http://boemm-nlb-dev-d79bf2e45c1cad91.elb.eu-central-1.amazonaws.com:8103/dps-api/swagger-ui/index.html#/actuals-controller/updateActualDetails`
- API base path is `dps-api/`. Backend service is exposed on port `8103` on the dev NLB.
- Page also contains a sequence diagram (image-only).

### Architecture (page 3276701701)
Image-only (architecture diagram exported). No textual content.

### Technical Documentation (page 3276570627)
Empty parent.

### Diagram (page 3349151748)
Smart-link only to another Confluence page. No text.

### DPS: Dependencies diagram (page 2631008269)
Cross-cutting epic dependency table. Useful to understand build order:
- Company onboarding → no deps
- Company profile → depends on Company onboarding (Delivered)
- Employee onboarding (no itsme / with itsme) → depends on Scheduler (Delivered)
- Employee profile → no deps
- Employee wage → depends on Employee profile (Delivered)
- Auth rules employee wage → depends on Employee wage (Delivered)
- Scheduler → no deps
- Contracts → depends on Scheduler, Company profile, Employee profile, Employee wage
- Shift templates → depends on Contracts (Delivered)
- Actuals → depends on Contracts (Not blocked)
- Migration → depends on Company profile, Employee profile, Employee wage (Delivered)
- Revenue for sales → depends on Company profile, Employee wage, Contracts (Delivered)
- Mails for admins → depends on Employee onboarding, Employee wage, Contracts (Delivered)

### DPS Hotfix Deployment Process (page 3608772611)
- Phase 1: branch from latest `prd` tag, name `hotfix-[Ticket-ID]` (e.g. `hotfix-BCJ-9999`).
- Phase 2: bump `pom.xml` version by at least 10 (e.g. 1.0.5 → 1.0.15).
- Phase 3: open PR (do not merge yet) — opening triggers image build. Then deploy image to QA via GitHub Actions manual workflow.
- Phase 4: deploy same validated image tag to PROD.
- Phase 5: backport to `main` via separate (non-`hotfix-` prefixed) branch, version on `main` must be higher than the hotfix version that just went to PROD.

### DPS: Components (page 2546925583)
UI component inventory (Button, Calendar, Card, Checkbox, Date picker, Dialog, Divider, Icons, Input field, Paginator, Select, Sidebar navigation, Snackbar, Stepper, Toggle). No API impact.

### Cron jobs in staffler (page 3562373121)
All run in `eu-central-1` AWS EventBridge Scheduler (`default` schedule group). Times in CET/CEST.

| Schedule | What it does | When |
| --- | --- | --- |
| `ActualsAutoConfirmSchedule` | Auto-confirms actuals for time-registration users | Every Mon or Tue at 03:00 |
| `ActualsDemoCleanupSchedule` | Removes contracts and actuals from PROD demo company | Every 11 min |
| `ActualsLockForPaymentSchedule` | Locks actuals during encodage day | Mon 12:59 (encodage Mon) / Mon 23:59 (encodage Tue) |
| `ActualsUnlockAfterPaymentSchedule` | Unlocks actuals after encodage | Tue 20:00 |
| `ActualsUpdateToOverdueSchedule` | Flips actuals to OVERDUE and blocks new contracts (red) | Tue 00:01 |
| `CompanyActualsConfirmationEmailScheduleMorning` | First admin email re companies still to confirm | Mon 07:00 |
| `CompanyActualsConfirmationEmailScheduleAfternoon` | Second admin email re companies still to confirm | Mon 14:00 |
| `EmployeeRegistrationReminderSchedule` | Reminder to itsme onboarders that haven't finished stepper | Every 10 min |
| `NotificationServiceSchedule` | WhatsApp queue for action centre | Every 15 min |
| `NotificationServiceMandatorySchedule` | Mandatory email reminder (cannot be disabled by user) | Mon 09:00 |
| `RegisteredHoursPerWeekForAllCompanySchedule` | Adds itsme cost to companies' invoices | Mon 06:00 |
| `RegisteredHoursPerWeekForCompanySchedule` | DISABLED | DISABLED |

---

## B. Auth + Users

### Login as employee: investigation (page 2517630983)
Discovery doc. Most options listed are deprecated. The only "active" stated method for employee login is **Username and Password** (most frequent). All other options (SSO, 2FA, biometric, OAuth, magic link) marked deprecated for employee login. Note: in production, employees authenticate primarily through itsme during invitation onboarding (see Itsme integration page).

### DPS: Login & Forgot password (page 2546139137)
- Two distinct login flows: **EXTERNAL** (customer email + password) and **INTERNAL** (BOEMM AD via "ADMIN" button → AWS Cognito hosted login).
- External users: Cognito User Pool with email validation `something@something.something` and password requirements (>= 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special).
- Forgot password sends a code (e.g. `NG78XW41`) to user's email; reset URL `https://???.digitalpayrollservices.be/wachtwoord-reset`.
- Forgot-password mail sender: `no-reply@digitalpayrollservices.be`. In QA: send to `dev.administratie@boemm.eu`. In PRD: send to actual user.
- Login error message: NL "E-mailadres of wachtwoord zijn niet juist. Kijk even na en probeer opnieuw." / EN "Email address or password are not correct. Please check and try again."

### DPS: Users: General (page 2546860053)
External vs internal users:
- **External**: `Company` (the customer paying DPS, NOT the legal employer — DPS is the legal employer), `Employee` (under DPS payroll for that company).
- **Internal**: `DPS Admin`, `DPS Sales representative` (Vertegenwoordiger), `DPS Commercial Director`. Plus `Credit controller`, `HR`, `IT`.
- Tool roles (EN/NL): `Customer user`/Klant, `Candidate/Employee user`/Kandidaat/Medewerker, `DPS admin`, `DPS sales representative`/DPS verkoper, `Full admin`.

### DPS: Create account external users (page 2546434049)
- Admin invites a customer with **temporary password** by email. User logs in with email + temp password and is forced to set permanent password.
- Mail sender `no-reply@digitalpayrollservices.be`. QA: `dev.administratie@boemm.eu`.
- Subject NL "Welkom bij Digital Payroll Services!" / EN "Welcome at Digital Payroll Services!"
- Password rules same as login: >= 8 chars, 1 upper, 1 lower, 1 digit, 1 special.

### DPS: Types of company users (page 2924773378)
Two external roles split by access level:
- **COMPANY-USER** (algemene toegang): sees all groups + employees + unassigned employees.
- **GROUP-USER** (specifieke toegang): only sees the groups they're assigned to. Required to pick a group on invitation creation. If only one group assigned: prefilled and disabled. They cannot manage groups (no menu item, redirect on URL access).
- Filter on groups: COMPANY-USER sees all; GROUP-USER sees only their groups (if 1 group → no filter shown).

### DPS: Manage user accounts (page 2925330437)
Critical operational page. Two AWS Cognito user pools:
- QA: `eu-central-1_F8LSAk3O5`
- PROD: `eu-central-1_QgXKNpVI3`

Cognito statuses surfaced in DPS:
- `Confirmed` → "Completed" account (user has set permanent password).
- `Force change password` → "Pending" account (got temp password but never logged in).
- `External provider` → ignored (these are internal BOEMM users, no `custom:companyId`).

Each external user has Cognito custom attribute `custom:companyId` matching DPS companyId.

Account actions in user accounts table:
- **Remove account**: deletes from user-service + AWS (manual disable then remove access). Must not be able to log in again, even via reset.
- **Reset account**: only shown for accounts that already set permanent password. Triggers the existing forgot-password mail flow.
- **Resend invitation**: only for accounts that have not yet set permanent password. First disable+delete in AWS+user-service, then resend invitation with same role and group rights.
- **Limit access rights** (COMPANY-USER → GROUP-USER): downgrade.
- **Expand access rights** (GROUP-USER → COMPANY-USER): upgrade to full access.

User-account auth rules — who can invite/update users (everyone except GROUP USER):
```
SALES ADMIN
SUPER ADMIN
FULL ADMIN
DPS SALES
DPS DIRECTOR
COMPANY USER
CREDIT CONTROLLER
PREVENTION ADVISOR
RECRUITER
```
COMPANY USER cannot update or remove their **own** account. GROUP USER cannot update anyone.
Standard 403 messages: NL "Je hebt geen rechten voor het uitvoeren van deze actie" / EN "You have no rights for executing this action".

### DPS: Roles and rights (page 2892365825)
Helicopter view of access:

| Area | All-rights (COMPANY USER) | Specific (GROUP USER) |
| --- | --- | --- |
| Company onboarding | yes | n/a |
| Company profile | yes | yes (only when at least one group exists) |
| User accounts | yes | yes, but only users in same group(s); cannot remove groups not assigned to own user; new invites by GROUP USER auto-assigned same groups |
| Planning | yes | filtered by groups |
| Time registration | yes | filtered by groups |
| Invitations list | yes | filtered by groups on invitation |
| Groups | yes | no access |

There is always at least one COMPANY USER per company. Only BOEMM users may delete customer users from the planning tool. Unassigned employees are visible only to COMPANY USERs.

### DPS: Machine State Diagram COMPANY vs. GROUPS user (page 2979528713)
Image only.

### Itsme integration: source of truth of data (page 2779676695)
- Itsme triggers from welcome page → mobile app authentication → callback returns identity data.
- After itsme verification, BE searches existing employee by SSN. If found, BE does NOT overwrite employee data with itsme data until the registration stepper is fully completed. If not found, BE creates the employee.
- Address is enriched with GPS coordinates from Google Maps service.
- New employee field `isDraft` (boolean):
  - Non-itsme stepper completed → `isDraft = false`.
  - Itsme verification only, stepper not completed → `isDraft = true`.
  - Itsme verification + stepper completed → `isDraft = false`.
  - Default when itsme is used: `true`. FE flips to `false` on stepper completion.
- BE only sends "employee registration" emails when `isDraft = false`.
- If invitation sent and user verifies via itsme but doesn't complete stepper, send a reminder email after 10 minutes.

Itsme-prefilled fields and trustworthiness (selected; full table on page):
- `SSN` / Rijksregisternummer — disabled, always prefilled, required.
- `Firstname`, `Lastname`, `Gender`, `Date of birth`, `Birth place`, `Birth country` — prefilled from DB if employee exists, otherwise from itsme; if both empty, field becomes editable.
- `Mobile` — readonly, always prefilled from itsme, required.
- `Email address` — prefilled (DB or itsme), editable.
- `IBAN` — prefilled from DB (with warning) or itsme, editable.
- `Marital status`, `Dependant partner`, `Dependent child(ren)` — never prefilled by itsme, editable, required.
- `Payroll tax` — defaults to `18%` if empty.
- `Statutes`, `transportType` — never prefilled, required.

### Logout (page 2805006360)
Logout clears Cognito session, SKEY session and cookies. Button at bottom-left of planning screen. Confirmation dialog. After logout same/different credentials must work.

### DPS: Re-inviting employee (page 2567210325)
Employees can be invited multiple times (across different companies; or within same company). Within same company: do NOT re-create wage, do NOT re-add to pool, do NOT overwrite wage. Student@work balance: re-invite of student adds +20 if balance < 20 (BrightStaffing notifies; sales admin cancels and recreates).

### DPS: Invitation already complete (page 2567209996)
Display when invitation already used. Title NL "Deze uitnodiging is al vervolledigd." / EN "This invitation has already been completed."

### DPS: Invitation invalid (page 2567210017)
Display when invalid id in URL. Title EN "This invitation is invalid." / NL "Deze uitnodiging is ongeldig."

### Employee onboarding stepper (page 2563244037)
Two onboarding flows: with itsme and without itsme. Steps: Welcome → Step 1 General → Step 2 Contact → Step 3 Payment → Step 4 Documents → Completed.
- Non-itsme: must upload ID or bank document; admin must validate (`validated=true`) before employee is added/updated to CORE.
- Welcome page footer constant text:
  ```
  © DIGITAL PAYROLL SERVICES
  Hoogleedsesteenweg 110, 8800 Roeselare, België
  BE0806.902.319, VL.: VG.1568/BUC, WAL: W.DISP.1296, BXL: 00143-406-20171109
  Privacy Policy & Cookies
  ```

### Invitation lifecycle (page 2816507907)
Four invitation statuses (state machine):
- `Active` / `Pending` — initial state on invitation create.
- `Completed` — user finished one of the steppers (with or without itsme).
- `Expired` — DEPRECATED. Originally: if not completed in 7 days. No longer enforced.
- `Canceled` — manual user action; only allowed from `Active`.

Filter UI: Active / Completed / Canceled. Pop-up message on welcome page when user accesses a `Completed` invitation: NL "Deze uitnodiging werd reeds vervolledigd en is niet langer geldig." / EN "This invitation has already been completed and is no longer valid."

When canceled: hide share button; show NL "Deze uitnodiging is niet langer geldig. Neem contact op met de werkgever om jou een nieuwe uitnodiging te versturen."

### Invite an employee (page 2656010268)
Invitation creation creates 3 DB entities: `invitation employee`, `invitation wage`, `invitation engagement`.
Statute options on invitation:
- `White collar student` (Jobstudent bediende)
- `Blue collar student` (Jobstudent arbeider)
- `Flex White Collar` (Flexijob bediende)
- `Flex Blue Collar` (Flexijob arbeider)
- `White Collar` (Bediende)
- `Blue Collar` (Arbeider)
- `White Collar Worker Student` (Werkstudent bediende) — visible only for sales admin role.
- `Blue Collar Worker Student` (Werkstudent arbeider) — visible only for sales admin role.
- `Extra` (Gelegenheidsarbeider horeca / Extra)
- `Seasonal labour` (Seizoensarbeider) — hidden, not visible to anyone.

Gross hourly wage validation `[8.30; 100.00]` EUR. "Choose minimum wage" switch when on, defaults to 8.30 (admin will adjust to baremaloon later).

Reason of employment defaults to "Tijdelijke vermeerdering van werk" / "Temporary enhancement of work". Other options: `Vervanging`, `Uitzonderlijk werk`, `Instroom`.

Mealvoucher rules (also used elsewhere):
- Max total: 8.00 EUR.
- Min total: 2.18 EUR.
- Min employee share: 1.09 EUR (legal minimum).

Invitation email is sent to: PRD = entered address; QA = `dev.administration@boemm.eu`. From `no-reply@verificationemail.com`. NL/FR/EN trilingual body containing the magic link.

### User Mapping Hunters DPS (page 3275128833)
For Staffler/DPS the mapping between hunter email and HubSpot ID is automated (consultantId in staffler ↔ HubSpot ID). For WorkToday the mapping is still manual (BCJ-16434 to automate).

---

## C. Contracts + Actuals + Scheduling

### DPS: Contracts (page 2541879297)
Composes `shiftTemplate` fields, `employeeWage` fields and contract-level fields. Key API-relevant fields:

shiftTemplate:
- `From`/`Until` (dd/mm/yyyy)
- `Select shiftTemplate or create new one` (search dropdown)
- `Name shift`, `Starting hour`, `Ending hour`, `Starting hour break`, `Ending hour break`

employeeWage (selected):
- `Gross hourly wage` `xx,xxxx €`, validated `[8.20; 100.00]`.
- `Statute`, `Joint Committee` (PC code), `Company-function`.
- `Reason of employment` defaults to `Tijdelijke vermeerdering van werk`. Options: `Vervanging`, `Uitzonderlijk werk`, `Instroom`.
- `Compensation hours` (Inhaalrust): `Geen` / `Met inkomsten` / `Zonder inkomsten`.
- `Transportation allowance` and `Type` (`Private subscription`/`Public subscription`/`Car`/`Bike allowance`).
- `Mealvouchers` total + employer share + employee share + minimum hours.
- `Ecovouchers`.

Other contract fields:
- `Coefficient` (per statute, defaulted from company-profile, only admins edit).
- `Coefficient bank holiday`, `Coefficient transportation allowance` (default 1,35), `Dimona cost` (default 0,3940), `Coefficient mealvouchers` (default 1,69), `Coefficient ecovouchers` (default 1,69).
- `Standard tax tariff` defaults to 21%; options: `0%`, `6%`, `12%`, `0% Verlegd`, `0% Verlegd EU`.
- Schedule fields `Q` (gemiddeld uren werknemer/week) and `S` (gemiddeld uren/week) defaulted to 38.

### Admin: Contracts (page 2511863810) and Contract details: General/Schedule/Invoicing/Wage/Internal info/Cost center (pages 2511798279, 2513371137, 2512355329, 2512322561, 2512322581, 2514518017)
Together these enumerate every Bright/Partena contract field that maps to DPS. Highlights:
- Contract number is generated by Brightstaffing, not stored in DPS.
- `Reduced rate?` (Verlaagd tarief): not applicable when payroll = true.
- `Paid holiday?` options: `Klant betaalt (Exclusief)` / `Klant betaalt niet (Inclusief)`.
- `Standard BTW tariff` options: 0%, 6%, 12%, 21%, `0% Verlegd`, `0% Verlegd EU`.
- `Dimona Addon` default 0,3508 (also referenced as 0,3108 elsewhere — values evolved across pages 2541682736 vs 2512355329).
- Schedule:
  - `Regime`: `Dag` / `Ploeg` / `Nacht` (DPS always `Dag`).
  - `Shift regime`: defaults to `Dag` for DPS.
  - `New Q/S calculation` boolean: when true, contract uses the new timetable fields (see DPS: New Time Table method).
  - Old Q/S fields: `companyHoursPerWeek` (S, default 38), `employeeHoursPerWeek` (Q, default 38).
  - New timetable fields: `Effective hours full time employer`, `Average hours fulltime employer`, `Actual hours employee`, `Paid recuperation time`, `Unpaid recuperation time`.
- Internal info:
  - `Late contract?` boolean; reason `Kantoor te laat` / `Klant te laat`.
  - `Contract ended?` boolean.
  - `Reason for late contract` required when `Late contract = true`.
  - `Job domain`: 27 options listed verbatim.
- `Cost center` only visible when company-profile checkbox `split invoice by cost center = true`.
- Tax tariff field `0% Verlegd EU` defaulted for PC124 (construction) / PC121 (cleaning).

### Contract validations (page 2798092290)
1. **Statute EXTRA** can only be one-day contracts. FE blocks contract create dialog when EXTRA is chosen with > 1 day. Hide create button + show info NL "Voor het statuut Gelegenheidsarbeider horeca (Extra) zijn enkel dagcontracten toegelaten." / EN "For the statute Extra only day contracts are allowed." BE 400: NL "Opeenvolgende dagcontracten zijn niet toegelaten voor Gelegenheidsarbeider horeca (Extra)" / EN "Consecutive day contracts are not allowed for statute Extra".
2. **Max two consecutive day contracts for EXTRA**. BE checks contracts in window x-2d, x-1d, x+1d, x+2d (across all allocations). If 3+ consecutive: BE 400 EN "Extra is not allowed three days in a row" / NL "Voor Gelegenheidsarbeider horeca (Extra) kunnen er slechts twee opeenvolgende dagcontracten zijn".
3. **40 consecutive day contracts per semester** rule (RSZ-fine threshold). Statute scope (count applies):
   ```
   WHITE COLLAR
   STUDENT WHITE COLLAR
   WORKER STUDENT WHITE COLLAR
   LABOUR
   STUDENT LABOUR
   WORKER STUDENT LABOUR
   ```
   Excluded: flex workers, Extras. Two semesters: Jan–Jun and Jul–Dec. Pop-up confirmation when adding consecutive day contract (NL "Bent u zeker dat u opeenvolgende dagcontracten wil voorzien? Weet dat er een wettelijk maximum is opgelegd."). At count=35 show info banner on employee name.

### DPS Dimona rules (page 2542665740)
- **Create contract**: only allowed when current timestamp is at least 29 minutes before contract first day starting time. Past-day contract creation is blocked for everyone except FULL ADMIN and SUPER ADMIN. UI validation (NL): "Startuur moet minstens 30 minuten in de toekomst zijn".
- Break must fall within working hours (overnight contracts handled).
- **Update contract before start**: customer can only set start hour ≥ 29 min in future. Past days in multi-day contract become readonly.
- **Update contract after start**: cannot update; the contract has become an actual.
- **Cancel contract**: allowed only when start is ≥ 14 minutes in future. Excluded from time-rule (always allowed): SALES ADMIN, SUPER ADMIN, FULL ADMIN.
- **Minimum contract duration**: 3 working hours, with exceptions:
  - PC 302 → minimum 2 hours.
  - PC 314.03 or PC 320 → minimum 1 hour.
- **Maximum contract duration**: 16 working hours (excluding break duration).
- Update message NL: "Voor dit paritair comité geldt een hogere minimumduur van contracturen."
- Max-duration message EN: "A contract can only be maximum 16 hours long."

### DPS: Actuals (page 2541977601)
Actual fields are mostly read-only (defaulted from contract). Editable by both admins and customers:
- `Starting hour` — can only be set later than original, never earlier.
- `Ending hour`, `Starting hour break`, `Ending hour break`, `Note`.
- `Premiums and allowances` — admin-only.
- `Absence reason` — fixed list (see auto-encodage).

### Actuals lifecycle (page 2725937155)
Statuses (machine):
- `Pending` (orange card, white text) — set as soon as contract end-time passes. Card greyed out until end-time passed.
- `Confirmed` (green) — set after user confirms working hours.
- `Absent` (also surfaces from confirmation flow) — when full-day absence reason set.
- `Overdue` — page predecessor name "In attent". Set every Tuesday at 00:01 CET on previous-week's still-pending actuals (orange + exclamation mark).
- `Cancelled` — when underlying contract is cancelled. Allowed from any preceding status; pop-up warning if status was already Confirmed/Absent/Overdue.

After a confirmation:
- SUPER, SALES and FULL admin can always update actuals (no BS push happens immediately, weekly auto-job).
- All other roles can no longer update.

### Actuals - Business notes (page 2982150154)
Operational rules:
- 3 statuses (legacy notes): Confirmed / Not confirmed / In attent (now `Overdue`).
- Mon W x+1 7:00: e-mail to admins with companies still NC.
- Tue W x+1 15:00: actuals flip to "in attent".
- Customer must confirm by Mon W x+2; otherwise company is blocked from create/update/cancel **across the whole company** (not just that customer/employee).
- Company-profile checkbox `block contract creation for actuals in attent`: only admin users can see/update; allows bypassing the contract block (used for monthly-billed customers).
- Confirmation dialog supports both WORKED hours (default, prefilled from contract) and absence (full day or partial). No overlap allowed between worked and absent hours (boundaries can match).
- Encodage script must push specific codes to BS when actuals confirmed (no weekly lambda like Work Today).

### Actuals confirmation in DPS (page 2992275457)
- Company-profile checkbox `Uses actuals confirmation` (NL "Maakt gebruik van prestatiebevestiging"). Default true for new companies; default false for already-onboarded prod companies (sales must enable).
- Internal-only roles can see/update this checkbox: DPS SALES, DPS DIRECTOR, SALES ADMIN, SUPER ADMIN, FULL ADMIN, CREDIT CONTROLLER, RECRUITER, PREVENTION ADVISOR. Hidden for COMPANY-USER and GROUP-USER.
- New menu item "Actuals" / "Prestaties" (€ icon) under "Planning" with red badge counting NC + OVERDUE actuals (one count per actual card, not per day).
- Filter on actuals status: only filters offered are "Te bevestigen" (PENDING + OVERDUE) and "Bevestigd" (CONFIRMED + ABSENT).
- URL contract param: `contractStartDate=2024-06-10&contractEndDate=2024-06-23`. Single contract: `/contract/{contract id}/update`.
- FE validations:
  - Start hour ≥ -30 min from contract start.
  - Working duration ≥ 2 hours (excluding break).
  - No overlap between worked and absent hours.

Absence reason dropdown (sorted exactly as below):
1. NL `Verlof` / EN `Leave of absence`
2. NL `Ziekte` / EN `Sick`
3. NL `Gerechtvaardigde afwezigheid` / EN `Justified absence`
4. NL `Onwettig afwezig` / EN `Unlawfully absent`
5. NL `Weerverlet` / EN `Bad weather`
6. NL `Feestdag` / EN `National holiday`
7. NL `Familiaal verlof` / EN `Family leave`
8. NL `Klein verlet` / EN `Short leave`
9. NL `Economische werkloosheid` / EN `Economic unemployment`
10. NL `ADV` / EN `ADV`

### DPS: Auto encodage of actuals confirmations (page 3002990599)
Encodage triggers per actual confirm/update against Brightstaffing API:
- Confirmation: `https://{customer}-staging.b-bright.be/backend/index.php/api/encodage/addEncodage` (staging) / `https://{customer}.b-bright.be/.../addEncodage` (PRD).
- Update: `.../updateEncodage` (same host pattern).
- Body keys: `code`, `date`, `amount` (decimal hours).

Encodage only runs for DPS contracts that:
1. are `ACTIVE`,
2. have no sync errors,
3. have actuals confirmed with worked and/or absent hours.

Codes:
- `1010` — WORKED hours. Amount = (end - start) - break duration in decimal hours.
- Absence-reason codes table (verbatim):

| Reason | Code | Allowed statutes |
| --- | --- | --- |
| JUSTIFIED ABSENCE | 3000 | all |
| ILLEGAL ABSENT | 3010 | all |
| FAMILIAL LEAVE | 2500 | WHITE_COLLAR, LABOUR, EXTRA |
| SHORT LEAVE | 1031 | WHITE_COLLAR, LABOUR, EXTRA |
| BAD WEATHER | 2720 | WHITE_COLLAR, LABOUR |
| ECONOMIC UNEMPLOYMENT | 2700 | WHITE_COLLAR, LABOUR |
| SICK | 2170 | WHITE_COLLAR, LABOUR, LABOUR_STUDENT, WHITE_COLLAR_STUDENT, LABOUR_STUDENT_WORKER, WHITE_COLLAR_STUDENT_WORKER, EXTRA |
| SICK PAID (INV) | 1311 | (same as SICK) |
| SICK PAID (NOT INV) | 1310 | (same as SICK) |
| SICK NOT PAID (FIRST MONTH) | 2010 | (same as SICK) |
| NATIONAL HOLIDAY INVOICED | 1020 | all |
| NATIONAL HOLIDAY NOT INVOICED | 1025 | all |
| LEAVE OF ABSENCE white collar | 3161 | WHITE_COLLAR, EXTRA |
| LEAVE OF ABSENCE labour | 1600 | LABOUR, EXTRA |
| ADV PAID | 1650 | WHITE_COLLAR, LABOUR, LABOUR_STUDENT, WHITE_COLLAR_STUDENT, LABOUR_STUDENT_WORKER, WHITE_COLLAR_STUDENT_WORKER, EXTRA |
| ADV NOT PAID | 1660 | (same as ADV PAID) |

Excluded for FAMILIAL/SHORT/BAD WEATHER/ECONOMIC etc: FLEX_LABOUR, FLEX_WHITE_COLLAR, LABOUR_STUDENT, WHITE_COLLAR_STUDENT, LABOUR_STUDENT_WORKER, WHITE_COLLAR_STUDENT_WORKER, SEASONAL_LABOUR (per-row exception list on page).

Driver flags from company-profile (Wage policy tab):
- `Holiday is invoiced` (default true) → picks 1020 vs 1025.
- `Illness is invoiced` (default true) → informational only; admin manually picks SICK code.

ADV code selection driven by contract's `Compensation hours` (`Paid` → 1650; `Not paid` → 1660; `None` → option hidden).

Roles that can see+edit holiday/illness invoicing switch: SUPER ADMIN, SALES ADMIN, FULL ADMIN, DPS DIRECTOR, PREVENTION ADVISOR. See but not edit: DPS SALES, CREDIT CONTROLLER, RECRUITER. Hidden for COMPANY-USER and GROUPS-USER.

### Actuals Encodage (page 3279880197)
Diagram only.

### Email for actuals confirmations (page 3039330355)
Mon 07:00 CET email from `administration@digitalpayrollservices.be` to staffler managers + admin mailbox listing companies whose actuals are still NOT CONFIRMED or OVERDUE for previous week (only when company `uses actuals confirmation = true`). Recipients in PROD listed verbatim:
```
jeff.callebaut@staffler.be
joke.carton@staffler.be
gregory.dubois@staffler.be
Karel.Vancamelbeke@staffler.be
Nordin.Allali@staffler.be
Lisbeth.Serroels@staffler.be
CC: administration@digitalpayrollservices.be
```
QA recipient: `dev.administratie@boemm.eu`.

### Who can confirm or update actuals and until when? (page 3039526918)
Roles allowed to confirm/update:
```
SUPER ADMIN
FULL ADMIN
COMPANY USER
GROUP USER
```
Read-only (can view dialog but no edits): SALES ADMIN, DPS SALES, DPS DIRECTOR, CREDIT CONTROLLER, PREVENTION ADVISOR, RECRUITER. BE 403 messages as elsewhere.

Time restrictions:
- Update of CONFIRMED/ABSENT actual allowed until next Mon 23:59. (E.g., Mon 3 Feb confirmed → updatable until Sun 7 Feb 23:59.)
- Hard lock window for ALL previous-week actuals: each Mon 23:59PM CEST (22:59 CET) → Tue 20:00PM CEST (19:00 CET). During lock: hide submit button, message NL "De uitbetalingen van deze week zijn al gestart. Deze actie is tijdelijk niet beschikbaar." / EN "This week's payments have already started. This action is temporarily unavailable."
- After Tue 11:00 CET (12 PM CEST): permanently lock previously-CONFIRMED/ABSENT actuals from previous weeks. BE message NL "De prestaties van vorige week worden al verwerkt. Je kan deze niet langer aanpassen."

Current-week actuals are not affected by these locks.

### [in progress] Copy contracts from one week to another week (page 3185737748)
Draft mode: planning shows two weeks. Copy creates DRAFT contracts (hatching overlay). Submit "Bevestigen weekplanning" creates them as real contracts. Right week must be current or future. Copy-button rules per employee: hidden if no source contracts; disabled if any overlap; otherwise enabled. Cancellation dialog: NL "Ben je zeker dat je deze pagina wil sluiten? De contracten werden nog niet bevestigd."

### Copy contracts from one week to another - Business notes (page 3074064399)
Auxiliary doc; same logic — when overlap, button disabled; warnings if weeks are non-consecutive or source is in the past. No link is preserved between source contracts and copies.

### DPS: Scheduler (page 2540371969)
Lists the actions exposed by contracts (`Create`, `Remove` = cancel, `Update`, `Copy`) and actuals (manual confirm, set absent, add premium/allowance, confirm-all-week button, time registration auto-confirm, Mon-evening auto-confirm).

### Libraries for DPS scheduler calendar (page 2553380867)
Library research: Bryntum Scheduler, FullCalendar, Webix, Mobiscroll. No prod impact; informational.

### UI of planningscreen (page 2541715477)
URL conventions for the planning screen:
- One-week and two-week views encoded as `?contractStartDate=YYYY-MM-DD&contractEndDate=YYYY-MM-DD`.
- Single contract route: `https://myplanning.digitalpayrollservices.be/company/{companyId}/planning/contract/{contract id}/update`.
- Pagination: `?pageNumber=1`. Default 30 employees per page.

URL hostname for the FE app: `https://myplanning.digitalpayrollservices.be`.

Auth rules per page (BOEMM internal users have access unless noted; COMPANY-USER access only for own company):
- Search company / company onboarding / company profile / planning / employee profile (others' company): all BOEMM internal roles (FULL ADMIN, SALES ADMIN, SUPER ADMIN, CREDIT CONTROLLER, PREVENTION ADVISOR, RECRUITER, DPS SALES, DPS DIRECTOR). COMPANY-USER denied except for own company's planning and employee profiles.
- BE error: NL "Je hebt geen rechten om deze actie uit te voeren." / EN "You have no rights for executing this action."
- FE redirect on missing permission: BOEMM internals → search company; company users → planning of own company.

Pool of employees on planning:
- Endpoint must list all employees in pool (entity binds employee to company; a single employee can be in multiple pools).
- Order alphabetically by first name then last name.
- Pagination request: BE issue with > 150 engagements per company because URL holds all ids (>URL length limit).
- Remove from pool: removes engagement + un-assigns from groups, keeps employee record (unless removed everywhere). Allowed roles: SUPER ADMIN, SALES ADMIN, FULL ADMIN.

### Confirm actuals (page 2542502043)
Confirmation reasons:
- `Worked` (NL Gewerkt) — sets status `Confirmed`.
- `Sick` (NL Ziekte) — sets status `Absent`.
- `Absent without notice` (NL Heeft niet verwittigd) — `Absent`.
- `Absent with notice` (NL Heeft verwittigd) — `Absent`.
"Confirm all actuals" button confirms every shown actual in current week with reason `Worked`. PUT endpoint reused for edit.

### Actuals UI (page 2542502030)
Card visuals: To confirm (orange, NL "Te bevestigen"), Confirmed (green, NL "Bevestigd"), Absent (NL "Afwezig"). Card shows position, hours, and statute on hover. Update rules: cannot make start time earlier; total working duration must be ≥ 2 hours.

### Select and copy contract(s) to week x (page 2541682748)
[Marked "to recheck"] Multi-select copy flow with intermediate review dialog.

### Filter by groups (page 2542272621)
Planning screen group filter. URL param: `groups=1,2`. Filter is multi-select; chips in active state.

---

## D. Employees + Wages + Groups

### DPS: Employees (page 2562785289)
Empty.

### DPS: Employee wage (page 2541846529)
Wage entity is per-employee per-company; FE name auto-composed `{Company-function} - {Statute} - {Street + (City)}` of place of employment.

Required and validation rules:
- `Gross hourly wage`: `[8.50; 100.00]` EUR (note: this page says 8.50 — invitation page says 8.30 — values evolved).
- Statute = same enum as invitation creation.
- Mealvoucher rules: Max 8 EUR total, min 2.18 EUR total, min employee share 1.09 EUR.

Update logic: when changing wage fields, **existing contracts are NOT updated**; only new contracts pick up the new value. Inform user with banner NL "Deze aanpassingen worden niet automatisch toegepast op reeds bestaande contracten...".

Remove employee wage button: only SUPER/SALES/FULL admin (soft delete; allowed even when contracts exist; future contracts lose their shift; past contracts stay untouched).

### Auth rules on employee wage list - create - update (page 2656338016)
- Hide `WORKER STUDENT LABOUR` and `WORKER STUDENT WHITE COLLAR` for COMPANY_USER, DPS_DIRECTOR, DPS_SALES.
- Hide `SEASONAL LABOUR` for everyone listed (SALES_ADMIN, SUPER_ADMIN, DPS_DIRECTOR, DPS_SALES, FULL_ADMIN, COMPANY_USER) — i.e., always.
- Hide for COMPANY_USER + DPS roles in CREATE and UPDATE wage: `Reason of employment`, `Compensation hours`, transportation `Number of km`, transportation calculation button, transportation `Amount`.
- COMPANY_USER, DPS_DIRECTOR, DPS_SALES updating wage:
  - `Gross hourly wage`: only enhance, cannot lower; submit disabled if lowered.
  - Disable: `Transportation allowance`, `Mealvouchers`, `Ecovouchers`.
  - PC code, statute, company-function disabled for ALL users on update.
- Listing wages: allowed for FULL_ADMIN, SUPER_ADMIN, SALES_ADMIN, DPS_DIRECTOR, COMPANY_USER, DPS_SALES.

Validation messages:
- NL "Met deze medewerker is een hogere verloning afgesproken. Contacteer onze administratie via +32 51 46 58 16 voor meer info."
- EN "Higher pay has been agreed with this employee. Contact our sales admin team through +32 51 46 58 16 for more information."

### DPS: Group employees (page 2806644740)
Empty parent.

### Grouping of employees (page 2806054922)
- Group entity: `name` + assigned employees. Per company.
- Group-name unique per `companyId`. Min 3 / max 25 chars.
- Filters: by employee name (3+ chars, ignore case/special), by group(s), by "only show unassigned" (URL `?filter=unassigned`).
- Group page URL: `myplanning.digitalpayrollservices.be/{companyId}/groups`.
- Group filter URL: `myplanning.digitalpayrollservices.be/{companyId}/groups/groups=1,2`.
- Removing employee from pool also unassigns from groups.
- COMPANY USERs can manage groups only on companies they're assigned to.

### DPS: Time registration (page 2658304005)
Empty parent / scope description.

### DPS: New Time Table method (page 2877227027)
Critical change to the contract schema. Two timetable methods coexist (FF-controlled).

Old fields on contract:
- `companyHoursPerWeek` (S timetable, default 38).
- `employeeHoursPerWeek` (Q timetable, default 38).

New fields (on company, employee wage and contract):
- `Effective hours full time employer` (NL `Effectieve uren voltijdse klant`).
- `Average hours fulltime employer` (NL `Gemiddelde uren voltijdse klant`).
- `Actual hours employee` (NL `Effectieve uren uzk`).
- `Paid recuperation time` (NL `Betaalde ADV uren`).
- `Unpaid recuperation time` (NL `Onbetaalde ADV uren`).

Rules:
- Format: number, 2 digits after comma, label `hours/week` / `uren/week`.
- Default new fields when creating wage: cascade from company profile (one-way, doesn't update later).
- Updating company timetable does NOT cascade to existing wages or contracts.
- Updating wage timetable does NOT cascade to existing contracts.
- Contract endpoint `dps-api/api/contracts` accepts EITHER old Q/S OR new fields, never both. Mixed payload is rejected (400). Switching methods on an existing contract is not allowed.
- Validation rule 1: `(Effective full-time employer) - (Actual employee) = (Paid recup) + (Unpaid recup)`.
- Validation rule 2: all five fields non-empty and non-zero, except Paid/Unpaid recup which can be zero.
- Migration job: copies `companyHoursPerWeek` to all five new fields (Paid/Unpaid recup → 0,00) and clears the old field.

Endpoints involved:
- Company: `/dps-api/api/companies/{ID}`
- Employee wage: `dps-api/api/employeewages` and `dps-api/api/employeewages/{ID}`
- Contract create: `dps-api/api/contracts`
- Contract edit: `/dps-api/api/contracts/{ID}`

Roles allowed to edit timetable on wage and contract (others can save unchanged value, not modified value):
```
SALES_ADMIN
SUPER_ADMIN
FULL_ADMIN
PREVENTION_ADVISOR
CREDIT_CONTROLLER
DPS_DIRECTOR
```

### Actuals working together with time registration (page 2705784834)
- If company `Uses time registration = true` AND there are registered hours for the day → prefill actual hours from time registration. Otherwise prefill from contract.
- First START → working hours start. Last STOP → working hours end. Second START → break start. Logic for multiple breaks: sum of (STOP→START) intervals, applied as break starting at first STOP for `breakStart + totalBreakDuration` minutes.
- If user pressed START but never STOP, leave "until" field empty, highlight red, mark as required. Actual card shows "12:01 - " visually.
- Show distinguishing icon per day on actual card when prefilled from registered hours.

### Collective time registration (page 2651160578)
- Visible only when company `Uses time registration = true`.
- Page shows current day, allows employee selection from pool dropdown.
- Clock-in rule: enabled only when current timestamp is within 30 min of contract start.
- Clock-out rule: until 16 hours after contract start, OR 1 hour before next contract starts (whichever is sooner).
- BE message NL "Je kan niet langer in -of uitprikken."
- Multiple play→stop→play→stop on same contract supported (interpreted as breaks). Time entries shown comma-separated in row.

---

## E. Companies

### DPS: Companies (page 2656600069)
Empty parent.

### Admin: Company details (page 2502819842)
Lists all section priorities, fields and admin-only actions (Events, Reminders, Add/remove hours balance, Bulk company contracts change, Download social balance pdf, link to BS Facturen). API-relevant points:
- `Type of company` (Ex-customer, Customer, Prospect, Supplier) is calculated on the fly.
- Bulk company contracts change is gated to FULL ADMIN and Commercial director.
- Default coefficients in bulk template: 4 digits after comma; cannot be negative; cannot exceed 100; can be 0.
- Social balance download: `start_date` defaults to 01/01 and `end_date` to 31/12 of current year. PDF retrieved from BrightStaffing.

### Add new company (Credit Safe) (page 2546139219)
Search-driven onboarding:
1. FE accepts search query (name or VAT).
2. BE searches DB by name and by VAT (accepts `BE1234567890`, `1234567890`, or `BE 0678.662.280`).
3. If not found in DB, BE searches Credit Safe by VAT and adds company on the fly.
4. After "Onboarding starten", BE adds company in HENRY DB, syncs to Brightstaffing, and runs automated credit-check rules. Returns one of: `Active`, `Processing`, `Blocked`. If blocked: pop-up that this company is not interesting.

### Company details: General (page 2503835669)
- `Search name` (Zoeknaam) — required, can differ from legal name.
- `Legal name` — retrieved from CreditSafe.
- `VAT Reg no.` — Belgium-only V1, format `BE0999999999 - BE1999999999`.
- `Address registered office` — postal code is 4 digits, cannot start with 0.
- `Type of company` — Ex-customer, Customer, Prospect, Supplier (calculated).
- `Blocked (yes/no)` plus `Reason for being blocked` (Automatic blocking, Bankruptcy, Bad payer, No cooperation anymore, Not creditworthy, WCO).

### Company profile (page 2541682736)
Five tabs: General, Contact data, Commercial agreement, Wage policy, Accounts (removed dec/2024).

Boolean toggles on tab 1 (General):
- `Uses time registration` (default false) — drives the `Time registration` menu item.
- `Uses groups` (default false) — drives the `Groups` menu item, filter on planning, group field on invitations.
- `Uses actuals confirmations` (default true for new companies, default false for already-onboarded).

All three toggles only visible/editable to internal BOEMM users (hidden + disabled for COMPANY-USER and GROUP USER).

Coefficients (tab 3) per statute: white collar, labour, student WC, student labour, worker student WC/labour (hidden, default copy from corresponding standard), flex WC, flex labour, extra, seasonal labour. Bank-holiday counterparts hidden but auto-copied. Plus coefficient transportation (default 1,35), mealvouchers (1,69), ecovouchers (1,69), dimonacost (default 0,4965 according to "Contract details: Invoicing"; 0,3940 elsewhere), dimona addon (default 0,3508; disabled by default in profile).

Standard TAX tariff: `0%`, `6%`, `12%`, `21%` (default), `0% Verlegd`, `0% Verlegd EU`.

Wage policy (tab 4): `Do you pay mealvouchers/eco-vouchers/transportation allowances?`, `Compensation hours` (`None` / `With income` / `Without income`), `Standard fulltime week schedule` (default 38 hours, replaced by new timetable method).

Validation pages cross-referenced for non-standard coefficients: only PAYROLL_ADMIN, FULL_ADMIN, SUPER_ADMIN, SALES_ADMIN, DPS_DIRECTOR, CREDIT_CONTROLLER may update them. Saving same value still allowed.

### Company onboarding (page 2524119041)
Five-step stepper that maps to Company profile fields. After step 4 the user is redirected to company-profile (the old "step 5 confirmation" was deprecated apr/2024). Mostly identical to Company profile — same defaults and same validations apply.

### Search a company (page 2502590465)
- Search by name, VAT or business registration number; optional postal-code filter (4 digits, no leading 0).
- API returns: legal name, VAT number, address, status (`Blocked`, `Processing`, `Active`).
- Detection of "onboarded" company: all 26 coefficient fields filled. If onboarded → "Company profile" button. Otherwise "Start onboarding" button.

### Blocked companies (page 2797928452)
- Search results show "Geblokkeerd" / "Blocked" chip.
- Banner on company-profile and company-onboarding when company is blocked: NL "Dit bedrijf is geblokkeerd en kan geen contracten aanmaken. Contacteer finance voor meer informatie via 09 xxxx".
- Contract creation is blocked entirely. BE: EN "Contract cannot be created due to blocked company." / NL "Contract kan niet aangemaakt worden want bedrijf is geblokkeerd."

### Demo company in DPS (page 2805006370)
Hard-coded demo companyId (DPS PROD): `bde29951-1b8e-4d60-b3f6-642a6a6c167e`.
Roles `DPS SALES` and `DPS DIRECTOR` cannot edit this company's profile. All fields readonly. BE message standard 403.

---

## F. Tech Notes

### Field formats to use in migration file (page 2705948675)
Excel template with three tabs: Enterprise, Employee, Wage. Column → DPS-field mapping verbatim. Notable enums for callers:
- `vat_country_code`: `BE`, `NL`, `CZ`, etc.
- `office_name`: `DPS100` or `DPS200`.
- `language_dc_id` / `language_name`: `nl`, `en`, etc.
- `standard_tax_tariff`: `0`, `6`, `12`, `21`, `0_SHIFTED`, `0_SHIFTED_EU`.
- `is_recup_paid`: `NONE`, `PAID`, `NOT_PAID`.
- `tax_perc` (employee): `11P`, `15P`, `18P`, `20P`, `24P`, `28P`, `32P`, `36P`, `40P`, `50P`, `0P` (Grensarbeider).
- `dependent_spouse`: `NONE`, `WITH_INCOME`, `WITHOUT_INCOME`.
- `marital state`: 56 MARRIED, 57 NOT_MARRIED, 58 LEGALLY_COHABITING, 59 WIDOW, 60 ACTUALLY_SEPARATED, 61 LEGALLY_DIVORCED, 62 LIVING_TOGETHER, SEPARATED_FROM_TABLE.
- `statute_name`: `EXTRA`, `FLEX_LABOUR`, `LABOUR`, `LABOUR_STUDENT`, `LABOUR_STUDENT_WORKER`, `FLEX_WHITE_COLLAR`, `WHITE_COLLAR`, `WHITE_COLLAR_STUDENT`, `WHITE_COLLAR_STUDENT_WORKER`, `SEASONAL`.
- `contract_reason_name`: `TEMPORAL_EXTRA_WORK`, `SUBSTITUTION`, `EXCEPTION_WORK`, `INFLOW`.
- `relocation_type`: `NONE`, `SUBSCRIPTION_PRIVATE`, `SUBSCRIPTION_PUBLIC`, `COMPANY_CAR`.
- `gender`: `MALE`, `FEMALE`, `OTHER`.
- `birth_date`: `dd.MM.yyyy`.

Sales-rep UUID mapping (PROD):
- Joke Carton `b779782f-8be7-44d9-ba94-1a8758fdb2cf`
- Lisbeth Serroels `1a46638f-053c-4e12-a298-3b7f5ea1dff1`
- Jeff Callebaut `84c2cd18-60d0-4df2-b64e-4b8c27211092`
- Kathy Declercq `d793ec3e-4500-4b03-9258-de07ab8bb65c`
- Joke Van Bruwaene `8d719ee5-e0e7-42b3-b12d-85f85555252b`
- Nadia Assounfou `f22ae898-d0b2-4a94-b502-ccde89c8b759`

### Migration: Parse import excel file (page 2627567617)
Three-tab Excel mapping (Enterprise → company profile; Employees → employee profile; Wages → employee wages). Excel columns → DPS field names (verbatim table). Empty values in non-required columns OK; failed rows are skipped. Imports go to CORE; SSN matching is used for merge (incoming data overwrites). Three flags defaulted to `true` on imported employees: `e-signing`, `e-documents`, `validated`. The job stores result by job id.

### DPS wide: Field validations (page 2656075823)
- **SSN format** `xx.xx.xx-xxx.xx`. Modulo-97 checksum on first 9 digits (or 11 digits with leading "2" if born in or after 2000); 97 - mod result = check digits. Foreigners w/o residency: month + 20 (gender known) or +40 (unknown). Refugees: month/day = 00.
- Gender from SSN: 2nd-group counter (002–998) even = female, 001–997 odd = male. Mismatch triggers EN "The gender does not match with the social security number." / NL "Het geslacht komt niet overeen met het rijksregisternummer."
- Birth date from SSN: yy mm dd in first six digits; with the rules above for unknown DOB or foreigners.
- Email validation: `something@something.something`; strip illegal chars, `space`, `:`, `$`, emoji.
- Mobile rules: leading `0` + 9 or 10 digits → drop leading 0 and prefix with `+32`. Display as `+32 (0) xx xx xx xx` (9 digits) or `+32 (0) 4xx xx xx xx` (10 digits). Other formats stored as is. Validation message NL "Ongeldig telefoonnummer." / EN "Invalid telephone number."
- IBAN validated against international library. Validation message NL "Het rekeningnummer is ongeldig." / EN "The bank account number is invalid."
- Communication languages: `Dutch`/`Nederlands`, `French`/`Frans`, `English`/`Engels`.

### PC code - statute validation (page 2656534623)
BE returns the legal PC code → statute combinations to FE. Statute select is disabled until PC code chosen. Validation message NL "Deze paritair comité en statuut combinatie is niet mogelijk." / EN "This joint committee and statute combination is not possible." If the user changes PC code after entering a statute, the statute is not cleared but a warning shows: NL "Deze combinatie van paritair comité en statuut is niet toegelaten." / EN "This combination of joint committee and statute is not allowed."

### Dimone 8h changes (page 3430744074)
Empty (live page placeholder).

### DPS Dimona rules (page 2542665740)
Already documented in Section C above.

### Premiums and allowances in DPS tool (page 2529558538)
Categories of premiums (selectable on contract/wage): weekend premies (zaterdag/zondag), nachtpremies, feestdag, ploegpremie (dag/ochtend/middag/nacht/zondag), overige (premie/hondenpremie/koudepremie), kledij, vervoers- en mobiliteitsvergoedingen (kilometervergoeding, vergoeding mobiliteit zonder RSZ, mobiliteitsvergoeding bouw, mobiliteit bouw buiten werkuren), premies in transport (ARAB/uur, Verblijfsvergoeding A/B), premies in schoonmaak (maskerpremie, premie ongezond werk, ARAB/dag), beschikbaarheidstijd (PC 140.03), voordelen alle aard (GSM, Privé gebruik voertuig), overuren (KB213 default 20%, vrijwillige netto overuren PC 302), onkosten (verblijfskosten, maaltijdvergoeding, terugbetaling onkosten, dagvergoeding, maandvergoeding).

---

## Cross-cutting notes (for API callers)

### Tenant / environment
- API base path: `dps-api/`. Backend is Java/Spring (port 8103 on dev NLB).
- Dev/QA NLB host: `boemm-nlb-dev-d79bf2e45c1cad91.elb.eu-central-1.amazonaws.com`.
- Brightstaffing customer-keyed hosts: `https://{customer}-staging.b-bright.be/backend/index.php/api/...` (staging) and `https://{customer}.b-bright.be/...` (PRD).
- DPS web app: `https://myplanning.digitalpayrollservices.be`. Marketing site: `https://www.digitalpayrollservices.be` (privacy at `/privacy-policy`, cookies at `/cookies`).

### Auth (Cognito)
- Two pools, both `eu-central-1`:
  - QA: `eu-central-1_F8LSAk3O5`
  - PRD: `eu-central-1_QgXKNpVI3`
- Custom attribute on each external user: `custom:companyId` (UUID).
- Cognito statuses surfaced in DPS: `Confirmed` (logged-in), `Force change password` (pending), `External provider` (BOEMM SSO — ignored by DPS).
- Internal staff log in via "ADMIN" button → AWS Cognito hosted UI (BOEMM AD/Cognito federation).
- Password policy: ≥ 8 chars, ≥ 1 upper, ≥ 1 lower, ≥ 1 digit, ≥ 1 special.
- 403 messages (BE): NL "Je hebt geen rechten om deze actie uit te voeren." / EN "You have no rights for executing this action."

### Role enum (canonical, exact strings)
```
SUPER_ADMIN
SALES_ADMIN
FULL_ADMIN
PAYROLL_ADMIN
DPS_DIRECTOR
DPS_SALES
CREDIT_CONTROLLER
PREVENTION_ADVISOR
RECRUITER
COMPANY_USER
GROUP_USER
```
("COMPANY-USER" and "GROUP-USER" with hyphens appear in older docs — same role; underscore form is what's used in code.)

### Statute enum (used everywhere — wage, contract, invitation, encodage)
```
WHITE_COLLAR
WHITE_COLLAR_STUDENT
WHITE_COLLAR_STUDENT_WORKER
LABOUR
LABOUR_STUDENT
LABOUR_STUDENT_WORKER
FLEX_WHITE_COLLAR
FLEX_LABOUR
EXTRA
SEASONAL_LABOUR  (alias SEASONAL in migration)
```

### Invitation status enum
```
ACTIVE / PENDING
COMPLETED
EXPIRED   (deprecated)
CANCELED
```

### Actuals status enum
```
PENDING       (orange)
CONFIRMED     (green, working hours)
ABSENT        (green, full-day absence)
OVERDUE       (orange + exclamation; was "in attent")
CANCELLED     (when underlying contract cancelled)
```

### Contract source / sync
- Created in DPS, synced to Brightstaffing.
- Contract number is generated by Brightstaffing (not by DPS).
- Encodage codes pushed per actual confirm/update via BS endpoints `/api/encodage/addEncodage` and `/api/encodage/updateEncodage`. See section C for the full code table.

### Date / time / number formats
- Dates in UI: `dd/mm/yyyy` (Belgian/Dutch). In migration imports: `dd.MM.yyyy`.
- URL contract dates: ISO `YYYY-MM-DD`.
- Times: 24h `HH:mm`.
- Decimals: comma in UI (e.g. `8,5000`), point in API and migration (`8.5000`).
- Hours format on cards: `hh:mm > hh:mm`.
- Money: `xx,xxxx €` (4 decimals).

### Validation rules of note
- Gross hourly wage: `[8.30; 100.00]` for invitations (page 2656010268), `[8.50; 100.00]` for employee wage (page 2541846529). Discrepancy across pages.
- Mealvouchers: total ≤ 8 EUR, ≥ 2.18 EUR; employee share ≥ 1.09 EUR.
- Contract minimum: 3 hours (PC 302 → 2; PC 314.03/320 → 1).
- Contract maximum: 16 hours (excluding break).
- Contract create cutoff: 29 minutes before start (admin SUPER/FULL bypass).
- Contract cancel cutoff: 14 minutes before start (admin SUPER/SALES/FULL bypass).
- Actuals start time can never be earlier than original contract start (extra 30-min cushion only on the lower bound for confirmation: -30 min).
- Postal code: 4 digits, no leading zero.
- VAT format Belgium: `BE0999999999`–`BE1999999999`.

### Time-window enforcement (actuals payroll cycle)
- Mon 23:59 → Tue 20:00 = previous-week actuals locked from confirm/update for everyone.
- Tue 11:00 = previous-week CONFIRMED/ABSENT actuals permanently locked.
- ActualsAutoConfirmSchedule (Mon or Tue 03:00) auto-confirms time-registration actuals.
- ActualsUpdateToOverdueSchedule (Tue 00:01) flips not-confirmed previous-week actuals to OVERDUE.

### Email senders
- `no-reply@digitalpayrollservices.be` — forgot password, customer invitation.
- `no-reply@verificationemail.com` — employee invitation.
- `administration@digitalpayrollservices.be` — Mon admin alert about non-confirmed actuals.
- All test environments redirect external mails to `dev.administratie@boemm.eu` (or `dev.administration@boemm.eu` — both spellings used in docs).

### Demo company id (PROD)
`bde29951-1b8e-4d60-b3f6-642a6a6c167e` — read-only for DPS_SALES and DPS_DIRECTOR.

### Edge cases / surprises
- Contract endpoint must NOT receive both old Q/S and new timetable fields — request rejected. Method cannot be switched on an existing contract.
- Updating wage fields does not propagate to existing contracts; updating company-profile timetable does not propagate to existing wages or contracts.
- Extra statute: max 1 day per contract, max 2 consecutive day contracts ever.
- 40 consecutive day contracts per semester rule applies only to non-flex/non-extra statutes; semester reset Jan/Jul.
- isDraft on employee: when itsme onboarding starts but doesn't complete, employee record exists with `isDraft=true` and no admin emails are sent. Reminder mail goes out 10 minutes after itsme verification if stepper not completed.
- Removing employee from pool unassigns from all groups and removes only the wages that were created for the company being removed from. Allocation removed; employee record kept.
- BS contract number is not stored on DPS side.
- Encodage runs only when contract is ACTIVE and has no sync errors and actuals carry worked or absent hours.
- Holiday/Sick "is invoiced" flags on company profile drive code selection (1020 vs 1025; SICK 1311 vs 1310 — though SICK is informational and admin chooses manually).
- ADV code selection driven entirely by contract's `Compensation hours` field; if `None`, the ADV reason is hidden.

### Image-only / empty pages encountered
- Architecture (3276701701): image only.
- Diagram (3349151748): smart-link only.
- Technical Documentation (3276570627): empty.
- DPS: Machine State Diagram COMPANY vs. GROUPS user (2979528713): image only.
- Actuals Encodage (3279880197): image only.
- DPS: Companies (2656600069): empty.
- DPS: Employees (2562785289): empty.
- DPS: Group employees (2806644740): empty.
- DPS: Time registration (2658304005): scope description only.
- Dimone 8h changes (3430744074): empty live page.
- DPS: Components (2546925583): UI inventory only.
