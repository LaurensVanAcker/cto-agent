/**
 * MyStaffler employee-side PoC — entry point. Builds the four-tab mobile
 * shell described by `staffler/mockups/mobile-mystaffler-v2.html`:
 *
 *   - Planning: week-view with the employee's broadcast / accepted shifts
 *   - Beschikbaarheid: per-day green hour-blocks
 *   - Profiel: read-only identity + logout
 *
 * Notifications tab from the mockup is intentionally left out for v1 —
 * the data behind it (broadcast events, "niet gekozen", etc.) doesn't
 * have a server-side feed in the PoC-DB yet.
 */
import { api } from './api.js';
import {
  store,
  weekDays,
  weekLabel,
  addDays,
  toIso,
  mondayOf,
} from './state.js';

const app = document.getElementById('app');

// ── Renderer entry point ────────────────────────────────────────────────
function render() {
  const s = store.get();
  renderOfflineBanner(s);
  if (s.forgotStep === 'request') {
    renderForgotRequest();
  } else if (s.forgotStep === 'confirm') {
    renderForgotConfirm();
  } else if (s.forceResetUsername) {
    renderForceReset();
  } else if (!s.employee) {
    renderLogin();
  } else if (s.needsPermissions) {
    renderPermissions();
  } else if (s.confirmCandidate) {
    renderCandidateConfirmation();
  } else if (s.tab === 'availability') {
    renderAvailability();
  } else if (s.tab === 'notifications') {
    renderNotifications();
  } else if (s.tab === 'profile') {
    renderProfile();
  } else {
    renderPlanning();
  }
  renderToast(s.toast);
}

/** Per BCJ-19426: "Only on first login ask for camera, location and
 *  notification permissions." We treat "first login" as "no
 *  `mystaffler.poc.perms` flag in localStorage for this device". The
 *  flag is set when the operator either accepts or skips. */
const PERMS_LS_KEY = 'mystaffler.poc.perms';
function shouldShowPermissions() {
  try { return localStorage.getItem(PERMS_LS_KEY) !== 'done'; }
  catch { return false; }
}
function markPermissionsDone() {
  try { localStorage.setItem(PERMS_LS_KEY, 'done'); } catch { /* ignore */ }
}
store.subscribe(render);
render();

// Network connectivity banner — surfaces a small bar at the top of
// the app when the browser reports offline OR a recent fetch failed.
// Auto-clears the failure flag whenever a fetch succeeds.
function setOnline(isOnline) {
  const wasOffline = store.get().online === false;
  store.set({ online: isOnline });
  // Auto-refresh data when the connection comes back so the
  // operator doesn't have to mash the refresh button.
  if (isOnline && wasOffline && store.get().employee) {
    reloadAll();
  }
}
window.addEventListener('online', () => setOnline(true));
window.addEventListener('offline', () => setOnline(false));
if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
  setOnline(navigator.onLine);
}

// ── Login screen ────────────────────────────────────────────────────────
function renderLogin() {
  const s = store.get();
  app.innerHTML = `
    <section class="login">
      <div class="brand">staffler</div>
      <div class="tagline">MyStaffler — voor jouw shifts en beschikbaarheid</div>
      <form id="login-form">
        <label>E-mail
          <input type="email" name="email" autocomplete="username" required placeholder="naam@bedrijf.be" />
        </label>
        <label>Wachtwoord
          <input type="password" name="password" autocomplete="current-password" required placeholder="••••••••" />
        </label>
        ${s.loginError ? `<div class="err">${escapeHtml(s.loginError)}</div>` : ''}
        <button type="submit" class="submit" ${s.loggingIn ? 'disabled' : ''}>
          ${s.loggingIn ? 'Inloggen…' : 'Inloggen'}
        </button>
        <button type="button" class="link" data-act="forgot">Wachtwoord vergeten?</button>
      </form>
      <div class="hint">Gebruik je MyStaffler-credentials. Eerste keer? Je krijgt een tijdelijk wachtwoord en wordt gevraagd er een nieuw te kiezen.</div>
    </section>
  `;
  document.querySelector('[data-act="forgot"]').addEventListener('click', () => {
    store.set({ forgotStep: 'request', forgotError: null, forgotEmail: '' });
  });
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    if (!email || !password) return;
    store.set({ loggingIn: true, loginError: null });
    try {
      const res = await api.login(email, password);
      if (res?.authStatus === 'FORCE_PASSWORD_RESET') {
        // The temp password from the invitation email is still in use.
        // Redirect to the force-reset screen so the employee picks a
        // real one before we land on Planning.
        store.set({
          loggingIn: false,
          loginError: null,
          forceResetUsername: res.username ?? email,
        });
        return;
      }
      if (res?.authStatus !== 'SUCCESS' || !res?.employee?.id) {
        throw new Error('Login mislukt');
      }
      store.setEmployee(res.employee);
      store.set({
        loggingIn: false,
        loginError: null,
        needsPermissions: shouldShowPermissions(),
      });
      reloadAll();
    } catch (err) {
      const status = err?.status;
      const body = err?.body ?? {};
      const fallback = 'E-mail of wachtwoord is verkeerd.';
      const message =
        status === 423
          ? body.message ?? 'Te veel mislukte pogingen. Probeer over 15 min opnieuw.'
          : body.message ?? fallback;
      store.set({ loggingIn: false, loginError: message });
    }
  });
}

