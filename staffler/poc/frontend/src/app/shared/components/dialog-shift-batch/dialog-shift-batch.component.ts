import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { Store } from '@ngxs/store';
import { DateTime } from 'luxon';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import {
  ShiftApiService,
  ShiftModel,
  ShiftTargetType,
} from '@dps/core/api/shift/shift.api.service';
import {
  ServiceLocationApiService,
  ServiceLocationModel,
} from '@dps/core/api/service-location/service-location.api.service';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';
import {
  CompanyGroupApiService,
  ContractApiService,
  EmployeeApiService,
  EmployeeWageApiService,
} from '@dps/core/api';
import {
  ContractDayScheduleModel,
  ContractModel,
  ContractStatusEnum,
  EmployeeGroupEngagement,
  EmployeeModel,
  EmployeeWageModel,
  Group,
} from '@dps/shared/models';
import { RootState } from '@dps/core/store';

interface DialogData {
  companyId?: string;
  serviceLocationId?: string;
  date?: string;
  /** Pre-selected employee ids (Names-view cell click). Each id becomes
   *  an assigned slot in the dialog. */
  targetEmployeeIds?: string[];
  /** Day-view drag-create: when the operator drags from e.g. 10:00 to
   *  14:00 we open the dialog with those hours already filled in. */
  prefillFromTime?: string;
  prefillToTime?: string;
  /** When provided, the dialog opens in edit mode — fields are pre-filled
   *  from the existing shift and Bevestig shift calls PATCH /share instead
   *  of POST /shifts. Slots are reconstructed from `capacity` +
   *  `target_employee_ids`. */
  existingShift?: ShiftModel;
  /** UI mode:
   *   - 'multi' (default): operator can add/remove slots, badge shows
   *     slot count, header reads "Nieuwe shifts". Used in Locaties view.
   *   - 'single': single-slot only — "+ Shift toevoegen" hidden, the
   *     per-slot count badge hidden, header reads "Nieuwe shift". Used
   *     in Namen view (one cell-click → one slot for one employee).
   */
  mode?: 'single' | 'multi';
  /**
   * Split-shift edit hint. The Locaties grid explodes one PoC-DB shift
   * with capacity=N into ≤ N Bryntum events (one per assigned employee
   * + one "open" lane for the remaining seats). When the operator
   * clicks one of those split blocks we open the dialog focused on
   * that branch only:
   *   - `slotFilter='open'`              → only the open seats render
   *   - `focusedEmployeeId='<empId>'`    → only that one assigned slot
   *   - `slotFilter='all'`/undefined     → all slots (legacy fallback)
   * Without this the operator would see every slot of the underlying
   * shift regardless of which split block they clicked, which is
   * confusing and lets them accidentally edit other people's
   * assignments.
   */
  slotFilter?: 'open' | 'all';
  focusedEmployeeId?: string;
  /**
   * Optional pre-seeded pool — used by the auth-free /demo/dialogs
   * gallery so the Persoon-kiezen dropdown is populated even though the
   * backend /api/employees call 401s on the demo route. Production
   * leaves this undefined and the dialog falls back to the real DPS
   * endpoint.
   */
  mockEmployees?: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
}

/** Rich employee option model — what the Persoon-kiezen dropdown renders
 *  per row. Backed by EmployeeModel + engagement-groups + a small mocked
 *  insights bundle until the DPS endpoint lands. */
export interface RichEmployeeOption {
  label: string;
  value: string;
  firstName: string;
  lastName: string;
  /** 2-letter avatar initials, e.g. "BV" for Bart Verhaegen. */
  initials: string;
  statute: string;
  statuteTag: string;
  lastShift: string;
  phone: string;
  groups: string[];
  availability: 'match' | 'partial' | 'none' | 'conflict';
  /** Pre-formatted availability range, e.g. "8u — 19u". Empty when the
   *  employee has no overlap. */
  availabilityRange: string;
  /** Set on permanent ("vaste werknemer") rows — render with the teal
   *  group label + no availability badge per mockup 09. */
  isPermanent: boolean;
}

/** Grouped option model used by p-select's [group]=true rendering.
 *  Mirrors the three sections in mockup 09 column 2:
 *  - Beschikbaar (full match)
 *  - Andere medewerkers (partial / no match)
 *  - Vaste werknemers (permanent, no statute, no availability) */
export interface RichEmployeeGroup {
  label: string;
  count: number;
  /** Visual variant for the group header — drives the SCSS class on
   *  `.p-select-option-group`. Pink/brand for "Beschikbaar", muted for
   *  "Andere medewerkers", teal for "Vaste werknemers". */
  variant: 'available' | 'other' | 'fixed';
  items: RichEmployeeOption[];
}

/** One slot row in the dialog. Maps to either a target employee id
 *  (kind=assigned), nothing (kind=open), or a permanent employee
 *  (kind=vast, PoC-DB only). Capacity == slots.length. */
interface Slot {
  kind: 'open' | 'assigned' | 'vast';
  employeeId?: string;
  employeeName?: string;
  /** Optional wage template id (DPS loonpakket). Stored for now but not
   *  persisted to the shift record — the PoC-DB doesn't model per-slot
   *  wages yet. */
  loonpakketId?: string;
  /** Vaste medewerkers are payrolled outside DPS so they don't need a
   *  loonpakket selection. The template hides the wage block when this is
   *  set; the employee picker passes it through from RichEmployeeOption. */
  isPermanent?: boolean;
}

/**
 * Mockup 09 — "Nieuwe shift" dialog.
 *
 * The dialog shows:
 *  - Klant / service-location header
 *  - Datum range (one date for single-day shifts)
 *  - Werkuren card (start/end + optional pauze)
 *  - Slots: each slot is a card with a numbered badge.
 *      * `open`     → "Open shift", hover reveals Persoon kiezen / Open laten
 *      * `assigned` → employee name + (placeholder) loonpakket select
 *      * `vast`     → Vast pill + permanent employee name
 *  - "+ Voeg slot toe" dashed-border button below
 *  - Footer: Annuleren / Bevestig shift
 *
 * On submit we POST one shift with capacity = slots.length and
 * target_employee_ids = the ids of assigned slots. The shift is published
 * immediately so it shows on the planning grid.
 */
