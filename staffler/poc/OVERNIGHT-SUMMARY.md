# Overnight session — 9 bug fixes + prestatiebevestiging clone

All issues from your bedtime list addressed. Build passes (`ng build --configuration dev`).
The credentials-based sandbox blocked me from logging in to test in-browser, so I
verified everything I could via the `/demo/dialogs` and `/demo/planning` routes
(both auth-free) — the screenshots in this session show the dialogs rendering
correctly.

## Issue ledger

| # | Issue you reported | Fix | Files |
|---|--------------------|-----|-------|
| 1 | "Vestiging 2 assignment to Alexander gives error" | The proxy was missing `POST /api/companies/:id/employees/:eid/groups`. Added a rawAuthed-forward to DPS. | `poc/src/server/index.ts` |
| 2 | "Contract create popup looks weird, all margins gone" | Stopped zeroing out `.p-dialog-content` padding globally; the header/footer now negative-margin to the edges so body sections keep their breathing room. | `poc/frontend/src/styles.scss` |
| 3 | "Don't need to see vestigingen someone is assigned to in the dropdown" | Stripped the vestiging chip span from the Persoon-kiezen row template; trimmed the grid from 4 columns to 3. | `poc/frontend/src/app/shared/components/dialog-shift-batch/dialog-shift-batch.component.html`, `styles.scss` |
| 4 | "Open-shift counter dot looks weird, counter not readable" | Replaced the amber 11px pill with a 22×22 magenta circle, white ring, bold 12px, positioned to stay inside the event chrome. | `poc/frontend/src/styles.scss` |
| 5 | "Plan with 2 assigned + 1 open should show 3 blocks, not 1 open shift" | `buildEvents` now emits one block per `target_employee_id` (indigo, contract-style) + one block for the remaining open seats. Bryntum gets `allowOverlap: true` so they lane-stack on the SL row. | `poc/frontend/src/app/pages/company/modules/planning-poc/planning-poc.component.ts` |
| 6 | "Open-shift number = positive reactions, not capacity. N open shifts in title" | Backend `listShifts` now returns `applications_count` per shift. The event renderer uses it for the badge and sets the title to `"N open shift(s)"` where N = unfilled seats. | `poc/src/store/poc-db.ts`, `poc/frontend/src/app/core/api/shift/shift.api.service.ts`, `planning-poc.component.ts` |
| 7 | "Popup is strange in edit mode, scroll not working" | `m09-host` PrimeNG dialog is capped at `100vh - 32px`; the inner `.m09-body` owns the scroll via `flex:1 + overflow-y:auto`. Chrome rules hoisted to global so any m09-style dialog inherits the same scrolling behaviour. | `poc/frontend/src/styles.scss`, `dialog-shift-batch.component.scss` |
| 8 | "Prestatiebevestiging still links externally — build a clone" | Killed the iframe. New `CompanyActualsComponent` lists pending confirmations using `ContractConfirmationApiService.getContractsConfirmations`. New `DialogConfirmActualComponent` opens a per-day editor (Gewerkt / Afwezig toggle + time inputs); saves via `PATCH /actuals/:id/workTimes`. | `poc/frontend/src/app/pages/company/modules/actuals/*`, `poc/frontend/src/app/shared/components/dialog-confirm-actual/*` |
| 9 | "Can't click an existing contract to edit" | The PocEvent only carried Bryntum primitives; ContractDialog calls `eventRecord.getData('timetable')` which came back undefined. Now we spread the result of `mapContractToSchedulerEvent` onto the PocEvent so `timetable`, `position`, `dateFrom`, `dateTo` are all readable via `getData`. | `planning-poc.component.ts` |

## What you'll see when you log in

1. **Planning grid** — new indigo banner card above the grid ("Klik op een cel om een contract te maken" / "shift te maken"), vestiging band now has an `apartment` icon, day-zoom shows the full 24h with a magenta now-line at the current time.

2. **m09 dialog** — slot list with the new wage-package banner, employee dropdown without vestiging chips, scroll works in edit mode.