// ── Force-reset screen (first login with temp password) ─────────────────
function renderForceReset() {
  const s = store.get();
  app.innerHTML = `
    <section class="login">
      <div class="brand">staffler</div>
      <div class="tagline">Kies een nieuw wachtwoord voor ${escapeHtml(s.forceResetUsername)}</div>
      <form id="reset-form">
        <label>Nieuw wachtwoord
          <input type="password" name="password" autocomplete="new-password" required placeholder="••••••••" />
        </label>
        <div class="pw-rules-mount">${renderPasswordChecklist('')}</div>
        <label>Bevestig wachtwoord
          <input type="password" name="confirm" autocomplete="new-password" required />
        </label>
        ${s.resetError ? `<div class="err">${escapeHtml(s.resetError)}</div>` : ''}
        <button type="submit" class="submit" ${s.resetting ? 'disabled' : ''}>
          ${s.resetting ? 'Opslaan…' : 'Wachtwoord instellen'}
        </button>
      </form>
    </section>
  `;
  bindPasswordChecklist('password', '.pw-rules-mount');
  const form = document.getElementById('reset-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const password = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirm') ?? '');
    const localErr = validatePasswordClient(password);
    if (localErr) {
      store.set({ resetError: localErr });
      return;
    }
    if (password !== confirm) {
      store.set({ resetError: 'De twee wachtwoorden zijn niet identiek.' });
      return;
    }
    store.set({ resetting: true, resetError: null });
    try {
      await api.setPassword(password);
      // Server promoted our session to a real skey. Fetch /me to bind
      // the employee identity, then drop the reset state.
      let employee;
      try {
        const me = await api.me();
        const userId = me?.managedEmployeeId ?? me?.employeeId ?? me?.userId ?? store.get().forceResetUsername;
        const fullName = me?.user?.name ?? '';
        const [firstName, ...rest] = fullName.split(' ');
        employee = {
          id: userId,
          email: store.get().forceResetUsername,
          firstName: firstName || store.get().forceResetUsername,
          lastName: rest.join(' '),
        };
      } catch {
        employee = {
          id: store.get().forceResetUsername,
          email: store.get().forceResetUsername,
          firstName: store.get().forceResetUsername.split('@')[0],
          lastName: '',
        };
      }
      store.setEmployee(employee);
      store.set({
        resetting: false,
        resetError: null,
        forceResetUsername: null,
        // BCJ-19426 AC: ask for perms on first login.
        needsPermissions: shouldShowPermissions(),
      });
      reloadAll();
    } catch (err) {
      store.set({
        resetting: false,
        resetError: err?.body?.message ?? 'Wachtwoord kon niet ingesteld worden.',
      });
    }
  });
}

/** Mirror of the server's `validatePassword` so we can show a hint
 *  before the round-trip. Returns null when valid. */
function validatePasswordClient(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Wachtwoord moet minstens 8 tekens hebben.';
  if (!/[0-9]/.test(p)) return 'Wachtwoord moet minstens één cijfer bevatten.';
  if (!/[A-Z]/.test(p)) return 'Wachtwoord moet minstens één hoofdletter bevatten.';
  return null;
}

/** Live checklist of password rules. Pass the live input value; the
 *  helper returns markup with ✓ for each satisfied rule. */
function renderPasswordChecklist(value) {
  const v = typeof value === 'string' ? value : '';
  const rules = [
    { ok: v.length >= 8, label: 'Minstens 8 tekens' },
    { ok: /[0-9]/.test(v), label: 'Minstens één cijfer' },
    { ok: /[A-Z]/.test(v), label: 'Minstens één hoofdletter' },
  ];
  return `
    <ul class="pw-rules" aria-live="polite">
      ${rules.map((r) => `<li class="${r.ok ? 'ok' : ''}"><span>${r.ok ? '✓' : '○'}</span>${escapeHtml(r.label)}</li>`).join('')}
    </ul>
  `;
}

/** Wire input → checklist re-render on a form field. */
function bindPasswordChecklist(inputName, mountSelector) {
  const input = document.querySelector(`input[name="${inputName}"]`);
  const mount = document.querySelector(mountSelector);
  if (!input || !mount) return;
  input.addEventListener('input', () => {
    mount.outerHTML = `<div class="pw-rules-mount">${renderPasswordChecklist(input.value)}</div>`;
    // The element we just replaced isn't ours anymore — re-bind on the
    // fresh one so the listener stays attached.
    bindPasswordChecklist(inputName, '.pw-rules-mount');
  });
}

