# Jira: MyStaffler / Staffler API surface (in-flight)

Source: boemm.atlassian.net (cloudId 8269a689-2956-4f90-9af2-b1fc7d5ad2d9), project BCJ.
Pulled: 2026-05-09. Active sprint = **Q2.3** (06/05/2026 - 20/05/2026), goal: MyStaffler.

Legend per ticket: **BREAKING** = renames/changes existing path or payload. **ADDITIVE** = brand new endpoint, no impact on existing PoC. **INTERNAL** = no API change.

---

## 1. MyStaffler suite (epics + children)

All MyStaffler epics still in **Analyzing** state at parent level, but child stories are mostly in **Sprint Q2.3** with active dev. New service, new subdomain `mystaffler.dev.wlnob.boemm.eu` (already up). Treat the whole `/mystaffler/...` namespace as **moving target until end of May 2026**.

### BCJ-19481 - MyStaffler setup + devops (Epic)
- Status: Analyzing. Assignee: none. Sprint: -.
- Description empty. Children:
  - **BCJ-19482** MyStaffler subdomain & environment setup - Done (Oleksandr Lapchenko)
  - **BCJ-19483** MyStaffler CI/CD pipelines - Done
  - **BCJ-19506** MyStaffler FE setup - Done (Q2.3)
  - **BCJ-19517** MyStaffler Firebase setup - To Do (Q2.3)
  - **BCJ-19524** SPIKE: how to implement 2 pools - DEV TESTING (Q2.3)
  - **BCJ-19456** SPIKE: backend MyStaffler - Done
- API surface: INTERNAL. Establishes the new `mystaffler.*` host and Cognito pool layout.

### BCJ-19424 - MyStaffler authentication & onboarding (Epic)
- Status: Analyzing. Sprint: children in Q2.3.
- Description empty on parent. Children below.

#### BCJ-19425 - MyStaffler Pool Overview & Invite Management
- Status: **In Progress** (Dmytro Biletskyi). Sprint Q2.3.
- Lives on the **Staffler/DPS** side (employer view), not on the new MyStaffler app. Replaces "Groups" nav with "Pool".
- BE AC names no path explicitly, but introduces:
  - Endpoint to **send/resend invite** -> auto-creates MyStaffler account + emails temp password.
  - GET on Pool list must additionally return: `myStafflerStatus` (inactive/active/pending), `linkedSalaryPackages`, `lastLogin`.
- API surface: **BREAKING** for `GET /api/employees` (or whatever the existing pool listing returns). New fields on the employee DTO.

#### BCJ-19426 - Login with email and password
- Status: **DEV TESTING** (Vanessa Nunes). Sprint Q2.3.
- AC: email+password login, lockout after 5 fails / 15 min, demo at `https://mystaffler.dev.wlnob.boemm.eu`.
- No explicit path quoted, but implies: `POST /api/my-staffler/auth/login` (or Cognito-direct). On first login forces password reset.
- API surface: **ADDITIVE** (new auth surface for new app).

#### BCJ-19427 - Reset forgotten password
- Status: To be refined. No assignee/sprint.
- AC: email -> reset link, 24h validity, no account enumeration.
- API surface: **ADDITIVE**. Endpoint not named.

#### BCJ-19428 / 19429 / 19430 - permission prompts (camera / location / push)
- All Q2.3, To Do, no assignee. FE-only. **INTERNAL** for API.

#### BCJ-19431 - Log out of the app
- Status: **DEV TESTING** (Roman Zubriichuk). Sprint Q2.3.
- AC: server-side session token invalidation on logout.
- API surface: **ADDITIVE**. Implies `POST /api/my-staffler/auth/logout` or Cognito sign-out.

#### BCJ-19535 - MyStaffler Force password reset on first login
- Status: To Do (Dmytro Biletskyi). Sprint Q2.3.
- BE AC explicitly:
  - `isFirstLogin` flag returned in login/session response.
  - "**A dedicated endpoint is available to update the user's password**" - min 8 chars, no other complexity rules.
  - Flag flips to false ONLY via successful first-login password update.
