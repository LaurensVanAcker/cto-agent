# Staffler PoC — Test plan

Manual walk-through for the pilot pre-flight. Each step lists the action,
the expected outcome, and the file/line where the wiring lives — so when a
step fails you can jump straight to the source.

Stand up locally: backend on `:5173` (`npm run dev` in `staffler/poc`),
frontend on `:4200` (`npm start` in `staffler/poc/frontend`). Then log in
with the DPS QA account (`STAFFLER_USERNAME` / `STAFFLER_PASSWORD`).

Legend:
- 🟢 = covered by current code; expected to pass
- 🟡 = touched in this round, retest carefully
- 🔴 = known broken / to fix

---

## A. Login + bootstrap

| # | Action | Expected |
|---|--------|----------|
| A1 | Navigate `/login` with no session | 🟢 Login form renders, no infinite redirect (auth.interceptor lines 14-40 — clears stale `skey`) |
| A2 | Submit valid credentials | 🟢 Lands on `/company/:id/planning-poc` with sidebar |
| A3 | Submit invalid credentials | 🟢 401 → error toast, stays on form |
| A4 | Restart backend, reload | 🟢 Stale `skey` cleared, login re-appears (was looping previously) |
| A5 | Navigate `/demo/dialogs` without session | 🟢 Renders gallery, no auth redirect (`/demo/*` whitelisted) |

## B. Planning — Names view (mockup 10)

| # | Action | Expected |
|---|--------|----------|
| B1 | Open Names tab, week zoom | 🟡 Indigo banner card "Klik op een cel om een contract te maken" |
| B2 | Click empty cell on employee row | 🟢 Production `ContractDialog` opens |
| B3 | Click empty cell on `perm:` row (vaste medewerker) | 🟡 Vast-blok dialog opens, prefilled with start/end |
| B4 | **Click existing contract block** | 🔴 Should open `ContractDialog` in edit mode (currently no-op) |
| B5 | Drag-create across multiple days on employee row | 🟢 ContractDialog opens, date range prefilled |
| B6 | Verify "Vast" pill on permanent rows | 🟢 (renderer line 1222) |

## C. Planning — Locaties view (mockup 11)

| # | Action | Expected |
|---|--------|----------|
| C1 | Switch to Locaties tab | 🟡 Banner copy switches to "Klik op een cel om een shift te maken" |
| C2 | Vestiging row shows apartment icon + branch name | 🟡 (resourceColumnRenderer lines 280-285) |
| C3 | Click empty cell on SL row | 🟢 m09 dialog opens with SL prefilled |
| C4 | Day zoom + drag across hours | 🟢 m09 opens with fromTime/toTime prefilled |
| C5 | Service location with no parent vestiging | 🟢 Orphan bucket shows amber pill + Koppel pencil |
| C6 | Click Koppel pencil on orphan | 🟢 Attach-vestiging dialog opens |
| C7 | Day-zoom: 24h strip visible, magenta now-line | 🟡 (TODAY_TIME_RANGE_ID filter + new now-line) |
| C8 | Click existing shift block | 🟢 m09 opens in edit mode |

## D. m09 — Nieuwe shift dialog

| # | Action | Expected |
|---|--------|----------|
| D1 | "Bestaande shift gebruiken" preset | 🟢 4 templates, picking one sets werkuren + pauze |
| D2 | "Nieuwe uren ingeven" tab | 🟢 Free-form werkuren input |
| D3 | Per-day title (dinsdag 12 mei 2026) | 🟢 |
| D4 | Add slot button (+ Shift toevoegen) | 🟢 Adds open slot |
| D5 | Open shift → "Persoon kiezen" | 🟢 Rich dropdown with statute + last shift |
| D6 | Open shift → "Open laten" | 🟢 Slot stays open |
| D7 | Wage-package missing banner | 🟡 Shows amber banner when ≥1 assigned slot still on Standaard pakket |
| D8 | Submit with no service location | 🟢 Disabled button + tooltip |
| D9 | Submit with no werkuren | 🟢 Disabled button + tooltip |
| D10 | Submit with toTime < fromTime | 🟢 Validation error |
| D11 | Submit with pauze outside werkuren | 🟢 Validation error |
| D12 | Submit valid: 2 assigned + 1 open | 🔴 Should yield 3 blocks on grid (Anouk, Bart, "1 open shift" badge) |
| D13 | Submit valid: all open | 🟡 Single shift block with capacity badge |
| D14 | Submit creates → toast + grid refreshes | 🟢 |
| D15 | Edit existing shift via grid click | 🔴 Dialog opens but scroll broken |

