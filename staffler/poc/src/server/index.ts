// Fastify proxy voor de Angular planning portal + MyStaffler PWA.
//
// Deze server is API-only. Sinds Option-C rollout (zie DEPLOY.md) staan
// frontend en backend op aparte Heroku apps; de Angular SPA wordt
// geserveerd door `staffler-poc-web` met de heroku-static-buildpack en
// de PWA door `staffler-mystaffler`. Lokaal draai je de frontend met
// `ng serve` op :1445 (of :4201 voor MyStaffler) met `proxy.conf.json`
// die /api/* doorstuurt naar deze server op :5173.
//
// Endpoints die deze server exposed:
//   POST /api/login             { username, password } -> { ok, profile? }
//   POST /api/logout
//   GET  /api/me                -> DpsUserDetailsWebDto
//   GET  /api/dictionaries      ?types=
//   GET  /api/companies/:id
//   GET  /api/employees         ?companyId=&page=&size=&nameLike=
//   GET  /api/contracts         ?companyId=&startDate=&endDate=
//   POST /api/contracts         body: ContractWebDto
//
// Skey leeft in een in-memory Map per session-cookie. Voor productie: vervang
// door Upstash KV of een echte session store. In-memory is OK voor PoC iteratie.

import { fastify } from "fastify";
import { randomBytes } from "node:crypto";

import { StafflerClient, StafflerError, gatewayFor, type StafflerEnv } from "../client/staffler-client.js";
import type { ContractWebDto } from "../types/staffler.js";
import { pocDb } from "../store/poc-db.js";

// -- bootstrap config --

const env = (process.env.STAFFLER_ENV ?? "qa") as StafflerEnv;
const port = parseInt(process.env.PORT ?? "5173");
const gateway =
  process.env[`STAFFLER_GATEWAY_${env.toUpperCase()}`] ?? gatewayFor(env);

// Tijdens dev draait de planning portal op :1445 met `ng serve` en
// proxy.conf.json, dus we hoeven daar geen extra CORS toe te staan
// (alles is same-origin via de Angular dev-proxy). De MyStaffler-PoC
// (employee-side) draait standaard op :4201 met eigen serve.mjs en
// praat rechtstreeks naar :5173 — daarom staat die origin er bij.
const allowedDevOrigins = (process.env.DEV_ORIGINS ?? "http://localhost:1445,http://localhost:4201")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// -- session store: cookie -> skey + cached profile --

interface Session {
  skey: string;
  username: string;
  profileJson?: string; // gecached zodat /api/me snel is
  /** "company" | "employee" — drives which DPS endpoints are reachable
   *  via this skey. The MyStaffler-PoC creates "employee" sessions; the
   *  planning PoC creates "company" sessions. Defaults to "company" for
   *  back-compat with the existing /api/login route. */
  kind?: "company" | "employee";
  /** Set when the upstream auth returned FORCE_PASSWORD_RESET. The
   *  employee can still call `/api/employee-set-password` because that
   *  route reads this field, but every other authed call should 401
   *  until the password is set. */
  forceResetSession?: string;
  /** The username the upstream returned in the FORCE_PASSWORD_RESET
   *  challenge response. Cognito's RespondToAuthChallenge requires the
   *  username from the challenge (often the Cognito sub or alias), NOT
   *  the email the user typed. Echoing back the wrong value makes
   *  Cognito throw an unhandled exception which the gateway surfaces
   *  as a generic 500 INTERNAL_SERVER_ERROR — see comment in
   *  /api/employee-set-password. */
  forceResetUsername?: string;
  /** Companies the logged-in user can read/write. Populated from
   *  `getCurrentUser().companyMemberships` after login. Used by
   *  `assertCompanyAccess` to 403 cross-tenant reads even when the
   *  caller forges a different companyId in the query string. Empty /
   *  undefined means "not hydrated yet" — the guard falls open in that
   *  case so a profile-fetch failure doesn't take the PoC offline. */
  companyIds?: string[];
}

/** Pull the set of companyIds the user has access to from a hydrated
 *  DpsUserDetailsWebDto. Returns [] when the profile is missing/unparseable
 *  — callers should treat empty as "not enforced", not "no access". */
function companyIdsFromProfile(profileJson: string | undefined): string[] {
  if (!profileJson) return [];
  try {
    const profile = JSON.parse(profileJson) as {
      companyMemberships?: Array<{ companyId?: string }>;
    };
    return (profile.companyMemberships ?? [])
      .map((m) => m?.companyId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/** Returns null on success, or { status, body } to short-circuit the
 *  handler. Enforces (a) session present, (b) companyId provided,
 *  (c) the session's user has membership of that company. Skip (c) when
 *  the session's company list is empty (= profile not hydrated yet) so
 *  the PoC stays usable when /api/users/currentuser briefly fails. */
function assertCompanyAccess(
  session: Session | null,
  companyId: string | undefined,
): { status: number; body: { kind: string; message: string } } | null {
  if (!session) return { status: 401, body: { kind: "unauthenticated", message: "login required" } };
  if (!companyId) return { status: 400, body: { kind: "validation", message: "companyId required" } };
  const allowed = session.companyIds ?? [];
  if (allowed.length > 0 && !allowed.includes(companyId)) {
    return { status: 403, body: { kind: "forbidden", message: "no access to this company" } };
  }
  return null;
}

const sessions = new Map<string, Session>();

// -- login throttle: per-email failure counter for BCJ-19426 AC --
//
// "After 5 failed attempts, the account is temporarily locked for 15
// minutes." We keep this in-memory; restart of the proxy clears it,
// which is fine for a PoC. Production lockout is in Cognito itself.
interface LoginAttempt {
  failedCount: number;
  lockedUntilMs: number; // 0 == not locked
  windowStartedMs: number;
}
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, LoginAttempt>();

function getLockState(email: string): { locked: boolean; retryInMs: number } {
  const row = loginAttempts.get(email);
  if (!row) return { locked: false, retryInMs: 0 };
  const now = Date.now();
  if (row.lockedUntilMs && row.lockedUntilMs > now) {
    return { locked: true, retryInMs: row.lockedUntilMs - now };
  }
  // expired lock → reset
  if (row.lockedUntilMs && row.lockedUntilMs <= now) {
    loginAttempts.delete(email);
    return { locked: false, retryInMs: 0 };
  }
  return { locked: false, retryInMs: 0 };
}

function recordLoginFailure(email: string): { locked: boolean; retryInMs: number } {
  const now = Date.now();
  const existing = loginAttempts.get(email);
  const row: LoginAttempt =
    existing && now - existing.windowStartedMs < LOCKOUT_WINDOW_MS
      ? existing
      : { failedCount: 0, lockedUntilMs: 0, windowStartedMs: now };
  row.failedCount += 1;
  if (row.failedCount >= LOCKOUT_THRESHOLD) {
    row.lockedUntilMs = now + LOCKOUT_WINDOW_MS;
  }
  loginAttempts.set(email, row);
  return {
    locked: row.lockedUntilMs > now,
    retryInMs: Math.max(0, row.lockedUntilMs - now),
  };
}

function clearLoginFailures(email: string): void {
  loginAttempts.delete(email);
}

function newSessionId(): string {
  return randomBytes(24).toString("base64url");
}

function readSessionId(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const cookieHeader = req.headers.cookie as string | undefined;
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)poc_sid=([A-Za-z0-9_-]+)/.exec(cookieHeader);
  return match ? match[1] : null;
}

function pickSession(req: { headers: Record<string, string | string[] | undefined> }): Session | null {
  const sid = readSessionId(req);
  if (!sid) return null;
  return sessions.get(sid) ?? null;
}

function clientFor(session: Session | null): StafflerClient {
  return new StafflerClient({ gateway, skey: session?.skey });
}

// -- fastify --

const app = fastify({ logger: { level: "info" } });

// CORS handler voor ng serve dev origin. In prod (same-origin) niet nodig.
app.addHook("onRequest", async (req, reply) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && allowedDevOrigins.includes(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Cookie");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    if (req.method === "OPTIONS") {
      reply.status(204).send();
      return reply;
    }
  }
});