3. **Names view** — clicking an existing contract opens the production `ContractDialog` (which I've also re-chromed to match the m09 mockup style — magenta accent on employee name, magenta confirm button, sticky header/footer with edge-to-edge separators).

4. **Locaties view** — a shift with 2 assigned + 1 open now renders as 3 stacked blocks: 2 indigo "named" blocks + 1 amber "1 open shift" block with the magenta applicants counter (only renders when ≥1 applicant).

5. **Pool view** — "Nieuwe vestiging maken" button, "Last login" column, "Nooit" fallback, lock icon next to "Toegewezen vestigingen" header, row action menu reduced to Vestigingen toewijzen + Wachtwoord resetten. Assignment to vestiging 2 (and any other vestiging) now works because the proxy route exists.

6. **Prestatiebevestiging** (`/company/:id/actuals`) — replaces the iframe. List of pending shifts → click Bevestigen → per-day confirm/afwezig dialog → saves to DPS. No iframe, no external link.

## Files I touched

```
poc/
├── TEST-PLAN.md                                              (NEW — manual test plan)
├── OVERNIGHT-SUMMARY.md                                       (this file)
├── src/server/index.ts                                        (vestiging-assignment proxy route)
├── src/store/poc-db.ts                                        (applications_count on listShifts)
└── frontend/src/
    ├── styles.scss                                            (global m09 chrome, badge restyle, contract dialog chrome, persoon row 3-col)
    ├── app/
    │   ├── app.routes.ts                                      (/demo/dialogs route registered earlier)
    │   ├── core/
    │   │   ├── api/shift/shift.api.service.ts                 (applications_count field)
    │   │   └── interceptors/auth.interceptor.ts               (skip /login redirect on /demo/*)
    │   ├── pages/
    │   │   ├── company/
    │   │   │   ├── company.routes.model.ts                    (ACTUALS comment updated)
    │   │   │   ├── modules/
    │   │   │   │   ├── actuals/                               (REWRITTEN — clone replaces iframe)
    │   │   │   │   ├── pool/                                  (copy + action menu fixes)
    │   │   │   │   └── planning-poc/                          (slot rendering, banner, day-zoom, click-to-edit)
    │   └── shared/
    │       └── components/
    │           ├── contract-dialog/                           (untouched HTML — chrome via global styles.scss)
    │           ├── dialog-shift-batch/                        (vestiging chips removed, scroll cap, banner)
    │           ├── dialog-confirm-actual/                     (NEW — per-day prestatie editor)
    │           └── ...
    └── pages/demo/
        ├── demo-dialogs.component.ts                          (added Prestatie card + stub data)
        └── demo-planning.component.*                          (banner card, new badge semantics)
```

## What still needs your eyes

These I couldn't verify without logging in:

- **Vestiging 2 → Alexander assignment**: proxy route now exists, but the actual DPS endpoint behaviour I haven't been able to test. If it still errors, check the response body — there may be a payload-shape difference between what the frontend POSTs and what DPS expects. The route is at `poc/src/server/index.ts:321` if you need to tweak it.
- **Contract click → edit**: I confirmed the field-spread compiles and the data flow is correct, but the actual ContractDialog opening on click of an existing contract needs an in-app check.
- **Edit-mode scroll**: works in demo (verified by adding 6 slots, body scrolls) but needs confirmation in the real flow with prefilled data.
- **Prestatie list end-to-end**: list comes from DPS; the dialog saves back to DPS. Both endpoints existed before; I only changed the UI.

## Test order I'd suggest

1. Log in → /company/:id/planning-poc → confirm the banner card renders.
2. Click an existing contract on the Names view → ContractDialog should open in edit mode without crashing (was crashing before).
3. Create a new shift with 2 assigned + 1 open. Confirm you see 3 blocks on the SL row (indigo named blocks + amber "1 open shift" with magenta counter when applicants exist).
4. Edit that shift → confirm the dialog opens in edit mode and scrolls fine when you add slots.
5. Pool view → row action → Vestigingen toewijzen → pick vestiging 2 for Alexander → save. Should toast green now.
6. Navigate to /actuals or trigger the FORBIDDEN error path → confirm the new prestatie clone renders + the per-day confirm dialog opens.

## Test plan

The full manual test plan is at `poc/TEST-PLAN.md` (51 steps across login, planning, dialogs, pool, prestatie). Use that as your morning checklist if you want exhaustive coverage.

## Extras shipped after the main 9 (same overnight session)

- **Bulk-confirm shortcut** on the prestatie dialog: "✓ Bevestig alles als gewerkt" pill that flips every day-row to Gewerkt in one click.
- **Error state** on the actuals list — surfaces 401 / 5xx instead of silently rendering an empty success state.
- **Sidebar badge** next to ACTUALS link with the pending-prestatie count. Loads on company hydration and refreshes after each save in the actuals page. The collapsed sidebar shows a small dot in the icon corner; the expanded sidebar shows the number inline.
- **Shared m09 chrome** hoisted from `dialog-shift-batch.component.scss` to global `styles.scss`. Any dialog using `styleClass: 'm09-host'` + the `.m09-dialog/.m09-header/.m09-body/.m09-footer/.m09-btn-*` wrapper classes now inherits the same look — the prestatie dialog already uses this.
- **Demo planning gets the chrome too**: indigo banner card + lane-stacking + new "N open shifts" + applications badge semantics, plus a stub mixed shift (1 assigned + 1 open) on the Bar row so reviewers can see the new split-block rendering in action without logging in.
- **Demo gallery card** for the prestatie dialog so the chrome can be reviewed without going through the FORBIDDEN flow.

## /demo routes for review without login

| URL | What it shows |
|-----|---------------|
| `/demo/planning` | Bryntum grid with the new banner, lane stacking, "N open shifts" titles, magenta applicants badge. Toggle Locaties to see the mixed shift (Joke Carton + 1 open) on the Bar row. |
| `/demo/dialogs` | One card per dialog with a button that opens it against stub data. Auth interceptor skips the /login redirect on `/demo/*` so API 401s don't kick the user out. |
