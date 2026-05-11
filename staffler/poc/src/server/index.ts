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
