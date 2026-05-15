/**
 * Minimal pub/sub store. No framework — just enough to keep the screens
 * in sync after each API mutation.
 *
 * The state shape is intentionally open (`AppState extends Record<string, any>`)
 * because screens stash their own bits of UI state (`forgotStep`,
 * `confirmCandidate`, `me`, `permGrants`, …) without a central
 * registration step. The compile-time guarantee is "this is an
 * object"; runtime correctness is locked by the renderer's case
 * analysis.
 */
export type AppState = Record<string, any>;
const LS_KEY = 'mystaffler.poc.session';

const listeners = new Set<(s: AppState) => void>();
const state: AppState = {
  /** { id, email, firstName, lastName } | null */
  employee: null,
  /** 'planning' | 'availability' | 'profile' */
  tab: 'planning',
  /** ISO Monday of the visible week. */
  weekStart: mondayOf(new Date()),
  /** Cache populated by reload(). */
  shifts: [],
  /** Availability rows for the visible week. */
  availabilities: [],
  /** UI flags. */
  loadingShifts: false,
  loadingAvailabilities: false,
  /** Transient { kind, text } popup, cleared after 3s. */
  toast: null,
};

// Hydrate from localStorage so a refresh keeps the operator logged in
// during a demo — the backend stub-session lives in the HTTP-only cookie.
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.email) state.employee = parsed;
  }
} catch {
  /* corrupt LS — ignore. */
}

function emit() {
  for (const fn of listeners) fn(state);
}

interface Store {
  get(): AppState;
  subscribe(fn: (s: AppState) => void): () => void;
  set(patch: Partial<AppState>): void;
  setEmployee(emp: AppState['employee']): void;
  toast(text: string, kind?: 'info' | 'success' | 'error' | 'warn'): void;
  _toastTimer?: ReturnType<typeof setTimeout>;
}

export const store: Store = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  set(patch) {
    Object.assign(state, patch);
    emit();
  },
  setEmployee(emp) {
    state.employee = emp;
    if (emp) localStorage.setItem(LS_KEY, JSON.stringify(emp));
    else localStorage.removeItem(LS_KEY);
    emit();
  },
  toast(text, kind = 'info') {
    state.toast = { kind, text };
    emit();
    if (store._toastTimer) clearTimeout(store._toastTimer);
    store._toastTimer = setTimeout(() => {
      state.toast = null;
      emit();
    }, 3000);
  },
};

export function mondayOf(d: Date | string | number): string {
  const date = new Date(d);
  const day = date.getDay();
  const offset = (day + 6) % 7;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return toIso(date);
}

export function toIso(d: Date | string | number): string {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toIso(dt);
}

const WEEKDAYS_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export interface WeekDay {
  iso: string;
  name: string;
  shortDate: string;
  isToday: boolean;
}

export function weekDays(weekStartIso: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(weekStartIso, i);
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return {
      iso,
      name: WEEKDAYS_NL[dt.getDay()],
      shortDate: `${dt.getDate()} ${MONTHS_NL[dt.getMonth()]}`,
      isToday: iso === toIso(new Date()),
    };
  });
}

export interface WeekLabel { range: string; week: number; }

export function weekLabel(weekStartIso: string): WeekLabel {
  const start = weekStartIso;
  const end = addDays(start, 6);
  const [, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startTxt = `${sd} ${MONTHS_NL[sm - 1]}`;
  const endTxt = `${ed} ${MONTHS_NL[em - 1]} ${ey}`;
  // ISO week number — Thursday-of-the-week trick (Belgium uses ISO).
  const [y, m, d] = start.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const thu = new Date(dt);
  thu.setUTCDate(thu.getUTCDate() + 3);
  const week1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thu.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
  return { range: `${startTxt} — ${endTxt}`, week };
}
