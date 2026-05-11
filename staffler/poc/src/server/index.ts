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
// dus we hoeven geen extra CORS toe te staan. Maar voor flexibiliteit wel
// een lijstje als je een andere origin nodig hebt.
const allowedDevOrigins = (process.env.DEV_ORIGINS ?? "http://localhost:4200")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// -- session store: cookie -> skey + cached profile --

interface Session {
  skey: string;
  username: string;
  profileJson?: string; // gecached zodat /api/me snel is
}

const sessions = new Map<string, Session>();

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
app.get<{ Querystring: { companyId: string; nameLike?: string; page?: string; size?: string } }>(
  "/api/employees",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    try {
      return await clientFor(session).listEmployees({
        companyId: req.query.companyId,
        nameLike: req.query.nameLike,
        page: req.query.page ? parseInt(req.query.page) : 0,
        size: req.query.size ? parseInt(req.query.size) : 20,
      });
    } catch (err) {
      const e = asResponse(err);
      reply.status(e.status);
      return e.body;
    }
  },
);

// GET /api/contracts
app.get<{ Querystring: { companyId: string; startDate: string; endDate: string } }>(
  "/api/contracts",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    try {
      return await clientFor(session).listContracts({
        companyId: req.query.companyId,
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
    return pocDb.createShift({
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

// Availabilities
app.get<{ Querystring: { employeeId?: string; from?: string; to?: string } }>(
  "/api/availabilities",
  async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: "unauthenticated" }; }
    if (!req.query.employeeId) {
      reply.status(400);
      return { kind: "validation", message: "employeeId required" };
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
if (existsSync(distRoot)) {
  await app.register(staticPlugin, {
    root: distRoot,
    prefix: "/",
  });

  // SPA fallback: alles wat niet matcht en niet onder /api zit, serve index.html
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      reply.status(404).send({ kind: "not_found", path: req.url });
      return;
    }
    reply.sendFile("index.html");
  });

  app.log.info(`Serving Angular SPA from ${distRoot}`);
} else {
  app.log.warn(
    `Angular dist not found at ${distRoot}. Run \`cd frontend && npm run build\` to enable static serving. Until then, use \`ng serve\` on :4200 with proxy.conf.json.`,
  );
}

// boot

await app.listen({ port, host: "0.0.0.0" });
console.log(`Staffler PoC backend listening on http://localhost:${port}`);
console.log(`Gateway: ${gateway}`);
console.log(`Env: ${env}`);
console.log(`Dev: run \`cd frontend && npm install && npm run start\` (port 4200)`);
console.log(`Prod-like: run \`cd frontend && npm run build\` then refresh this server`);
