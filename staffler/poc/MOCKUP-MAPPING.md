# Mockup → PoC mapping

Snapshot 2026-05-15 — after the all-night MyStaffler-PoC build (real
skey auth + lockout + force-reset + forgot-password + tap-to-edit
availability + Meldingen tab + kandidaat-bevestiging + service worker
+ Vercel config).

Each mockup under `staffler/mockups/` is either implemented in the
PoC, partially mapped, or out of scope. Use this as the source of
truth when picking the next feature.

Legend:
- ✅ implemented and reachable in the PoC
- 🟡 partially implemented (chrome OK, behaviour incomplete)
- 🔵 design only — no PoC equivalent yet
- ⛔ explicitly out of scope per PLAN.md

| # | Mockup | Status | PoC entry-point | Notes |
|---|--------|--------|------------------|-------|
| 01 | shift-board.html (early concept A) | ⛔ | — | Concept A; mockup 04 chosen as direction |
| 02 | resource-lanes.html (concept B) | ⛔ | — | Concept B; superseded by 04 |
| 03 | hybrid-timeline.html (concept C) | ⛔ | — | Concept C; superseded by 04 |
| 04 | resource-lanes-v2.html (chosen direction) | ✅ | `planning-poc/` Locaties view | Bryntum grid, +/3-dot overflow on vestiging rows |
| 05 | create-shift-modal.html | ✅ | `dialog-shift-batch/` | Both scenarios (all assigned / mixed) covered, broadcast section conditional on open slots |
| 06 | selectie-picker.html | 🟡 | `dialog-shift-share/` | Inline SELECTION picker now has "Beschikbaar deze week" filter + bulk-add chip (gap 1 closed); full-screen redesign with statuut/group filters still deferred |
| 07 | simpele-dialog.html | ✅ | `dialog-shift-batch/` | Pill capacity, binary "iemand kiezen / open shift", autosuggest, broadcast radios all present |
| 08 | planscherm-staffler-stijl.html | ✅ | `planning-poc/` chrome | Mockup 08 tokens live in `styles.scss` + `planning-poc.component.scss` |
| 09 | dialog-volledig.html | ✅ | `contract-dialog/` (Medewerkers) + `dialog-shift-batch/` (Locaties) | Inline "Loonpakket aanmaken" banner now Locaties-only (pilot item 4) |
| 10 | planning-names.html | ✅ | `planning-poc/` Medewerkers view | Including green availability bands (item 2) |
| 11 | planning-vsl.html | ✅ | `planning-poc/` Locaties view | Service-location rows, +Open shifts delen, share dialog (mockup 12) |
| 12 | batch-dialog.html | ✅ | `dialog-shift-share/` | Reached via "Open shifts delen (N)" header button |
| 13 | planning-dag.html | ✅ | `planning-poc/` Day zoom | Now-line, 24h strip, prev/next-day navigation fixed (item 9) |
| 14 | locatie-eigenschappen.html | 🟡 | `dialog-edit-vestiging/` + `dialog-add-service-location/` + `company-locations/` | Address editing wired; per-weekday opening-hours editor + table strip added (gap 2 closed); map preview still deferred |
| 15 | pool-mystaffler.html | 🟡 | `pool/` | Pool list + invite-status table present; `last_login` now bumps every time the operator opens that employee's MyStaffler preview (gap 3 closed) |
| mobile-mystaffler.html | 🟡 | `mystaffler-preview/` (in-portal) | Strip embedded in the company portal (per PLAN.md: no separate app). Contract list + apply/withdraw + availability add/remove all wired (gap 4 closed). |
| mobile-mystaffler-v2.html | ✅ | `mystaffler-poc/` (**standalone, port 4201**) | Full mockup-v2 coverage: real skey login + lockout + force-reset + forgot-password + Meldingen tab + kandidaat-bevestiging + permissions + PWA install. Runs as a separate Vercel-deployable static SPA. |

## Round summary

**2026-05-14** — closed gaps 1–4 (selectie-picker filter, opening
hours, live last_login, availability remove).

**2026-05-15 (all-night MyStaffler portal build)** — full mockup
mobile-mystaffler-v2 coverage shipped as `staffler/poc/mystaffler-poc/`,
a standalone framework-free SPA on port 4201:

- Real BCJ-19426 employee login (`/publicapi/employees/users/login`)
  with `skey` cookie, 5-fail / 15-min per-email lockout, force-
  password-reset, "wachtwoord vergeten" 2-step Cognito flow.
- Server-side password validator (≥ 8, ≥ 1 digit, ≥ 1 upper) +
  client mirror with live ✓/× rule checklist.
- First-launch permissions consent (notifications + location), one-
  shot via `mystaffler.poc.perms` localStorage flag.
- Planning week-view: open shifts + accepted shifts grouped per day,
  shift cards show SL name + city (server-side join), tap-to-apply →
  full-screen kandidaat-bevestiging screen, withdraw inline.
- Beschikbaarheid tab: whole-row tap opens a bottom-sheet that
  handles add / edit / delete; locked rows non-interactive.
- Meldingen tab: derived feed (new open shifts, candidate, selected,
  rejected) with per-kind dot colour + tab badge.
- Profiel: DPS-side `/me` (full name + memberships) + change-
  password CTA + uitloggen.
- Network: offline banner via `navigator.onLine`, auto-reload on
  reconnect; service worker (skipWaiting + clients.claim, network-
  first for `/api`, stale-while-revalidate elsewhere); PWA manifest
  + icons + apple-touch-icon for home-screen install.
- Deploy: `vercel.json` with SPA fallback + placeholder `/api`
  rewrite + README walking the 3-step deploy.

## Gaps worth picking up next

1. **Mockup 06 — full-screen selectie-picker** — the current inline
   picker now has a "Beschikbaar deze week" filter + bulk-add, but
   the dedicated 300-row fullscreen with statuut / group filters
   from the mockup is still deferred.
2. **Mockup 14 map preview** — Google Maps autocomplete + embed for
   the service-location address. The wiring already exists in
   `dialog-edit-vestiging` but isn't reusable as-is.
3. **Niveau-2 candidate flow polishing** — `dialog-shift-detail`
   lists candidates; the "Kies" wiring exists but doesn't yet copy
   a real wage package into the resulting contract (PoC uses a
   placeholder). Production-grade fix.
4. **MyStaffler-PoC custom-hours selector** — the bottom-sheet
   already supports custom times for both add and edit (Mockup
   v1 gap closed); the in-portal `mystaffler-preview/` still
   hardcodes 09:00–17:00 on its "+" button.
5. **MyStaffler-PoC: in-app password change with current password**
   — Cognito flow goes through email reset only; an in-app change
   needs a different upstream path or a custom code-then-confirm
   screen.

## What's intentionally not built

Per PLAN.md "Buiten v0":
- WhatsApp + email broadcast channels (radio still present, no integration)
- Separate mobile app (we use the embedded strip)
- LastUsedWagePackage cache
- itsme / multipart imports / actuals API (the `actuals/` page calls
  the DPS endpoint but the dialog state machine is PoC-only)
- Multi-company switcher beyond the existing dropdown