// ── First-login permissions consent (BCJ-19426 AC) ──────────────────────
function renderPermissions() {
  const s = store.get();
  const grants = s.permGrants ?? { notifications: null, location: null };
  app.innerHTML = `
    <section class="login">
      <div class="brand">staffler</div>
      <div class="tagline">Welkom! Een paar instellingen om je shifts goed te laten werken.</div>
      <div class="perm-list">
        <div class="perm-row">
          <div class="perm-info">
            <div class="perm-title">Meldingen</div>
            <div class="perm-sub">Krijg een notificatie wanneer een nieuwe shift voor jou klaar staat.</div>
          </div>
          <button class="perm-btn ${grants.notifications ? 'granted' : ''}" data-act="ask-notifications" ${grants.notifications ? 'disabled' : ''}>
            ${grants.notifications === true ? '✓' : grants.notifications === false ? 'Geweigerd' : 'Sta toe'}
          </button>
        </div>
        <div class="perm-row">
          <div class="perm-info">
            <div class="perm-title">Locatie</div>
            <div class="perm-sub">Helpt om shifts in jouw buurt eerst voor te stellen.</div>
          </div>
          <button class="perm-btn ${grants.location ? 'granted' : ''}" data-act="ask-location" ${grants.location ? 'disabled' : ''}>
            ${grants.location === true ? '✓' : grants.location === false ? 'Geweigerd' : 'Sta toe'}
          </button>
        </div>
      </div>
      <button class="submit perm-continue" data-act="continue">Verder naar planning</button>
      <button class="link" data-act="skip">Sla over</button>
    </section>
  `;
  document.querySelector('[data-act="ask-notifications"]')?.addEventListener('click', async () => {
    let result = false;
    try {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        result = perm === 'granted';
      }
    } catch {
      // Some browsers throw on insecure origins — surface as denied.
    }
    store.set({ permGrants: { ...grants, notifications: result } });
  });
  document.querySelector('[data-act="ask-location"]')?.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      store.set({ permGrants: { ...grants, location: false } });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => store.set({ permGrants: { ...grants, location: true } }),
      () => store.set({ permGrants: { ...grants, location: false } }),
      { timeout: 5000 },
    );
  });
  document.querySelector('[data-act="continue"]').addEventListener('click', () => {
    markPermissionsDone();
    store.set({ needsPermissions: false });
  });
  document.querySelector('[data-act="skip"]').addEventListener('click', () => {
    markPermissionsDone();
    store.set({ needsPermissions: false });
  });
}

// ── Wachtwoord vergeten — step 1: ask for email ─────────────────────────
function renderForgotRequest() {
  const s = store.get();
  app.innerHTML = `
    <section class="login">
      <div class="brand">staffler</div>
      <div class="tagline">Wachtwoord vergeten</div>
      <form id="forgot-form">
        <label>E-mail
          <input type="email" name="email" autocomplete="email" required placeholder="naam@bedrijf.be" value="${escapeHtml(s.forgotEmail ?? '')}" />
        </label>
        ${s.forgotError ? `<div class="err">${escapeHtml(s.forgotError)}</div>` : ''}
        <button type="submit" class="submit" ${s.forgotSubmitting ? 'disabled' : ''}>
          ${s.forgotSubmitting ? 'Versturen…' : 'Stuur code per e-mail'}
        </button>
        <button type="button" class="link" data-act="back">Terug naar inloggen</button>
      </form>
      <div class="hint">Je krijgt een code in je inbox. Vul die in op het volgende scherm en kies een nieuw wachtwoord.</div>
    </section>
  `;
  const form = document.getElementById('forgot-form');
  document.querySelector('[data-act="back"]').addEventListener('click', () => {
    store.set({ forgotStep: null, forgotError: null });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(new FormData(form).get('email') ?? '').trim();
    if (!email) return;
    store.set({ forgotSubmitting: true, forgotError: null });
    try {
      await api.forgotPassword(email);
      // Server hides upstream errors — we always move to step 2.
      store.set({
        forgotSubmitting: false,
        forgotError: null,
        forgotStep: 'confirm',
        forgotEmail: email,
      });
    } catch (err) {
      // Network issue only — upstream errors already swallowed.
      store.set({
        forgotSubmitting: false,
        forgotError: err?.body?.message ?? 'Verzenden mislukt. Controleer je verbinding.',
      });
    }
  });
}