- DTO: session/auth response gains `isFirstLogin: boolean`.
- API surface: **ADDITIVE** (new endpoint) + **BREAKING** (login response shape grows; but additive field, low risk).

#### BCJ-19543 - Create MyStaffler account upon successful employee validation
- Status: To Do, Q2.3. No description endpoints.
- API surface: **INTERNAL** (server-to-server trigger on validation; emits invite email). No PoC impact.

#### BCJ-19545 - Recreate account when employee email changed
- Status: To be refined, Q2.3.
- Email is identity. On change: delete old MyStaffler account, create new, send activation email with temp password, force password reset on first login.
- API surface: **INTERNAL** trigger, but indirectly **BREAKING** for any client caching email-keyed identity.

### BCJ-19432 - MyStaffler shift scheduling & planning (Epic)
- Status: Analyzing. Children Q2.3.

#### BCJ-19433 - FE View my weekly shift schedule
- Status: **In Progress** (Vanessa Nunes). Q2.3.
- FE-heavy. No BE endpoint quoted.
- API surface: **INTERNAL** for endpoints, but consumes the actuals list endpoint described in BCJ-19435.

#### BCJ-19435 - View shift card details in the schedule list
- Status: **In Progress** (Vanessa Nunes). Q2.3.
- BE AC explicitly: "**receive a list of acuals that contains**: `company name`, `company function (found in wage template)`, `actual date`, `actual start time / end time`, `place of employment (found inside wage template)`".
- Statuses exposed to user: only **Scheduled** and **Cancelled** (BE may have more: Cancelled, Absent, Scheduled, Finished).
- Roles: `FULL_ADMIN`, `SUPER_ADMIN`, `EMPLOYEE_USER`.
- Error messages quoted (EN/NL): "You are not a Mystaffler user", "You cannot access other MyStaffler user data."
- DTO: a flat actuals list, NOT the existing `/api/actuals` shape - drops `actual status` field, expects wage-template-derived `companyFunction` + `placeOfEmployment`.
- API surface: **ADDITIVE** for new path (likely `GET /api/my-staffler/actuals` or `/shifts`). Reuses domain but new wire shape.

#### BCJ-19436 - View full shift details
- Status: To Do, Q2.3. FE-heavy. No path quoted. API surface: **INTERNAL/ADDITIVE** (probably `GET /api/my-staffler/actuals/{id}`).

#### BCJ-19438 - Cancel a scheduled shift
- Status: To Do, Q2.3.
- BE AC: "**endpoint to update status when cancel**". Reason enum: `Niet beschikbaar`, `Ziek`, `Andere`. Triggers WhatsApp/email notify to employer.
- API surface: **ADDITIVE**. Likely `POST /api/my-staffler/actuals/{id}/cancel` or `PATCH /api/my-staffler/actuals/{id}` with `{status: CANCELLED, reason}`.

#### BCJ-19434 (Obsolete), 19437 (To be refined), no BE.

### BCJ-19439 - MyStaffler clock in / clock out (Epic)
- Status: Analyzing.

#### BCJ-19440 - Clock in to a shift using a selfie
- Status: To Do, Q2.3.
- BE AC explicit:
  - "**endpoint to update status when clocking in (existing logic from dps)**"
  - "**endpoint to update status when clocking out (existing logic from dps)**"
  - Save selfie to S3 (timestamped + uuid), new `media` table.
- Window: only active 30 min before shift start. Confirmation contains selfie + optional GPS timestamp.
- API surface: **ADDITIVE** new path, but **REUSES existing DPS clock-in/out logic underneath**. Watch for: existing DPS clock-in path may be wrapped or renamed for MyStaffler-side.

#### BCJ-19441 - Clock out of a shift using a selfie
- Status: To Do, Q2.3 not flagged.
- Same flow as 19440. Status -> `Voltooid` (Completed). API surface: **ADDITIVE**.