@Component({
  selector: 'dps-dialog-shift-batch',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TooltipModule,
  ],
  templateUrl: './dialog-shift-batch.component.html',
  styleUrl: './dialog-shift-batch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShiftBatchComponent {
  private readonly ref = inject(DynamicDialogRef);
  protected readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly serviceLocationsApi = inject(ServiceLocationApiService);
  private readonly engagementGroupsApi = inject(EngagementGroupApiService);
  private readonly employeesApi = inject(EmployeeApiService);
  private readonly companyGroupsApi = inject(CompanyGroupApiService);
  private readonly contractsApi = inject(ContractApiService);
  private readonly wagesApi = inject(EmployeeWageApiService);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageService = inject(MessageService, { optional: true });

  /** "Bestaande shift gebruiken" / "Nieuwe uren ingeven" toggle state. */
  protected readonly hoursMode = signal<'template' | 'custom'>('template');
  protected readonly branches = signal<EngagementGroupModel[]>([]);

  protected readonly companyId = this.config.data?.companyId ?? '';
  protected readonly companyName = this.store.selectSnapshot(RootState.getCompanyData)?.name ?? '';
  protected readonly serviceLocations = signal<ServiceLocationModel[]>([]);
  /** Pool members shown in the per-slot "Persoon kiezen" dropdown — joined
   *  with engagement-group data so the rich item template can render
   *  group chips per row. */
  protected readonly poolEmployees = signal<EmployeeModel[]>([]);
  /** Employee → vestigingen + statute lookup keyed by employee id. The
   *  PoC doesn't expose contract statute/laatste-shift on the same
   *  endpoint, so we mock them deterministically from the id hash to
   *  keep the visual representative across reloads. */
  protected readonly engagementsById = signal<Map<string, EmployeeGroupEngagement>>(new Map());
  /** Hover index — controls which slot shows the choice buttons. */
  protected readonly hoveredSlotIndex = signal<number | null>(null);

  /**
   * Per-slot type-ahead filter for the inline Persoon-kiezen picker.
   * Keyed by slot index → lowercase search string. The previous design
   * leaned on PrimeNG's p-select with appendTo="body", which rendered
   * the option panel as an overlay floating on top of the dialog (the
   * pilot complained about "popup-over-popup"). We now render a true
   * inline scrollable list inside the slot, gated by this signal.
   */
  protected readonly personFilter = signal<Record<number, string>>({});

  protected onPersonFilterInput(idx: number, value: string): void {
    this.personFilter.update(m => ({ ...m, [idx]: (value ?? '').toLowerCase() }));
  }

  /** Filtered + alphabetically sorted options for the inline picker.
   *  Flat list — kept as the source of truth that
   *  `filteredEmployeeGroups` slices into three sections. */
  protected filteredEmployeeOptions(idx: number): RichEmployeeOption[] {
    const q = (this.personFilter()[idx] ?? '').trim();
    const all = this.employeeOptions().slice().sort((a, b) =>
      a.label.localeCompare(b.label, 'nl-BE'),
    );
    if (!q) return all;
    return all.filter(
      o =>
        o.label.toLowerCase().includes(q) ||
        (o.statute ?? '').toLowerCase().includes(q),
    );
  }

  /**
   * Grouped + filtered options for the inline picker. Restores the
   * three-section split that pilot operators relied on (regression
   * 2026-05-18: the flat list buried the vaste medewerkers so
   * operators couldn't tell who was permanent any more).
   *
   * Groups:
   *   - Beschikbaar       → full overlap (availability=match), non-permanent
   *   - Andere medewerkers → partial / no overlap, non-permanent
   *   - Vaste werknemers  → permanent employees (rendered teal)
   *
   * Empty buckets are dropped so the picker never shows an empty
   * section header. Sort + filter happen in `filteredEmployeeOptions`
   * before the slice, so the chip-row text always matches what the
   * operator typed.
   */
  protected filteredEmployeeGroups(idx: number): RichEmployeeGroup[] {
    const filtered = this.filteredEmployeeOptions(idx);
    const available = filtered.filter(o => !o.isPermanent && o.availability === 'match');
    const other = filtered.filter(o => !o.isPermanent && o.availability !== 'match');
    const fixed = filtered.filter(o => o.isPermanent);
    const groups: RichEmployeeGroup[] = [];
    if (available.length > 0) {
      groups.push({
        label: 'Beschikbaar',
        count: available.length,
        variant: 'available',
        items: available,
      });
    }
    if (other.length > 0) {
      groups.push({
        label: 'Andere medewerkers',
        count: other.length,
        variant: 'other',
        items: other,
      });
    }
    if (fixed.length > 0) {
      groups.push({
        label: 'Vaste werknemers',
        count: fixed.length,
        variant: 'fixed',
        items: fixed,
      });
    }
    return groups;
  }

  /** Default deadline = next Sunday at 21:00 (Brussels time). Pilot
   *  operators typically broadcast for the upcoming week, so reaction
   *  needs to settle by Sunday evening. */
  private defaultDeadline(): string {
    const now = DateTime.now();
    const sunday = now.set({ weekday: 7, hour: 21, minute: 0, second: 0 });
    const target = sunday > now ? sunday : sunday.plus({ weeks: 1 });
    return target.toFormat("yyyy-MM-dd'T'HH:mm");
  }

  protected readonly isEdit = !!this.config.data?.existingShift;
  protected readonly editingShiftId = this.config.data?.existingShift?.id ?? null;
  /** Single-slot mode → hide the "+ Shift toevoegen" button + per-slot
   *  count badge, render "shift" (singular) in the header. Defaults to
   *  multi for backwards-compat with the Locaties cell-click flow. */
  protected readonly mode: 'single' | 'multi' = this.config.data?.mode ?? 'multi';
  /** When set, the dialog opened in "split branch" edit mode:
   *  either focused on one assigned employee, or the open-seats branch.
   *  We hide slot manipulation affordances in that case — the operator
   *  shouldn't be able to add/remove slots when they only opened one
   *  branch of the split. */
  protected readonly focusedEmployeeId = this.config.data?.focusedEmployeeId ?? null;
  protected readonly slotFilter = this.config.data?.slotFilter ?? 'all';
  /**
   * True only when the dialog was opened on a single ASSIGNED-employee
   * split block. In that case we hide both add- and remove-slot affordances:
   * the operator only sees one slot (the assigned one they clicked) and
   * letting them mutate the surrounding slots from this narrow view would
   * be surprising.
   *
   * Pilot feedback 2026-05-18: "als je een open shift block bewerkt, mag
   * je wel shiften kunnen toevoegen nog." When the operator clicks the
   * OPEN-seats branch we still narrow the dialog to the open slots, but
   * adding a new slot to the underlying shift remains a sensible op
   * (it simply increases capacity by one open seat). So we no longer
   * gate the "Shift toevoegen" button behind slotFilter==='open'.
   */
  protected readonly isSplitBranchEdit = this.isEdit && !!this.focusedEmployeeId;

  /**
   * Pilot 2026-05-19 spec — rule (c) flexibele medewerker bestaand contract:
   *
   * When the operator opens an existing shift on a single assigned employee
   * (split-branch edit with `focusedEmployeeId` set), only werkuren +
   * service-locatie are editable, and only until 8h before the shift starts.
   * Naam / datum / datumrange / loonpakket / vestiging are ALWAYS read-only;
   * remove-slot affordances stay hidden. Within the 8h window even the
   * uren go read-only and a chip explains why.
   *
   * Pure assigned-employee branches map to flex employees in the PoC-DB
   * — vaste medewerkers go through DialogVastBlockComponent (separate
   * dialog), open shifts use slotFilter='open' (rule b, fully editable).
   * So `isSplitBranchEdit` is a sufficient signal for "rule c applies".
   */
  protected readonly isExistingFlexAssignedEdit = this.isSplitBranchEdit;

  /** First start datetime of the existing-shift series (multi-day shifts
   *  use date_from + from_time). Drives the 8h-before-start cutoff. */
  private existingShiftStartDateTime(): DateTime | null {
    const sh = this.config.data?.existingShift;
    if (!sh) return null;
    const dt = DateTime.fromISO(`${sh.date_from}T${sh.from_time}`);
    return dt.isValid ? dt : null;
  }

  /** True when "now" is still more than 8h before the existing shift's
   *  first day starts. Outside the window → werkuren + service-locatie
   *  editable; inside → everything read-only. */
  protected isWithinFlexEditWindow(): boolean {
    if (!this.isExistingFlexAssignedEdit) return true;
    const start = this.existingShiftStartDateTime();
    if (!start) return false;
    const hoursUntilStart = start.diff(DateTime.now()).as('hours');
    return hoursUntilStart >= 8;
  }

  /** True when we're INSIDE the 8h lock window for an existing flex
   *  assignment — drives the read-only chip + disables everything. */
  protected isExistingFlexLocked(): boolean {
    return this.isExistingFlexAssignedEdit && !this.isWithinFlexEditWindow();
  }

  /**
   * Same-vestiging service-location options. For existing flex
   * assignments the spec forbids moving to a different vestiging, so we
   * filter the dropdown to only the SLs whose branch_group_id matches
   * the original shift's SL. Outside of rule (c) we return the full set.
   */
  protected serviceLocationOptionsFiltered = () => {
    const baseOpts = this.serviceLocations();
    if (!this.isExistingFlexAssignedEdit) {
      return baseOpts.map(s => ({ label: s.name, value: s.id }));
    }
    const originalSlId = this.config.data?.existingShift?.service_location_id;
    const originalSl = baseOpts.find(s => s.id === originalSlId);
    if (!originalSl) return baseOpts.map(s => ({ label: s.name, value: s.id }));
    return baseOpts
      .filter(s => s.branch_group_id === originalSl.branch_group_id)
      .map(s => ({ label: s.name, value: s.id }));
  };

  protected readonly form = {
    serviceLocationId:
      this.config.data?.existingShift?.service_location_id ??
      this.config.data?.serviceLocationId ??
      '',
    dateFrom:
      this.config.data?.existingShift?.date_from ??
      this.config.data?.date ??
      '',
    dateTo:
      this.config.data?.existingShift?.date_to ??
      this.config.data?.date ??
      '',
    fromTime:
      this.config.data?.existingShift?.from_time ??
      this.config.data?.prefillFromTime ??
      '09:00',
    toTime:
      this.config.data?.existingShift?.to_time ??
      this.config.data?.prefillToTime ??
      '17:00',
    pauseFrom: this.config.data?.existingShift?.pause_from ?? '',
    pauseTo: this.config.data?.existingShift?.pause_to ?? '',
    deadline:
      this.config.data?.existingShift?.deadline
        ? DateTime.fromISO(this.config.data!.existingShift!.deadline!).toFormat(
            "yyyy-MM-dd'T'HH:mm",
          )
        : this.defaultDeadline(),
  };

  /**
   * Initial slots derived from three sources, in priority order:
   *  1. `existingShift` — reconstruct from `capacity` + `target_employee_ids`
   *  2. `targetEmployeeIds` data prop — Names-view cell click
   *  3. Default: one open slot
   */
  protected slots = signal<Slot[]>(this.initialSlots());

  private initialSlots(): Slot[] {
    const existing = this.config.data?.existingShift;
    if (existing) {
      const assigned: Slot[] = (existing.target_employee_ids ?? []).map(id => ({
        kind: 'assigned',
        employeeId: id,
      }));
      const openCount = Math.max(0, (existing.capacity ?? 1) - assigned.length);
      const open: Slot[] = Array.from({ length: openCount }, () => ({
        kind: 'open' as const,
      }));
      // Split-shift narrowing — see DialogData.slotFilter docs.
      const focusedId = this.config.data?.focusedEmployeeId;
      const filter = this.config.data?.slotFilter ?? 'all';
      if (focusedId) {
        const one = assigned.find(s => s.employeeId === focusedId);
        return one ? [one] : [{ kind: 'open' }];
      }
      if (filter === 'open') {
        return open.length > 0 ? open : [{ kind: 'open' }];
      }
      const all = [...assigned, ...open];
      return all.length > 0 ? all : [{ kind: 'open' }];
    }
    const preTargets = this.config.data?.targetEmployeeIds ?? [];
    if (preTargets.length > 0) {
      return preTargets.map<Slot>(id => ({ kind: 'assigned', employeeId: id }));
    }
    return [{ kind: 'open' }];
  }

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly serviceLocationOptions = () =>
    this.serviceLocations().map(s => ({ label: s.name, value: s.id }));

  /**
   * Flat list of rich options. Kept as an internal helper — the template
   * binds to `employeeGroups()` instead so PrimeNG's grouped renderer
   * can label the three sections from mockup 09 (Beschikbaar / Andere
   * medewerkers / Vaste werknemers).
   */
  protected readonly employeeOptions = () =>
    this.poolEmployees().map(e => this.toRichEmployeeOption(e));

  /**
   * Unfiltered grouped options — convenience used elsewhere (demo
   * gallery). The slot picker binds to `filteredEmployeeGroups($index)`
   * so the per-slot type-ahead is honoured. Restored 2026-05-18 after
   * pilot reported the vaste werknemers had disappeared from the
   * picker when the flat-list rewrite landed.
   */
  protected readonly employeeGroups = (): RichEmployeeGroup[] => {
    const opts = this.employeeOptions()
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, 'nl-BE'));
    const available = opts.filter(o => !o.isPermanent && o.availability === 'match');
    const other = opts.filter(o => !o.isPermanent && o.availability !== 'match');
    const fixed = opts.filter(o => o.isPermanent);
    const groups: RichEmployeeGroup[] = [];
    if (available.length > 0) {
      groups.push({ label: 'Beschikbaar', count: available.length, variant: 'available', items: available });
    }
    if (other.length > 0) {
      groups.push({ label: 'Andere medewerkers', count: other.length, variant: 'other', items: other });
    }
    if (fixed.length > 0) {
      groups.push({ label: 'Vaste werknemers', count: fixed.length, variant: 'fixed', items: fixed });
    }
    return groups;
  };

  /** Initials from "Bart Verhaegen" → "BV". Single-name rows return the
   *  first 2 letters of that name. */
  private toInitials(first: string, last: string): string {
    const a = (first ?? '').trim().charAt(0).toUpperCase();
    const b = (last ?? '').trim().charAt(0).toUpperCase();
    if (a && b) return `${a}${b}`;
    const fallback = `${first ?? ''}${last ?? ''}`.trim().slice(0, 2).toUpperCase();
    return fallback || '?';
  }

  /**
   * Decorate an EmployeeModel with the metadata the rich Persoon-kiezen
   * dropdown wants to show (statute, last shift, group tags, availability).
   * Statute + last-shift + availability are mocked deterministically from
   * the id hash so the visual is stable across reloads — production
   * wires this to a real `/api/employees/:id/insights` endpoint that
   * returns the same shape.
   */
  private toRichEmployeeOption(e: EmployeeModel): RichEmployeeOption {
    const hash = (e.id ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    // Statutes per mockup column 2 — the long-form label (e.g. "Flexijob
    // bediende") is what renders under the name; the short tag is unused
    // in the m09 layout but kept for backwards-compat with other surfaces.
    const statutes: Array<{ label: string; tag: string }> = [
      { label: 'Flexijob bediende', tag: 'flexi' },
      { label: 'Student', tag: 'student' },
      { label: 'Bediende', tag: 'bediende' },
      { label: 'Arbeider', tag: 'arbeider' },
      { label: 'Flexijob arbeider', tag: 'flexi' },
      { label: 'Extra', tag: 'student' },
    ];
    // Mocked "is permanent" flag — roughly 1-in-5 employees, deterministic.
    const isPermanent = hash % 5 === 0;
    const statute = isPermanent
      ? { label: '', tag: '' }
      : statutes[hash % statutes.length];
    const groups = (this.engagementsById().get(e.id)?.engagementGroups ?? []).map(
      (g: Group) => g.name,
    );
    // Availability — match (full overlap) | partial (window inside the
    // shift) | none. Permanent employees never get an availability badge
    // per mockup.
    const availability: RichEmployeeOption['availability'] = isPermanent
      ? 'none'
      : hash % 4 === 0
        ? 'partial'
        : hash % 7 === 0
          ? 'none'
          : 'match';
    // Format a stable range from the hash: full match → wide window
    // (e.g. "8u — 19u"), partial → narrower window inside the shift
    // (e.g. "14u — 18u"). "u" suffix with no leading zero per mockup.
    const fmtRange = (from: number, to: number) => `${from}u — ${to}u`;
    let availabilityRange = '';
    if (availability === 'match') {
      const start = 6 + (hash % 4); // 6..9
      const end = 18 + (hash % 5); // 18..22
      availabilityRange = fmtRange(start, end);
    } else if (availability === 'partial') {
      const start = 9 + (hash % 6); // 9..14
      const end = Math.min(22, start + 3 + (hash % 4)); // start+3..start+6
      availabilityRange = fmtRange(start, end);
    }
    const firstName = e.firstName ?? '';
    const lastName = e.lastName ?? '';
    return {
      label: `${firstName} ${lastName}`.trim() || e.id,
      value: e.id,
      firstName,
      lastName,
      initials: this.toInitials(firstName, lastName),
      statute: statute.label,
      statuteTag: statute.tag,
      lastShift: hash % 3 === 0 ? 'nooit gewerkt' : `laatste shift ${10 + (hash % 18)}/04`,
      phone:
        (e as unknown as { contact?: { phoneNumber?: string } }).contact?.phoneNumber
          ? `tel ${(e as unknown as { contact: { phoneNumber: string } }).contact.phoneNumber}`
          : '',
      groups,
      availability,
      availabilityRange,
      isPermanent,
    };
  }

  /** True when the shift will broadcast to the pool — i.e. when at least
   *  one slot is open. The deadline field only renders in that case. */
  protected hasOpenSlot(): boolean {
    return this.slots().some(s => s.kind === 'open');
  }

  /**
   * Note: the body-level "slotsMissingLoonpakket" banner used to live
   * here. Per mockup 09 v2 the warning surfaces INLINE inside each slot
   * (see shouldShowLoonpakketBanner), so the global computed signal was
   * removed — every slot owns its own validation visibility now.
   */

  /** Title chip — "Vestiging — Service Location" derived from the chosen
   *  service-location. Falls back to a generic label while loading. */
  protected positionLabel(): string {
    const slId = this.form.serviceLocationId;
    const sl = this.serviceLocations().find(s => s.id === slId);
    if (!sl) return 'service location';
    const branch = this.branches().find(b => b.id === sl.branch_group_id);
    return branch ? `${branch.name} — ${sl.name}` : sl.name;
  }

  /** Human-readable "dinsdag 12 mei — woensdag 13 mei 2026" header. */
  protected dayTitle(): string {
    const from = DateTime.fromISO(this.form.dateFrom).setLocale('nl-BE');
    const to = DateTime.fromISO(this.form.dateTo || this.form.dateFrom).setLocale('nl-BE');
    if (!from.isValid) return '';
    if (!to.isValid || from.hasSame(to, 'day')) {
      return from.toFormat('cccc d LLLL yyyy');
    }
    return `${from.toFormat('cccc d LLLL')} — ${to.toFormat('cccc d LLLL yyyy')}`;
  }

  /** Keep dateTo synced with dateFrom while it's still the default. */
  protected onDateFromChange(value: string): void {
    if (!this.form.dateTo || this.form.dateTo < value) {
      this.form.dateTo = value;
    }
  }

  protected firstName(full: string | undefined): string {
    return (full ?? '').trim().split(/\s+/)[0] ?? '';
  }

  /** Loonpakket options — placeholder set; production wires this to the
   *  DPS wage-template endpoint. There is no "Standaard pakket" fallback —
   *  the operator must pick a real package per assigned slot.
   *
   *  Each option carries a `serviceLocationId` so the dialog can detect when
   *  the chosen loonpakket belongs to a different vestiging than the one
   *  the shift is for — mockup 09 column 3 shows the inline banner that
   *  surfaces in exactly that case. The first option is intentionally on
   *  a different service-location to make the banner demoable in the gallery.
   */
  protected readonly loonpakketOptions = signal<
    Array<{ label: string; value: string; serviceLocationId: string }>
  >([
    {
      label: 'Barista — Flexijob bediende — Antwerpen Eilandje',
      value: 'barista-flex-antwerpen',
      serviceLocationId: 'sl-antwerpen-eilandje',
    },
    {
      label: 'Barista — Arbeider — Gent Dok Noord',
      value: 'barista-arbeider-gent',
      serviceLocationId: 'sl-gent-dok-noord',
    },
    {
      label: 'Kelner — Flexijob bediende — Gent Dok Noord',
      value: 'kelner-flex-gent',
      serviceLocationId: 'sl-gent-dok-noord',
    },
  ]);

  /**
   * Per-slot dismiss state for the inline "loonpakket mismatch" banner.
   * Operator clicks Aanmaken → we close the banner for that slot. The
   * actual wage-template create call is out of scope for the PoC; the
   * stub below just flips this signal.
   */
  protected readonly bannerDismissed = signal<Record<number, boolean>>({});

  /**
   * Show the inline "Loonpakket aanmaken" banner for a slot when ALL of:
   *  - the dialog is in Locaties (multi-slot) mode — Namen single-slot
   *    flow doesn't surface this affordance per pilot feedback
   *  - the slot is assigned (open / vast never need a loonpakket)
   *  - a name is bound
   *  - a wage-template IS selected (we don't nag when nothing is picked)
   *  - the picked wage-template's address differs from the chosen
   *    service location's address (i.e. real mismatch — the "create a
   *    new wage-package for this vestiging" suggestion only makes sense
   *    when the existing one belongs to a different address)
   *  - the operator hasn't dismissed it yet.
   *
   * Rendered _inside_ the slot, right below the loonpakket select
   * (mockup 09 column 3).
   */
  protected shouldShowLoonpakketBanner(slot: Slot, idx: number): boolean {
    // Per pilot AC: Locaties view only.
    if (this.mode === 'single') return false;
    if (slot.kind !== 'assigned' || !slot.employeeName) return false;
    if (this.bannerDismissed()[idx]) return false;
    // Per pilot AC: only when a wage-template is actually selected — no
    // banner for "nothing picked yet".
    if (!slot.loonpakketId) return false;
    const opt = this.loonpakketOptions().find(o => o.value === slot.loonpakketId);
    if (!opt) return false;
    // Mismatch when the picked wage-template's vestiging (≈ address)
    // differs from the chosen service-location's. The current PoC uses
    // placeholder ids ("sg-gent-dok-noord", etc.); production wires this
    // to a real wage-template ↔ vestiging join keyed on address.
    return opt.serviceLocationId !== this.form.serviceLocationId;
  }

  /**
   * Mockup-09 column 3 — friendly statute name to surface in the banner
   * copy: "Voor Anouk bestaat er nog geen Barista (Flexijob bediende) op
   * deze vestiging." We just take the loonpakket label and split off the
   * leading position + statute pieces.
   */
  protected bannerPakketLabel(slot: Slot): string {
    const opt = this.loonpakketOptions().find(o => o.value === slot.loonpakketId);
    if (!opt) return 'dit loonpakket';
    // "Barista — Flexijob bediende — Antwerpen Eilandje" → "Barista (Flexijob bediende)"
    const parts = opt.label.split('—').map(p => p.trim());
    if (parts.length >= 2) return `${parts[0]} (${parts[1]})`;
    return opt.label;
  }

  /**
   * "Aanmaken" click on the inline banner.
   *
   * PoC behaviour (per pilot feedback 2026-05-18): clone the slot's
   * current loonpakket with just the address (≈ serviceLocationId) swapped
   * to the dialog's selected vestiging, push the clone into the in-memory
   * options list, auto-select it on this slot, dismiss the banner, and
   * fire a short toast confirming the clone. No backend hit yet — the
   * production wire-up POSTs to /api/employeewages with the cloned
   * payload and selects the returned id.
   */
  protected onCreateLoonpakket(slotIndex: number): void {
    const slot = this.slots()[slotIndex];
    if (!slot || !slot.loonpakketId) {
      this.bannerDismissed.update(d => ({ ...d, [slotIndex]: true }));
      return;
    }
    const src = this.loonpakketOptions().find(o => o.value === slot.loonpakketId);
    if (!src) {
      this.bannerDismissed.update(d => ({ ...d, [slotIndex]: true }));
      return;
    }
    // Swap the trailing "— <vestiging>" piece for the current one.
    const vestigingLabel = this.positionLabel();
    const parts = src.label.split('—').map(p => p.trim());
    const head = parts.length >= 2 ? parts.slice(0, -1).join(' — ') : src.label;
    const newLabel = `${head} — ${vestigingLabel}`;
    const newValue = `${src.value}-clone-${Date.now().toString(36)}`;
    const clone = {
      label: newLabel,
      value: newValue,
      serviceLocationId: this.form.serviceLocationId,
    };
    this.loonpakketOptions.update(arr => [...arr, clone]);
    // Auto-select the clone on this slot — banner naturally hides when
    // serviceLocationId matches.
    this.slots.update(arr =>
      arr.map((s, i) => (i === slotIndex ? { ...s, loonpakketId: newValue } : s)),
    );
    this.bannerDismissed.update(d => ({ ...d, [slotIndex]: true }));
    this.messageService?.add({
      severity: 'success',
      summary: 'Loonpakket gekloond',
      detail: `Voor ${vestigingLabel}`,
      life: 3000,
    });
  }

  /** "Bestaande shift gebruiken" presets — these are pilot-defined shift
   *  templates. Picking one fills werkuren + pauze in one shot, mimicking
   *  the production planning page's shift-template dropdown. */
  protected readonly shiftTemplateId = signal<string>('std-09-17');
  protected readonly shiftTemplateOptions = [
    { label: 'Standaard 09:00 → 17:00', value: 'std-09-17', from: '09:00', to: '17:00', pf: '', pt: '' },
    { label: 'Lunch shift 11:00 → 14:00', value: 'lunch-11-14', from: '11:00', to: '14:00', pf: '', pt: '' },
    { label: 'Avond 17:00 → 23:00', value: 'avond-17-23', from: '17:00', to: '23:00', pf: '', pt: '' },
    { label: 'Volle dag 08:00 → 18:00 (30m pauze)', value: 'vol-08-18', from: '08:00', to: '18:00', pf: '12:00', pt: '12:30' },
  ];

  protected applyShiftTemplate(id: string): void {
    const t = this.shiftTemplateOptions.find(x => x.value === id);
    if (!t) return;
    this.shiftTemplateId.set(id);
    this.form.fromTime = t.from;
    this.form.toTime = t.to;
    this.form.pauseFrom = t.pf;
    this.form.pauseTo = t.pt;
  }

  protected onSlotLoonpakketChanged(idx: number, value: string): void {
    this.slots.update(arr =>
      arr.map((s, i) => (i === idx ? { ...s, loonpakketId: value } : s)),
    );
  }

  constructor() {
    // Auth-free demo path: when the caller seeds a `mockEmployees` list
    // (only /demo/dialogs does this), short-circuit the API calls so the
    // dropdown isn't empty on the gallery route. Real product code never
    // passes `mockEmployees` so this branch never trips outside demos.
    const mock = this.config.data?.mockEmployees;
    if (mock && mock.length > 0) {
      const asModels = mock.map(m => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
      })) as unknown as EmployeeModel[];
      this.poolEmployees.set(asModels);
      // Backfill names on any pre-selected assigned slots — same logic as
      // the API success branch below, so a demo-gallery caller that ships
      // both `mockEmployees` and `targetEmployeeIds` lands on an assigned
      // slot with the name already bound.
      const byId = new Map(asModels.map(e => [e.id, e]));
      this.slots.update(arr =>
        arr.map(s =>
          s.kind === 'assigned' && s.employeeId && !s.employeeName
            ? {
                ...s,
                employeeName:
                  `${byId.get(s.employeeId)?.firstName ?? ''} ${
                    byId.get(s.employeeId)?.lastName ?? ''
                  }`.trim() || s.employeeId,
              }
            : s,
        ),
      );
    }
    if (this.companyId) {
      this.engagementGroupsApi.listForCompany(this.companyId).subscribe({
        next: rows => {
          this.branches.set(rows ?? []);
          this.cdr.markForCheck();
        },
      });
      this.serviceLocationsApi.list(this.companyId).subscribe({
        next: rows => {
          this.serviceLocations.set(rows ?? []);
          if (rows && rows.length > 0 && !this.form.serviceLocationId) {
            this.form.serviceLocationId = rows[0].id;
          }
          this.cdr.markForCheck();
        },
      });
      this.employeesApi
        .getEmployees({
          companyId: this.companyId,
          baseView: true,
          page: 0,
          size: 100,
        })
        .subscribe({
          next: page => {
            const content = (page as { content?: EmployeeModel[] }).content ?? [];
            this.poolEmployees.set(content);
            // Populate names on any pre-selected assigned slots.
            const byId = new Map(content.map(e => [e.id, e]));
            this.slots.update(arr =>
              arr.map(s =>
                s.kind === 'assigned' && s.employeeId && !s.employeeName
                  ? {
                      ...s,
                      employeeName:
                        `${byId.get(s.employeeId)?.firstName ?? ''} ${
                          byId.get(s.employeeId)?.lastName ?? ''
                        }`.trim() || s.employeeId,
                    }
                  : s,
              ),
            );
            this.cdr.markForCheck();
          },
        });
      // Engagement-groups (per-employee vestiging memberships) — used by
      // the rich Persoon-kiezen dropdown to render group chips per row.
      this.companyGroupsApi
        .getEmployeeGroupEngagements(this.companyId, {
          page: 0,
          size: 100,
        } as Parameters<CompanyGroupApiService['getEmployeeGroupEngagements']>[1])
        .subscribe({
          next: resp => {
            const map = new Map<string, EmployeeGroupEngagement>();
            for (const eng of resp?.content ?? []) map.set(eng.id, eng);
            this.engagementsById.set(map);
            this.cdr.markForCheck();
          },
        });
    }
  }

  // ── slot manipulation ──────────────────────────────────────────────────

  protected addSlot(): void {
    this.slots.update(arr => [...arr, { kind: 'open' }]);
  }

  protected removeSlot(idx: number): void {
    this.slots.update(arr => arr.filter((_, i) => i !== idx));
  }

  /** Convert a slot to "Open shift" (clears any assignment). */
  protected makeOpen(idx: number): void {
    this.slots.update(arr =>
      arr.map((s, i) => (i === idx ? { kind: 'open' as const } : s)),
    );
  }

  /** "Persoon kiezen" choice — converts the slot to assigned with a
   *  placeholder; the inline dropdown then lets the operator pick a name. */
  protected makeAssigned(idx: number): void {
    this.slots.update(arr =>
      arr.map((s, i) =>
        i === idx ? { kind: 'assigned' as const, employeeId: '' } : s,
      ),
    );
  }

  /** Bind the chosen employee id + name onto the slot when the dropdown
   *  emits a change. Guards against picking the same employee twice across
   *  the slot list — duplicates collapse to a single assignment and the
   *  earlier slot is reset to 'open' instead, since shifting the same
   *  person twice never makes sense (it'd double-book them on the same
   *  day). */
  protected onSlotEmployeeSelected(idx: number, employeeId: string): void {
    const emp = this.poolEmployees().find(e => e.id === employeeId);
    const name =
      emp != null
        ? `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || employeeId
        : '';
    // RichEmployeeOption carries an isPermanent flag; the raw EmployeeModel
    // doesn't, but the rich variant is what the picker lists, so consult
    // the enriched array first and fall back to false for unknown ids.
    const rich = this.employeeOptions().find(o => o.value === employeeId);
    const isPermanent = rich?.isPermanent ?? false;
    this.slots.update(arr =>
      arr.map((s, i) => {
        if (i === idx) {
          return {
            kind: 'assigned' as const,
            employeeId,
            employeeName: name,
            isPermanent,
          };
        }
        // Strip the same employee off any other slot — show the operator
        // an empty 'open' chip so they know they need to assign another
        // person there. Without this guard you could double-assign the
        // same person and the publish would fail upstream.
        if (s.kind === 'assigned' && s.employeeId === employeeId) {
          return { kind: 'open' as const };
        }
        return s;
      }),
    );
  }

  /** Composite validation. Returns null when valid, else the first
   *  failing reason (also shown as a tooltip on the disabled confirm
   *  button so the operator knows why they can't submit). */
  protected validationError(): string | null {
    // Rule (c): within 8h of an existing flex assignment everything is
    // read-only — there is nothing meaningful left to submit. Surface a
    // dedicated reason so the confirm-button tooltip explains the lock
    // instead of complaining about a stale field.
    if (this.isExistingFlexLocked()) {
      return 'Bewerken niet meer mogelijk binnen 8u voor start van de shift.';
    }
    if (!this.form.serviceLocationId) return 'Kies een service location.';
    if (!this.form.dateFrom || !this.form.dateTo) return 'Vul beide datums in.';
    if (this.form.dateTo < this.form.dateFrom) return 'Tot-datum ligt vóór Van-datum.';
    if (!this.form.fromTime || !this.form.toTime) return 'Vul beide werkuren in.';
    if (this.form.toTime <= this.form.fromTime)
      return 'Werkuren Tot moet na Van liggen.';
    if (this.form.pauseFrom || this.form.pauseTo) {
      if (!this.form.pauseFrom || !this.form.pauseTo)
        return 'Vul beide pauze-uren in (of laat beide leeg).';
      if (this.form.pauseTo <= this.form.pauseFrom)
        return 'Pauze Tot moet na Van liggen.';
      if (this.form.pauseFrom < this.form.fromTime || this.form.pauseTo > this.form.toTime)
        return 'Pauze moet binnen de werkuren vallen.';
    }
    if (this.slots().length === 0) return 'Voeg minstens één slot toe.';
    if (this.hasOpenSlot() && !this.form.deadline)
      return 'Deadline is verplicht bij open shifts.';
    return null;
  }

  protected canSave(): boolean {
    return !this.saving() && this.validationError() === null;
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected confirmAndPublish(): void {
    if (!this.companyId) {
      this.ref.close({ kind: 'shift.batch.error', reason: 'missing companyId' });
      return;
    }
    if (!this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);

    const assignedIds = this.slots()
      .filter(s => s.kind === 'assigned' && !!s.employeeId)
      .map(s => s.employeeId!) as string[];
    const openCount = this.slots().filter(s => s.kind === 'open').length;

    // ── Edit mode ────────────────────────────────────────────────────────
    // P1 follow-up 2026-05-19: the PoC-DB no longer accepts
    // `targetEmployeeIds` on POST /api/shifts or PATCH /api/shifts/:id/share
    // (backend strips them to prevent flex-employee shadow rows). The
    // "Specifieke namen" path must now mint a real DPS contract per
    // newly-assigned employee. The share call is kept for cases where
    // only deadline / open-seats need to change.
    if (this.isEdit && this.editingShiftId) {
      const original = this.config.data?.existingShift;
      const originalTargets = new Set(original?.target_employee_ids ?? []);
      // Newly assigned employees (visible in this dialog but not on the
      // original shift) become contracts. Existing ones stay as-is.
      const newAssignedIds = assignedIds.filter(id => !originalTargets.has(id));

      this.createContractsForEmployees(newAssignedIds).subscribe(contractResult => {
        // After contracts: still patch the shift's deadline / share-state
        // (no targetEmployeeIds — backend ignores them anyway, but we
        // omit them to keep the call clean).
        const stillHasOpenSeats =
          (original?.capacity ?? originalTargets.size) > originalTargets.size;
        const shouldShare =
          stillHasOpenSeats ||
          (this.isSplitBranchEdit && this.slotFilter === 'open');

        const closeWith = (shift: ShiftModel) => {
          this.saving.set(false);
          this.surfaceContractFailures(contractResult);
          this.ref.close({ kind: 'shift.batch.published', shift });
        };

        if (!shouldShare) {
          // No share needed — just close, refresh will pick up the new
          // contracts.
          this.saving.set(false);
          this.surfaceContractFailures(contractResult);
          this.ref.close({
            kind: 'shift.batch.published',
            shift: original ?? ({ id: this.editingShiftId! } as unknown as ShiftModel),
          });
          return;
        }

        this.shiftsApi
          .share(this.editingShiftId!, {
            targetType: 'ALL_POOL',
            reactionDeadline: this.form.deadline || undefined,
          })
          .subscribe({
            next: shift => closeWith(shift),
            error: err => {
              this.saving.set(false);
              this.error.set(this.parseError(err));
              this.cdr.markForCheck();
            },
          });
      });
      return;
    }

    // ── Create mode ──────────────────────────────────────────────────────
    // 1. Mint a real DPS contract per assigned employee.
    // 2. If there are still open seats, create an open shift (no
    //    targetEmployeeIds — backend strips them anyway).
    this.createContractsForEmployees(assignedIds).subscribe(contractResult => {
      if (openCount === 0) {
        // All slots were assigned — no open shift needed. Close and let
        // the planning grid refresh pick up the new contracts.
        this.saving.set(false);
        this.surfaceContractFailures(contractResult);
        this.ref.close({
          kind: 'shift.batch.published',
          // Synthesize a minimal shift object so the planning-poc toast
          // doesn't crash on missing fields. The actual data shown comes
          // from the post-close refresh.
          shift: {
            id: '',
            date_from: this.form.dateFrom,
            date_to: this.form.dateTo || this.form.dateFrom,
            from_time: this.form.fromTime,
            to_time: this.form.toTime,
          } as unknown as ShiftModel,
        });
        return;
      }

      // Open shift for the remaining open seats. Capacity = openCount,
      // no targetEmployeeIds (assigned slots became contracts).
      const targetType: ShiftTargetType = 'ALL_POOL';
      this.shiftsApi
        .create({
          companyId: this.companyId,
          serviceLocationId: this.form.serviceLocationId,
          dateFrom: this.form.dateFrom,
          dateTo: this.form.dateTo || this.form.dateFrom,
          fromTime: this.form.fromTime,
          toTime: this.form.toTime,
          pauseFrom: this.form.pauseFrom || undefined,
          pauseTo: this.form.pauseTo || undefined,
          capacity: openCount,
          deadline: this.form.deadline || undefined,
          targetType,
          status: 'draft',
        })
        .subscribe({
          next: ({ shift, merged }) => {
            if (merged) {
              this.saving.set(false);
              this.surfaceContractFailures(contractResult);
              this.ref.close({ kind: 'shift.batch.merged', shift });
              return;
            }
            this.shiftsApi.publish(shift.id).subscribe({
              next: published => {
                this.saving.set(false);
                this.surfaceContractFailures(contractResult);
                this.ref.close({ kind: 'shift.batch.published', shift: published });
              },
              error: () => {
                this.saving.set(false);
                this.surfaceContractFailures(contractResult);
                this.ref.close({ kind: 'shift.batch.created-no-publish', shift });
              },
            });
          },
          error: err => {
            this.saving.set(false);
            this.error.set(this.parseError(err));
            this.cdr.markForCheck();
          },
        });
    });
  }

  /**
   * Create one DPS contract per employee id (Specifieke-namen flow,
   * P1 follow-up 2026-05-19). Each contract fetches the employee's
   * wage packets and uses the first one as the default loonpakket —
   * same convention the per-employee dialog-contract-create dialog
   * uses. The contract spans the dialog's dateFrom..dateTo range with
   * the same werkuren per day.
   *
   * Returns ONE observable that resolves when every per-employee
   * create call has settled (success OR error — see
   * `surfaceContractFailures`). Empty list → emits an empty result
   * immediately. Per-employee errors do not short-circuit siblings.
   */
  private createContractsForEmployees(
    employeeIds: string[],
  ): Observable<{
    created: ContractModel[];
    failed: Array<{ employeeId: string; reason: string }>;
  }> {
    if (employeeIds.length === 0) {
      return of({ created: [], failed: [] });
    }
    // For each employee: fetch wages → take first → POST contract.
    // Each per-employee chain catches its own errors so one Dimona
    // rejection doesn't abort siblings in the forkJoin.
    const requests = employeeIds.map(employeeId =>
      this.wagesApi
        .getEmployeeWages({
          companyId: this.companyId,
          employeeId,
          page: 0,
          size: 50,
        } as Parameters<EmployeeWageApiService['getEmployeeWages']>[0])
        .pipe(
          map(wages => (wages ?? [])[0]),
          switchMap(wage => this.createOneContract(employeeId, wage)),
          catchError(err =>
            of({
              ok: false as const,
              employeeId,
              reason: this.parseError(err),
            }),
          ),
        ),
    );
    return forkJoin(requests).pipe(
      map(results => {
        const created: ContractModel[] = [];
        const failed: Array<{ employeeId: string; reason: string }> = [];
        for (const r of results) {
          if (r.ok) created.push(r.contract);
          else failed.push({ employeeId: r.employeeId, reason: r.reason });
        }
        return { created, failed };
      }),
    );
  }

  /**
   * Build + POST one contract for `employeeId`. Returns an observable
   * that always resolves (success → `{ ok: true, contract }`, failure →
   * `{ ok: false, employeeId, reason }`) so siblings in a forkJoin
   * aren't aborted by a single Dimona rejection.
   */
  private createOneContract(
    employeeId: string,
    wage: EmployeeWageModel | undefined,
  ): Observable<
    | { ok: true; contract: ContractModel; employeeId: string }
    | { ok: false; employeeId: string; reason: string }
  > {
    if (!wage) {
      return of({
        ok: false as const,
        employeeId,
        reason: 'Geen loonpakket gevonden voor medewerker.',
      });
    }
    const dateFrom = this.form.dateFrom;
    const dateTo = this.form.dateTo || this.form.dateFrom;
    const schedule = this.buildContractSchedule(dateFrom, dateTo);
    const payload: ContractModel = {
      id: '',
      employeeId,
      companyId: this.companyId,
      dateFrom,
      dateTo,
      status: ContractStatusEnum.DRAFT,
      timetable: { schedule },
      allocationId: wage.allocationId,
      wageHour: wage.wageHour,
      position: wage.position,
      compensationHours: wage.compensationHours,
      mealVoucher: wage.mealVoucher,
      travelAllowance: wage.travelAllowance,
      statute: wage.statute,
      paritairComite: wage.paritairComite,
      reason: wage.reason,
      employmentAddress: wage.employmentAddress,
      revenueConsultant: wage.revenueConsultant,
      revenueOfficeCode: wage.revenueOfficeCode,
      invoicing: {
        coefficient: 0,
        coefficientTravelAllowance: 0,
        coefficientMealVouchers: 0,
        coefficientEcoVouchers: 0,
        coefficientBankHoliday: 0,
        dimonaCost: 0,
        defaultTaxRate: { code: '', name: '' },
      },
      // DPS rejects 0/null on these — sensible defaults; planner can
      // tune per-contract afterwards via the standard contract dialog.
      companyHoursPerWeek: 40,
      employeeHoursPerWeek: 40,
      cancelReason: null,
      cancelExtraInfo: null,
      result: null,
      socialSecurityCategory: null,
    };
    return this.contractsApi.createContract(payload).pipe(
      map(contract => ({ ok: true as const, contract, employeeId })),
      catchError(err => of({
        ok: false as const,
        employeeId,
        reason: this.parseError(err),
      })),
    );
  }

  /**
   * One day-schedule entry per day in the inclusive range. The dialog
   * applies the same werkuren / pauze on every day — multi-day shifts
   * are expanded into per-day rows because that's what the DPS contract
   * schema demands (one ContractDayScheduleModel per calendar day).
   */
  private buildContractSchedule(
    dateFrom: string,
    dateTo: string,
  ): ContractDayScheduleModel[] {
    const start = DateTime.fromISO(dateFrom);
    const end = DateTime.fromISO(dateTo);
    if (!start.isValid || !end.isValid) return [];
    const out: ContractDayScheduleModel[] = [];
    let cursor = start;
    while (cursor <= end) {
      out.push({
        shiftTemplateName: null,
        createShiftTemplate: false,
        date: cursor.toISODate() ?? '',
        fromTime: this.form.fromTime || null,
        toTime: this.form.toTime || null,
        pauseFromTime: this.form.pauseFrom || null,
        pauseToTime: this.form.pauseTo || null,
      });
      cursor = cursor.plus({ days: 1 });
    }
    return out;
  }

  /**
   * Toast partial failures from the contract-create forkJoin. Success-
   * only batches stay silent (the dialog closes + the planning grid
   * refresh is its own confirmation). Logged details give the operator
   * the per-employee error code so they can retry from the standard
   * contract dialog if Dimona pushed back.
   */
  private surfaceContractFailures(result: {
    created: ContractModel[];
    failed: Array<{ employeeId: string; reason: string }>;
  }): void {
    if (result.failed.length === 0) return;
    const total = result.created.length + result.failed.length;
    this.messageService?.add({
      severity: 'warn',
      summary: 'Contracten gedeeltelijk aangemaakt',
      detail: `${result.created.length} van ${total} contracten aangemaakt. Probeer de overige opnieuw via Medewerkers.`,
      life: 6000,
    });
    for (const f of result.failed) {
      // eslint-disable-next-line no-console
      console.warn('[dialog-shift-batch] contract create failed', f);
    }
  }

  private parseError(err: unknown): string {
    const e = err as { error?: { message?: string; errors?: { details?: string }[] } } | undefined;
    return e?.error?.message ?? e?.error?.errors?.[0]?.details ?? 'Aanmaken shift mislukt.';
  }
}