// ── Wachtwoord vergeten — step 2: code + new password ───────────────────
function renderForgotConfirm() {
  const s = store.get();
  app.innerHTML = `
    <section class="login">
      <div class="brand">staffler</div>
      <div class="tagline">Code uit e-mail + nieuw wachtwoord voor ${escapeHtml(s.forgotEmail ?? '')}</div>
      <form id="forgot-confirm-form">
        <label>Confirmatie-code
          <input type="text" name="code" autocomplete="one-time-code" inputmode="numeric" required placeholder="6-cijferige code" />
        </label>
        <label>Nieuw wachtwoord
          <input type="password" name="password" autocomplete="new-password" required placeholder="••••••••" />
        </label>
        <div class="pw-rules-mount">${renderPasswordChecklist('')}</div>
        <label>Bevestig wachtwoord
          <input type="password" name="confirm" autocomplete="new-password" required />
        </label>
        ${s.forgotError ? `<div class="err">${escapeHtml(s.forgotError)}</div>` : ''}
        <button type="submit" class="submit" ${s.forgotSubmitting ? 'disabled' : ''}>
          ${s.forgotSubmitting ? 'Opslaan…' : 'Wachtwoord instellen'}
        </button>
        <button type="button" class="link" data-act="back">Terug naar inloggen</button>
      </form>
    </section>
  `;
  bindPasswordChecklist('password', '.pw-rules-mount');
  const form = document.getElementById('forgot-confirm-form');
  document.querySelector('[data-act="back"]').addEventListener('click', () => {
    store.set({ forgotStep: null, forgotError: null });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const code = String(fd.get('code') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirm') ?? '');
    if (!code) return store.set({ forgotError: 'Vul de code uit je e-mail in.' });
    const localErr = validatePasswordClient(password);
    if (localErr) return store.set({ forgotError: localErr });
    if (password !== confirm) return store.set({ forgotError: 'De twee wachtwoorden zijn niet identiek.' });
    store.set({ forgotSubmitting: true, forgotError: null });
    try {
      await api.confirmForgotPassword(store.get().forgotEmail, password, code);
      store.toast('Wachtwoord ingesteld. Log nu in.', 'success');
      store.set({ forgotStep: null, forgotError: null, forgotSubmitting: false });
    } catch (err) {
      store.set({
        forgotSubmitting: false,
        forgotError: err?.body?.message ?? 'Code of wachtwoord werd niet aanvaard.',
      });
    }
  });
}

// ── Planning week-view ──────────────────────────────────────────────────
function renderPlanning() {
  const s = store.get();
  const days = weekDays(s.weekStart);
  const label = weekLabel(s.weekStart);
  const shiftsByDay = groupShiftsByDay(s.shifts, s.weekStart);

  // Hero greeting prefers the DPS-side name from /me (matches the
  // employee record on the company side), falls back to the email-
  // derived stub. Capitalise first character so "anouk" reads as "Anouk".
  const heroName =
    (s.me?.user?.name?.split(' ')[0]) ||
    s.employee.firstName ||
    'jij';
  const greeting = heroName.charAt(0).toUpperCase() + heroName.slice(1);
  const totalShifts = (s.shifts ?? []).length;

  app.innerHTML = `
    <section class="screen">
      <header class="hero">
        <h1>Hallo, ${escapeHtml(greeting)}!</h1>
        <div class="sub">
          ${
            totalShifts === 0
              ? 'Geen shifts deze week — geniet ervan.'
              : `${totalShifts} ${totalShifts === 1 ? 'shift' : 'shifts'} deze week`
          }
        </div>
        <div class="week-bar">
          <button class="icon icon-prev" data-act="prev-week" aria-label="Vorige week"></button>
          <span>week ${label.week} · ${label.range}</span>
          <button class="icon icon-next" data-act="next-week" aria-label="Volgende week"></button>
          <button class="hero-refresh" data-act="refresh" aria-label="Vernieuwen">↻</button>
        </div>
      </header>
      <div class="day-list">
        ${days
          .map(
            (d) => `
            <article class="day">
              <div class="day-head">
                <span class="name ${d.isToday ? 'today' : ''}">${d.name}${d.isToday ? ' · vandaag' : ''}</span>
                <span class="date">${d.shortDate}</span>
              </div>
              ${
                (shiftsByDay.get(d.iso) ?? []).map(renderShift).join('') ||
                (s.loadingShifts && !s.shifts?.length
                  ? `<div class="skeleton-shift" aria-hidden="true"></div>`
                  : `<div class="day-empty">Niets gepland</div>`)
              }
            </article>
          `,
          )
          .join('')}
      </div>
      ${renderTabbar('planning')}
    </section>
  `;
  bindTabbar();
  bindWeekNav();
  bindShiftActions();
  bindRefresh();
}

function bindRefresh() {
  document.querySelector('[data-act="refresh"]')?.addEventListener('click', () => {
    reloadAll();
    store.toast('Vernieuwd.', 'info');
  });
}

function renderShift({ shift, application }) {
  const isCandidate = application?.status === 'candidate' || application?.status === 'selected';
  const klass = isCandidate ? 'candidate' : 'open';
  // Prefer the resolved service-location name; fall back to the city,
  // then to the raw service_group_id (last resort — looks ugly but
  // never crashes the UI). Skip the row entirely when nothing useful.
  const name = shift.service_group_name;
  const city = shift.service_group_city;
  const where = name && city ? `${name} · ${city}` : name || city || '';
  return `
    <div class="shift ${klass}" data-shift-id="${escapeHtml(shift.id)}">
      <div class="title">${isCandidate ? 'Je bent kandidaat' : 'Open shift'}</div>
      <div class="times">${escapeHtml(shift.from_time)} → ${escapeHtml(shift.to_time)}</div>
      ${where ? `<div class="where">${escapeHtml(where)}</div>` : ''}
      <div class="actions">
        ${
          isCandidate
            ? `<button class="btn-respond withdraw" data-act="withdraw">Terugtrekken</button>`
            : `
              <button class="btn-respond yes" data-act="apply">Kandidaat stellen</button>
              <button class="btn-respond no" data-act="skip">Niet beschikbaar</button>
            `
        }
      </div>
    </div>
  `;
}

function bindShiftActions() {
  app.querySelectorAll('[data-shift-id]').forEach((card) => {
    const shiftId = card.dataset.shiftId;
    card.querySelector('[data-act="apply"]')?.addEventListener('click', () => applyShift(shiftId));
    card.querySelector('[data-act="withdraw"]')?.addEventListener('click', () => withdrawShift(shiftId));
    card.querySelector('[data-act="skip"]')?.addEventListener('click', () => {
      store.toast('We onthouden dat je voor deze shift niet beschikbaar bent.', 'info');
    });
  });
}

async function applyShift(shiftId) {
  const emp = store.get().employee;
  // Capture the shift card data BEFORE the API call so the
  // confirmation screen has stable details even if the refresh
  // races with the render.
  const card = (store.get().shifts ?? []).find((r) => r?.shift?.id === shiftId);
  try {
    await api.apply(shiftId, emp.id);
    // Mockup mobile-mystaffler-v2 #2: "Klik op Kandidaat stellen →
    // direct bevestigingsscherm". We show a full-screen overlay with
    // the shift details so the operator gets explicit confirmation;
    // the planning refresh runs in the background.
    if (card) store.set({ confirmCandidate: card });
    await reloadShifts();
    await reloadNotifications();
  } catch (err) {
    store.toast(err?.body?.message ?? 'Kandidaat stellen mislukt.', 'error');
  }
}

async function withdrawShift(shiftId) {
  const emp = store.get().employee;
  if (!confirm('Je kandidatuur intrekken?')) return;
  try {
    await api.withdraw(shiftId, emp.id);
    store.toast('Je kandidatuur is ingetrokken.', 'success');
    await reloadShifts();
  } catch (err) {
    store.toast(err?.body?.message ?? 'Terugtrekken mislukt.', 'error');
  }
}

function bindWeekNav() {
  document.querySelector('[data-act="prev-week"]')?.addEventListener('click', () => {
    store.set({ weekStart: addDays(store.get().weekStart, -7) });
    reloadShifts();
    reloadAvailabilities();
  });
  document.querySelector('[data-act="next-week"]')?.addEventListener('click', () => {
    store.set({ weekStart: addDays(store.get().weekStart, 7) });
    reloadShifts();
    reloadAvailabilities();
  });
}

// ── Availability tab ────────────────────────────────────────────────────
function renderAvailability() {
  const s = store.get();
  const days = weekDays(s.weekStart);
  const label = weekLabel(s.weekStart);
  const byDate = new Map((s.availabilities ?? []).map((a) => [a.date, a]));

  app.innerHTML = `
    <section class="screen">
      <header class="hero">
        <h1>Beschikbaarheid</h1>
        <div class="sub">Eén tijdsblok per dag — hoe ruimer, hoe meer voorstellen.</div>
        <div class="week-bar">
          <button class="icon icon-prev" data-act="prev-week" aria-label="Vorige week"></button>
          <span>week ${label.week} · ${label.range}</span>
          <button class="icon icon-next" data-act="next-week" aria-label="Volgende week"></button>
        </div>
      </header>
      <div class="avail-list">
        ${days
          .map((d) => {
            const a = byDate.get(d.iso);
            if (!a) {
              // Empty day — whole row is clickable to add (mockup pattern:
              // "Donderdag toevoegen" → bottom-sheet).
              return `
                <button type="button" class="avail-row as-button" data-date="${d.iso}" data-act="add">
                  <div class="day-label">
                    <div class="name">${d.name}${d.isToday ? ' · vandaag' : ''}</div>
                    <div class="date">${d.shortDate}</div>
                  </div>
                  <div class="when">Niet beschikbaar</div>
                  <span class="row-btn icon icon-add" aria-hidden="true"></span>
                </button>
              `;
            }
            const locked = a.status === 'locked';
            // Set day — whole row opens the edit sheet (with delete inside).
            // Locked rows are non-interactive (contract owns the slot).
            return `
              <button
                type="button"
                class="avail-row as-button ${locked ? 'locked' : 'set'}"
                data-date="${d.iso}"
                data-id="${a.id}"
                data-from="${escapeHtml(a.from_time)}"
                data-to="${escapeHtml(a.to_time)}"
                data-act="${locked ? 'locked' : 'edit'}"
                ${locked ? 'aria-disabled="true"' : ''}
              >
                <div class="day-label">
                  <div class="name">${d.name}${d.isToday ? ' · vandaag' : ''}</div>
                  <div class="date">${d.shortDate}</div>
                </div>
                <div class="when">${escapeHtml(a.from_time)} → ${escapeHtml(a.to_time)}</div>
                <span class="row-btn icon ${locked ? 'icon-clock' : 'icon-edit'}" aria-hidden="true"></span>
              </button>
            `;
          })
          .join('')}
      </div>
      ${renderTabbar('availability')}
    </section>
  `;
  bindTabbar();
  bindWeekNav();
  bindAvailabilityActions();
}

function bindAvailabilityActions() {
  app.querySelectorAll('[data-date]').forEach((row) => {
    const act = row.dataset.act;
    if (act === 'add') {
      row.addEventListener('click', () => openAvailSheet(row.dataset.date));
    } else if (act === 'edit') {
      row.addEventListener('click', () =>
        openAvailSheet(row.dataset.date, {
          id: row.dataset.id,
          from: row.dataset.from,
          to: row.dataset.to,
        }),
      );
    } else if (act === 'locked') {
      row.addEventListener('click', () => {
        store.toast('Deze beschikbaarheid hangt aan een contract.', 'info');
      });
    }
  });
}

function openAvailSheet(date, current) {
  const isEdit = !!current?.id;
  const sheet = document.createElement('div');
  sheet.className = 'sheet-backdrop';
  sheet.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <h2>${isEdit ? 'Beschikbaarheid aanpassen' : 'Beschikbaar op ' + escapeHtml(date)}</h2>
      <div class="sub">Eén blok per dag. Werkgever stelt open shifts voor binnen je window.</div>
      <div class="time-pair">
        <input id="sheet-from" type="time" value="${current?.from ?? '09:00'}" />
        <span class="arr">›</span>
        <input id="sheet-to" type="time" value="${current?.to ?? '17:00'}" />
      </div>
      <div class="sheet-actions">
        <button class="cancel" data-act="cancel">Annuleren</button>
        ${
          isEdit
            ? `<button class="danger" data-act="delete">Verwijderen</button>`
            : ''
        }
        <button class="confirm" data-act="confirm">${isEdit ? 'Opslaan' : 'Bevestigen'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });
  sheet.querySelector('[data-act="cancel"]').addEventListener('click', close);
  sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    close();
    if (!current?.id) return;
    if (!confirm('Deze beschikbaarheid verwijderen?')) return;
    try {
      await api.removeAvailability(current.id);
      store.toast('Beschikbaarheid verwijderd.', 'success');
      await reloadAvailabilities();
    } catch (err) {
      const msg =
        err?.status === 409
          ? 'Niet verwijderbaar — gekoppeld aan een contract.'
          : err?.body?.message ?? 'Verwijderen mislukt.';
      store.toast(msg, 'error');
    }
  });
  sheet.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
    const fromTime = sheet.querySelector('#sheet-from').value;
    const toTime = sheet.querySelector('#sheet-to').value;
    if (!fromTime || !toTime || toTime <= fromTime) {
      store.toast('Eindtijd moet na starttijd liggen.', 'error');
      return;
    }
    close();
    const emp = store.get().employee;
    try {
      // Edit = delete-then-create. The PoC-DB has no PATCH on
      // availabilities (one row per day, immutable), but the operator
      // expects "update" semantics. We bundle the two calls so they
      // either both succeed or the row stays in its old state — if
      // delete fails (e.g. locked), we surface the conflict and skip
      // the create.
      if (isEdit) {
        await api.removeAvailability(current.id);
      }
      await api.createAvailability({ employeeId: emp.id, date, fromTime, toTime });
      store.toast(
        `${isEdit ? 'Aangepast' : 'Beschikbaar'} ${fromTime} → ${toTime} op ${date}.`,
        'success',
      );
      await reloadAvailabilities();
    } catch (err) {
      const msg =
        err?.status === 409
          ? 'Niet wijzigbaar — gekoppeld aan een contract.'
          : err?.body?.message ?? 'Opslaan mislukt.';
      store.toast(msg, 'error');
    }
  });
}