## E. m12 — Open shifts delen

| # | Action | Expected |
|---|--------|----------|
| E1 | Header shows "Open shifts delen" + "N open shifts in week W (date range)" | 🟡 |
| E2 | Default deadline = next Sunday 21:00 | 🟢 |
| E3 | Override banner explains effect | 🟢 |
| E4 | Volledige pool → recipientCount = pool size | 🟢 |
| E5 | Specifieke namen → name picker reveals | 🟢 |
| E6 | Selecteer 4 → magenta badge "4" in search row | 🟡 |
| E7 | Pool-summary indigo info-box at bottom | 🟡 |
| E8 | Submit → POSTs per shift, success toast | 🟢 |

## F. m14 — Service location dialog

| # | Action | Expected |
|---|--------|----------|
| F1 | Open from "+" on vestiging row | 🟡 Title "Service location" + parent vestiging subtitle |
| F2 | Field label "NAAM LOCATIE *" uppercase | 🟡 |
| F3 | Edit existing SL | 🟡 Magenta SL name accent in header |
| F4 | Submit → toast + row updates | 🟢 |

## G. Vestiging — eigenschappen dialog

| # | Action | Expected |
|---|--------|----------|
| G1 | Open from gear on vestiging row | 🟢 Naam + Plaats tewerkstelling fields |
| G2 | Edit name → save → toast | 🟢 |
| G3 | Address autocomplete | 🟢 |
| G4 | Click "Verwijderen" in danger-zone | 🟡 p-confirmDialog appears |
| G5 | Confirm delete | 🟡 Calls `companyGroupApi.removeGroup`, refreshes grid |
| G6 | Cancel delete | 🟡 Dialog closes, no API call |

## H. Pool — mockup 15

| # | Action | Expected |
|---|--------|----------|
| H1 | Header button "Nieuwe vestiging maken" + group_add icon | 🟡 |
| H2 | Column header "Last login" + lock icon w/ tooltip | 🟡 |
| H3 | "Nooit" fallback for never-logged-in users | 🟡 |
| H4 | Row action menu: Vestigingen toewijzen + Wachtwoord resetten | 🟡 |
| H5 | Invited row also has "Uitnodiging opnieuw versturen" | 🟢 |
| H6 | **Assign employee to a vestiging (vestiging 2 → Alexander)** | 🔴 reported error |
| H7 | Filter chips (All / Active / Pending) | 🟢 |

## I. Prestatiebevestiging (actuals)

| # | Action | Expected |
|---|--------|----------|
| I1 | Navigate from FORBIDDEN error CTA | 🔴 Currently links externally — must clone |
| I2 | List recent prestaties (week zoom) | 🔴 To build |
| I3 | Bevestig per prestatie | 🔴 To build |
| I4 | Empty state | 🔴 To build |

## J. Demo routes (no-auth)

| # | Action | Expected |
|---|--------|----------|
| J1 | `/demo/planning` renders mock data | 🟢 |
| J2 | `/demo/dialogs` lists 6 cards | 🟢 |
| J3 | Each card opens its dialog | 🟢 (verified screenshot session) |

---

## Known broken / in-progress (this round)

- D12: assigned slots collapse into "Open shift × N" instead of separate person blocks
- D15: scroll broken in edit-mode m09 dialog
- B4: clicking existing contract is a no-op (should open edit dialog)
- C7: now-line visibility (depends on Bryntum z-index)
- H6: vestiging-2 → Alexander assignment error (server-side or payload mismatch)
- I1-I4: prestatiebevestiging clone not yet built
- G4-G6: danger-zone confirm flow needs in-browser confirmation
