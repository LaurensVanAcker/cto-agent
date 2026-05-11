# Breaking changes — Sprint Q2.3 (FE impact)

Sprint Q2.3 loopt **06/05/2026 → 20/05/2026** met als hoofd-doel: MyStaffler launch. Bron: Jira BCJ-tickets. Cross-ref: `../api/sources/jira-mystaffler-details.md` (BE-perspectief).

Dit document focust op wat de FE-codebase moet wijzigen / klaarmaken / vermijden. Sortering: ranked op impact + urgentie.

## Active op 10/05/2026

### BCJ-19426 — Login with email and password (DEV TESTING)

**FE-impact**: ✅ **al geïmplementeerd** in `wlnob/my-staffler` op `feature/BCJ-19426`.
- `LoginComponent` met email + password validation
- Lockout-handling NA 5 fails / 15 min — server-side, geen FE actie
- Demo URL: `https://mystaffler.dev.wlnob.boemm.eu`

**Wat te checken**:
- Lockout error response format → FE moet `httpErrorInterceptor` aanpassen om de specifieke "account locked" message correct te tonen.
- Force-pwd-reset flow (BCJ-19535) is **geplaatst maar lege body** — `onSetNewPassword()` is een placeholder. **Implementeer dit** voor de release.

### BCJ-19431 — Log out of the app (DEV TESTING)

**FE-impact**: ✅ Geplaatst, **nog niet volledig**.
- Huidige `AuthService.logout()` wist alleen lokale Capacitor Preferences — geen server-side Cognito GlobalSignOut.
- BCJ-19431 vereist een server-side session-token-invalidation endpoint (vermoedelijk `POST /api/my-staffler/auth/logout` of `GET /api/users/logout`).

**Wat aan te passen**:
- Toevoegen aan `AuthService`:
  ```ts
  logout(): Observable<void> {
    return this.#http.get<void>(`${environment.apiBaseUrl}/users/logout`)
      .pipe(switchMap(() => from(this.#authStore.clear())));
  }
  ```
- UI-confirmation modal toevoegen (à la dps `LogoutConfirmationComponent`).

### BCJ-19433 — View my weekly shift schedule (In Progress)

**FE-impact**: ⏳ in `feature/BCJ-19433`. Verwacht `ScheduleListComponent` herwerking.
- BE retourneert nieuwe slimmere actuals-shape (zie BCJ-19435 hieronder).
- FE moet:
  - Week-view tonen (vermoedelijk swipeable carousel met date-fns)
  - Lege dagen tonen ("Geen shifts deze dag")
  - Filter alleen op `Scheduled` en `Cancelled` statuses (BE shipt meer maar UI toont alleen die twee)

**Wat te bouwen**:
- ScheduleListComponent state: `signal<WeekData[]>` met week-grouped shifts
- API-call naar `GET /api/my-staffler/actuals?startDate=...&endDate=...` (path TBD)

### BCJ-19435 — View shift card details in the schedule list (In Progress)

**FE-impact**: ⏳ Cruciaal — DTO-verandering.

BE-AC quoted:
> Receive a list of actuals that contains:
> - company name
> - company function (found in wage template)
> - actual date
> - actual start time / end time
> - place of employment (found inside wage template)

Statuses exposed: alleen `Scheduled` + `Cancelled` aan UI.
Roles: `FULL_ADMIN`, `SUPER_ADMIN`, `EMPLOYEE_USER`.

Error messages quoted (NL/EN):
- "You are not a Mystaffler user"
- "You cannot access other MyStaffler user data."

**Wat te bouwen in FE**:
- Nieuw `Shift` model met `companyName`, `companyFunction`, `actualDate`, `startTime`, `endTime`, `placeOfEmployment`. **NIET** dezelfde shape als de bestaande `/api/actuals` DTO in dps. Vermoedelijk een nieuwe `MyStafflerShift` interface.
- Status enum reduceren tot `Scheduled | Cancelled` voor display (filter andere statuses uit).
- Error-toast aanpassen om de specifieke 403-messages netjes te tonen (vertaal naar nl).

**Cross-ref**: `core/models/schedule.models.ts` heeft nu `Shift` met `id, company, position, startTime, endTime, status: ActualStatus`. Dit moet **uitgebreid** worden met `companyFunction` (≠ position?) en `placeOfEmployment`.

