# MyStaffler PoC (employee side)

Standalone mobile-styled portal for the **uitzendkracht** view —
sibling of the company-side `staffler/poc/frontend` planning app.

## What it does

Per `staffler/mockups/mobile-mystaffler-v2.html`, four tabs in a
460 px wide shell:

| Tab            | Wat                                                            |
|----------------|-----------------------------------------------------------------|
| Planning       | Week-view, open shifts + accepted shifts, "Kandidaat stellen" / "Terugtrekken". |
| Beschikbaar    | Eén tijdsblok per dag toevoegen / bewerken / verwijderen.      |
| Meldingen      | Afgeleide feed van open shifts + kandidatuur-events.           |
| Profiel        | DPS-naam, e-mail, werkgevers + uitloggen + change-password CTA.|

Login is the **real BCJ-19426 flow** — `/publicapi/employees/users/login`
via the Fastify proxy. Sub-flows: FORCE_PASSWORD_RESET (first-login
temp password → kies nieuw wachtwoord), forgot-password (Cognito
mailt code → confirm), per-account 5-fail / 15-min lockout, and a
first-launch consent screen for browser permissions (notifications,
location).

## Stack

TypeScript (zero new npm deps — re-uses the backend's `tsc`), compiled
to plain ESM JS in `src/dist/`. The portal is **100% static after the
build step** — `index.html` + `src/dist/` + `src/styles.css` is what
gets deployed to Vercel / Cloudflare Pages.

`serve.mjs` is a 30-line Node script that:
1. Serves the static files (with SPA fallback to `index.html`).
2. Proxies every `/api/*` request to the Fastify backend on `:5173`,
   forwarding cookies in both directions so the HTTP-only session
   survives a reload. Replace with a Vercel rewrite in prod.

### Building

`npm start` runs tsc + boots serve.mjs. Useful one-shots:

```bash
npm run build         # tsc → src/dist/*.js
npm run typecheck     # tsc --noEmit
npm run watch         # tsc --watch for tight inner loop
```

The `src/dist/` artifact is gitignored.

## Running it locally

```bash
# Terminal 1 — Fastify proxy (talks to gw.qa.dps.boemm.eu)
cd staffler/poc
npm install
npm run dev           # listens on :5173

# Terminal 2 — Company-side planning grid
cd staffler/poc/frontend
npm install
npm start             # listens on :1445, proxies /api → :5173

# Terminal 3 — MyStaffler employee PoC
cd staffler/poc/mystaffler-poc
npm start             # listens on :4201, proxies /api → :5173
```

Then open <http://localhost:4201/> and log in with a real MyStaffler
account on QA (`mystaffler.dev.wlnob.boemm.eu` credentials work
because the Fastify backend talks to the same gateway).

## Demo round-trip

1. On the **company side** (`:4200`) → Pool → uitnodigen → markeer
   actief. Or sneller: gebruik een bestaande employee uit `GET
   /api/employees?companyId=`.
2. Login on **`:4201`** with that employee's credentials. First time:
   force-reset screen → choose new password → permissions screen →
   Planning.
3. On `:4200` open the planning grid, **Locaties view**, click a
   cell. Create a shift, set "Specifieke namen" + add the employee
   from step 1 to the selection. Bevestig.
4. Switch back to `:4201` → Planning tab → tap "↻ vernieuwen". The
   open shift card shows up under the right day.
5. Tap "Kandidaat stellen" → green confirmation screen → "Terug naar
   planning". The shift card now reads "Je bent kandidaat".
6. On `:4200` open the shift's detail dialog. The employee shows in
   the candidate list — operator can "Kies".

## Deployment

The `index.html` + `src/` + `manifest.webmanifest` + `icon-*.svg`
files are pure static.

### Vercel (one-click)

The repo ships a `vercel.json` already wired with:

- `cleanUrls: true`
- SPA fallback (any non-`/api` path → `index.html`)
- `/api/:path*` rewrite (placeholder `BACKEND_URL` — replace with
  the hostname where you deploy the Fastify proxy)
- `Content-Type` + `Cache-Control` headers for the manifest + icons

Steps:

1. Deploy `staffler/poc` (the Fastify proxy in `src/server`) to
   Render / Fly / a Vercel Node function. Note the hostname.
2. Open `mystaffler-poc/vercel.json` and replace `BACKEND_URL` with
   that hostname.
3. `cd staffler/poc/mystaffler-poc && vercel deploy --prod`.

Cookies stay same-origin via the rewrite, so the
HTTP-only `poc_sid` cookie survives.

Add a service worker later (out of scope for this PoC).

## Files

```
mystaffler-poc/
├─ README.md          ← this file
├─ index.html         ← SPA shell
├─ manifest.webmanifest
├─ icon-192.svg / icon-512.svg
├─ package.json       ← only the `start` script (no deps)
├─ serve.mjs          ← static + /api/* proxy
└─ src/
   ├─ main.js         ← screens, render functions, event wiring
   ├─ api.js          ← fetch client
   ├─ state.js        ← pub/sub store + week math
   └─ styles.css      ← mobile chrome
```

## What's intentionally out of scope

- **Service worker / offline mode** — login depends on the gateway
  anyway.
- **Push notifications via FCM** — BCJ-19517 covers Firebase wiring;
  the permission screen here is the consent prompt, not the topic
  subscription.
- **In-app password change with current password** — DPS Cognito
  flow doesn't expose this directly; users go through the email
  reset flow on Profile.
- **Camera permission** — only asked when a flow needs it (avatar
  upload, document scan); none exist yet, so the consent screen
  doesn't request it.
- **i18n** — Dutch only for v0.

## Tests

The portal's contract is locked by tests in `staffler/poc/tests/`:

- `employee-login.qa.test.mjs` + `employee-login-integration.qa.test.mjs`
  — login flow including lockout + force-reset.
- `employee-reset-integration.qa.test.mjs` — forgot-password 2-step.
- `flow-mystaffler-apply.qa.test.mjs` — broadcast → apply → withdraw
  round-trip.
- `dps-clone-structure.qa.test.mjs` — structural locks (tabs, screens
  present, manifest valid, etc.).

Run via `cd staffler/poc && npm test`.
