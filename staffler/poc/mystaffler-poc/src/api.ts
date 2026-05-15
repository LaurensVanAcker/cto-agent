/**
 * Tiny API client. Same-origin `/api/*` because serve.mjs proxies to the
 * Fastify backend on :5173 (and on Vercel/Cloudflare the static + the
 * proxy can be split via rewrites). All calls send cookies so the
 * stub-login session is reused.
 */

const BASE = '/api';

/** Error subtype that carries the response status + parsed body so
 *  callers can do `err.status === 423` without re-fetching. */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...((init.headers ?? {}) as Record<string, string>),
    },
    ...init,
  });
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}`, res.status, body);
  }
  return body as T;
}

export const api = {
  /**
   * Real employee login — calls `/publicapi/employees/users/login` via
   * the Fastify proxy. Returns:
   *   { authStatus: 'SUCCESS', employee }            — logged in, cookie set
   *   { authStatus: 'FORCE_PASSWORD_RESET', session, username }
   *                                                  — must call setPassword
   * On 401 / 423 / 5xx we throw a typed error the caller can branch on.
   */
  login(username, password) {
    return call('/employee-login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  /** Finalises the force-reset flow. The Cognito session is held in the
   *  HTTP-only cookie set by the prior /employee-login response — the
   *  client only ships the new password. */
  setPassword(password) {
    return call('/employee-set-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  /** "Wachtwoord vergeten" step 1 — Cognito mails a confirmation code.
   *  Always returns ok (server hides upstream errors to avoid account
   *  enumeration). */
  forgotPassword(username) {
    return call('/employee-reset-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  },

  /** "Wachtwoord vergeten" step 2 — submit code + new password. */
  confirmForgotPassword(username, newPassword, confirmationCode) {
    return call('/employee-confirm-reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, newPassword, confirmationCode }),
    });
  },

  logout() {
    return call('/logout', { method: 'POST' });
  },

  /** Identity of the currently-logged-in employee. Falls back to whatever
   *  is in localStorage when the upstream call 401s. */
  me() {
    return call('/me');
  },

  /** BCJ-19451 — update mutable personal details. Server bubbles the
   *  upstream error (typically 405 if the gateway hasn't enabled the
   *  endpoint yet) so the UI can show a friendly toast. */
  updateMe(payload) {
    return call('/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /** BCJ-19517 — public Firebase Web SDK config + a flag telling the
   *  client whether FCM is wired in this env. `enabled: false`
   *  means "skip FCM setup" so a demo without prod Firebase keys
   *  doesn't crash with a missing-config error. */
  fcmConfig() {
    return call('/fcm-config');
  },

  /** Send the device-specific FCM registration token to the backend so
   *  it can be paired with the employee's invite rows for outbound
   *  push from the company side. */
  fcmSubscribe(employeeId, token) {
    return call('/fcm-subscribe', {
      method: 'POST',
      body: JSON.stringify({ employeeId, token }),
    });
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

  /** Derived notification feed (new open shifts + application state
   *  transitions). Server returns max 30 entries, newest first. */
  notifications(employeeId) {
    return call(`/notifications?employeeId=${encodeURIComponent(employeeId)}`);
  },
};