### BCJ-19451 — View and edit my personal details (In Progress)

**FE-impact**: ⏳ in `feature/BCJ-19451`. `PersonalDetailsComponent` met form voor editing.
- Editable: alleen email + phone (de rest is read-only).
- Email change → triggers BE re-verification email + `BCJ-19545` (account-recreation).
- Phone change → triggers SMS verification.

**Wat te bouwen**:
- `core/api/user/user.service.ts` heeft `updateEmail` en `updatePhone` als **mocks** vandaag. Vervang door echte HTTP calls naar `PATCH /api/my-staffler/users/profile/email` en `.../phone`.
- UI-feedback voor pending verification ("Check je inbox", "Voer SMS-code in").
- **Belangrijk**: bij email-change trekt server een nieuwe MyStaffler-account aan met temp-password (BCJ-19545). Dat impliceert: token invalid worden en force-relogin. FE moet dat detecteren via 401-response.

### BCJ-19453 — View employment documents (On hold)

**FE-impact**: ⏸️ **on hold**, maar UI bestaat al. `EmploymentDocumentsComponent` toont `MOCK_DOCUMENTS` uit `DocumentService`.
- "New" badge mechanisme via Capacitor Preferences (`PREFERENCES_KEYS.openedDocuments`) is al echt.
- Wachten op BE endpoint `GET /api/my-staffler/documents`.

**Wat te doen**:
- Niet rebuilden voor sprint Q2.3 (on hold).
- Wel: zorg dat `DocumentService.getDocuments()` de switch-naar-real-API gemakkelijk kan maken (één lijn vervangen).

### BCJ-19506 — MyStaffler FE setup (Done)

✅ Klaar. `wlnob/my-staffler` repo bestaat met basis-routing en auth-flow.

### BCJ-19524 — SPIKE: how to implement 2 pools (DEV TESTING)

**FE-impact**: BE-spike maar relevant voor FE-keuzes.
- Conclusie van de spike (vermoedelijk): twee Cognito user pools (DPS company + MyDPS employee), `JwtIssuerAuthenticationManagerResolver` aan BE-kant.
- FE-impact: dps app praat naar `/publicapi/companies/users/login`, mystaffler naar `/publicapi/employees/users/login`. **Geen verdere FE-actie nodig**.

### BCJ-19535 — Force password reset on first login (To Do)

**FE-impact**: 🟡 mystaffler heeft `newPasswordForm` UI gebouwd maar `onSetNewPassword()` is leeg.

BE-AC:
- `isFirstLogin: boolean` flag in login-response.
- Nieuw endpoint voor first-login-pwd-update (path TBD).

**Wat te bouwen in FE**:
1. Update `LoginResponse` model met `isFirstLogin?: boolean` field.
2. Implementeer `onSetNewPassword()` in `LoginComponent`:
   ```ts
   async onSetNewPassword(): Promise<void> {
     const { newPassword } = this.newPasswordForm.getRawValue();
     await firstValueFrom(this.#authService.firstLoginPwd(newPassword));
     await this.#navigateAfterLogin();
   }
   ```
3. Add to `AuthService`:
   ```ts
   firstLoginPwd(newPassword: string): Observable<void> {
     return this.#http.post<void>(`${this.EMPLOYEE_USER_API_URL}/firstLoginPwd`, { newPassword });
     // exact path TBD
   }
   ```

### BCJ-19425 — MyStaffler Pool Overview & Invite Management (In Progress)

**FE-impact (dps-side)**: ⚠️ **BREAKING** voor `wlnob/dps` Pool view.

BE-AC:
- Replaces "Groups" nav with "Pool" (rename).
- New endpoint `POST /api/companies/:id/employees/:eid/myStaffler/invite` (auto-creates MyStaffler account + emails temp pwd).
- `GET /api/employees` retourneert nu ook:
  - `myStafflerStatus: 'inactive' | 'active' | 'pending'`
  - `linkedSalaryPackages: SalaryPackage[]`
  - `lastLogin: ISO8601 | null`

**Wat aan te passen in dps**:
1. `EmployeeModel` interface uitbreiden met de drie nieuwe velden.
2. `pages/company/modules/groups/` herwerken tot `pool/` (rename + nav-item update).
3. Pool-list-component: voeg kolommen toe voor MyStaffler-status, salary-packages, last-login.
4. "Send invite" + "Resend invite" buttons toevoegen, callen naar nieuwe BE-endpoint.