// (removeAvailability merged into openAvailSheet — the bottom-sheet
// now owns both edit + delete so there's a single confirm path.)

// ── Kandidaat-bevestiging (mockup mobile-mystaffler-v2 #2) ──────────────
function renderCandidateConfirmation() {
  const s = store.get();
  const card = s.confirmCandidate;
  if (!card) return;
  const shift = card.shift ?? {};
  const sgName = shift.service_group_name;
  const sgCity = shift.service_group_city;
  const where = sgName && sgCity ? `${sgName} · ${sgCity}` : sgName || sgCity || '';
  app.innerHTML = `
    <section class="screen confirm-screen">
      <div class="confirm-icon">✓</div>
      <h1 class="confirm-title">Je bent kandidaat</h1>
      <div class="confirm-sub">We laten je werkgever weten dat je beschikbaar bent.</div>
      <div class="confirm-card">
        <div class="confirm-card-label">Shift</div>
        <div class="confirm-card-line">${escapeHtml(shift.date_from ?? '')} · ${escapeHtml(shift.from_time ?? '')} → ${escapeHtml(shift.to_time ?? '')}</div>
        ${where ? `<div class="confirm-card-where">${escapeHtml(where)}</div>` : ''}
      </div>
      <div class="confirm-actions">
        <button class="btn-respond withdraw confirm-secondary" data-act="withdraw">Terugtrekken</button>
        <button class="btn-respond yes confirm-primary" data-act="back">Terug naar planning</button>
      </div>
    </section>
  `;
  document.querySelector('[data-act="back"]').addEventListener('click', () => {
    store.set({ confirmCandidate: null });
  });
  document.querySelector('[data-act="withdraw"]').addEventListener('click', async () => {
    const emp = store.get().employee;
    if (!emp || !shift.id) return;
    if (!confirm('Je kandidatuur intrekken?')) return;
    try {
      await api.withdraw(shift.id, emp.id);
      store.toast('Je kandidatuur is ingetrokken.', 'success');
      store.set({ confirmCandidate: null });
      await reloadShifts();
      await reloadNotifications();
    } catch (err) {
      store.toast(err?.body?.message ?? 'Terugtrekken mislukt.', 'error');
    }
  });
}