// helpers
function asResponse(err: unknown) {
  if (err instanceof StafflerError) {
    // Surface DPS errors in the backend log instead of swallowing them. The
    // frontend gets the kind/status/message it needs to render a sensible
    // toast or fallback; the operator gets enough context to debug the
    // upstream failure.
    console.warn(
      `[dps ${err.status}] kind=${err.kind} traceId=${err.traceId} msg=${err.message} errors=${JSON.stringify(err.errors)}`,
    );
    return {
      status: err.status || 500,
      body: {
        kind: err.kind,
        traceId: err.traceId,
        errors: err.errors,
        message: err.message,
      },
    };
  }
  console.warn("[proxy] unexpected error", err);
  return {
    status: 500,
    body: { kind: "internal", message: (err as Error)?.message ?? String(err) },
  };
}

// ── health / env probe ──────────────────────────────────────────────────
// GET /api/health → { env, gateway, ts }. Used by the login page to
// surface the *actual* upstream the proxy is hitting, so a stale
// `STAFFLER_ENV=dev` shell export doesn't silently send QA credentials
// to the dev Cognito pool (and vice versa). The login flow's "incorrect
// username or password" is otherwise indistinguishable from a real bad
// password — the banner makes the env-mismatch case self-diagnosing.
app.get("/api/health", async () => {
  return { env, gateway, ts: new Date().toISOString() };
});

// ── auth endpoints ──────────────────────────────────────────────────────

// POST /api/login
// Response shape matcht de cloned DPS-frontend (`AuthResultModel`):
// `{ authStatus, username, session, skey }`. Het echte sessie-token leeft
// in een httpOnly cookie (poc_sid); de `skey` in de body is een marker zodat
// de frontend zijn localStorage-`AUTH_KEY` flag kan zetten en de
// authenticatedGuard groen ziet. We sturen het echte Staffler-skey
// bewust NIET naar de browser.
app.post<{ Body: { username: string; password: string } }>(
  "/api/login",
  async (req, reply) => {
    const { username, password } = req.body || ({} as { username: string; password: string });
    if (!username || !password) {
      reply.status(400);
      return { kind: "validation", message: "username and password required" };
    }
    const client = new StafflerClient({ gateway });
    try {
      const result = await client.login({ username, password });
      if (result.authStatus !== "SUCCESS" || !result.skey) {
        console.warn(
          `[auth] /api/login FAILURE for "${username}" via ${gateway} (STAFFLER_ENV=${env}). ` +
            `If these creds work on a different env, unset STAFFLER_ENV or set it to the matching one.`,
        );
        return {
          authStatus: result.authStatus ?? "FAILURE",
          username,
          session: result.session ?? "",
          skey: "",
        };
      }
      const sid = newSessionId();
      const session: Session = { skey: result.skey, username };
      sessions.set(sid, session);
      reply.header(
        "Set-Cookie",
        `poc_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
      );

      // immediate currentuser hydrate + cache (best-effort, niet blocking)
      try {
        const profile = await client.getCurrentUser();
        session.profileJson = JSON.stringify(profile);
        session.companyIds = companyIdsFromProfile(session.profileJson);
      } catch {
        // negeer; /api/me kan later hertryen
      }

      return {
        authStatus: "SUCCESS",
        username,
        session: "",
        skey: "cookie-session",
      };
    } catch (err) {
      const e = asResponse(err);
      if (e.status === 401) {
        console.warn(
          `[auth] /api/login 401 for "${username}" via ${gateway} (STAFFLER_ENV=${env}). ` +
            `Verify creds belong to this env (Cognito users are per-env).`,
        );
      }
      reply.status(e.status);
      return e.body;
    }
  },
);

// POST /api/employee-login
// Real MyStaffler login — talks to /publicapi/employees/users/login on
// the Staffler gateway and returns either:
//   { authStatus: "SUCCESS", employee }  — session cookie is set; the
//     skey lives in the server-side session map only, never on the wire
//     to the browser
//   { authStatus: "FORCE_PASSWORD_RESET", session, username }  — the
//     employee logged in with the temp password from the invitation
//     email; the client must collect a new password and call
//     /api/employee-set-password with the `session` token. No cookie
//     is set yet at this stage.
//
// Adds the BCJ-19426 lockout: 5 failed attempts in 15 min → 423 Locked.
// Lock state is per-email and in-memory (resets on proxy restart).
app.post<{ Body: { username?: string; password?: string } }>(
  "/api/employee-login",
  async (req, reply) => {
    const username = (req.body?.username ?? "").trim().toLowerCase();
    const password = req.body?.password ?? "";
    if (!username || !password) {
      reply.status(400);
      return {
        authStatus: "FAILURE",
        message: "Email of wachtwoord ontbreekt.",
      };
    }
    const lock = getLockState(username);
    if (lock.locked) {
      reply.status(423);
      return {
        authStatus: "LOCKED",
        retryInSec: Math.ceil(lock.retryInMs / 1000),
        message:
          "Te veel mislukte pogingen. Probeer over 15 minuten opnieuw.",
      };
    }
    const client = new StafflerClient({ gateway });
    let result;
    try {
      result = await client.employeeLogin({ username, password });
    } catch (err) {
      // Network / 5xx / generic auth failure. We surface a non-specific
      // error (per BCJ-19426 AC) and bump the lockout counter.
      const lockAfter = recordLoginFailure(username);
      reply.status(401);
      return {
        authStatus: "FAILURE",
        retryInSec: lockAfter.retryInMs > 0 ? Math.ceil(lockAfter.retryInMs / 1000) : 0,
        message: "E-mail of wachtwoord is verkeerd.",
        upstream: asResponse(err).body,
      };
    }

    if (result.authStatus === "FORCE_PASSWORD_RESET" && result.session) {
      // Stash the session token so /api/employee-set-password can pick
      // it up via the (about-to-be-set) cookie. The client will follow
      // up with new password + we'll flip authStatus to SUCCESS.
      //
      // IMPORTANT: Cognito's RespondToAuthChallenge wants the username
      // exactly as it came back in the challenge — for some pools that's
      // an alias / sub-id rather than the email the operator typed.
      // Falling back to the lowercased input keeps single-field pools
      // working too.
      const upstreamUsername =
        typeof result.username === "string" && result.username.length > 0
          ? result.username
          : username;
      const sid = newSessionId();
      sessions.set(sid, {
        skey: "",
        username,
        kind: "employee",
        forceResetSession: result.session,
        forceResetUsername: upstreamUsername,
      });
      reply.header(
        "Set-Cookie",
        `poc_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60}`,
      );
      return {
        authStatus: "FORCE_PASSWORD_RESET",
        session: result.session,
        username,
      };
    }

    if (result.authStatus !== "SUCCESS" || !result.skey) {
      recordLoginFailure(username);
      reply.status(401);
      return {
        authStatus: result.authStatus ?? "FAILURE",
        message: "E-mail of wachtwoord is verkeerd.",
      };
    }

    // Happy path — clear any pending lock and open the session.
    clearLoginFailures(username);
    const sid = newSessionId();
    const session: Session = {
      skey: result.skey,
      username,
      kind: "employee",
    };
    sessions.set(sid, session);
    reply.header(
      "Set-Cookie",
      `poc_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    );
    // Best-effort: hydrate the employee's identity from /api/users/currentuser
    // so subsequent calls have a name + DPS employeeId. Falls back to email-derived
    // values if the upstream call fails so the client can still render the UI.
    let employee: { id: string; email: string; firstName: string; lastName: string };
    try {
      const profile = await new StafflerClient({
        gateway,
        skey: result.skey,
      }).getCurrentUser();
      session.profileJson = JSON.stringify(profile);
      session.companyIds = companyIdsFromProfile(session.profileJson);
      const employeeId =
        (profile as { managedEmployeeId?: string }).managedEmployeeId ??
        (profile as { employeeId?: string }).employeeId ??
        (profile as { userId?: string }).userId ??
        username;
      const fullName = (profile as { user?: { name?: string } }).user?.name ?? "";
      const [firstName, ...rest] = fullName.split(" ");
      employee = {
        id: employeeId,
        email: username,
        firstName: firstName || username.split("@")[0],
        lastName: rest.join(" "),
      };
    } catch {
      employee = {
        id: username,
        email: username,
        firstName: username.split("@")[0],
        lastName: "",
      };
    }
    return { authStatus: "SUCCESS", employee };
  },
);