Risico: bestaande `EmployeeModel` consumers (er zijn er ~10 in dps) kunnen breken op required-velden. **Check elke consumer** of de nieuwe velden optional zijn.

## Aankomend / On hold

### BCJ-19427 — Reset forgotten password (To be refined)

mystaffler. Geen UI of service vandaag. Wanneer geïmplementeerd: equivalent van dps' forgot-password flow maar voor employee-pool.

### BCJ-19428 / 19429 / 19430 — Camera/Location/Push permissions

**FE-only**, in `feature/BCJ-19428`. `OnboardingPermissionsComponent` bestaat al. Verwacht UI voor permission-explanation + denial-handling (link naar OS-settings via `capacitor-native-settings`).

### BCJ-19438 — Cancel a scheduled shift (To Do)

**FE-impact**: 🔮 toekomstig.
- Reason enum: `Niet beschikbaar`, `Ziek`, `Andere`.
- Triggers WhatsApp/email notify.
- API: TBD `PATCH /api/my-staffler/actuals/:id` met `{status: CANCELLED, reason}`.

UI: actie-knop op `ShiftDetailComponent`, modal met reason-picker.

### BCJ-19440 / 19441 — Clock in/out met selfie (To Do)

**FE-impact**: 🔮 toekomstig. Grote feature.
- Selfie via Capacitor Camera (front-cam).
- Save naar S3 via FE-side upload.
- Window: alleen 30 min vóór shift-start.

`ClockInComponent` is **lege placeholder** vandaag. Heel wat te bouwen:
- Camera trigger UI
- Selfie preview + retake
- GPS confirmation (optioneel)
- Upload naar `POST /api/my-staffler/actuals/:id/clockIn` (path TBD) met multipart.

### BCJ-19442 — Verify location on clock-in/out (To Do)

**FE-impact**: 🔮 toekomstig.
- Capacitor Geolocation `getCurrentPosition()`.
- Optional fallback: "Continue without GPS" button.
- API: `POST /api/my-staffler/actuals/:id/location` of payload-onderdeel van clock-in.

### BCJ-19541 — Delete selfie + location after 14 days (To Do)

**FE-impact**: ❌ geen. Server-side cron.

### BCJ-19445 epic family — MyStaffler Notifications (To be refined)

**FE-impact**: 🔮 langetermijn. Geen children in Q2.3.
- Push-notifications setup (`@capacitor/push-notifications` is al geïnstalleerd).
- Notifications-screen route (`/tabs/notifications` ?).
- User preferences screen.

### BCJ-19543 — Create MyStaffler account upon employee validation (To Do)

**FE-impact**: ❌ server-side trigger. Geen FE-actie.

### BCJ-19545 — Recreate account when employee email changed (To be refined)

**FE-impact**: ⚠️ indirect.
- Email-change in `PersonalDetailsComponent` triggert account-recreation.
- Token wordt invalid → 401 op next call → FE moet redirect naar `/auth` met message "Login opnieuw — je email is gewijzigd".

Wat aan te passen: voeg een specifieke 401-handler toe die check of de fout op een email-change call kwam, en toon een nicer message dan generic logout.

## Indexation epic (BCJ-18930 family)

**FE-impact (dps-side)**: ⚠️ groot, eigen module nodig.

Endpoints (sommige live, sommige in flight):
- `POST /api/indexation/wages` (BCJ-19242, In Progress)
- `POST /api/indexation/travel-allowance` (BCJ-19243, Ready for testing)
- `POST /api/indexation/wages/run` (BCJ-19024, To be refined)
- `POST /api/indexation/{id}/execute` (split-out, niet in flight)
- `GET /api/indexation/history` (BCJ-19250, Ready for testing)
- `GET /api/indexation/saved` + `DELETE` (BCJ-19246, Done)

`wlnob/dps` heeft op 10/05/2026 nog **geen** indexation module. Verwacht een nieuwe `pages/indexation/` met:
- Form voor wage-indexation params (PC code + statutes + coefficient/newMinimumValue)
- Travel-allowance indexation form
- History view
- Saved-indexations list met execute-knop

