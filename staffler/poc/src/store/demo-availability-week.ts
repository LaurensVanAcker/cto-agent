// Hand-curated demo-week availability schedule used by `pocDb.seedDemo`
// so that fresh PoC-DB boots (clone, review-app deploy, /api/poc-reset)
// reproduce the 35-row planning grid the pilot is reviewing this week.
//
// Anchor: Monday 2026-05-18. `dayOffset` is days from that Monday
// (0 = Mon, 6 = Sun). Times are realistic horeca windows hand-rolled
// by the pilot — do NOT regenerate procedurally. UUID keys are the
// canonical DPS employee ids returned for the PoC company; rows are
// only applied for employees whose id appears in the seed input, so
// non-pilot tenants are unaffected.
//
// Schema note: availabilities has UNIQUE(employee_id, date); the seed
// applies rows defensively (skip on conflict) so re-seeds are no-ops.

export interface DemoAvailabilitySlot {
  /** Days from `DEMO_AVAILABILITY_WEEK_START` Monday (0..6). */
  dayOffset: number;
  /** "HH:mm" — inclusive start. */
  from_time: string;
  /** "HH:mm" — exclusive end. Allowed up to "23:59". */
  to_time: string;
}

/** Monday of the demo week the template is anchored to. */
export const DEMO_AVAILABILITY_WEEK_START = "2026-05-18";

/** Per-employee schedule for the demo week. Total: 35 rows across 7
 *  employees (5 + 5 + 5 + 5 + 5 + 4 + 6). */
export const DEMO_AVAILABILITY_WEEK: Record<string, DemoAvailabilitySlot[]> = {
  // Vroege ploeg: 5x dagdienst.
  "07e6664b-dda4-42ee-8a0f-840fb894b78d": [
    { dayOffset: 0, from_time: "09:00", to_time: "17:00" },
    { dayOffset: 1, from_time: "09:00", to_time: "17:00" },
    { dayOffset: 2, from_time: "09:00", to_time: "17:00" },
    { dayOffset: 3, from_time: "09:00", to_time: "17:00" },
    { dayOffset: 4, from_time: "09:00", to_time: "17:00" },
  ],
  // Avond + weekend cluster.
  "bc2dc200-45a4-4bc3-ad81-c40ec48693d5": [
    { dayOffset: 0, from_time: "17:00", to_time: "23:30" },
    { dayOffset: 2, from_time: "17:00", to_time: "23:30" },
    { dayOffset: 4, from_time: "17:00", to_time: "23:59" },
    { dayOffset: 5, from_time: "15:00", to_time: "23:59" },
    { dayOffset: 6, from_time: "12:00", to_time: "20:00" },
  ],
  // Lunch-ochtenden.
  "d2d13889-8191-41de-97b2-195282e9ccff": [
    { dayOffset: 0, from_time: "07:00", to_time: "13:00" },
    { dayOffset: 1, from_time: "07:00", to_time: "13:00" },
    { dayOffset: 3, from_time: "07:00", to_time: "13:00" },
    { dayOffset: 4, from_time: "07:00", to_time: "13:00" },
    { dayOffset: 6, from_time: "08:00", to_time: "14:00" },
  ],
  // Vaste dagshifts.
  "30ce71a0-bf86-472c-8029-91f89a8405b9": [
    { dayOffset: 0, from_time: "08:00", to_time: "16:30" },
    { dayOffset: 2, from_time: "08:00", to_time: "16:30" },
    { dayOffset: 3, from_time: "08:00", to_time: "16:30" },
    { dayOffset: 4, from_time: "08:00", to_time: "16:30" },
    { dayOffset: 5, from_time: "10:00", to_time: "18:00" },
  ],
  // Lunch + avond mix.
  "727f87f1-ca01-4567-b809-09bd3d8eec3f": [
    { dayOffset: 0, from_time: "11:00", to_time: "15:00" },
    { dayOffset: 1, from_time: "18:00", to_time: "23:00" },
    { dayOffset: 2, from_time: "11:00", to_time: "15:00" },
    { dayOffset: 3, from_time: "18:00", to_time: "23:00" },
    { dayOffset: 5, from_time: "12:00", to_time: "22:00" },
  ],
  // Eind-week + weekend.
  "9f18beee-eb81-4d84-a3d2-39b2b29c3172": [
    { dayOffset: 3, from_time: "17:00", to_time: "22:00" },
    { dayOffset: 4, from_time: "16:00", to_time: "23:30" },
    { dayOffset: 5, from_time: "10:00", to_time: "22:00" },
    { dayOffset: 6, from_time: "10:00", to_time: "20:00" },
  ],
  // Brede beschikbaarheid, 6 dagen.
  "2bf30685-c83d-4fce-8761-e00948e35c03": [
    { dayOffset: 0, from_time: "12:00", to_time: "20:00" },
    { dayOffset: 1, from_time: "12:00", to_time: "20:00" },
    { dayOffset: 3, from_time: "12:00", to_time: "20:00" },
    { dayOffset: 4, from_time: "12:00", to_time: "20:00" },
    { dayOffset: 5, from_time: "14:00", to_time: "22:00" },
    { dayOffset: 6, from_time: "14:00", to_time: "22:00" },
  ],
};

/**
 * Resolve the calendar date for a given day-offset against the demo
 * week anchor. Returns ISO yyyy-mm-dd. Pure helper (no Date math on
 * caller's side) so the seed stays deterministic.
 */
export function demoAvailabilityDate(dayOffset: number): string {
  const start = new Date(`${DEMO_AVAILABILITY_WEEK_START}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + dayOffset);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, "0");
  const d = String(start.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
