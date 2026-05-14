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

import { Store } from '@ngxs/store';
import { DateTime } from 'luxon';

import {
  ShiftApiService,
  ShiftModel,
  ShiftTargetType,
} from '@dps/core/api/shift/shift.api.service';
import {
  ServiceGroupApiService,
  ServiceGroupModel,
} from '@dps/core/api/service-group/service-group.api.service';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';
import { CompanyGroupApiService, EmployeeApiService } from '@dps/core/api';
import { EmployeeGroupEngagement, EmployeeModel, Group } from '@dps/shared/models';
import { RootState } from '@dps/core/store';

interface DialogData {
  companyId?: string;
  serviceGroupId?: string;
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
  private readonly serviceGroupsApi = inject(ServiceGroupApiService);
  private readonly engagementGroupsApi = inject(EngagementGroupApiService);
  private readonly employeesApi = inject(EmployeeApiService);
  private readonly companyGroupsApi = inject(CompanyGroupApiService);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);

  /** "Bestaande shift gebruiken" / "Nieuwe uren ingeven" toggle state. */
  protected readonly hoursMode = signal<'template' | 'custom'>('template');
  protected readonly branches = signal<EngagementGroupModel[]>([]);

  protected readonly companyId = this.config.data?.companyId ?? '';
  protected readonly companyName = this.store.selectSnapshot(RootState.getCompanyData)?.name ?? '';
  protected readonly serviceGroups = signal<ServiceGroupModel[]>([]);
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

  protected readonly form = {
    serviceGroupId:
      this.config.data?.existingShift?.service_group_id ??
      this.config.data?.serviceGroupId ??
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

  protected readonly serviceGroupOptions = () =>
    this.serviceGroups().map(s => ({ label: s.name, value: s.id }));

  /**
   * Flat list of rich options. Kept as an internal helper — the template
   * binds to `employeeGroups()` instead so PrimeNG's grouped renderer
   * can label the three sections from mockup 09 (Beschikbaar / Andere
   * medewerkers / Vaste werknemers).
   */
  protected readonly employeeOptions = () =>
    this.poolEmployees().map(e => this.toRichEmployeeOption(e));

  /**
   * Grouped options for the Persoon-kiezen p-select. Splits the flat
   * employee list into three buckets that match the mockup column 2:
   *   - Beschikbaar     → full overlap (availability=match), non-permanent
   *   - Andere medewerkers → partial / no overlap, non-permanent
   *   - Vaste werknemers → permanent employees (rendered teal)
   *
   * Each group exposes a `count` chip and a `variant` so the panel SCSS
   * can colour the group header (pink/brand for Beschikbaar, teal for
   * Vaste werknemers, muted for the rest).
   */
  protected readonly employeeGroups = (): RichEmployeeGroup[] => {
    const opts = this.employeeOptions();
    const available = opts.filter(o => !o.isPermanent && o.availability === 'match');
    const other = opts.filter(o => !o.isPermanent && o.availability !== 'match');
    const fixed = opts.filter(o => o.isPermanent);
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
   *  service-group. Falls back to a generic label while loading. */
  protected positionLabel(): string {
    const sgId = this.form.serviceGroupId;
    const sg = this.serviceGroups().find(s => s.id === sgId);
    if (!sg) return 'service location';
    const branch = this.branches().find(b => b.id === sg.branch_group_id);
    return branch ? `${branch.name} — ${sg.name}` : sg.name;
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
   *  Each option carries a `serviceGroupId` so the dialog can detect when
   *  the chosen loonpakket belongs to a different vestiging than the one
   *  the shift is for — mockup 09 column 3 shows the inline banner that
   *  surfaces in exactly that case. The first option is intentionally on
   *  a different service-group to make the banner demoable in the gallery.
   */
  protected readonly loonpakketOptions = [
    {
      label: 'Barista — Flexijob bediende — Antwerpen Eilandje',
      value: 'barista-flex-antwerpen',
      serviceGroupId: 'sg-antwerpen-eilandje',
    },
    {
      label: 'Barista — Arbeider — Gent Dok Noord',
      value: 'barista-arbeider-gent',
      serviceGroupId: 'sg-gent-dok-noord',
    },
    {
      label: 'Kelner — Flexijob bediende — Gent Dok Noord',
      value: 'kelner-flex-gent',
      serviceGroupId: 'sg-gent-dok-noord',
    },
  ];

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
    const opt = this.loonpakketOptions.find(o => o.value === slot.loonpakketId);
    if (!opt) return false;
    // Mismatch when the picked wage-template's vestiging (≈ address)
    // differs from the chosen service-location's. The current PoC uses
    // placeholder ids ("sg-gent-dok-noord", etc.); production wires this
    // to a real wage-template ↔ vestiging join keyed on address.
    return opt.serviceGroupId !== this.form.serviceGroupId;
  }

  /**
   * Mockup-09 column 3 — friendly statute name to surface in the banner
   * copy: "Voor Anouk bestaat er nog geen Barista (Flexijob bediende) op
   * deze vestiging." We just take the loonpakket label and split off the
   * leading position + statute pieces.
   */
  protected bannerPakketLabel(slot: Slot): string {
    const opt = this.loonpakketOptions.find(o => o.value === slot.loonpakketId);
    if (!opt) return 'dit loonpakket';
    // "Barista — Flexijob bediende — Antwerpen Eilandje" → "Barista (Flexijob bediende)"
    const parts = opt.label.split('—').map(p => p.trim());
    if (parts.length >= 2) return `${parts[0]} (${parts[1]})`;
    return opt.label;
  }

  /**
   * "Aanmaken" click on the inline banner. For now: stub that just
   * dismisses the banner for that slot. Production hookup is a POST to
   * the wage-template endpoint with the slot's loonpakket details + the
   * current service-group, after which the new template gets selected
   * automatically.
   */
  protected onCreateLoonpakket(slotIndex: number): void {
    this.bannerDismissed.update(d => ({ ...d, [slotIndex]: true }));
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
      this.serviceGroupsApi.list(this.companyId).subscribe({
        next: rows => {
          this.serviceGroups.set(rows ?? []);
          if (rows && rows.length > 0 && !this.form.serviceGroupId) {
            this.form.serviceGroupId = rows[0].id;
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
   *  emits a change. */
  protected onSlotEmployeeSelected(idx: number, employeeId: string): void {
    const emp = this.poolEmployees().find(e => e.id === employeeId);
    const name =
      emp != null
        ? `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || employeeId
        : '';
    this.slots.update(arr =>
      arr.map((s, i) =>
        i === idx
          ? { kind: 'assigned' as const, employeeId, employeeName: name }
          : s,
      ),
    );
  }

  /** Composite validation. Returns null when valid, else the first
   *  failing reason (also shown as a tooltip on the disabled confirm
   *  button so the operator knows why they can't submit). */
  protected validationError(): string | null {
    if (!this.form.serviceGroupId) return 'Kies een service location.';
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

    // status: when every slot is assigned, the shift is "fulfilled" — it's
    // not an open shift broadcast. When at least one slot is open we keep
    // it as a draft → publish so the pool gets notified. This fixes the
    // bug where assigning an employee still produced an Open shift block.
    const allAssigned = assignedIds.length === this.slots().length;
    const targetType: ShiftTargetType = allAssigned ? 'SELECTION' : 'ALL_POOL';

    // Edit mode: PATCH /api/shifts/:id/share with the updated target +
    // deadline. The PoC-DB endpoint accepts a partial merge.
    if (this.isEdit && this.editingShiftId) {
      this.shiftsApi
        .share(this.editingShiftId, {
          targetType,
          targetEmployeeIds: assignedIds.length > 0 ? assignedIds : undefined,
          reactionDeadline: this.hasOpenSlot() ? this.form.deadline : undefined,
        })
        .subscribe({
          next: shift => {
            this.saving.set(false);
            this.ref.close({ kind: 'shift.batch.published', shift });
          },
          error: err => {
            this.saving.set(false);
            this.error.set(this.parseError(err));
            this.cdr.markForCheck();
          },
        });
      return;
    }

    this.shiftsApi
      .create({
        companyId: this.companyId,
        serviceGroupId: this.form.serviceGroupId,
        dateFrom: this.form.dateFrom,
        dateTo: this.form.dateTo || this.form.dateFrom,
        fromTime: this.form.fromTime,
        toTime: this.form.toTime,
        pauseFrom: this.form.pauseFrom || undefined,
        pauseTo: this.form.pauseTo || undefined,
        capacity: this.slots().length,
        deadline: this.form.deadline || undefined,
        targetType,
        targetEmployeeIds: assignedIds.length > 0 ? assignedIds : undefined,
        status: 'draft',
      })
      .subscribe({
        next: ({ shift, merged }) => {
          // The server may have folded this payload into an existing
          // draft/open shift on the same SL + dates + hours. We forward
          // that signal up so the caller can show a toast instead of
          // pretending a fresh shift was created. Merged shifts also
          // skip publish — the original shift was already published
          // (or is still a draft, in which case the operator publishes
          // explicitly via the next save).
          if (merged) {
            this.saving.set(false);
            this.ref.close({ kind: 'shift.batch.merged', shift });
            return;
          }
          // Fully-assigned shifts skip publish — they don't need to be
          // broadcast. The PoC-DB still flips status to "fulfilled" via
          // /share so the planning grid renders them as solid (not open).
          if (allAssigned) {
            this.shiftsApi
              .share(shift.id, {
                targetType: 'SELECTION',
                targetEmployeeIds: assignedIds,
              })
              .subscribe({
                next: updated => {
                  this.saving.set(false);
                  this.ref.close({ kind: 'shift.batch.published', shift: updated });
                },
                error: () => {
                  this.saving.set(false);
                  this.ref.close({ kind: 'shift.batch.published', shift });
                },
              });
            return;
          }
          this.shiftsApi.publish(shift.id).subscribe({
            next: published => {
              this.saving.set(false);
              this.ref.close({ kind: 'shift.batch.published', shift: published });
            },
            error: () => {
              this.saving.set(false);
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
  }

  private parseError(err: unknown): string {
    const e = err as { error?: { message?: string; errors?: { details?: string }[] } } | undefined;
    return e?.error?.message ?? e?.error?.errors?.[0]?.details ?? 'Aanmaken shift mislukt.';
  }
}