Roles: `SUPER_ADMIN` + `FULL_ADMIN`. Voeg een `indexationGuard` toe.

## Other Done items met FE-impact

### BCJ-18046 — Adapt EP for batch contract creation (Done)

**FE-impact (dps-side)**: ⚠️ response-shape gewijzigd.
- Same path `POST /v1/dps-api/api/contracts`.
- Accepteert nu single OR batch payloads.
- Response:
  - 100% success: 200 + `created` array.
  - Partial: 200 + `created` + `failed` array (met `contractId, employeeId, rightWeek, jobTitle, hours, wage, errorCode, errorMessage`).
  - 0% (overlap): 5xx + `failed`.

dps' `ContractApiService.createContract(...)` retourneert vermoedelijk nog `Observable<ContractModel>` voor single shape. **Update naar `Observable<{ created: ContractModel[]; failed: BatchFailItem[] }>`** voor batch awareness.

### BCJ-18557 — Block & unblock employees (On hold)

**FE-impact**: 🔮 toekomstig.
- Modal met reason-picker (5 reasons NL+EN).
- "Wis GDPR" zet status naar BLOCKED, niet DELETED — UI moet dit duidelijk maken.

### BCJ-19111 — ITSME v2 endpoint update (On hold)

**FE-impact**: ❌ alleen config (SSM params + lambda's). Geen FE-actie tenzij itsme login direct getriggerd wordt vanuit FE.

`mystaffler.LoginComponent.loginItsme()` is `console.log` placeholder. Wanneer itsme actief wordt: zal redirecten naar Cognito hosted UI met `identity_provider=itsme`.

### BCJ-19554 — Dictionary for STATUTE (To Do)

**FE-impact**: ⚠️ potentieel **BREAKING**.

Statute set wordt gedynamiseerd via `GET /api/dictionaries/statutes`. Huidige FE-types in dps hebben `StatuteItem` met `name, isStudent, collar, genericStatute (nested)`.

Statute-enum waardes (per BCJ-19329 docs):
```
LABOUR, WHITE_COLLAR, LABOUR_STUDENT, WHITE_COLLAR_STUDENT,
LABOUR_STUDENT_WORKER, WHITE_COLLAR_STUDENT_WORKER,
FLEX_LABOUR, FLEX_WHITE_COLLAR, EXTRA, SEASONAL
```

Als FE-code hardcoded op `WHITE_COLLAR` en `LABOUR` checkt (zonder dictionary lookup), zal het breken bij seasonal/extra/flex statuten.

**Wat te checken**: zoek in dps op `'WHITE_COLLAR'`, `'LABOUR'`, `'STATUTE'` strings — alle hits moeten via dictionary-lookup, niet hardcoded enum.

## Samenvatting voor PoC

Voor een PoC die in mei-juni leeft, vermijd:

1. **Hardcoded statute enum waarden** → gebruik dictionary lookup.
2. **`/api/employees` velden zonder pre-check** → check of nieuwe `myStafflerStatus`, `linkedSalaryPackages`, `lastLogin` velden er zijn.
3. **Single-contract POST shape** → de batch-shape is de canonieke vooruit.
4. **`/api/actuals` shape voor MyStaffler** → bouw een aparte client voor `/api/my-staffler/actuals` (komende).
5. **`isFirstLogin` field assumption** → check of het er is, hoor niet op afhankelijk van zijn afwezigheid.

Voor een PoC die de bestaande dps-codebase uitbreidt:

- Volg `feature/BCJ-XXXXX` branches om te zien wat er in flight is — die kan je `git diff dev` voor preview.
- Check `core/api/employee/employee.api.service.ts` na een sprint Q2.3 merge — vermoedelijk groei van model en service-methods.

## Top vragen voor backend-team

1. Wat is de **exacte path** van `POST /api/my-staffler/actuals/:id/cancel` (BCJ-19438)?
2. Wat is de **exacte path** van first-login-pwd-update (BCJ-19535)?
3. Wat is de **exacte path** van `GET /api/my-staffler/actuals` listing (BCJ-19435)?
4. Waar is de **breaking change** voor `EmployeeModel` velden gedocumenteerd? (Vermoedelijk geen formele changelog.)
5. **Statute dictionary** (BCJ-19554) — wanneer is dat live? Welke endpoint?

Stuur deze door op maandag (zie `monday-checklist.md`).