#### BCJ-19442 - Verify location on clock-in and clock-out
- Status: To Do, Q2.3.
- BE AC: "**endpoint to save location**". Silent background check; user can opt out with "Continue without GPS".
- API surface: **ADDITIVE**. Likely `POST /api/my-staffler/actuals/{id}/location` or part of clock-in/out payload.

#### BCJ-19443 / 19444 - Camera fallbacks - To be refined, no BE detail.

#### BCJ-19541 - Delete selfie and location data after 14 days
- Status: To Do, Q2.3. Cron Thursdays 03:00, > 14 days.
- API surface: **INTERNAL** (housekeeping job).

### BCJ-19445 - MyStaffler Notifications (Epic)
- Status: Analyzing. **All children To be refined, no BE detail, no sprint.**
- BCJ-19446 new shift assignment notification
- BCJ-19447 reminder before shift
- BCJ-19448 shift detail change notification
- BCJ-19449 notifications screen
- BCJ-19450 notification preferences
- API surface: **ADDITIVE** when it lands. Not in flight in Q2.3. Don't rely on any of these for the PoC.

### BCJ-19452 - MyStaffler profile & documents (Epic)
- Status: Analyzing.

#### BCJ-19451 - View and edit my personal details
- Status: **In Progress** (Bernardo Bras Lourenco). Q2.3.
- AC: form with first name, last name, address, phone number, email. **Editable fields: phone number + email only**. Email change requires re-verification email. Phone change triggers SMS verification.
- API surface: **ADDITIVE**. New PATCH endpoint on profile, but downstream `BCJ-19545` triggers full account recreation on email change.

#### BCJ-19453 - View employment documents
- Status: **On hold**, Q2.3.
- AC: list `Loonbrieven` (pay slips) + `Contracten` (contracts), inline PDF or download, "New" badge until opened.
- API surface: **ADDITIVE**. No path quoted. Likely `GET /api/my-staffler/documents` + per-document download.

#### BCJ-19454 / 19455 - Settings & support - To be refined.

---

## 2. Indexation epic

### BCJ-18930 - Indexations Module (Epic, parent)
- Status: Analyzing. SUPER_ADMIN/FULL_ADMIN UI. Targets indexations across **WorkToday, Staffler, Eagle**. Mentions ACTIVE-only contracts, 2 vs 4 decimals rounding.
- API surface: **INTERNAL** at parent level (UI), but children below add endpoints.

### BCJ-19053 - Wage indexations 03/2026 (Epic)
- Status: **In Progress**. No description. Tracking ticket for the March run, not an API change.

### BCJ-19381 - Wage indexations 04/2026 (Epic)
- Status: Idea. No description. Same: tracking, not API.

### BCJ-19024 - Wages transactional indexing endpoint
- Status: To be refined.
- Endpoint quoted: "**`POST /api/indexation/wages/run`**" (suggested, "something like").
- Behaviour: Begin tx -> wage indexation -> if OK, contract indexation; rollback on fail. Returns summarised success/failure per step.
- API surface: **ADDITIVE**.

### BCJ-19030 - Travel Allowance Indexation Endpoint
- Status: To Do.
- "**create endpoint for travel allowance transactional indexation**" - same transactional behaviour as wages, summary structure, takes user-given start date.
- API surface: **ADDITIVE**.

### BCJ-19124 - Save indexation params for execution
- Status: To be refined.
- "**API endpoint for saving**" with status `Ready`. Server-side validations.
- API surface: **ADDITIVE**.

### BCJ-19242 - BE: endpoint to save wage indexation (all wages)
- Status: **In Progress** (Bernardo). Q2.2/Q2.3.
- DTO fields: `pcCode` (single, exactly 1), `indexationType` = "All wages", `affectedContractsStartDate`, `statute(s)` (one or more), `coefficient` xor `newMinimumValue`. PC 302 + Flexi -> only newMinimum (2 decimals). Saved status = "Ready to Execute". Duplicate (same PC+statutes, not yet executed) blocked with: "An indexation for the same PC and statutes is already being processed."
- Tied to test sub-task **BCJ-19583** (To Do).
- API surface: **ADDITIVE**.

