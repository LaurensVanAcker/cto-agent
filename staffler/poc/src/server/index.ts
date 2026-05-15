// Fastify server-side proxy + statische serving voor Angular PoC.
//
// Twee draaiende modes:
//
// 1. Dev: Angular draait op :4200 via `ng serve`. Browser → :4200 → proxy.conf.json
//    forwardt /api/* naar deze Fastify op :5173. Deze server dient enkel /api/*
//    en geen static files (er is nog niets gebouwd).
//
// 2. Prod-like: Angular gebouwd naar dist/frontend/browser/. Browser → :5173 →
//    deze server dient de statische app PLUS /api/*.
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
import staticPlugin from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

import { StafflerClient, StafflerError, gatewayFor, type StafflerEnv } from "../client/staffler-client.js";
import type { ContractWebDto } from "../types/staffler.js";
import { pocDb } from "../store/poc-db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -- bootstrap config --

const env = (process.env.STAFFLER_ENV ?? "qa") as StafflerEnv;
const port = parseInt(process.env.PORT ?? "5173");
const gateway =
  process.env[`STAFFLER_GATEWAY_${env.toUpperCase()}`] ?? gatewayFor(env);

// Tijdens dev draait Angular op :4200 met `ng serve` en proxy.conf.json,
// dus we hoeven geen extra CORS toe te staan. De MyStaffler-PoC (mobile,
// employee-side) draait standaard op :4201 met eigen serve.mjs en talkt
// rechtstreeks naar :5173 — daarom staat die origin er standaard bij.
const allowedDevOrigins = (process.env.DEV_ORIGINS ?? "http://localhost:4200,http://localhost:4201")
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
      const sid = newSessionId();
      sessions.set(sid, {
        skey: "",
        username,
        kind: "employee",
        forceResetSession: result.session,
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
// (3 service-groups + 2 permanent employees) for demos.
app.post<{ Querystring: { companyId?: string } }>(
  "/api/poc-seed-demo",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    let branchGroupIds: string[] = [];
    try {
      const groups = (await clientFor(session).listCompanyGroups(
        req.query.companyId,
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
        companyId: req.query.companyId,
        page: 0,
        size: 50,
      })) as { content?: Array<{ id: string }> };
      employeeIds = (page.content ?? []).map((e) => e.id);
    } catch {
      // intentionally empty — availability seed is best-effort.
    }
    return pocDb.seedDemo({
      companyId: req.query.companyId,
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

// Service groups (= sub-row under a vestiging, e.g. "Toog Gent", "Bar Sluizeken")

// GET /api/service-groups?companyId=
app.get<{ Querystring: { companyId?: string } }>(
  "/api/service-groups",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const companyId = req.query.companyId;
    if (!companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    return pocDb.listServiceGroups(companyId);
  },
);

// POST /api/service-groups
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
  "/api/service-groups",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const b = req.body;
    if (!b?.companyId || !b?.branchGroupId || !b?.name) {
      reply.status(400);
      return {
        kind: "validation",
        message: "companyId, branchGroupId and name are required",
      };
    }
    return pocDb.createServiceGroup({
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

// PUT /api/service-groups/:id
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
  "/api/service-groups/:id",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const patch: Parameters<typeof pocDb.updateServiceGroup>[1] = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.branchGroupId !== undefined) patch.branch_group_id = req.body.branchGroupId;
    if (req.body.addressLine1 !== undefined) patch.address_line1 = req.body.addressLine1 || null;
    if (req.body.addressLine2 !== undefined) patch.address_line2 = req.body.addressLine2 || null;
    if (req.body.postalCode !== undefined) patch.postal_code = req.body.postalCode || null;
    if (req.body.city !== undefined) patch.city = req.body.city || null;
    if (req.body.openingHours !== undefined) patch.opening_hours = req.body.openingHours;
    const updated = pocDb.updateServiceGroup(req.params.id, patch);
    if (!updated) { reply.status(404); return { kind: "not_found" }; }
    return updated;
  },
);

// DELETE /api/service-groups/:id (soft delete)
app.delete<{ Params: { id: string } }>(
  "/api/service-groups/:id",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const ok = pocDb.softDeleteServiceGroup(req.params.id);
    if (!ok) { reply.status(404); return { kind: "not_found" }; }
    return { ok: true };
  },
);

// Permanent assignments (Vast blokken op het planscherm)
app.get<{
  Querystring: { companyId?: string; serviceGroupId?: string; dateFrom?: string; dateTo?: string };
}>(
  "/api/permanent-assignments",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    return pocDb.listPermanentAssignments({
      companyId: req.query.companyId,
      serviceGroupId: req.query.serviceGroupId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    });
  },
);

app.post<{
  Body: {
    serviceGroupId: string;
    permanentEmployeeId: string;
    weekdayPattern: Record<string, { from: string; to: string; pauseFrom?: string; pauseTo?: string }>;
    validFrom: string;
    validTo?: string;
    note?: string;
  };
}>(
  "/api/permanent-assignments",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const b = req.body;
    if (!b?.serviceGroupId || !b?.permanentEmployeeId || !b?.weekdayPattern || !b?.validFrom) {
      reply.status(400);
      return { kind: "validation", message: "serviceGroupId, permanentEmployeeId, weekdayPattern, validFrom required" };
    }
    return pocDb.createPermanentAssignment({
      service_group_id: b.serviceGroupId,
      permanent_employee_id: b.permanentEmployeeId,
      weekday_pattern: b.weekdayPattern,
      valid_from: b.validFrom,
      valid_to: b.validTo ?? null,
      note: b.note ?? null,
    });
  },
);

