# Mockup → PoC mapping

Snapshot 2026-05-14, after the pilot-feedback round. Each mockup
under `staffler/mockups/` is either implemented in the PoC, partially
mapped, or out of scope. Use this as the source of truth when picking
the next feature.

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
| mobile-mystaffler.html | 🟡 | `mystaffler-preview/` | Strip embedded in the company portal (per PLAN.md: no separate app). Contract list + apply/withdraw + availability add/remove all wired (gap 4 closed); custom hours selector still hardcoded to 09:00-17:00 |
| mobile-mystaffler-v2.html | 🟡 | `mystaffler-preview/` | v2 is just polish over v1; same status |

## Gaps worth picking up next

Round 2026-05-14 closed gaps 1–4 (filter-and-bulk-add in the SELECTION
picker, opening hours per service location, live last_login bumps,
MyStaffler availability remove). What's still on the list:

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
4. **MyStaffler availability custom hours** — the "+" button on a
   day currently hardcodes 09:00–17:00. Mockup expects a small
   time-pair input.

## What's intentionally not built

Per PLAN.md "Buiten v0":
- WhatsApp + email broadcast channels (radio still present, no integration)
- Separate mobile app (we use the embedded strip)
- LastUsedWagePackage cache
- itsme / multipart imports / actuals API (the `actuals/` page calls
  the DPS endpoint but the dialog state machine is PoC-only)
- Multi-company switcher beyond the existing dropdown