### BCJ-19243 - BE: endpoint to save Travel Allowance
- Status: **Ready for testing** (Dmytro).
- Endpoint quoted: "**`POST /api/indexation/travel-allowance`** -> saves the new values".
- API surface: **ADDITIVE**.

### BCJ-19246 - Retrieve and delete saved indexations endpoint
- Status: **Done** (Dmytro). Test sub-task **BCJ-19612** Done.
- List + delete with confirmation; FULL_ADMIN/SUPER_ADMIN. Note in ticket: "**This ticket does not cover the execute endpoint (`POST /api/indexation/{id}/execute`) which will be handled separate**".
- API surface: **ADDITIVE** (live).

### BCJ-19250 - Endpoint indexation History
- Status: **Ready for testing** (Nuno Correia).
- List of executed indexations sorted desc by date. Per-entry status: `In Progress` / `Error` / `Success`.
- API surface: **ADDITIVE**.

### BCJ-19329 - Endpoint to execute wage indexation (normal PC codes)
- Status: **DEV TESTING** (Nuno).
- Scope: only "normal" PC codes; PC 124 / 302 / 201 split out to separate tickets (struck through in description).
- Calculation: `currentWage x factor`. Statutes enum: `LABOUR, WHITE_COLLAR, LABOUR_STUDENT, WHITE_COLLAR_STUDENT, LABOUR_STUDENT_WORKER, WHITE_COLLAR_STUDENT_WORKER, FLEX_LABOUR, FLEX_WHITE_COLLAR, EXTRA, SEASONAL`.
- Double execution blocked: same PC + activeFrom + statutes can't run twice.
- API surface: **ADDITIVE** but powerful: cross-system writes to WorkToday + Staffler + Eagle.

### BCJ-19583 - Testing task for BCJ-19242 - To Do (Tomas Vaz). INTERNAL.
### BCJ-19612 - Testing task for BCJ-19246 - Done. INTERNAL.

---

## 3. ITSME v2 migration

### BCJ-19111 - ITSME update to v2 endpoint
- Status: **On hold** (Dmytro).
- WorkToday + Staffler. Affected client IDs: `YYSNwbxM95`, `hNxFj9sQdz`, `vCavUFEYfk`. **NOT Eagle.**
- Endpoint changes (configuration only, not our API surface):
  - `Authorization: https://idp.[e2e|prd].itsme.services/v2/authorization`
  - `Token:         https://idp.[e2e|prd].itsme.services/v2/token`
  - `UserInfo:      https://idp.[e2e|prd].itsme.services/v2/userinfo`
- PKCE confirmed required. OV/EV TLS only (no DV/Lets Encrypt).
- API surface: **INTERNAL**. No endpoint rename in our APIs, but the OIDC redirect flow against itsme changes. PoC consumers using BoEMM SSO indirectly are unaffected; anyone scripting itsme directly against old v1 must move.

### BCJ-19468 - Migrate all lambdas on v2 itsme endpoints (sub-task)
- Status: To Do.
- Lists SSM parameter paths to update across worktoday-cognito (`ItsMeRegistration`, `ItsMeLogin`), dps-cognito + itsme-api (DPS scope `BOEMM_AWS_SHAREDATA`, falcon scope `BOEMM_TEST_SHAREDATA`). Highlights `/auth/dps/idp/itsme/issuer` as "**old v1 URL, needs update**".
- API surface: **INTERNAL** (config rotation).

### BCJ-19285 - (Testing task) BCJ-19111 ITSME v2 - To Do (Sam Carlier). No description. INTERNAL.

---

## 4. Recent contracts / batch / employee work