// Permanent employees (vaste medewerker, leeft niet in DPS)
app.get<{ Querystring: { companyId?: string } }>(
  "/api/permanent-employees",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    return pocDb.listPermanentEmployees(req.query.companyId);
  },
);

app.post<{
  Body: { companyId: string; firstName: string; lastName: string };
}>(
  "/api/permanent-employees",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const b = req.body;
    if (!b?.companyId || !b?.firstName || !b?.lastName) {
      reply.status(400);
      return { kind: "validation", message: "companyId, firstName, lastName required" };
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
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    return pocDb.listPermanentBlocks({
      companyId: req.query.companyId,
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
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const b = req.body;
    if (!b?.companyId || !b?.permanentEmployeeId || !b?.dateFrom || !b?.dateTo || !b?.fromTime || !b?.toTime) {
      reply.status(400);
      return { kind: "validation", message: "companyId, permanentEmployeeId, dates, hours required" };
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
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.companyId || !req.query.dateFrom || !req.query.dateTo) {
      reply.status(400);
      return { kind: "validation", message: "companyId, dateFrom, dateTo required" };
    }
    return pocDb.listShifts(req.query.companyId, req.query.dateFrom, req.query.dateTo);
  },
);

app.post<{
  Body: {
    companyId: string;
    serviceGroupId: string;
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
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const b = req.body;
    if (!b?.companyId || !b?.serviceGroupId || !b?.dateFrom || !b?.fromTime || !b?.toTime) {
      reply.status(400);
      return { kind: "validation", message: "companyId, serviceGroupId, dateFrom, fromTime, toTime required" };
    }
    const result = pocDb.createShift({
      company_id: b.companyId,
      service_group_id: b.serviceGroupId,
      date_from: b.dateFrom,
      date_to: b.dateTo ?? b.dateFrom,
      from_time: b.fromTime,
      to_time: b.toTime,
      pause_from: b.pauseFrom ?? null,
      pause_to: b.pauseTo ?? null,
      capacity: b.capacity ?? 1,
      deadline: b.deadline ?? null,
      target_type: b.targetType ?? "NONE",
      target_employee_ids: b.targetEmployeeIds ?? [],
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
    if (req.body?.targetType) patch.target_type = req.body.targetType;
    if (req.body?.targetEmployeeIds) patch.target_employee_ids = req.body.targetEmployeeIds;
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

// GET /api/mystaffler-invites?companyId=
// Returns the PoC-DB invite/account status per employee for this company.
app.get<{ Querystring: { companyId?: string } }>(
  "/api/mystaffler-invites",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    return pocDb.listMyStafflerInvites(req.query.companyId);
  },
);

// POST /api/employees/:id/mystaffler-invite?companyId=
// Best-effort proxy to DPS' real invite endpoint, plus a PoC-DB upsert so the
// Pool overview can render the new status immediately.
app.post<{ Params: { id: string }; Querystring: { companyId?: string } }>(
  "/api/employees/:id/mystaffler-invite",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const companyId = req.query.companyId;
    if (!companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    let upstream: unknown = null;
    let upstreamError: unknown = null;
    try {
      upstream = await clientFor(session).rawAuthed<unknown>(
        "POST",
        `/api/companies/${companyId}/employees/${req.params.id}/mystaffler/invite`,
      );
    } catch (err) {
      upstreamError = err;
    }
    const invite = pocDb.upsertMyStafflerInvite(req.params.id, companyId, {
      status: "invited",
    });
    return { invite, upstream, upstreamError: upstreamError ? (asResponse(upstreamError).body) : null };
  },
);

// POST /api/employees/:id/mystaffler-resend-invite?companyId=
app.post<{ Params: { id: string }; Querystring: { companyId?: string } }>(
  "/api/employees/:id/mystaffler-resend-invite",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const companyId = req.query.companyId;
    if (!companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    let upstreamError: unknown = null;
    try {
      await clientFor(session).rawAuthed<unknown>(
        "POST",
        `/api/companies/${companyId}/employees/${req.params.id}/mystaffler/invite`,
      );
    } catch (err) {
      upstreamError = err;
    }
    const invite = pocDb.upsertMyStafflerInvite(req.params.id, companyId, {
      status: "invited",
    });
    return { invite, upstreamError: upstreamError ? (asResponse(upstreamError).body) : null };
  },
);

// GET /api/my-staffler/employees/:id/contracts?startDate=&endDate=
// Cross-company contracts for one employee — mirrors mockup MyStaffler week.
// Bumps the PoC-DB `last_login_at` so the company-side Pool "Last login"
// column shows when this employee last opened their MyStaffler view.
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
      const out = await clientFor(session).listEmployeeContractsCrossCompany({
        employeeId: req.params.id,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
      pocDb.touchMyStafflerLogin(req.params.id);
      return out;
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
    // "Toog Gent" instead of "sg-…-uuid". One pass over service_groups
    // is fine — the PoC has dozens, not thousands.
    const sgById = new Map(
      pocDb.raw().service_groups.map((sg) => [sg.id, sg] as const),
    );
    // Same login-touch as /api/my-staffler/employees/:id/contracts —
    // viewing my-shifts in the preview counts as the employee being
    // present in their MyStaffler view.
    pocDb.touchMyStafflerLogin(employeeId);
    return targeted.map((s) => {
      const sg = sgById.get(s.service_group_id);
      return {
        shift: {
          ...s,
          service_group_name: sg?.name ?? null,
          service_group_city: sg?.city ?? null,
        },
        application: appByShift.get(s.id) ?? null,
      };
    });
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

// POST /api/employees/:id/mystaffler-mark-active?companyId=
// Test/demo helper — flips the PoC-DB status to "active" so the Pool overview
// shows the green "Account active" badge without needing the employee to
// actually accept the invite via the MyStaffler app.
app.post<{ Params: { id: string }; Querystring: { companyId?: string } }>(
  "/api/employees/:id/mystaffler-mark-active",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    const companyId = req.query.companyId;
    if (!companyId) {
      reply.status(400);
      return { kind: "validation", message: "companyId required" };
    }
    return pocDb.upsertMyStafflerInvite(req.params.id, companyId, {
      status: "active",
      accepted_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    });
  },
);

// ── static serving (alleen als Angular gebouwd is) ──────────────────────

const distRoot = join(__dirname, "..", "..", "dist", "frontend", "browser");
const distExists = existsSync(distRoot);
if (distExists) {
  await app.register(staticPlugin, {
    root: distRoot,
    prefix: "/",
  });
  app.log.info(`Serving Angular SPA from ${distRoot}`);
} else {
  app.log.warn(
    `Angular dist not found at ${distRoot}. Run \`cd frontend && npm run build\` to enable static serving. Until then, use \`ng serve\` on :4200 with proxy.conf.json.`,
  );
}

// Single not-found handler that covers both modes:
//
//  1. `/api/*` paths we don't have a specific handler for → pass through to
//     DPS using the user's cookie session. This keeps the frontend working
//     against the full DPS surface (notification preferences, invitations,
//     contract confirmation counts, etc.) without having to enumerate every
//     endpoint in this proxy.
//  2. Everything else: if `dist/` exists, fall back to `index.html` so the
//     Angular router can handle deep links. Otherwise a plain 404.
//
// The pass-through is a safety net only — explicit handlers above (login,
// poc-db tables, contract/employees wrappers) take priority because they
// add cookie-session logic, validation, or PoC-DB writes that DPS doesn't
// know about. For paths we've intentionally not wrapped (e.g. read-only
// reference endpoints), this avoids a stream of "Route not found" 404s
// silently breaking the frontend.
const PASSTHROUGH_VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
app.setNotFoundHandler(async (req, reply) => {
  if (!req.url.startsWith("/api")) {
    if (distExists) return reply.sendFile("index.html");
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
console.log(`Dev: run \`cd frontend && npm install && npm run start\` (port 4200)`);
console.log(`Prod-like: run \`cd frontend && npm run build\` then refresh this server`);