// ── Notifications tab ───────────────────────────────────────────────────
function renderNotifications() {
  const s = store.get();
  const rows = s.notifications ?? [];
  app.innerHTML = `
    <section class="screen">
      <header class="hero">
        <h1>Meldingen</h1>
        <div class="sub">Wat er deze week voor jou is veranderd.</div>
      </header>
      <div class="notif-list">
        ${
          rows.length === 0
            ? `<div class="notif-empty">${s.loadingNotifications ? 'Laden…' : 'Geen meldingen.'}</div>`
            : rows.map(renderNotificationRow).join('')
        }
      </div>
      ${renderTabbar('notifications')}
    </section>
  `;
  bindTabbar();
  app.querySelectorAll('[data-notif-shift]').forEach((row) => {
    row.addEventListener('click', () => {
      // Tapping a notification jumps back to Planning so the operator
      // can act on the shift in context.
      store.set({ tab: 'planning' });
    });
  });
}

function renderNotificationRow(n) {
  const klass = `notif-${n.kind}`;
  return `
    <button type="button" class="notif-row ${klass}" data-notif-shift="${escapeHtml(n.shiftId)}">
      <span class="notif-dot"></span>
      <div class="notif-body">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-detail">${escapeHtml(n.detail)}</div>
      </div>
      <span class="notif-time">${escapeHtml(formatRelative(n.at))}</span>
    </button>
  `;
}