### BCJ-18046 - Adapt EP for batch contract creation
- Status: **Done** (Bernardo).
- Path quoted: "**`https://gw.qa.dps.boemm.eu/v1/dps-api/api/contracts`**".
- Same path now accepts **single OR batch** payloads. Backward compatible. Response:
  - 100% success -> 200 OK + `created` items.
  - Partial -> 200 OK + `created` + `failed` (with `contractId, employeeId, rightWeek, jobTitle, hours, wage, errorCode, errorMessage`).
  - 0% (overlap) -> 5xx + `failed`. 0% other (CORE down) -> 5xx.
- API surface: **BREAKING in shape, ADDITIVE in path**. Same URL, **but request schema now accepts an array** -> any PoC pinned to single-contract-only must send the batch shape too if it wants partial-success responses.

### BCJ-18557 - Allow to block & unblock employees: modal + endpoint + BE logic
- Status: **On hold**.
- BE AC: "**Endpoint to block employee**" + "**Endpoint to unblock employee**". Fields: employeeId, action (block/unblock), targetStatus (DRAFT/BLOCKED), existingStatus, reasonType, when, who. On block: employee + all leads -> BLOCKED. On unblock: restore previous status + re-run leads office assignment.
- Reason enum (NL/EN): "Geen samenwerking meer / No allocation anymore", "Overleden / Deceased", "GDPR/AVG verwijderen / GDPR removal" (note: GDPR removal also maps to BLOCKED, no DELETED status), "Wil niet meer gecontacteerd worden / Doesn't want to be contacted", "Interne medewerker / Internal employee".
- API surface: **ADDITIVE** when it ships. Currently **on hold**, do NOT depend on it.

### BCJ-18610 - BE: Manual Registration Endpoint (sub-task)
- Status: To Do. Description: "Implement backend endpoint to support manual registration of user personal details when itsme is not available."
- API surface: **ADDITIVE**, no path named.

### BCJ-18715 - CR: Allow user to change email during account creation
- Status: **Done** (Bernardo). MyJobfixers.
- Description points to BCJ-18709. No endpoint quoted in this ticket.
- API surface: **ADDITIVE** at the time it shipped. Already live.

### BCJ-18639 - Cognito email challenge
- Status: **Done** (David Rudenko). MyJobfixers.
- Behavior: BE calls Cognito `InitiateAuth`, Cognito issues email OTP (default 8-char code). Settings: `MfaConfiguration: 'ON'`, `AutoVerifiedAttributes: [email]`, email OTP as Sign-In for passwordless auth.
- Resend code: same EP, e.g. `/auth/code` (suggested).
- API surface: **ADDITIVE**, already live.

### BCJ-18103 - Allow to switch between companies
- Status: **Done** (David Rudenko).
- Mostly FE: dropdown, switch active company, update URL with new `companyId`.
- API surface: **INTERNAL** (uses existing endpoints with different `companyId`).

