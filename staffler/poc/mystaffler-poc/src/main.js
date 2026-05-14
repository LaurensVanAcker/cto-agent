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
  if (!s.employee) {
    renderLogin();
  } else if (s.tab === 'availability') {
    renderAvailability();
  } else if (s.tab === 'profile') {
    renderProfile();
  } else {
    renderPlanning();
  }
  renderToast(s.toast);
}
store.subscribe(render);
render();

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
      </form>
      <div class="hint">PoC: elke combinatie werkt. Gebruik bv. test@example.com / test123.</div>
    </section>
  `;
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    if (!email || !password) return;
    store.set({ loggingIn: true, loginError: null });
    try {
      const res = await api.stubLogin(email, password);
      if (!res?.ok || !res?.employee?.id) {
        throw new Error('Login mislukt');
      }
      store.setEmployee(res.employee);
      store.set({ loggingIn: false, loginError: null });
      reloadAll();
    } catch (err) {
      store.set({
        loggingIn: false,
        loginError: err?.body?.message ?? 'Inloggen mislukt. Probeer opnieuw.',
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

  app.innerHTML = `
    <section class="screen">
      <header class="hero">
        <h1>Hallo, ${escapeHtml(s.employee.firstName || 'jij')}!</h1>
        <div class="sub">Jouw planning deze week</div>
        <div class="week-bar">
          <button class="icon icon-prev" data-act="prev-week" aria-label="Vorige week"></button>
          <span>week ${label.week} · ${label.range}</span>
          <button class="icon icon-next" data-act="next-week" aria-label="Volgende week"></button>
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
                `<div class="day-empty">${s.loadingShifts ? 'Laden…' : 'Niets gepland'}</div>`
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
}

function renderShift({ shift, application }) {
  const isCandidate = application?.status === 'candidate' || application?.status === 'selected';
  const klass = isCandidate ? 'candidate' : 'open';
  const where = shift.service_group_name || shift.service_group_id || '';
  return `
    <div class="shift ${klass}" data-shift-id="${escapeHtml(shift.id)}">
      <div class="title">${isCandidate ? 'Je bent kandidaat' : 'Open shift'}</div>
      <div class="times">${escapeHtml(shift.date_from)} · ${escapeHtml(shift.from_time)} → ${escapeHtml(shift.to_time)}</div>
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
  try {
    await api.apply(shiftId, emp.id);
    store.toast('Je bent nu kandidaat voor deze shift.', 'success');
    await reloadShifts();
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
              return `
                <div class="avail-row" data-date="${d.iso}">
                  <div class="day-label">
                    <div class="name">${d.name}${d.isToday ? ' · vandaag' : ''}</div>
                    <div class="date">${d.shortDate}</div>
                  </div>
                  <div class="when">Niet beschikbaar</div>
                  <button class="row-btn icon icon-add" data-act="add" aria-label="Toevoegen"></button>
                </div>
              `;
            }
            const locked = a.status === 'locked';
            return `
              <div class="avail-row ${locked ? 'locked' : 'set'}" data-date="${d.iso}" data-id="${a.id}">
                <div class="day-label">
                  <div class="name">${d.name}${d.isToday ? ' · vandaag' : ''}</div>
                  <div class="date">${d.shortDate}</div>
                </div>
                <div class="when">${escapeHtml(a.from_time)} → ${escapeHtml(a.to_time)}</div>
                <button class="row-btn icon ${locked ? 'icon-clock' : 'icon-trash'}" data-act="${locked ? 'locked' : 'remove'}" aria-label="${locked ? 'Gekoppeld aan contract' : 'Verwijderen'}"></button>
              </div>
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
  app.querySelectorAll('[data-act="add"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-date]');
      openAvailSheet(row.dataset.date);
    });
  });
  app.querySelectorAll('[data-act="remove"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-date]');
      removeAvailability(row.dataset.id);
    });
  });
  app.querySelectorAll('[data-act="locked"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.toast('Deze beschikbaarheid hangt aan een contract.', 'info');
    });
  });
}

function openAvailSheet(date, current) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-backdrop';
  sheet.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <h2>Beschikbaar op ${escapeHtml(date)}</h2>
      <div class="sub">Eén blok per dag. Werkgever stelt open shifts voor binnen je window.</div>
      <div class="time-pair">
        <input id="sheet-from" type="time" value="${current?.from ?? '09:00'}" />
        <span class="arr">›</span>
        <input id="sheet-to" type="time" value="${current?.to ?? '17:00'}" />
      </div>
      <div class="sheet-actions">
        <button class="cancel" data-act="cancel">Annuleren</button>
        <button class="confirm" data-act="confirm">Bevestigen</button>
      </div>
    </div>
  `;
  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });
  sheet.querySelector('[data-act="cancel"]').addEventListener('click', close);
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
      await api.createAvailability({ employeeId: emp.id, date, fromTime, toTime });
      store.toast(`Beschikbaar ${fromTime} → ${toTime} op ${date}.`, 'success');
      await reloadAvailabilities();
    } catch (err) {
      store.toast(err?.body?.message ?? 'Opslaan mislukt.', 'error');
    }
  });
}

async function removeAvailability(id) {
  if (!confirm('Deze beschikbaarheid verwijderen?')) return;
  try {
    await api.removeAvailability(id);
    store.toast('Beschikbaarheid verwijderd.', 'success');
    await reloadAvailabilities();
  } catch (err) {
    const msg =
      err?.status === 409
        ? 'Niet verwijderbaar — gekoppeld aan een contract.'
        : err?.body?.message ?? 'Verwijderen mislukt.';
    store.toast(msg, 'error');
  }
}

// ── Profile tab ─────────────────────────────────────────────────────────
function renderProfile() {
  const emp = store.get().employee;
  app.innerHTML = `
    <section class="screen">
      <header class="hero">
        <h1>Profiel</h1>
        <div class="sub">Jouw account in deze PoC.</div>
      </header>
      <div class="profile">
        <div class="profile-card">
          <div class="name">${escapeHtml(emp.firstName || emp.email)}</div>
          <div class="email">${escapeHtml(emp.email)}</div>
          <div class="id">id: ${escapeHtml(emp.id)}</div>
        </div>
        <button class="profile-action danger" data-act="logout">
          <span>Uitloggen</span>
          <span>›</span>
        </button>
      </div>
      ${renderTabbar('profile')}
    </section>
  `;
  bindTabbar();
  document.querySelector('[data-act="logout"]').addEventListener('click', async () => {
    try { await api.logout(); } catch { /* best-effort */ }
    store.setEmployee(null);
    store.set({ shifts: [], availabilities: [], tab: 'planning' });
  });
}

// ── Tab bar ─────────────────────────────────────────────────────────────
function renderTabbar(active) {
  const tabs = [
    { id: 'planning', label: 'Planning', icon: 'icon-calendar' },
    { id: 'availability', label: 'Beschikbaar', icon: 'icon-clock' },
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

// ── Data loaders ────────────────────────────────────────────────────────
async function reloadAll() {
  await Promise.all([reloadShifts(), reloadAvailabilities()]);
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
