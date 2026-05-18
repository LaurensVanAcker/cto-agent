# E2E tests — Playwright

Two flows, both running against a live dev:all (`:4200` Angular, `:5174` mystaffler-poc PWA).

## Auth: reuse your Chrome login (no creds in env)

The `setup` project at `e2e/_setup/auth.setup.ts` produces
`e2e/.auth/staffler.json` — a Playwright **storageState** snapshot containing
the session cookies. All `company-portal/*` specs declare `dependencies:
['setup']` and load that file, so they run as if you were already logged in.

### First run

```bash
cd staffler/poc
npx playwright test
```

A headed Chromium opens on the login page. Log in by hand. As soon as the
browser lands on `/company/...`, Playwright saves the session and the rest
of the suite continues headless.

### Subsequent runs

Just re-run `npx playwright test`. The setup project re-uses
`e2e/.auth/staffler.json` for **12 hours** (mtime check) and skips the
login step entirely.

### Force a fresh login

```bash
rm staffler/poc/e2e/.auth/staffler.json
```

The next run pops the headed browser again.

### CI / unattended bypass

Set the QA creds:

```bash
export STAFFLER_QA_USER=...
export STAFFLER_QA_PASSWORD=...
npx playwright test
```

The setup project detects the env vars and fills the form
non-interactively — still produces the same storageState file, no manual
clicking required.

## Notes

- `e2e/.auth/` is git-ignored (cookies = secrets). Never commit.
- mystaffler-poc specs don't use storageState yet — they use the
  `MYSTAFFLER_EMP_USER` + `MYSTAFFLER_EMP_PASSWORD` env vars, same pattern
  as before.
- Run a single file: `npx playwright test e2e/company-portal/pilot-feedback-2026-05-18.spec.ts --reporter=line`