### BCJ-18123 - API endpoint in MyJobfixers service that returns contracts and paychecks
- Status: **Done** (Bernardo). MyJobfixers PoC ticket.
- Returns lists of contracts + paychecks per employee. PoC scope explicitly **drops Company** from response (BS API doesn't expose it).
- API surface: **ADDITIVE**, live. PoC code that pins to a `company` field on contract/paycheck rows will be wrong - field is intentionally absent.

---

## 5. Validations + dictionary

### BCJ-19554 - Dictionary for STATUTE
- Status: To Do (Roman Zubriichuk). MyJobfixers.
- AC: "Implement dictionaries for the statutes". Used by selection lists in the profile.
- Likely affects existing dictionary endpoint (e.g. `/api/dictionaries/statutes`) - new returned values.
- API surface: **ADDITIVE** in values, **possibly BREAKING** for any consumer with a hard-coded enum. The statute set (per BCJ-19329) is: `LABOUR, WHITE_COLLAR, LABOUR_STUDENT, WHITE_COLLAR_STUDENT, LABOUR_STUDENT_WORKER, WHITE_COLLAR_STUDENT_WORKER, FLEX_LABOUR, FLEX_WHITE_COLLAR, EXTRA, SEASONAL`.

### BCJ-18844 - Create Request Validations for each endpoint
- Status: To Do. No description, no assignee.
- API surface: **INTERNAL** if it stays validation-only, **BREAKING** if it tightens existing required-field rules. Worth watching but no concrete contract to point at.

---

## Breaking changes timeline (next 3 months)

### Already shipped or imminent (May 2026)
- **`POST /v1/dps-api/api/contracts`** (BCJ-18046, **Done**): now accepts batch arrays alongside single objects, with new partial-success response containing `created`/`failed` arrays. Old single-object callers still work, but DTO shape on the response has grown. Treat as **BREAKING** for response consumers, **ADDITIVE** for clients that still POST one at a time.
- **`POST /api/indexation/travel-allowance`** (BCJ-19243, Ready for testing).
- **Save wage indexation** endpoint (BCJ-19242, In Progress) - path implied `POST /api/indexation/wages` (single PC).
- **Indexations CRUD** (BCJ-19246, Done) live. Note `POST /api/indexation/{id}/execute` is split out and still pending.
- **`POST /api/indexation/wages/run`** transactional wrapper (BCJ-19024) - to be refined.
- **Execute wage indexation for normal PC codes** (BCJ-19329, DEV TESTING).
- **History endpoint** (BCJ-19250, Ready for testing).

### In flight Sprint Q2.3 (06/05 - 20/05/2026), MyStaffler
Whole `/api/my-staffler/...` namespace is being authored. Highlights:
- Auth: `POST /api/my-staffler/auth/login`, logout, password change on first login (BCJ-19426 / 19431 / 19535 - all DEV TESTING or Q2.3).
- Pool listing: existing employees endpoint gains `myStafflerStatus`, `linkedSalaryPackages`, `lastLogin` fields (BCJ-19425, In Progress) - **BREAKING** field additions for employer-side clients.
- Shift listing for employee: new actuals shape (BCJ-19435) - drops `actual status` field, adds wage-template-derived `companyFunction` + `placeOfEmployment`. **BREAKING** if you reuse the existing actuals DTO.
- Cancel shift: new path probably `PATCH /api/my-staffler/actuals/{id}` with `{status: CANCELLED, reason}` (BCJ-19438).
- Clock-in / clock-out / location: new endpoints wrapping existing DPS clock logic, plus selfie upload to S3 + new `media` table (BCJ-19440 / 19441 / 19442).
- Profile read/update: PATCH on profile, email change triggers full account recreation (BCJ-19451 + 19545).

### Q3 2026 likely
- **Block / unblock employee endpoints** (BCJ-18557) - currently On hold, will rename "GDPR removed" status semantics (no DELETED, only BLOCKED).
- **Notifications module** (BCJ-19445 family) - to be refined, no BE detail. New `/api/my-staffler/notifications` surface eventually.
- **ITSME v2 OIDC migration** (BCJ-19111, On hold). Internal config; no rename of our APIs but anyone still hitting v1 itsme endpoints directly must move to v2.
- **Documents endpoint** (BCJ-19453, On hold) - new `GET /api/my-staffler/documents` plus per-document download.

### Concrete advice for the PoC
- Do NOT pin to the existing `/api/actuals` DTO and assume it serves MyStaffler. The mobile app will get a separate, slimmer payload.
- Do NOT pin to a `company` field on contracts/paychecks for MyJobfixers (BCJ-18123 dropped it intentionally).
- Do NOT hard-code statute values - dictionary is being formalized in BCJ-19554.
- For contracts batch (`POST /v1/dps-api/api/contracts`), prefer the array request shape and the `created`/`failed` response shape - the single-item form is legacy fallback.
- Anything under `/api/my-staffler/...` is Q2.3 work; expect path/payload churn until end of May 2026.
- `/api/indexation/{id}/execute` is still unowned at the time of this scan.