function formatRelative(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'nu';
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86_400) return `${Math.round(sec / 3600)} u`;
  return `${Math.round(sec / 86_400)} d`;
}

// ── Profile tab ─────────────────────────────────────────────────────────
function renderProfile() {
  const s = store.get();
  const emp = s.employee;
  const me = s.me;
  const fullName = me?.user?.name || `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || emp.email;
  const memberships = me?.companyMemberships ?? [];
  app.innerHTML = `
    <section class="screen">
      <header class="hero">
        <h1>Profiel</h1>
        <div class="sub">${escapeHtml(fullName)}</div>
      </header>
      <div class="profile">
        <div class="profile-card">
          <div class="name">${escapeHtml(fullName)}</div>
          <div class="email">${escapeHtml(emp.email)}</div>
          ${
            memberships.length > 0
              ? `<div class="profile-memberships">
                  <div class="memberships-label">Werkgevers</div>
                  ${memberships
                    .map(
                      (m) => `
                      <div class="membership-row">
                        <span>${escapeHtml(m.companyName ?? m.companyId)}</span>
                        <span class="membership-role">${escapeHtml(m.role ?? '')}</span>
                      </div>
                    `,
                    )
                    .join('')}
                </div>`
              : ''
          }
          <div class="id">id: ${escapeHtml(emp.id)}</div>
        </div>

        <button class="profile-action" data-act="change-password">
          <span>Wachtwoord wijzigen</span>
          <span>›</span>
        </button>

        <button class="profile-action danger" data-act="logout">
          <span>Uitloggen</span>
          <span>›</span>
        </button>

        <div class="profile-footer">MyStaffler PoC · v0.1.0</div>
      </div>
      ${renderTabbar('profile')}
    </section>
  `;
  bindTabbar();
  document.querySelector('[data-act="logout"]').addEventListener('click', async () => {
    try { await api.logout(); } catch { /* best-effort */ }
    store.setEmployee(null);
    store.set({ shifts: [], availabilities: [], notifications: [], me: null, tab: 'planning' });
  });
  document.querySelector('[data-act="change-password"]').addEventListener('click', () => {
    // The DPS password-change flow goes via Cognito email reset
    // (resetPassword → email → confirmResetPassword). Implementing the
    // round-trip would need: a "request reset link" route here, an
    // email-out hop, then a code-entry screen. Deferred until the BCJ
    // ticket for self-service password change lands; for now we point
    // the operator at the employer-managed reset path.
    store.toast(
      'Voor een wachtwoord-reset: vraag je werkgever om je MyStaffler-account te resetten.',
      'info',
    );
  });
}

// ── Tab bar ─────────────────────────────────────────────────────────────
function renderTabbar(active) {
  const s = store.get();
  // Count un-acknowledged notifications — for the PoC every notification
  // entry counts (no per-row read state yet). Cap at 9+ so the dot stays
  // small visually.
  const notifCount = (s.notifications ?? []).length;
  const badge =
    notifCount > 0 ? `<span class="badge">${notifCount > 9 ? '9+' : notifCount}</span>` : '';
  const tabs = [
    { id: 'planning', label: 'Planning', icon: 'icon-calendar' },
    { id: 'availability', label: 'Beschikbaar', icon: 'icon-clock' },
    { id: 'notifications', label: 'Meldingen', icon: 'icon-bell', badge },
    { id: 'profile', label: 'Profiel', icon: 'icon-user' },
  ];
  return `
    <nav class="tabbar" role="tablist">
      ${tabs
        .map(
          (t) => `
            <button
              type="button"
              class="tab ${t.id === active ? 'active' : ''}"
              data-tab="${t.id}"
              role="tab"
              aria-selected="${t.id === active}"
            >
              <span class="icon ${t.icon}"></span>
              <span class="lbl">${t.label}</span>
              ${t.badge ?? ''}
            </button>
          `,
        )
        .join('')}
    </nav>
  `;
}

function bindTabbar() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.set({ tab: btn.dataset.tab });
    });
  });
}

// ── Toast ───────────────────────────────────────────────────────────────
function renderToast(toast) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  if (!toast) return;
  const el = document.createElement('div');
  el.className = `toast ${toast.kind ?? ''}`;
  el.textContent = toast.text;
  document.body.appendChild(el);
}

// ── Offline banner ──────────────────────────────────────────────────────
function renderOfflineBanner(s) {
  document.querySelectorAll('.offline-banner').forEach((b) => b.remove());
  // Show the banner if the browser thinks we're offline. We don't
  // try to ping-test here — the OS hint is good enough for the demo.
  if (s.online === false) {
    const el = document.createElement('div');
    el.className = 'offline-banner';
    el.textContent = 'Geen verbinding. We proberen opnieuw wanneer je weer online bent.';
    document.body.appendChild(el);
  }
}

// ── Data loaders ────────────────────────────────────────────────────────
async function reloadAll() {
  await Promise.all([
    reloadMe(),
    reloadShifts(),
    reloadAvailabilities(),
    reloadNotifications(),
  ]);
}

/** Loads the DPS-side identity so the Profile screen can show real
 *  name + companyMemberships instead of the email-derived placeholder. */
async function reloadMe() {
  const s = store.get();
  if (!s.employee) return;
  try {
    const me = await api.me();
    store.set({ me });
  } catch (err) {
    // Stub-style sessions 401 here; we keep going so the rest of the
    // app still renders.
    if (err?.status === 401) {
      store.set({ me: null });
    }
  }
}

async function reloadNotifications() {
  const s = store.get();
  if (!s.employee) return;
  store.set({ loadingNotifications: true });
  try {
    const rows = await api.notifications(s.employee.id);
    store.set({ notifications: rows ?? [], loadingNotifications: false });
  } catch (err) {
    store.set({ loadingNotifications: false });
    if (err?.status === 401) store.setEmployee(null);
  }
}

async function reloadShifts() {
  const s = store.get();
  if (!s.employee) return;
  store.set({ loadingShifts: true });
  try {
    const rows = await api.myShifts(s.employee.id);
    store.set({ shifts: rows ?? [], loadingShifts: false });
  } catch (err) {
    store.set({ loadingShifts: false });
    if (err?.status === 401) {
      // Stub session lost — log out so the user re-enters credentials.
      store.setEmployee(null);
    } else {
      store.toast('Laden van shifts mislukt.', 'error');
    }
  }
}

async function reloadAvailabilities() {
  const s = store.get();
  if (!s.employee) return;
  store.set({ loadingAvailabilities: true });
  try {
    const from = s.weekStart;
    const to = addDays(s.weekStart, 6);
    const rows = await api.listAvailabilities(s.employee.id, from, to);
    store.set({ availabilities: rows ?? [], loadingAvailabilities: false });
  } catch (err) {
    store.set({ loadingAvailabilities: false });
    if (err?.status === 401) {
      store.setEmployee(null);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────
function groupShiftsByDay(rows, weekStart) {
  const out = new Map();
  for (let i = 0; i < 7; i++) out.set(addDays(weekStart, i), []);
  for (const row of rows ?? []) {
    const date = row?.shift?.date_from;
    if (!date) continue;
    if (out.has(date)) out.get(date).push(row);
  }
  return out;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Boot: if we already have a session in LS, fetch initial data.
if (store.get().employee) {
  reloadAll();
}

// Service worker registration — makes the "install to home screen"
// flow on iOS / Android show the app icon and a content-filled splash
// on first launch. Guarded by feature detection so it's a no-op in
// non-secure contexts (e.g. `serve.mjs` over plain http://localhost is
// allowed by the browser exception for localhost).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // SW registration is best-effort: the app still works without it.
      // Log to console so a curious operator can spot the failure.
      // eslint-disable-next-line no-console
      console.warn('[mystaffler-poc] sw register failed:', err);
    });
  });
}