// POST /api/employee-set-password
// Finalises the FORCE_PASSWORD_RESET flow. Requires the (cookie-)session
// from the preceding /api/employee-login call so we don't have to ship
// the raw Cognito session token through the browser.
app.post<{ Body: { password?: string } }>(
  "/api/employee-set-password",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session || !session.forceResetSession || session.kind !== "employee") {
      reply.status(401);
      return { kind: "unauthenticated" };
    }
    const password = req.body?.password ?? "";
    const validity = validatePassword(password);
    if (!validity.ok) {
      reply.status(400);
      return { kind: "validation", message: validity.reason };
    }
    const client = new StafflerClient({ gateway });
    try {
      const result = await client.employeeSetPassword({
        session: session.forceResetSession,
        username: session.username,
        password,
      });
      if (result.authStatus !== "SUCCESS" || !result.skey) {
        reply.status(400);
        return {
          authStatus: result.authStatus ?? "FAILURE",
          message: "Wachtwoord kon niet ingesteld worden. Probeer opnieuw.",
        };
      }
      // Promote the session: it now has a real skey and no longer needs
      // the reset-session token.
      session.skey = result.skey;
      session.forceResetSession = undefined;
      clearLoginFailures(session.username);
      return { authStatus: "SUCCESS" };
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// POST /api/employee-reset-password
// Step 1 of the "wachtwoord vergeten" flow. Always returns 200 to
// avoid account enumeration — upstream Cognito mails a confirmation
// code to the email on file, or silently does nothing if the email
// is unknown. The client just shows a generic confirmation screen.
app.post<{ Body: { username?: string } }>(
  "/api/employee-reset-password",
  async (req, reply) => {
    const username = (req.body?.username ?? "").trim().toLowerCase();
    if (!username) {
      reply.status(400);
      return { kind: "validation", message: "username required" };
    }
    try {
      await new StafflerClient({ gateway }).employeeResetPassword(username);
    } catch {
      // Swallow upstream errors — same response shape either way so a
      // probe can't tell a known vs unknown email apart.
    }
    return { ok: true };
  },
);

// POST /api/employee-confirm-reset-password
// Step 2 of "wachtwoord vergeten" — operator pastes the code from
// their email + picks a new password. Same password validator as
// /api/employee-set-password.
app.post<{
  Body: { username?: string; newPassword?: string; confirmationCode?: string };
}>(
  "/api/employee-confirm-reset-password",
  async (req, reply) => {
    const username = (req.body?.username ?? "").trim().toLowerCase();
    const newPassword = req.body?.newPassword ?? "";
    const confirmationCode = (req.body?.confirmationCode ?? "").trim();
    if (!username || !newPassword || !confirmationCode) {
      reply.status(400);
      return {
        kind: "validation",
        message: "username, newPassword en confirmationCode zijn vereist.",
      };
    }
    const validity = validatePassword(newPassword);
    if (!validity.ok) {
      reply.status(400);
      return { kind: "validation", message: validity.reason };
    }
    try {
      await new StafflerClient({ gateway }).employeeConfirmResetPassword({
        username,
        newPassword,
        confirmationCode,
      });
      return { ok: true };
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

/**
 * BCJ-19426 password rule: ≥ 8 chars, at least one digit, at least one
 * uppercase letter. Mirrors the Cognito policy upstream so a client
 * that satisfies us also satisfies the gateway.
 */
function validatePassword(p: string): { ok: true } | { ok: false; reason: string } {
  if (typeof p !== "string" || p.length < 8) {
    return { ok: false, reason: "Wachtwoord moet minstens 8 tekens hebben." };
  }
  if (!/[0-9]/.test(p)) {
    return { ok: false, reason: "Wachtwoord moet minstens één cijfer bevatten." };
  }
  if (!/[A-Z]/.test(p)) {
    return { ok: false, reason: "Wachtwoord moet minstens één hoofdletter bevatten." };
  }
  return { ok: true };
}

// POST /api/logout
app.post("/api/logout", async (req, reply) => {
  const session = pickSession(req);
  if (session) {
    try {
      await clientFor(session).logout();
    } catch {
      // best-effort
    }
    const sid = readSessionId(req);
    if (sid) sessions.delete(sid);
    reply.header("Set-Cookie", `poc_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }
  return { ok: true };
});

// PATCH /api/me
// BCJ-19451 — update the logged-in employee's personal details.
// Forwards to the gateway's `/api/users/currentuser` (PATCH). Whatever
// the upstream returns becomes the new cached profile so subsequent
// /api/me calls see the fresh values. Errors bubble back to the client
// untouched so the toast can surface them.
app.patch<{
  Body: { firstName?: string; lastName?: string; phoneNumber?: string };
}>("/api/me", async (req, reply) => {
  const session = pickSession(req);
  if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
  // Whitelist the fields we forward — drop anything else so an
  // accidental field doesn't reach the gateway with a payload it
  // can't validate.
  const b = req.body ?? {};
  const payload: { firstName?: string; lastName?: string; phoneNumber?: string } = {};
  if (typeof b.firstName === "string") payload.firstName = b.firstName.trim();
  if (typeof b.lastName === "string") payload.lastName = b.lastName.trim();
  if (typeof b.phoneNumber === "string") payload.phoneNumber = b.phoneNumber.trim();
  if (Object.keys(payload).length === 0) {
    reply.status(400);
    return { kind: "validation", message: "Niets om bij te werken." };
  }
  try {
    const updated = await clientFor(session).updateCurrentUser(payload);
    session.profileJson = JSON.stringify(updated);
    session.companyIds = companyIdsFromProfile(session.profileJson);
    return updated;
  } catch (err) {
    const e = asResponse(err);
    reply.status(e.status);
    return e.body;
  }
});

// GET /api/me
app.get("/api/me", async (req, reply) => {
  const session = pickSession(req);
  if (!session) {
    reply.status(401);
    return { kind: "unauthenticated" };
  }
  // Gebruik cached profile als beschikbaar; anders ververs van Staffler
  if (session.profileJson) {
    try {
      return JSON.parse(session.profileJson);
    } catch {
      // fall through
    }
  }
  try {
    const profile = await clientFor(session).getCurrentUser();
    session.profileJson = JSON.stringify(profile);
    session.companyIds = companyIdsFromProfile(session.profileJson);
    return profile;
  } catch (err) {
    const e = asResponse(err);
    reply.status(e.status);
    return e.body;
  }
});

// ── data endpoints ──────────────────────────────────────────────────────

// GET /api/dictionaries
app.get<{ Querystring: { types?: string } }>(
  "/api/dictionaries",
  async (req) => {
    const types = (req.query.types || "statutes,languages,countries").split(",").filter(Boolean);
    return new StafflerClient({ gateway }).getDictionaries(types);
  },
);

// GET /api/companies/:id
app.get<{ Params: { id: string } }>("/api/companies/:id", async (req, reply) => {
  const session = pickSession(req);
  if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
  try {
    return await clientFor(session).getCompany(req.params.id);
  } catch (err) {
    const e = asResponse(err);
    reply.status(e.status);
    return e.body;
  }
});

// GET /api/employees
// Forwards every query param the frontend sends — DPS supports baseView,
// sortBy, groupIds, etc., and stripping them produced a 500 from the
// gateway. Cleaner: just relay the raw query string.
app.get(
  "/api/employees",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    try {
      return await clientFor(session).rawAuthed<unknown>("GET", req.url);
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// GET /api/contracts
// Same rationale as /api/employees: pass the raw query string through. The
// frontend's ContractApiService sends page/size/sortBy/statuses/etc., all
// of which DPS understands and our typed wrapper would otherwise drop.
app.get(
  "/api/contracts",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    try {
      return await clientFor(session).rawAuthed<unknown>("GET", req.url);
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// POST /api/contracts
app.post<{ Body: ContractWebDto }>("/api/contracts", async (req, reply) => {
  const session = pickSession(req);
  if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
  try {
    return await clientFor(session).createContract(req.body);
  } catch (err) {
    const e = asResponse(err);
    reply.status(e.status);
    return e.body;
  }
});

// GET /api/companies/:id/groups   (= engagement groups = vestigingen)
app.get<{ Params: { id: string } }>(
  "/api/companies/:id/groups",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    try {
      return await clientFor(session).listCompanyGroups(req.params.id);
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// POST /api/companies/:id/employees/:eid/groups  → assign vestigingen.
// Pool view's "Vestigingen toewijzen" action POSTs the full new list of
// groups. Before this route existed the call 404'd at the proxy (only
// listCompanyGroups was wired) and the operator saw a "Toewijzen mislukt"
// toast. We just rawAuthed-forward to DPS — the request body is already
// in DPS's expected shape.
app.post<{ Params: { id: string; eid: string }; Body: unknown }>(
  "/api/companies/:id/employees/:eid/groups",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    try {
      return await clientFor(session).rawAuthed<unknown>(
        "POST",
        `/api/companies/${req.params.id}/employees/${req.params.eid}/groups`,
        req.body,
      );
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// ── PoC-DB admin / seed ───────────────────────────────────────────────────

// POST /api/poc-seed-demo?companyId= → create a small starter dataset
// (3 service-locations + 2 permanent employees) for demos.
app.post<{ Querystring: { companyId?: string } }>(
  "/api/poc-seed-demo",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.query.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    const companyId = req.query.companyId!; // narrowed by assertCompanyAccess
    let branchGroupIds: string[] = [];
    try {
      const groups = (await clientFor(session).listCompanyGroups(
        companyId,
      )) as { id: string }[];
      branchGroupIds = groups.map((g) => g.id);
    } catch {
      // Soldier on with an empty list; the seed still creates rows but
      // their `branch_group_id` will be empty until the operator picks one.
    }
    // Pilot feedback (2026-05-14): the Medewerkers grid is empty-looking
    // without seeded availabilities. Pull the first page of company
    // employees so seedDemo can paint a varied set of green hour-blocks
    // across this week + next week. Fall back to an empty list on
    // failure — the rest of the seed still proceeds.
    let employeeIds: string[] = [];
    try {
      const page = (await clientFor(session).listEmployees({
        companyId,
        page: 0,
        size: 50,
      })) as { content?: Array<{ id: string }> };
      employeeIds = (page.content ?? []).map((e) => e.id);
    } catch {
      // intentionally empty — availability seed is best-effort.
    }
    return pocDb.seedDemo({
      companyId,
      branchGroupIds,
      employeeIds,
    });
  },
);

// POST /api/poc-reset → wipe the PoC-DB. Only for local dev.
app.post("/api/poc-reset", async (req, reply) => {
  const session = pickSession(req);
  if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
  pocDb.reset();
  return { ok: true };
});

// ── PoC-DB endpoints ──────────────────────────────────────────────────────

// Service locations (= sub-row under a vestiging, e.g. "Toog Gent", "Bar Sluizeken")

// GET /api/service-locations?companyId=
app.get<{ Querystring: { companyId?: string } }>(
  "/api/service-locations",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.query.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    return pocDb.listServiceLocations(req.query.companyId!);
  },
);

// POST /api/service-locations
app.post<{
  Body: {
    companyId: string;
    branchGroupId: string;
    name: string;
    addressLine1?: string;
    addressLine2?: string;
    postalCode?: string;
    city?: string;
    openingHours?: import("../store/poc-db.js").OpeningHours;
  };
}>(
  "/api/service-locations",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.body?.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    const b = req.body;
    if (!b?.branchGroupId || !b?.name) {
      reply.status(400);
      return {
        kind: "validation",
        message: "branchGroupId and name are required",
      };
    }
    return pocDb.createServiceLocation({
      company_id: b.companyId,
      branch_group_id: b.branchGroupId,
      name: b.name,
      address_line1: b.addressLine1 ?? null,
      address_line2: b.addressLine2 ?? null,
      postal_code: b.postalCode ?? null,
      city: b.city ?? null,
      opening_hours: b.openingHours ?? {},
    });
  },
);

// PUT /api/service-locations/:id
app.put<{
  Params: { id: string };
  Body: {
    name?: string;
    branchGroupId?: string;
    addressLine1?: string;
    addressLine2?: string;
    postalCode?: string;
    city?: string;
    openingHours?: import("../store/poc-db.js").OpeningHours;
  };
}>(
  "/api/service-locations/:id",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const patch: Parameters<typeof pocDb.updateServiceLocation>[1] = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.branchGroupId !== undefined) patch.branch_group_id = req.body.branchGroupId;
    if (req.body.addressLine1 !== undefined) patch.address_line1 = req.body.addressLine1 || null;
    if (req.body.addressLine2 !== undefined) patch.address_line2 = req.body.addressLine2 || null;
    if (req.body.postalCode !== undefined) patch.postal_code = req.body.postalCode || null;
    if (req.body.city !== undefined) patch.city = req.body.city || null;
    if (req.body.openingHours !== undefined) patch.opening_hours = req.body.openingHours;
    const updated = pocDb.updateServiceLocation(req.params.id, patch);
    if (!updated) { reply.status(404); return { kind: "not_found" }; }
    return updated;
  },
);

// DELETE /api/service-locations/:id (soft delete)
app.delete<{ Params: { id: string } }>(
  "/api/service-locations/:id",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const ok = pocDb.softDeleteServiceLocation(req.params.id);
    if (!ok) { reply.status(404); return { kind: "not_found" }; }
    return { ok: true };
  },
);

// Permanent employees (vaste medewerker, leeft niet in DPS)
app.get<{ Querystring: { companyId?: string } }>(
  "/api/permanent-employees",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.query.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    return pocDb.listPermanentEmployees(req.query.companyId!);
  },
);

app.post<{
  Body: { companyId: string; firstName: string; lastName: string };
}>(
  "/api/permanent-employees",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.body?.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    const b = req.body;
    if (!b?.firstName || !b?.lastName) {
      reply.status(400);
      return { kind: "validation", message: "firstName, lastName required" };
    }
    return pocDb.createPermanentEmployee({
      company_id: b.companyId,
      first_name: b.firstName,
      last_name: b.lastName,
    });
  },
);

// Permanent blocks (Vast blokjes — date range + hour range, no Dimona).
// Created from the planning-poc Names view when the operator clicks an
// empty cell on a permanent-employee row.

app.get<{ Querystring: { companyId?: string; dateFrom?: string; dateTo?: string } }>(
  "/api/permanent-blocks",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.query.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    return pocDb.listPermanentBlocks({
      companyId: req.query.companyId!,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    });
  },
);

app.post<{
  Body: {
    companyId: string;
    permanentEmployeeId: string;
    dateFrom: string;
    dateTo: string;
    fromTime: string;
    toTime: string;
  };
}>(
  "/api/permanent-blocks",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.body?.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    const b = req.body;
    if (!b?.permanentEmployeeId || !b?.dateFrom || !b?.dateTo || !b?.fromTime || !b?.toTime) {
      reply.status(400);
      return { kind: "validation", message: "permanentEmployeeId, dates, hours required" };
    }
    return pocDb.createPermanentBlock({
      company_id: b.companyId,
      permanent_employee_id: b.permanentEmployeeId,
      date_from: b.dateFrom,
      date_to: b.dateTo,
      from_time: b.fromTime,
      to_time: b.toTime,
    });
  },
);

app.delete<{ Params: { id: string } }>(
  "/api/permanent-blocks/:id",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const ok = pocDb.deletePermanentBlock(req.params.id);
    if (!ok) { reply.status(404); return { kind: "not_found" }; }
    return { ok: true };
  },
);

// Shifts (PoC-DB; open vraag voor temporary invulling)
app.get<{ Querystring: { companyId?: string; dateFrom?: string; dateTo?: string } }>(
  "/api/shifts",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.query.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    if (!req.query.dateFrom || !req.query.dateTo) {
      reply.status(400);
      return { kind: "validation", message: "dateFrom, dateTo required" };
    }
    return pocDb.listShifts(req.query.companyId!, req.query.dateFrom, req.query.dateTo);
  },
);

app.post<{
  Body: {
    companyId: string;
    serviceLocationId: string;
    dateFrom: string;
    dateTo: string;
    fromTime: string;
    toTime: string;
    pauseFrom?: string;
    pauseTo?: string;
    capacity?: number;
    deadline?: string;
    targetType?: "ALL_POOL" | "SELECTION" | "GROUP" | "NONE";
    targetEmployeeIds?: string[];
    targetGroupIds?: string[];
    status?: "draft" | "open";
    createdByUserId?: string;
  };
}>(
  "/api/shifts",
  async (req, reply) => {
    const session = pickSession(req);
    const denied = assertCompanyAccess(session, req.body?.companyId);
    if (denied) { reply.status(denied.status); return denied.body; }
    const b = req.body;
    if (!b?.serviceLocationId || !b?.dateFrom || !b?.fromTime || !b?.toTime) {
      reply.status(400);
      return { kind: "validation", message: "serviceLocationId, dateFrom, fromTime, toTime required" };
    }
    // Architectural rule (pilot directive 2026-05-19): a flex employee
    // assigned to a slot is a DPS *contract*, not a PoC-DB shadow row.
    // The shifts table is reserved for OPEN shifts (capacity that nobody
    // is yet pinned to) and for ALL_POOL / GROUP broadcast metadata.
    //
    // We therefore drop `targetEmployeeIds` at the boundary: the planning
    // grid used to read this list and paint each id as a "filled contract"
    // block, which was a lie — DPS QA had no contract for those employees.
    // Operators must use POST /api/contracts (pure proxy → DPS, Dimona-
    // bound) to pin a flex employee to a slot. The shift itself stays in
    // PoC-DB as an open vraag with `target_employee_ids: []`.
    if (b.targetEmployeeIds && b.targetEmployeeIds.length > 0) {
      req.log.warn(
        { shiftCompany: b.companyId, dropped: b.targetEmployeeIds.length },
        "[shifts] dropping targetEmployeeIds — flex assignments must go through POST /api/contracts",
      );
    }
    // SELECTION without per-employee targets makes no sense; downgrade
    // to NONE so the open shift is honest about being unassigned.
    const safeTargetType =
      b.targetType === "SELECTION" ? "NONE" : (b.targetType ?? "NONE");
    const result = pocDb.createShift({
      company_id: b.companyId,
      service_location_id: b.serviceLocationId,
      date_from: b.dateFrom,
      date_to: b.dateTo ?? b.dateFrom,
      from_time: b.fromTime,
      to_time: b.toTime,
      pause_from: b.pauseFrom ?? null,
      pause_to: b.pauseTo ?? null,
      capacity: b.capacity ?? 1,
      deadline: b.deadline ?? null,
      target_type: safeTargetType,
      target_employee_ids: [],
      target_group_ids: b.targetGroupIds ?? [],
      status: b.status ?? "draft",
      published_at: null,
      created_by_user_id: b.createdByUserId ?? null,
    });
    // Surface the dedup signal as a custom header so the legacy frontend
    // typing (`Observable<ShiftModel>`) keeps working. Operators that
    // want to react to a merge can opt-in by reading the header; the
    // shift body is unchanged so all existing callers still parse the
    // payload as a single ShiftModel.
    if (result.merged) {
      reply.header("x-poc-shift-merged", "true");
      if (result.mergedInto) reply.header("x-poc-shift-merged-into", result.mergedInto);
    }
    return result.shift;
  },
);

app.post<{ Params: { id: string } }>(
  "/api/shifts/:id/publish",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const updated = pocDb.publishShift(req.params.id);
    if (!updated) { reply.status(404); return { kind: "not_found" }; }
    return updated;
  },
);

// POST /api/shifts/:id/cancel — set a draft/open shift to "cancelled".
// 404 if the id is unknown; 409 if the shift is already past the draft/open
// stage (closed / fulfilled), so the caller can show a tailored error.
app.post<{ Params: { id: string }; Body: { reason?: string | null } }>(
  "/api/shifts/:id/cancel",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const updated = pocDb.cancelShift(req.params.id, req.body?.reason ?? null);
    if (!updated) {
      // null means either unknown id OR the shift is past the draft/open
      // stage. Re-read the row to disambiguate so we return the right
      // status code (404 vs 409).
      const exists = pocDb.findShift(req.params.id);
      if (!exists) { reply.status(404); return { kind: "not_found" }; }
      reply.status(409);
      return { kind: "conflict", message: "Shift is niet meer annuleerbaar." };
    }
    return updated;
  },
);

// PATCH /api/shifts/:id/share — update target + deadline on an open shift.
// Used by the batch-share dialog (mockup 12) to broadcast open shifts to
// the pool / specific employees / external partners in one go.
app.patch<{
  Params: { id: string };
  Body: {
    targetType?: string;
    targetEmployeeIds?: string[];
    targetGroupIds?: string[];
    reactionDeadline?: string;
  };
}>(
  "/api/shifts/:id/share",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const patch: Record<string, unknown> = {};
    // Per-employee assignments belong on DPS as contracts, not as
    // PoC-DB shadow rows. Drop targetEmployeeIds here — see the long
    // comment on POST /api/shifts for the architectural rule. The
    // share endpoint stays useful for ALL_POOL / GROUP broadcasts and
    // for moving the reaction deadline.
    if (req.body?.targetEmployeeIds && req.body.targetEmployeeIds.length > 0) {
      req.log.warn(
        { shiftId: req.params.id, dropped: req.body.targetEmployeeIds.length },
        "[shifts/share] dropping targetEmployeeIds — flex assignments must go through POST /api/contracts",
      );
    }
    if (req.body?.targetType) {
      patch.target_type =
        req.body.targetType === "SELECTION" ? "NONE" : req.body.targetType;
    }
    // Always force target_employee_ids back to empty when the share
    // endpoint is touched. This also retroactively clears any rows
    // that slipped through before this fix landed.
    patch.target_employee_ids = [];
    if (req.body?.targetGroupIds) patch.target_group_ids = req.body.targetGroupIds;
    if (req.body?.reactionDeadline) patch.deadline = req.body.reactionDeadline;
    const updated = pocDb.patchShift(req.params.id, patch);
    if (!updated) { reply.status(404); return { kind: "not_found" }; }
    return updated;
  },
);

// GET /api/shifts/:id/applications — list candidates for a shift
app.get<{ Params: { id: string } }>(
  "/api/shifts/:id/applications",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    return pocDb.listApplicationsForShift(req.params.id);
  },
);

// Shift applications (uitzendkracht-strook)
app.post<{ Params: { id: string }; Body: { employeeId: string; note?: string } }>(
  "/api/shifts/:id/apply",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.body?.employeeId) {
      reply.status(400);
      return { kind: "validation", message: "employeeId required" };
    }
    return pocDb.applyToShift(req.params.id, req.body.employeeId, req.body.note);
  },
);

app.delete<{ Params: { id: string }; Body: { employeeId: string } }>(
  "/api/shifts/:id/apply",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.body?.employeeId) {
      reply.status(400);
      return { kind: "validation", message: "employeeId required" };
    }
    const ok = pocDb.withdrawApplication(req.params.id, req.body.employeeId);
    if (!ok) { reply.status(404); return { kind: "not_found" }; }
    return { ok: true };
  },
);

// Niveau 2 kandidaat-selectie → maakt Contract aan in DPS (Dimona!)
app.post<{
  Params: { id: string };
  Body: { applicationId: string; contract: ContractWebDto };
}>(
  "/api/shifts/:id/select",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const b = req.body;
    if (!b?.applicationId || !b?.contract) {
      reply.status(400);
      return { kind: "validation", message: "applicationId and contract required" };
    }
    try {
      const created = await clientFor(session).createContract(b.contract);
      const contractId = (created as { id?: string }).id ?? "";
      pocDb.selectApplication(b.applicationId, contractId);
      return { contract: created, applicationId: b.applicationId };
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// Availabilities — three modes:
//   - `employeeId=…`        : single-employee list (uitzendkracht view)
//   - `employeeIds=ID1,ID2` : explicit bulk list (caller already has ids)
//   - `companyId=…`         : server resolves the company's employee ids
//                             via Staffler, then bulk-lists. Used by the
//                             planning grid so the frontend doesn't have
//                             to round-trip /api/employees first.
// All three filter by the optional [from, to] date window.
app.get<{
  Querystring: {
    employeeId?: string;
    employeeIds?: string;
    companyId?: string;
    from?: string;
    to?: string;
  };
}>(
  "/api/availabilities",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (req.query.employeeIds !== undefined) {
      const ids = req.query.employeeIds.split(",").map((s) => s.trim()).filter(Boolean);
      return pocDb.listAvailabilitiesBulk(ids, req.query.from, req.query.to);
    }
    if (req.query.companyId) {
      const denied = assertCompanyAccess(session, req.query.companyId);
      if (denied) { reply.status(denied.status); return denied.body; }
      try {
        const page = (await clientFor(session).listEmployees({
          companyId: req.query.companyId,
          page: 0,
          size: 100,
        })) as { content?: Array<{ id: string }> };
        const ids = (page.content ?? []).map((e) => e.id);
        return pocDb.listAvailabilitiesBulk(ids, req.query.from, req.query.to);
      } catch (err) {
        const e = asResponse(err);
        reply.status(e.status);
        return e.body;
      }
    }
    if (!req.query.employeeId) {
      reply.status(400);
      return {
        kind: "validation",
        message: "employeeId, employeeIds or companyId required",
      };
    }
    return pocDb.listAvailabilities(req.query.employeeId, req.query.from, req.query.to);
  },
);

app.post<{
  Body: { employeeId: string; date: string; fromTime: string; toTime: string };
}>(
  "/api/availabilities",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const b = req.body;
    if (!b?.employeeId || !b?.date || !b?.fromTime || !b?.toTime) {
      reply.status(400);
      return { kind: "validation", message: "employeeId, date, fromTime, toTime required" };
    }
    return pocDb.createAvailability({
      employee_id: b.employeeId,
      date: b.date,
      from_time: b.fromTime,
      to_time: b.toTime,
      status: "open",
      locked_by_contract_id: null,
    });
  },
);

// DELETE /api/availabilities/:id — uitzendkracht intrekt een availability
// vanuit MyStaffler. 404 als de id onbekend is, 409 als de availability
// al gelocked is door een contract (verwijder eerst het contract).
app.delete<{ Params: { id: string } }>(
  "/api/availabilities/:id",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const existed = pocDb.raw().availabilities.some((a) => a.id === req.params.id);
    if (!existed) { reply.status(404); return { kind: "not_found" }; }
    const removed = pocDb.deleteAvailability(req.params.id);
    if (!removed) {
      reply.status(409);
      return {
        kind: "conflict",
        message: "Deze beschikbaarheid is al gekoppeld aan een contract.",
      };
    }
    return { ok: true };
  },
);

// ── MyStaffler pool (BCJ-19425) ────────────────────────────────────────────

// POST /api/employees/:id/mystaffler-invite?companyId=
// Thin proxy onto the upstream DPS invite endpoint. Same URL is used for
// both "first invite" and "resend" — upstream returns 204 either way.
// Invite/account status is now read from EmployeeWebDto on the upstream
// `/api/employees` response, so the PoC no longer keeps its own row.
app.post<{ Params: { id: string }; Querystring: { companyId?: string } }>(
  "/api/employees/:id/mystaffler-invite",
  async (req, reply) => {
    const session = pickSession(req);
    const guard = assertCompanyAccess(session, req.query.companyId);
    if (guard) {
      reply.status(guard.status);
      return guard.body;
    }
    const companyId = req.query.companyId as string;
    try {
      await clientFor(session).rawAuthed<unknown>(
        "POST",
        `/api/companies/${companyId}/employees/${req.params.id}/mystaffler/invite`,
      );
      reply.status(204).send();
      return;
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// GET /api/my-staffler/employees/:id/contracts?startDate=&endDate=
// Cross-company contracts for one employee — mirrors mockup MyStaffler week.
// "Last login" tracking now lives on the upstream EmployeeWebDto, so we
// no longer touch any PoC-DB state here.
app.get<{ Params: { id: string }; Querystring: { startDate?: string; endDate?: string } }>(
  "/api/my-staffler/employees/:id/contracts",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.startDate || !req.query.endDate) {
      reply.status(400);
      return { kind: "validation", message: "startDate and endDate required" };
    }
    try {
      return await clientFor(session).listEmployeeContractsCrossCompany({
        employeeId: req.params.id,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// GET /api/my-shifts?employeeId=
// PoC-DB view: all open shifts where this employee is targeted (SELECTION,
// ALL_POOL) plus the application status if any.
app.get<{ Querystring: { employeeId?: string } }>(
  "/api/my-shifts",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.employeeId) {
      reply.status(400);
      return { kind: "validation", message: "employeeId required" };
    }
    const employeeId = req.query.employeeId;
    const allShifts = pocDb.raw().shifts;
    const targeted = allShifts.filter(
      (s) =>
        s.status === "open" &&
        (s.target_type === "ALL_POOL" ||
          (s.target_type === "SELECTION" && s.target_employee_ids?.includes(employeeId))),
    );
    const apps = pocDb.listApplicationsForEmployee(employeeId);
    const appByShift = new Map(apps.map((a) => [a.shift_id, a] as const));
    // Resolve service-location names so the mobile client can show
    // "Toog Gent" instead of "sl-…-uuid". One pass over service_locations
    // is fine — the PoC has dozens, not thousands.
    const slById = new Map(
      pocDb.raw().service_locations.map((sl) => [sl.id, sl] as const),
    );
    // Login tracking moved upstream (EmployeeWebDto.lastLogin) — no
    // PoC-DB touch needed here anymore.
    return targeted.map((s) => {
      const sl = slById.get(s.service_location_id);
      return {
        shift: {
          ...s,
          service_location_name: sl?.name ?? null,
          service_location_city: sl?.city ?? null,
        },
        application: appByShift.get(s.id) ?? null,
      };
    });
  },
);

// GET /api/fcm-config
// Returns the Firebase Web SDK public config that the mystaffler-poc
// client uses to bootstrap `getMessaging`. The "public" config IS
// safe to expose — auth comes from Cognito, the FCM token comes
// from the device. Operators set the values via env vars; we ship
// empty defaults so the call always 200s and the client knows when
// to skip FCM setup. Per BCJ-19517.
app.get("/api/fcm-config", async () => {
  return {
    apiKey: process.env.FCM_API_KEY ?? "",
    authDomain: process.env.FCM_AUTH_DOMAIN ?? "",
    projectId: process.env.FCM_PROJECT_ID ?? "",
    storageBucket: process.env.FCM_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.FCM_MESSAGING_SENDER_ID ?? "",
    appId: process.env.FCM_APP_ID ?? "",
    vapidKey: process.env.FCM_VAPID_KEY ?? "",
    // The client treats `enabled: false` as "skip FCM setup" so we
    // don't crash with a missing-config error during a demo where no
    // Firebase project is wired yet.
    enabled: !!(process.env.FCM_API_KEY && process.env.FCM_PROJECT_ID && process.env.FCM_VAPID_KEY),
  };
});

// POST /api/fcm-subscribe
// The mystaffler-poc client calls this after `getToken()` resolves a
// device registration token. We store it on every invite for that
// employee so the company-side can push (e.g. on new broadcast) via
// the Firebase Admin SDK. Stub-friendly: returns 200 even if the
// employee has no invites yet (PoC demo flow).
app.post<{ Body: { employeeId?: string; token?: string } }>(
  "/api/fcm-subscribe",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const employeeId = (req.body?.employeeId ?? "").trim();
    const token = (req.body?.token ?? "").trim();
    if (!employeeId || !token) {
      reply.status(400);
      return { kind: "validation", message: "employeeId en token zijn vereist." };
    }
    const updated = pocDb.storeFcmToken(employeeId, token);
    return { ok: true, invitesUpdated: updated };
  },
);

// GET /api/notifications?employeeId=
// Derives a notification feed from PoC-DB state — no separate
// notifications table (would be premature for v0). Surfaces:
//   - "Nieuwe open shift": every open shift the employee is targeted at
//     and has NOT yet reacted to.
//   - "Je bent kandidaat": shifts where the employee has a candidate
//     application.
//   - "Geselecteerd": shifts where the application status flipped to
//     selected (= a contract was created).
// Most-recent first. Capped at 30 entries — pilot pool stays small.
app.get<{ Querystring: { employeeId?: string } }>(
  "/api/notifications",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.employeeId) {
      reply.status(400);
      return { kind: "validation", message: "employeeId required" };
    }
    const employeeId = req.query.employeeId;
    const apps = pocDb.listApplicationsForEmployee(employeeId);
    const reactedShiftIds = new Set(apps.map((a) => a.shift_id));

    type Notification = {
      id: string;
      kind: "new_open_shift" | "candidate" | "selected" | "rejected";
      title: string;
      detail: string;
      at: string; // ISO
      shiftId: string;
    };
    const notifs: Notification[] = [];

    // Open shifts not yet reacted to.
    for (const s of pocDb.raw().shifts) {
      if (s.status !== "open") continue;
      const targeted =
        s.target_type === "ALL_POOL" ||
        (s.target_type === "SELECTION" && s.target_employee_ids?.includes(employeeId));
      if (!targeted) continue;
      if (reactedShiftIds.has(s.id)) continue;
      notifs.push({
        id: `open:${s.id}`,
        kind: "new_open_shift",
        title: "Nieuwe open shift",
        detail: `${s.date_from} ${s.from_time} → ${s.to_time}`,
        at: s.published_at ?? s.updated_at,
        shiftId: s.id,
      });
    }
    // Applications — candidate / selected / rejected.
    for (const a of apps) {
      const shift = pocDb.raw().shifts.find((s) => s.id === a.shift_id);
      if (!shift) continue;
      const detail = `${shift.date_from} ${shift.from_time} → ${shift.to_time}`;
      if (a.status === "candidate") {
        notifs.push({
          id: `cand:${a.id}`,
          kind: "candidate",
          title: "Je bent kandidaat",
          detail,
          at: a.applied_at,
          shiftId: shift.id,
        });
      } else if (a.status === "selected") {
        notifs.push({
          id: `sel:${a.id}`,
          kind: "selected",
          title: "Je bent geselecteerd",
          detail,
          at: a.decided_at ?? a.applied_at,
          shiftId: shift.id,
        });
      } else if (a.status === "rejected") {
        notifs.push({
          id: `rej:${a.id}`,
          kind: "rejected",
          title: "Niet gekozen",
          detail,
          at: a.decided_at ?? a.applied_at,
          shiftId: shift.id,
        });
      }
    }
    notifs.sort((a, b) => (a.at < b.at ? 1 : -1));
    return notifs.slice(0, 30);
  },
);

// Pass-through 404 handler for /api/* endpoints we don't wrap explicitly.
//
// `/api/*` paths without a specific handler → forward to DPS using the
// user's cookie session. This keeps the frontend working against the
// full DPS surface (notification preferences, invitations, contract
// confirmation counts, etc.) without having to enumerate every endpoint
// in this proxy.
//
// The pass-through is a safety net only — explicit handlers above
// (login, poc-db tables, contract/employees wrappers) take priority
// because they add cookie-session logic, validation, or PoC-DB writes
// that DPS doesn't know about. For paths we've intentionally not
// wrapped (e.g. read-only reference endpoints), this avoids a stream
// of "Route not found" 404s silently breaking the frontend.
//
// Non-/api paths are a plain 404 — the SPA is served by sister Heroku
// apps (Option C in DEPLOY.md), not by this server.
const PASSTHROUGH_VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
app.setNotFoundHandler(async (req, reply) => {
  if (!req.url.startsWith("/api")) {
    reply.status(404);
    return { kind: "not_found", path: req.url };
  }

  // Only authed methods can pass through — and only with a valid cookie
  // session. Without that we can't forward the x-boemm-skey to DPS so the
  // caller gets a 401 instead of an opaque 500.
  const method = (req.method ?? "GET").toUpperCase();
  if (!PASSTHROUGH_VERBS.has(method)) {
    reply.status(404);
    return { kind: "not_found", path: req.url, method };
  }
  const session = pickSession(req);
  if (!session) {
    reply.status(401);
    return { kind: "unauthenticated" };
  }
  try {
    const body = await clientFor(session).rawAuthed<unknown>(method, req.url, req.body);
    return body;
  } catch (err) {
    const e = asResponse(err);
    reply.status(e.status);
    return e.body;
  }
});

// boot

await app.listen({ port, host: "0.0.0.0" });
console.log(`Staffler PoC backend listening on http://localhost:${port}`);
console.log(`Gateway: ${gateway}`);
console.log(`Env: ${env}`);
console.log(`Frontend: \`cd frontend && npm run start\` → http://localhost:1445`);
console.log(`MyStaffler PWA: \`cd mystaffler-poc && npm run dev\` → http://localhost:4201`);
