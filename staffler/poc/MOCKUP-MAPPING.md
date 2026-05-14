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
| 06 | selectie-picker.html | 🔵 | — | Fullscreen pool picker for SELECTION broadcast — currently we drop into a flat select; gap for v1 |
| 07 | simpele-dialog.html | ✅ | `dialog-shift-batch/` | Pill capacity, binary "iemand kiezen / open shift", autosuggest, broadcast radios all present |
| 08 | planscherm-staffler-stijl.html | ✅ | `planning-poc/` chrome | Mockup 08 tokens live in `styles.scss` + `planning-poc.component.scss` |
| 09 | dialog-volledig.html | ✅ | `contract-dialog/` (Medewerkers) + `dialog-shift-batch/` (Locaties) | Inline "Loonpakket aanmaken" banner now Locaties-only (pilot item 4) |
| 10 | planning-names.html | ✅ | `planning-poc/` Medewerkers view | Including green availability bands (item 2) |
| 11 | planning-vsl.html | ✅ | `planning-poc/` Locaties view | Service-location rows, +Open shifts delen, share dialog (mockup 12) |
| 12 | batch-dialog.html | ✅ | `dialog-shift-share/` | Reached via "Open shifts delen (N)" header button |
| 13 | planning-dag.html | ✅ | `planning-poc/` Day zoom | Now-line, 24h strip, prev/next-day navigation fixed (item 9) |
| 14 | locatie-eigenschappen.html | 🟡 | `dialog-edit-vestiging/` + `dialog-add-service-location/` | Address editing wired; map/locate-button + opening-hours strip missing |
| 15 | pool-mystaffler.html | 🟡 | `pool/` | Pool list + invite-status table present; `last_login` column shows static "—" until DPS endpoint lands |
| mobile-mystaffler.html | 🟡 | `mystaffler-preview/` | Strip embedded in the company portal (per PLAN.md: no separate app). Contract list + apply/withdraw works; availabilities CRUD is read-only |
| mobile-mystaffler-v2.html | 🟡 | `mystaffler-preview/` | v2 is just polish over v1; same status |

## Gaps worth picking up next

1. **Mockup 06 — selectie-picker (full-screen)** — when broadcast target is "Specifieke namen", the operator currently uses a plain select. Mockup 06 is a dedicated 300-row picker with statute / group / availability filters. Concrete v1 work.
2. **Mockup 14 — locatie-eigenschappen** — opening-hours strip per service location, plus a map preview. The address-editing dialog has the input but no map / hours UI.
3. **Mockup 15 + mobile views — last_login + uitzendkracht availability CRUD** — read-side works, write-side from MyStaffler doesn't sync availabilities back to the company portal. Item 2 only seeded demo data.
4. **Niveau-2 candidate flow polishing** — `dialog-shift-detail` lists candidates; the "Kies" wiring exists but doesn't yet copy a real wage package into the resulting contract (PoC uses a placeholder). Production-grade fix.

## What's intentionally not built

Per PLAN.md "Buiten v0":
- WhatsApp + email broadcast channels (radio still present, no integration)
- Separate mobile app (we use the embedded strip)
- LastUsedWagePackage cache
- itsme / multipart imports / actuals API (the `actuals/` page calls
  the DPS endpoint but the dialog state machine is PoC-only)
- Multi-company switcher beyond the existing dropdown
