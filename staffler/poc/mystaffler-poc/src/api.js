/**
 * Tiny API client. Same-origin `/api/*` because serve.mjs proxies to the
 * Fastify backend on :5173 (and on Vercel/Cloudflare the static + the
 * proxy can be split via rewrites). All calls send cookies so the
 * stub-login session is reused.
 */

const BASE = '/api';

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  /** Stub login — accepts any creds. Returns the employee identity that
   *  is stored in localStorage and used for every subsequent call. */
  stubLogin(email, password) {
    return call('/mystaffler-stub-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  logout() {
    return call('/logout', { method: 'POST' });
  },

  /** Open shifts targeted at this employee (broadcast SELECTION or
   *  ALL_POOL). Returns `[{ shift, application }]`. */
  myShifts(employeeId) {
    return call(`/my-shifts?employeeId=${encodeURIComponent(employeeId)}`);
  },

  /** Apply (kandidaat stellen) for an open shift. */
  apply(shiftId, employeeId, note) {
    return call(`/shifts/${encodeURIComponent(shiftId)}/apply`, {
      method: 'POST',
      body: JSON.stringify({ employeeId, note }),
    });
  },

  /** Withdraw the candidature. */
  withdraw(shiftId, employeeId) {
    return call(`/shifts/${encodeURIComponent(shiftId)}/apply`, {
      method: 'DELETE',
      body: JSON.stringify({ employeeId }),
    });
  },

  /** Availabilities for this employee, optionally filtered by date window. */
  listAvailabilities(employeeId, from, to) {
    const qs = new URLSearchParams({ employeeId });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return call(`/availabilities?${qs}`);
  },

  createAvailability({ employeeId, date, fromTime, toTime }) {
    return call('/availabilities', {
      method: 'POST',
      body: JSON.stringify({ employeeId, date, fromTime, toTime }),
    });
  },

  removeAvailability(id) {
    return call(`/availabilities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
