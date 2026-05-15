# MyStaffler-PoC → Jira mapping

Cross-reference between the screens / behaviours that live in
`staffler/poc/mystaffler-poc/` and the BCJ epics + stories that
describe their production AC. Built 2026-05-15 after the all-night
portal build.

The PoC is **not** the production code — it talks to the same
gateway (`gw.qa.dps.boemm.eu`), but the UI is a 460 px static SPA
rather than the Angular bundle that production deploys. Use this
mapping when you want to know "where is the test for X?" or "what
ticket does this screen relate to?".

## Login + auth

| BCJ | Title | PoC coverage | Files |
|---|---|---|---|
| BCJ-19426 | 👥 Login with email and password | ✅ — real `/publicapi/employees/users/login` via Fastify proxy, FORCE_PASSWORD_RESET screen, generic error message, 5-fail / 15-min lockout, first-login permissions consent | `src/main.js` (renderLogin / renderForceReset / renderPermissions), `src/server/index.ts` (/api/employee-login, /api/employee-set-password), `tests/employee-login*.qa.test.mjs` |
| BCJ-19535 | 👥 MyStaffler Force password reset on first login | ✅ — FPR branch sets a temp cookie carrying the Cognito session, set-password promotes it to a real skey | `src/main.js` (renderForceReset), `src/server/index.ts` (/api/employee-set-password), `tests/employee-login-integration.qa.test.mjs` |
| BCJ-19431 | Log out of the app | ✅ — Profile tab "Uitloggen" hits /api/logout + clears localStorage | `src/main.js` (renderProfile, logout handler) |
| BCJ-19543 | 👥 Create MyStaffler account upon successful employee validation | ⛔ — backend-only; out of scope for the PoC frontend |
| BCJ-19545 | 👥 Recreate account when employee email changed | ⛔ — backend-only |
| BCJ-19517 | 👥 MyStaffler Firebase setup | 🟡 — the consent screen asks for Notification permission, no FCM topic subscription yet |

## Planning + shifts

| BCJ | Title | PoC coverage | Files |
|---|---|---|---|
| BCJ-19433 | FE View my weekly shift schedule | ✅ — Planning tab with week navigation, prev/next/refresh, day cards, ISO weekday/week-number labels | `src/main.js` (renderPlanning), `src/state.js` (week helpers) |
| BCJ-19435 | 👥 View shift card details in the schedule list | 🟡 — card shows date + hours + service location + city + status (kandidaat / open). No expanded detail screen yet (planned: tap card → metadata) |
| BCJ-19439 | MyStaffler clock in clock out | ⛔ — out of scope |
| BCJ-19646 | FE cancel shift MyStaffler | ✅ — withdraw flow on the kandidaat-bevestigingsscherm + on every "Je bent kandidaat" card |
| BCJ-19650 | View shift card details — Canceled contracts not sent to BE | ⛔ — obsolete in Jira |
| BCJ-19645 | BE cancel shift MyStaffler | ✅ — `/api/shifts/:id/cancel` route + pocDb.cancelShift state machine (live in backend, used by company-side as well) |

## Pool + invitations (company side, but the employee identity comes from here)

| BCJ | Title | PoC coverage | Files |
|---|---|---|---|
| BCJ-19425 | 👥 MyStaffler Pool Overview & Invite Management | ✅ — company-side `pages/company/modules/pool/` (separate from mystaffler-poc) shows invite status + live last_login |

## Personal details

| BCJ | Title | PoC coverage | Files |
|---|---|---|---|
| BCJ-19451 | View and edit my personal details | 🟡 — Profile tab shows DPS-side full name + e-mail + companyMemberships read from /api/me. Edit path not surfaced yet (production has the upstream endpoint) |

## Misc

| BCJ | Title | PoC coverage | Files |
|---|---|---|---|
| BCJ-19524 | SPIKE: how to implement 2 pools | ⛔ — research ticket, no UI |

## What the PoC adds that no BCJ tracks (yet)

- **Forgot-password 2-step (resetPassword → email → confirmResetPassword)**
  — wires the Cognito endpoints under `/api/employee-reset-password`
  + `/api/employee-confirm-reset-password`. Anti-enumeration: step 1
  always returns 200.
- **Live password-rule checklist** — same validator on client +
  server, ✓ / ○ updates per keystroke.
- **First-launch permissions consent** — notifications + location
  prompts, one-shot via localStorage flag.
- **PWA install (manifest + service worker)** — install-to-home-
  screen on iOS / Android shows the magenta "S" icon, shell stays
  cached for fast paint.
- **Offline banner + auto-reload on reconnect**.
- **Server-side service-location join on /api/my-shifts** — shift
  cards say "Toog · Gent" instead of a UUID.

## Coverage stats

- **110 / 110 tests green** across `staffler/poc/tests/` covering
  the auth flow (unit + integration), reset flow (integration),
  pocDb business logic, the broadcast → apply → withdraw round-trip,
  the structural shape of the static SPA, and the `serve.mjs`
  proxy.
- **0 npm dependencies** in mystaffler-poc itself (Node-only
  serve.mjs uses built-ins; production deploys static files).
