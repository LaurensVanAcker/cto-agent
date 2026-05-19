import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { DateTime } from 'luxon';
import { catchError, filter, forkJoin, of, take, type Observable } from 'rxjs';

// Bryntum
import type { EventModel, ResourceModel, Scheduler, SchedulerConfig } from '@bryntum/scheduler';
import { BryntumSchedulerComponent, BryntumSchedulerModule } from '@bryntum/scheduler-angular';

// PrimeNG
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { Menu, MenuModule } from 'primeng/menu';
import { MenuItem, MessageService } from 'primeng/api';

import { RootState } from '@dps/core/store';
import { EmployeeApiService, ContractApiService } from '@dps/core/api';
import { PageHeaderComponent } from '@dps/shared/components';
import { ContractListModel, EmployeeModel } from '@dps/shared/models';
import { mapContractToSchedulerEvent } from '@dps/shared/functions';
import { GENERAL_SCHEDULER_CONFIG, TODAY_TIME_RANGE_ID } from '@dps/shared/configs';
import { ContractDialogComponent } from '@dps/shared/components/contract-dialog/contract-dialog.component';
import type { ContractDialogDataModel } from '@dps/shared/components/contract-dialog/contract-dialog-data.model';
import {
  ServiceLocationApiService,
  ServiceLocationModel,
} from '@dps/core/api/service-location/service-location.api.service';
import {
  ShiftApiService,
  ShiftModel,
} from '@dps/core/api/shift/shift.api.service';
import {
  PermanentEmployeeApiService,
  PermanentEmployeeModel,
} from '@dps/core/api/permanent-employee/permanent-employee.api.service';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';
import { DialogShiftBatchComponent } from '@dps/shared/components/dialog-shift-batch/dialog-shift-batch.component';
import { DialogShiftDetailComponent } from '@dps/shared/components/dialog-shift-detail/dialog-shift-detail.component';
import { DialogShiftShareComponent } from '@dps/shared/components/dialog-shift-share/dialog-shift-share.component';
import { DialogAddServiceLocationComponent } from '@dps/shared/components/dialog-add-service-location/dialog-add-service-location.component';
import { DialogEditVestigingComponent } from '@dps/shared/components/dialog-edit-vestiging/dialog-edit-vestiging.component';
import { DialogVastBlockComponent } from '@dps/shared/components/dialog-vast-block/dialog-vast-block.component';
import { DialogAttachVestigingComponent } from '@dps/shared/components/dialog-attach-vestiging/dialog-attach-vestiging.component';
import {
  PermanentBlockApiService,
  PermanentBlockModel,
} from '@dps/core/api/permanent-block/permanent-block.api.service';
import {
  AvailabilityApiService,
  AvailabilityModel,
} from '@dps/core/api/availability/availability.api.service';

type PocPlanningView = 'names' | 'locations';
type PocPlanningZoom = 'day' | 'week' | '2weeks';

const VIEW_OPTIONS: { label: string; value: PocPlanningView }[] = [
  { label: 'Medewerkers', value: 'names' },
  { label: 'Locaties', value: 'locations' },
];

const ZOOM_OPTIONS: { label: string; value: PocPlanningZoom }[] = [
  { label: 'Dag', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: '2 weken', value: '2weeks' },
];

interface PocResource {
  id: string;
  name: string;
  /** Names view: marks PoC-DB "vaste medewerker" rows (perm:* ids). */
  isPermanent?: boolean;
  /** Locaties view: marks the synthetic vestiging-header row (no events,
   *  has a "+ Service location" button). */
  isBranch?: boolean;
  /** Locaties view: id of the parent vestiging for a service-location row.
   *  Used by the row renderer to indent and by the empty-cell click to
   *  pass the right context to the new-shift dialog. */
  branchId?: string;
  /** Locaties view: SL row that has no vestiging — the renderer shows a
   *  "Koppel" pencil that opens the attach-vestiging dialog. */
  isOrphan?: boolean;
  /** Synthetic header row for the orphan bucket — same chrome as a
   *  vestiging header but without the "+" button. */
  isOrphanHeader?: boolean;
}

interface PocEvent {
  id: string;
  resourceId: string;
  startDate: Date;
  endDate: Date;
  name: string;
  cls: string;
  eventColor?: string;
  kind: 'contract' | 'shift' | 'permanent';
  raw: unknown;
}

/**
 * PoC planning surface — real Bryntum integration aligned with mockups
 * 10 (names), 11 (V+SL) and 13 (day). The existing
 * `pages/company/modules/planning/` (production planning) remains
 * untouched. This view runs in parallel and merges three event sources:
 *
 *  - DPS contracts (`/api/contracts`)
 *  - PoC-DB shifts (`/api/shifts`)
 *
 * Resources change shape per view:
 *  - Names: flat rows = DPS employees (+ permanent employees as siblings)
 *  - V+SL: tree rows = vestiging (DPS engagement group) > service location
 *  - Day: same as V+SL but Bryntum vertical preset, one day at a time
 */
@Component({
  selector: 'dps-planning-poc',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BryntumSchedulerModule,
    ButtonModule,
    SelectButtonModule,
    TooltipModule,
    ToastModule,
    MenuModule,
    PageHeaderComponent,
  ],
  providers: [DialogService, MessageService],
  templateUrl: './planning-poc.component.html',
  styleUrl: './planning-poc.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-auto flex-column overflow-hidden p-3 gap-3',
    '(click)': 'hostClickHandler($event)',
  },
})
export class PlanningPocComponent implements AfterViewInit {
  @ViewChild('scheduler') readonly schedulerComponent?: BryntumSchedulerComponent;
  /** Anchored to the clicked branch-row 3-dot trigger at hostClickHandler
   *  time. Model is rebuilt per-click with the branchId baked in. */
  @ViewChild('branchMenu') readonly branchMenu?: Menu;
  protected readonly branchMenuItems = signal<MenuItem[]>([]);

  private readonly employeesApi = inject(EmployeeApiService);
  private readonly contractsApi = inject(ContractApiService);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly permanentEmployeesApi = inject(PermanentEmployeeApiService);
  private readonly permanentBlocksApi = inject(PermanentBlockApiService);
  private readonly availabilityApi = inject(AvailabilityApiService);
  private readonly serviceLocationsApi = inject(ServiceLocationApiService);
  private readonly engagementGroupsApi = inject(EngagementGroupApiService);
  private readonly dialogService = inject(DialogService);
  private readonly messageService = inject(MessageService);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Per-user preference keys. We don't bother with server-side persistence
   *  for the PoC — localStorage is enough to remember the last-used view
   *  across refreshes / company switches. */
  private static readonly LS_VIEW_KEY = 'poc.planning.view';
  private static readonly LS_ZOOM_KEY = 'poc.planning.zoom';

  protected readonly view = signal<PocPlanningView>(
    (localStorage.getItem(PlanningPocComponent.LS_VIEW_KEY) as PocPlanningView | null) ?? 'names',
  );
  protected readonly zoom = signal<PocPlanningZoom>(
    (localStorage.getItem(PlanningPocComponent.LS_ZOOM_KEY) as PocPlanningZoom | null) ?? 'week',
  );
  protected readonly viewOptions = VIEW_OPTIONS;
  protected readonly zoomOptions = ZOOM_OPTIONS;
  /** Free-text employee filter, debounced + sent as nameLike to /api/employees. */
  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  // Anchor: Monday of this week for Week / 2-week zooms, today for Day-zoom
  // (so the user lands on something with content instead of staring at an
  // empty Monday). Zoom transitions re-anchor this via setZoom.
  protected readonly weekStart = signal<string>(
    (((localStorage.getItem(PlanningPocComponent.LS_ZOOM_KEY) as PocPlanningZoom | null) ?? 'week') ===
    'day'
      ? DateTime.now().startOf('day').toISODate()
      : DateTime.now().startOf('week').toISODate()) ?? '',
  );
  protected readonly resources = signal<PocResource[]>([]);
  protected readonly events = signal<PocEvent[]>([]);
  /**
   * Active company — fed to <dps-page-header [subtitle]> so the planning
   * page chrome matches accounts/actuals (indigo title chip + tenant
   * subtitle). Mirrors pool.component's `company` selectSignal.
   */
  protected readonly company = this.store.selectSignal(RootState.getCompanyData);
  /**
   * Per-resource background time ranges — used to paint availability
   * hour-blocks BEHIND contracts/shifts in the Medewerkers view. Bryntum
   * draws ResourceTimeRanges below events so they read as context, not as
   * a clickable block, and they don't stack in their own lane (which the
   * previous event-based approach did when `allowOverlap=true`).
   */
  protected readonly resourceTimeRanges = signal<
    Array<{
      id: string;
      resourceId: string;
      startDate: Date;
      endDate: Date;
      name?: string;
      timeRangeColor?: string;
      cls?: string;
    }>
  >([]);
  protected readonly loading = signal(false);
  /** Cache of the visible week's employees, keyed by DPS id. Used to look up
   * an EmployeeModel when the user clicks a contract event. */
  private readonly employeesById = new Map<string, EmployeeModel>();

  /**
   * Custom event-bar renderer — paints the v5 block layout:
   *  - permanent (Vast) block: `<span class="poc-vast-tag">Vast</span> Name`
   *  - open-shift block:        title + "+N" pill in the top-right if capacity > 1
   *  - contract block:          position + time range
   *
   * Returns raw HTML. Bryntum's eventStyle is set to 'plain' so we have
   * full control of the inner DOM (no default border/title overlay to
   * fight with).
   */
  private readonly eventBarRenderer = ({
    eventRecord,
  }: {
    eventRecord: { getData: (key: string) => unknown };
  }): string => {
    const kind = eventRecord.getData('kind') as PocEvent['kind'] | undefined;
    const name = String(eventRecord.getData('name') ?? '');
    const raw = eventRecord.getData('raw') as { capacity?: number } | undefined;
    const start = eventRecord.getData('startDate') as Date | undefined;
    const end = eventRecord.getData('endDate') as Date | undefined;
    const fmt = (d: Date | undefined): string =>
      d ? DateTime.fromJSDate(d).toFormat('HH:mm') : '';

    if (kind === 'permanent') {
      return `
        <div class="poc-event-title">
          <span class="poc-vast-tag">Vast</span>
          <span>${name.replace(/^Vast\s*[-—]?\s*/, '')}</span>
        </div>
        <div class="poc-event-times">${fmt(start)} – ${fmt(end)}</div>`;
    }
    if (kind === 'shift') {
      // Badge = applicants who positively reacted (mockup 11 spec). Capacity
      // already lives in the title ("2 open shifts") so we don't repeat it
      // here. We only paint the magenta dot when there's actually
      // applications — empty zero would just be visual noise.
      const apps = (raw as { applications_count?: number } | undefined)
        ?.applications_count ?? 0;
      const badge =
        apps > 0
          ? `<span class="poc-open-badge" aria-label="${apps} reacties">${apps}</span>`
          : '';
      const title = name && name.length > 0 ? name : 'Open shift';
      return `
        ${badge}
        <div class="poc-event-title">${title}</div>
        <div class="poc-event-times">${fmt(start)} – ${fmt(end)}</div>`;
    }
    // Default = contract.
    return `
      <div class="poc-event-title">${name}</div>
      <div class="poc-event-times">${fmt(start)} – ${fmt(end)}</div>`;
  };

  /**
   * Custom resource-column renderer.
   *
   * Names view: "Jan Janssens" / "Jan Janssens (vast)".
   *
   * Locaties view:
   *   - branch row → "Galana" + "+" button (opens "Nieuwe service location"
   *     dialog scoped to that vestiging) — purely visual, no shifts attach.
   *   - service-location row → indented "Toog".
   *
   * The "+" button click is wired via a data-action attribute; we delegate
   * the actual handling in a host listener (see hostClickHandler) so we
   * don't have to leak Angular context into the Bryntum DOM.
   */
  private readonly resourceColumnRenderer = ({
    record,
  }: {
    record: { getData: (key: string) => unknown };
  }): string => {
    const name = String(record.getData('name') ?? '');
    const isBranch = !!record.getData('isBranch');
    const branchId = String(record.getData('id') ?? '').replace(/^branch:/, '');
    if (this.view() === 'locations' && isBranch) {
      // Branch (vestiging) row: a single 3-dot menu trigger keeps the
      // chrome subtle and gives both actions (add service-location,
      // edit branch address) consistent visual weight. The actual menu
      // is rendered by a single Angular <p-menu> anchored to the
      // clicked trigger at hostClick time.
      const isReal = branchId && !branchId.startsWith('_');
      const trigger = isReal
        ? `<button
            type="button"
            class="poc-branch-menu"
            data-poc-action="branch-menu"
            data-branch-id="${branchId}"
            title="Acties"
            aria-label="Acties voor vestiging"
          ><span class="dps-icon dps-icon-more_vert"></span></button>`
        : '';
      return `
        <div class="poc-branch-row">
          <span class="poc-branch-name">
            <span class="dps-icon dps-icon-apartment poc-branch-icon"></span>
            <span>${name}</span>
          </span>
          <span class="poc-branch-actions">${trigger}</span>
        </div>`;
    }
    if (this.view() === 'locations') {
      const slId = String(record.getData('id') ?? '');
      const isOrphan = !!record.getData('isOrphan');
      if (isOrphan) {
        // Orphan SL: surface a clear "koppel aan vestiging" pencil with a
        // warning amber pill so the operator can tell why this row is
        // misbehaving.
        return `
          <span class="poc-sl-row poc-sl-orphan">
            <span class="poc-orphan-pill">!</span>
            <span>${name}</span>
            <button
              type="button"
              class="poc-sl-gear"
              data-poc-action="attach-sl"
              data-sl-id="${slId}"
              title="Koppel aan vestiging"
            ><span class="dps-icon dps-icon-edit"></span></button>
          </span>`;
      }
      // Service-location row: name + rename pencil (no address — that
      // lives on the parent vestiging row).
      return `
        <span class="poc-sl-row">
          <span>${name}</span>
          <button
            type="button"
            class="poc-sl-gear"
            data-poc-action="rename-sl"
            data-sl-id="${slId}"
            title="Naam wijzigen"
          ><span class="dps-icon dps-icon-edit"></span></button>
        </span>`;
    }
    // Names view: permanent (PoC-DB) rows get a teal "Vast" pill prefix,
    // matching the v5 mockup's row treatment. The name itself is stripped
    // of the legacy "(vast)" suffix we used while there was no styled pill.
    const isPerm = !!record.getData('isPermanent');
    if (isPerm) {
      const clean = name.replace(/\s*\(vast\)\s*$/i, '');
      return `
        <span class="poc-name-row">
          <span class="poc-perm-tag">Vast</span>
          <span>${clean}</span>
        </span>`;
    }
    return `<span class="poc-name-row"><span>${name}</span></span>`;
  };

  protected readonly schedulerConfig = computed<Partial<SchedulerConfig>>(() => {
    const z = this.zoom();
    const commonColumns = [
      {
        text: '',
        field: 'name',
        width: 280,
        enableHeaderContextMenu: false,
        enableCellContextMenu: false,
        cellCls: 'poc-resource-cell',
        htmlEncode: false,
        renderer: this.resourceColumnRenderer,
      },
    ];

    if (z === 'day') {
      // Mockup 13: horizontal grid, single day on the X-axis, one row per
      // resource. Full 24h strip — night shifts (horeca tot 03u) zijn
      // zichtbaar. Scroll-buttons (set on the host) laten de operator
      // makkelijk vooruit/achteruit door de uren navigeren.
      //
      // We drop the today timeRange because the whole grid IS today —
      // showing the magenta stripe across the entire body just looked
      // like a CSS bug. We add a thin "now-line" instead — a 1-minute
      // wide timeRange that paints a magenta vertical line at the current
      // hour (mockup 13's `.now-line`).
      const base = { ...GENERAL_SCHEDULER_CONFIG } as Partial<SchedulerConfig>;
      const baseTimeRanges = (base.timeRanges ?? []) as Array<{ id?: string | number }>;
      const nowLineRange = {
        id: 'now-line',
        startDate: DateTime.now().toJSDate(),
        duration: 1,
        durationUnit: 'minute',
        cls: 'poc-now-line',
      };
      return {
        ...base,
        columns: commonColumns,
        viewPreset: {
          base: 'hourAndDay',
          tickWidth: 80,
          headers: [
            {
              unit: 'day',
              dateFormat: 'dddd D MMMM',
              headerCellCls: 'justify-content-center text-base font-medium',
            },
            { unit: 'hour', dateFormat: 'HH:mm' },
          ],
        },
        eventStyle: 'plain',
        eventRenderer: this.eventBarRenderer,
        rowHeight: 65,
        // Locaties view emits multiple blocks per shift (assigned per
        // employee + the remaining open block); they all land on the same
        // service_location row so Bryntum needs allowOverlap=true to stack
        // them into lanes instead of refusing to render.
        //
        // Pilot feedback 2026-05-18 (regression of 17c9c16): dragging a new
        // contract / open shift onto a day-view row that already contained
        // an event landed exactly on top of the existing bar because
        // Bryntum's default `pack` layout squeezes overlaps into a single
        // lane. Force `stack` + a small `barMargin` so each overlap gets
        // its own y-lane below the previous one, matching the actuals
        // scheduler fix.
        allowOverlap: true,
        eventLayout: 'stack',
        barMargin: 6,
        timeRanges: [
          ...baseTimeRanges.filter(r => r.id !== TODAY_TIME_RANGE_ID),
          nowLineRange,
        ],
      } as unknown as Partial<SchedulerConfig>;
    }
    return {
      ...GENERAL_SCHEDULER_CONFIG,
      columns: commonColumns,
      // Drop the redundant week-level header row from the shared
      // GENERAL_SCHEDULER_CONFIG: the toolbar above already shows
      // "<from> → <to> (week N)" so a second copy inside Bryntum is just
      // visual noise that takes vertical room from the grid.
      viewPreset: {
        base: 'dayAndWeek',
        headers: [
          {
            unit: 'day',
            dateFormat: 'ddd D',
          },
        ],
      },
      // 'plain' = no default Bryntum chrome on the event bar; the renderer
      // owns the full HTML. Combined with the per-kind classes in cls (set
      // by buildEvents) the SCSS paints the v5 mockup look exactly.
      eventStyle: 'plain',
      eventRenderer: this.eventBarRenderer,
      rowHeight: 65,
      // Same lane-stacking reason as the day-zoom config above. Also need
      // `eventLayout: 'stack'` + `barMargin` so dropped events land BELOW
      // the existing bar instead of on top of it (pilot feedback 2026-05-18,
      // regression of 17c9c16 after the service_locations rename).
      allowOverlap: true,
      eventLayout: 'stack',
      barMargin: 6,
    } as unknown as Partial<SchedulerConfig>;
  });

  protected readonly weekLabel = computed(() => {
    const week = DateTime.fromISO(this.weekStart()).setLocale('nl-BE');
    const z = this.zoom();
    if (z === 'day') {
      // weekStart IS the displayed day in Day-zoom — label matches grid.
      return week.toFormat('cccc d LLL yyyy');
    }
    const end = z === '2weeks' ? week.plus({ days: 13 }) : week.plus({ days: 6 });
    return `${week.toFormat('d LLL')} → ${end.toFormat('d LLL yyyy')} (week ${week.weekNumber})`;
  });

  /**
   * Day zoom: anchor on today if it falls in the visible week, otherwise
   * on the week's Monday. The hour window spans the full 24h so night
   * shifts (e.g. horeca tot 03u) zijn zichtbaar — mockup 13 toont een
   * 24-uur strip met scroll-buttons. Bryntum's scrollButtonsFeature
   * (config'd by `zoom() === 'day'`) lets the operator scroll horizontaal.
   *
   * Week / 2 weken: full day boundary (00:00–24:00) for 7 / 14 days from
   * the anchor Monday.
   */
  /**
   * Day zoom: weekStart IS the displayed day (set by setZoom / previousDay /
   * nextDay). Bryntum shows [day, day+1]. Without this, the previous "snap
   * to today" logic ate every prev/next-day click whenever today happened
   * to sit in the visible 7-day window — Day view felt frozen.
   *
   * Week / 2 weken: weekStart is the anchor Monday. Bryntum shows 7 or 14
   * full days from there.
   */
  protected readonly startDate = computed(() => {
    return DateTime.fromISO(this.weekStart()).startOf('day').toJSDate();
  });
  protected readonly endDate = computed(() => {
    const anchor = DateTime.fromISO(this.weekStart()).startOf('day');
    const z = this.zoom();
    if (z === 'day') return anchor.plus({ days: 1 }).toJSDate();
    if (z === '2weeks') return anchor.plus({ days: 14 }).toJSDate();
    return anchor.plus({ days: 7 }).toJSDate();
  });

  /**
   * Item 3 (re-fix, pilot feedback 2026-05-19): the `eventLayout` and
   * `barMargin` props were set in the schedulerConfig computed but NEVER
   * bound to the <bryntum-scheduler> template, AND Bryntum only honours
   * `eventLayout` at construction time — switching viewPreset after
   * the instance is up doesn't re-apply it. Net result: dropping a new
   * contract on a day-view row that already had one landed exactly on
   * top of the existing bar (Bryntum's default `pack` lane shrinks
   * overlaps into one lane).
   *
   * Fix: re-assert `eventLayout = 'stack'` and `barMargin = 6` on the
   * live Bryntum instance every time the zoom changes (Dag/Week/2 weken),
   * which forces Bryntum to recompute lanes for the new viewPreset.
   * The effect also fires once on first paint via the initial signal
   * read, so we don't need an explicit kick from ngAfterViewInit.
   */
  private readonly forceStackLayoutEffect = effect(() => {
    // Track zoom so the effect re-runs on every Dag/Week/2-weken switch.
    this.zoom();
    const scheduler = this.schedulerComponent?.instance as
      | (Scheduler & { eventLayout?: string; barMargin?: number })
      | undefined;
    if (!scheduler) return;
    try {
      scheduler.eventLayout = 'stack';
      scheduler.barMargin = 6;
      // Bryntum needs a refresh to recompute lanes after the layout
      // changes — without this the previous lane geometry sticks.
      (scheduler as unknown as { refreshWithTransition?: () => void })
        .refreshWithTransition?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[planning-poc] forceStackLayout failed', err);
    }
  });

  ngAfterViewInit(): void {
    this.store
      .select(RootState.getCompanyData)
      .pipe(filter(Boolean), take(1))
      .subscribe(company => this.refresh(company.id));

    // Wire the production planning page's interaction pattern: any new or
    // edited Bryntum event routes through `beforeEventEdit`, which decides
    // which dialog to open (Names → ContractDialog, Locaties → shift batch,
    // Vast row → Vast block dialog). This is the same listener prod uses,
    // so drag-to-create, drag-to-resize, and cell-click all share one
    // funnel.
    setTimeout(() => {
      const scheduler = this.schedulerComponent?.instance as Scheduler | undefined;
      if (!scheduler) return;
      (scheduler as unknown as { on: (name: string, fn: (ev: unknown) => void) => void }).on(
        'beforeEventEdit',
        (ev: unknown) => this.handleBeforeEventEdit(ev as {
          resourceRecord: ResourceModel;
          eventRecord: EventModel;
        }),
      );
    });
  }

  /**
   * Funnel for everything Bryntum tries to "edit": fresh placeholders
   * (drag-create, cell click) AND clicks on existing events.
   *
   * Dispatch order:
   *  1. Branch (vestiging-header) row → no-op, drop placeholder.
   *  2. Existing event with a known `kind` → open the appropriate detail
   *     dialog (contracts → ContractDialog, shifts → ShiftDetail, vast →
   *     toast for now).
   *  3. Otherwise (placeholder from a fresh cell-click / drag-create):
   *     pick the dialog by view (Names → ContractDialog, Locaties →
   *     shift batch).
   */
  private handleBeforeEventEdit(
    ev: { resourceRecord: ResourceModel; eventRecord: EventModel },
  ): false {
    const resource = ev.resourceRecord;
    const event = ev.eventRecord;
    if (!resource || !event) return false;
    const resourceId = String(resource.getData('id') ?? '');
    const isBranch = !!resource.getData('isBranch');
    if (isBranch) {
      (event as { remove: () => void }).remove?.();
      return false;
    }
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) return false;

    const kind = event.getData('kind') as PocEvent['kind'] | undefined;
    const hasGenId = !!(event as { hasGeneratedId?: boolean }).hasGeneratedId;

    // Existing event with our data shape → branch on kind so each event
    // type opens its own detail dialog.
    if (!hasGenId && kind) {
      if (kind === 'contract') {
        this.openContractDialogForEvent(resourceId, event);
        return false;
      }
      if (kind === 'shift') {
        this.openShiftDetailDialog(event);
        return false;
      }
      if (kind === 'permanent') {
        this.openVastBlockDialog(resourceId, event);
        return false;
      }
    }

    // Fresh placeholder (cell-click / drag-create). Pick the right dialog
    // by view + resource kind.
    if (this.view() === 'names') {
      if (resourceId.startsWith('perm:')) {
        this.openVastBlockDialog(resourceId, event);
        return false;
      }
      this.openContractDialogForEvent(resourceId, event);
      return false;
    }
    const startDate = (event as unknown as { startDate: Date }).startDate;
    this.openShiftDialogForCell(resourceId, startDate, event);
    return false;
  }

  /**
   * Existing-shift click → reuse the same mockup-09 dialog as create, but
   * in edit mode. The user gets the same chrome they're already familiar
   * with (datum / werkuren / slots / deadline) populated with the shift's
   * current state. Confirm calls PATCH /share via the existingShift branch
   * inside the dialog.
   */
  private openShiftDetailDialog(eventRecord: EventModel): void {
    const shift = eventRecord.getData('raw') as ShiftModel | undefined;
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!shift || !company) return;
    const ref = this.dialogService.open(DialogShiftBatchComponent, {
      showHeader: false,
      width: '38rem',
      styleClass: 'm09-host',
      modal: true,
      focusOnShow: false,
      // Editing an existing shift: the underlying record may have
      // capacity > 1, so we open in multi-slot mode regardless of view.
      data: { companyId: company.id, existingShift: shift, mode: 'multi' as const },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'shift.batch.published') {
        this.messageService.add({
          severity: 'success',
          summary: 'Shift bijgewerkt',
        });
        this.maybeRefresh();
      }
    });
  }

  /** Open ContractDialog with the same DynamicDialogConfig shape as prod. */
  private openContractDialogForEvent(employeeId: string, eventRecord: EventModel): void {
    const employee = this.employeesById.get(employeeId);
    if (!employee) return;
    const ref = this.dialogService.open(ContractDialogComponent, {
      modal: true,
      showHeader: false,
      focusOnShow: false,
      data: {
        contractEventRecord: eventRecord,
        employee,
      } satisfies ContractDialogDataModel,
    });
    ref.onClose.subscribe(result => {
      // Cancel → remove the placeholder so the grid stays clean.
      if (!result && (eventRecord as { hasGeneratedId?: boolean }).hasGeneratedId) {
        (eventRecord as { remove: () => void }).remove();
      }
      if (result?.usedMode === 'create' || result?.usedMode === 'update') {
        this.maybeRefresh();
      }
    });
  }

  /**
   * Vast-blok dialog — date range + hours, no Dimona. Vaste medewerkers
   * live entirely in PoC-DB so the dialog stays compact. The placeholder
   * event from Bryntum drives the initial date/time values.
   */
  private openVastBlockDialog(resourceId: string, eventRecord: EventModel): void {
    const permId = resourceId.replace(/^perm:/, '');
    const employee = this.lastData?.permanentEmployees?.find(p => p.id === permId);
    const employeeName = employee
      ? `${employee.first_name} ${employee.last_name}`
      : 'Vaste medewerker';
    const start = (eventRecord as unknown as { startDate?: Date }).startDate ?? null;
    const end = (eventRecord as unknown as { endDate?: Date }).endDate ?? null;
    const startD = start ? DateTime.fromJSDate(start as Date) : DateTime.now();
    const endD = end ? DateTime.fromJSDate(end as Date) : startD;
    const isDragged = endD > startD.plus({ minutes: 1 });
    // Extract the existing block id from the event id (`vast:<uuid>` per
    // buildEvents). Fresh placeholders have a generated id ≠ vast:<x>, so
    // blockId stays undefined and the dialog stays in create-only mode.
    const rawId = String((eventRecord as unknown as { id?: unknown }).id ?? '');
    const blockId = rawId.startsWith('vast:') ? rawId.slice('vast:'.length) : undefined;
    const ref = this.dialogService.open(DialogVastBlockComponent, {
      showHeader: false,
      width: '32rem',
      styleClass: 'm09-host',
      modal: true,
      focusOnShow: false,
      data: {
        permanentEmployeeId: permId,
        employeeName,
        dateFrom: startD.toISODate() ?? '',
        dateTo: endD.toISODate() ?? startD.toISODate() ?? '',
        fromTime: isDragged && this.zoom() === 'day' ? startD.toFormat('HH:mm') : '09:00',
        toTime: isDragged && this.zoom() === 'day' ? endD.toFormat('HH:mm') : '17:00',
        blockId,
      },
    });
    ref.onClose.subscribe(result => {
      // Always drop the Bryntum placeholder — the persisted block is its
      // own record once the dialog confirms.
      if ((eventRecord as { hasGeneratedId?: boolean }).hasGeneratedId) {
        (eventRecord as { remove: () => void }).remove();
      }
      if (result?.kind === 'vast.block.saved') {
        const b = result.block;
        const company = this.store.selectSnapshot(RootState.getCompanyData);
        if (!company) return;
        this.permanentBlocksApi
          .create({
            companyId: company.id,
            permanentEmployeeId: b.permanentEmployeeId,
            dateFrom: b.dateFrom,
            dateTo: b.dateTo,
            fromTime: b.fromTime,
            toTime: b.toTime,
          })
          .subscribe({
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: 'Vast blok opgeslagen',
                detail: `${b.dateFrom} ${b.fromTime}–${b.toTime}`,
              });
              this.maybeRefresh();
            },
            error: err => {
              this.messageService.add({
                severity: 'error',
                summary: 'Opslaan vast blok mislukt',
                detail:
                  (err?.error?.message as string | undefined) ?? 'Probeer het opnieuw.',
              });
            },
          });
      } else if (result?.kind === 'vast.block.deleted' && result.blockId) {
        this.permanentBlocksApi.remove(result.blockId).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Vast blok verwijderd',
            });
            this.maybeRefresh();
          },
          error: err => {
            this.messageService.add({
              severity: 'error',
              summary: 'Verwijderen vast blok mislukt',
              detail:
                (err?.error?.message as string | undefined) ?? 'Probeer het opnieuw.',
            });
          },
        });
      }
    });
  }

  /** Shift batch dialog opener used by Locaties view. */
  private openShiftDialogForCell(
    serviceLocationId: string,
    date: Date | undefined,
    placeholder: EventModel | null,
  ): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) return;

    // Day-view drag-create: Bryntum sets the placeholder's startDate /
    // endDate to the drag range. Extract HH:mm so the dialog opens with
    // the times the operator just dragged. Week view dragging stays
    // disabled (we only have hour granularity in Day view).
    let prefillFromTime: string | undefined;
    let prefillToTime: string | undefined;
    const startD = placeholder
      ? ((placeholder as unknown as { startDate?: Date }).startDate ?? null)
      : null;
    const endD = placeholder
      ? ((placeholder as unknown as { endDate?: Date }).endDate ?? null)
      : null;
    if (startD && endD && this.zoom() === 'day') {
      const start = DateTime.fromJSDate(startD as Date);
      const end = DateTime.fromJSDate(endD as Date);
      // Only treat as a drag (vs single-cell click) when the range
      // actually spans more than a tick.
      if (end > start.plus({ minutes: 1 })) {
        prefillFromTime = start.toFormat('HH:mm');
        prefillToTime = end.toFormat('HH:mm');
      }
    }

    const ref = this.dialogService.open(DialogShiftBatchComponent, {
      // The dialog renders its own mockup-09 header + footer; suppress
      // PrimeNG's default chrome so the layout matches the mockup.
      showHeader: false,
      width: '38rem',
      styleClass: 'm09-host',
      modal: true,
      focusOnShow: false,
      data: {
        companyId: company.id,
        date: date ? DateTime.fromJSDate(date).toISODate() : undefined,
        serviceLocationId,
        prefillFromTime,
        prefillToTime,
        // Cell-click on a service-location row is the Locaties flow: the
        // operator can declare multiple slots in one go (capacity > 1).
        mode: 'multi' as const,
      },
    });
    ref.onClose.subscribe(result => {
      // Remove the Bryntum placeholder either way — the shift is its own
      // record once the dialog confirms.
      if (placeholder && (placeholder as { hasGeneratedId?: boolean }).hasGeneratedId) {
        (placeholder as { remove: () => void }).remove();
      }
      if (result?.kind === 'shift.batch.published') {
        this.messageService.add({
          severity: 'success',
          summary: 'Shift aangemaakt',
          detail: `${result.shift?.from_time} → ${result.shift?.to_time} op ${result.shift?.date_from}`,
        });
        this.maybeRefresh();
      } else if (result?.kind === 'shift.batch.merged') {
        // Server-side dedup: the new payload was folded into an existing
        // draft/open shift on the same service location + dates + hours.
        // Tell the operator so they don't go hunting for a "new" row.
        this.messageService.add({
          severity: 'info',
          summary: 'Samengevoegd met bestaande shift',
          detail: `Capaciteit is nu ${result.shift?.capacity}. ${result.shift?.from_time} → ${result.shift?.to_time}`,
          life: 5000,
        });
        this.maybeRefresh();
      } else if (result?.kind === 'shift.batch.error') {
        this.messageService.add({
          severity: 'error',
          summary: 'Aanmaken shift mislukt',
          detail: 'Controleer datum en service location.',
        });
      }
    });
  }

  protected onViewChange(): void {
    this.maybeRefresh();
  }

  protected setView(v: PocPlanningView): void {
    this.view.set(v);
    localStorage.setItem(PlanningPocComponent.LS_VIEW_KEY, v);
    // Re-render from the cached forkJoin result so the rows swap NOW; the
    // background refresh below will overwrite with fresh data when it
    // arrives. Avoids the "I clicked Locaties but it still shows names"
    // perception when the API is slow.
    this.rebuildFromCache();
    this.maybeRefresh();
  }

  protected setZoom(z: PocPlanningZoom): void {
    const prev = this.zoom();
    if (z !== prev) {
      // Re-anchor weekStart at zoom transitions so the displayed date stays
      // intuitive (and the refresh below pulls the right range):
      //   - leaving Day → snap weekStart back to the Monday of that day
      //   - entering Day → snap weekStart to today if today is in the
      //     visible week, otherwise leave it on the Monday (so the user
      //     lands on something with context). Without this, the day-zoom
      //     would show Monday after switching out and back, and prev/next
      //     navigation was fighting an implicit "today" override.
      if (prev === 'day' && z !== 'day') {
        const monday = DateTime.fromISO(this.weekStart()).startOf('week');
        this.weekStart.set(monday.toISODate() ?? this.weekStart());
      } else if (z === 'day' && prev !== 'day') {
        const monday = DateTime.fromISO(this.weekStart());
        const today = DateTime.now().startOf('day');
        const inWeek = today >= monday && today < monday.plus({ days: 7 });
        if (inWeek) this.weekStart.set(today.toISODate() ?? this.weekStart());
      }
    }
    this.zoom.set(z);
    localStorage.setItem(PlanningPocComponent.LS_ZOOM_KEY, z);
    // Two-pass: paint the cache immediately so the toolbar feels
    // responsive, then kick a fresh refresh in the background so the
    // events match the new date range. Without the refresh the Day view
    // could end up showing stale or empty events when zooming out from
    // a previously cached Week.
    this.rebuildFromCache();
    this.maybeRefresh();
    // Item 7 (pilot feedback 2026-05-19): when switching Dag/Week/2 weken
    // all contracts disappeared until a manual F5. Root cause: changing
    // [viewPreset] makes Bryntum tear down + rebuild its internal time
    // axis and event store; the queueMicrotask `syncSchedulerStores` from
    // rebuildFromCache fires BEFORE that rebuild settles, so the events
    // we just pushed get wiped by Bryntum's own reconcile. A second sync
    // via setTimeout(0) lands AFTER the viewPreset rebuild, restoring
    // the events from the (still-fresh) signals.
    setTimeout(() => this.syncSchedulerStores(this.resources(), this.events()), 0);
  }

  /**
   * Bryntum's eventEdit feature config — mirrors the production planning
   * page. `triggerEvent: 'eventclick'` routes both fresh placeholders
   * (from drag-create / cell-click) AND existing event clicks through the
   * `beforeEventEdit` listener, which is where we open ContractDialog.
   */
  protected readonly eventEditFeatureConfig = { triggerEvent: 'eventclick' };

  /** Day-zoom navigation arrows (mockup 13). Week mode uses prev/Week chevrons. */
  protected previousDay(): void {
    const d = DateTime.fromISO(this.weekStart()).minus({ days: 1 });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.maybeRefresh();
  }

  protected nextDay(): void {
    const d = DateTime.fromISO(this.weekStart()).plus({ days: 1 });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.maybeRefresh();
  }

  protected previousWeek(): void {
    // 2-week zoom navigates by the visible span (14 days), not by 1 week
    // — otherwise prev/next visibly overlaps the previous page by 7 days.
    const step = this.zoom() === '2weeks' ? { days: 14 } : { weeks: 1 };
    const d = DateTime.fromISO(this.weekStart()).minus(step);
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.maybeRefresh();
  }

  protected nextWeek(): void {
    const step = this.zoom() === '2weeks' ? { days: 14 } : { weeks: 1 };
    const d = DateTime.fromISO(this.weekStart()).plus(step);
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.maybeRefresh();
  }

  protected today(): void {
    // In Day-zoom "Today" goes to actual today (the displayed day = weekStart);
    // in Week/2-week-zoom we anchor on the Monday of this week.
    const anchor =
      this.zoom() === 'day'
        ? DateTime.now().startOf('day')
        : DateTime.now().startOf('week');
    this.weekStart.set(anchor.toISODate() ?? '');
    this.maybeRefresh();
  }

  /**
   * Count of open shifts (status === 'open') visible in the current week.
   * Drives the "Open shifts delen (N)" header button — the button hides
   * when zero. Counts unique shifts; the Names view fans each shift out
   * across multiple employee rows, but a single open shift only counts once.
   */
  protected readonly openShiftCount = computed(() => {
    const seen = new Set<string>();
    let n = 0;
    for (const e of this.events()) {
      if (e.kind !== 'shift') continue;
      const raw = e.raw as { id?: string; status?: string } | undefined;
      if (!raw?.id || raw.status !== 'open') continue;
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      n++;
    }
    return n;
  });

  /**
   * Open shifts share dialog (mockup 12). Pre-loads every open shift in the
   * visible week so the operator can broadcast them in one go. Lives on
   * its own component so it can grow (partner channels, deadline overrides,
   * etc.) without bloating the planning shell.
   */
  protected openShareDialog(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) return;
    const ref = this.dialogService.open(DialogShiftShareComponent, {
      // No PrimeNG header — the dialog component renders its own
      // "Open shifts delen" title + week-range subtitle (mockup 12).
      showHeader: false,
      modal: true,
      width: '46rem',
      styleClass: 'p-dialog-no-overflow',
      data: {
        companyId: company.id,
        weekIso: this.weekStart(),
        shifts: this.collectOpenShifts(),
      },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'shift.share.success') {
        this.messageService.add({
          severity: 'success',
          summary: 'Open shifts verstuurd',
          detail: `${result.recipientCount} medewerker(s) verwittigd.`,
        });
        this.maybeRefresh();
      }
    });
  }

  /** Distinct open shifts in the visible week, pulled from the events signal. */
  private collectOpenShifts(): ShiftModel[] {
    const seen = new Map<string, ShiftModel>();
    for (const e of this.events()) {
      if (e.kind !== 'shift') continue;
      const raw = e.raw as ShiftModel | undefined;
      if (!raw || raw.status !== 'open') continue;
      seen.set(raw.id, raw);
    }
    return Array.from(seen.values());
  }

  /**
   * Delegate handler for the in-row "+ Service location" button. The Bryntum
   * resource cell is rendered as raw HTML (htmlEncode: false) so attaching
   * an Angular click handler directly isn't an option — we listen at the
   * host and dispatch on a `data-poc-action` attribute instead.
   */
  protected hostClickHandler(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target?.closest) return;
    const btn = target.closest('[data-poc-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset['pocAction'];
    if (action === 'branch-menu') {
      const branchId = btn.dataset['branchId'] ?? '';
      ev.preventDefault();
      ev.stopPropagation();
      this.openBranchMenu(branchId, ev);
    } else if (action === 'add-sl') {
      const branchId = btn.dataset['branchId'] ?? '';
      ev.preventDefault();
      ev.stopPropagation();
      this.openAddServiceLocationDialog(branchId);
    } else if (action === 'rename-sl') {
      const slId = btn.dataset['slId'] ?? '';
      ev.preventDefault();
      ev.stopPropagation();
      this.openRenameServiceLocationDialog(slId);
    } else if (action === 'edit-branch') {
      const branchId = btn.dataset['branchId'] ?? '';
      ev.preventDefault();
      ev.stopPropagation();
      this.openEditBranchDialog(branchId);
    } else if (action === 'attach-sl') {
      const slId = btn.dataset['slId'] ?? '';
      ev.preventDefault();
      ev.stopPropagation();
      this.openAttachVestigingDialog(slId);
    }
  }

  /** Orphan SL → "Koppel aan vestiging" dialog. PATCH the SL with the
   *  picked branchGroupId, then refresh so the row leaves the bucket. */
  private openAttachVestigingDialog(slId: string): void {
    if (!slId || !this.lastData) return;
    const sl = this.lastData.serviceLocations.find(x => x.id === slId);
    if (!sl) return;
    const ref = this.dialogService.open(DialogAttachVestigingComponent, {
      header: 'Service location koppelen',
      modal: true,
      width: '30rem',
      data: {
        serviceLocation: sl,
        branches: this.lastData.branches,
      },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'sl.attached') {
        this.messageService.add({
          severity: 'success',
          summary: 'Service location gekoppeld',
        });
        this.maybeRefresh();
      }
    });
  }

  /** 3-dot overflow menu on a vestiging-header row. Anchors the shared
   *  Angular <p-menu> to the click target and rebuilds its model with
   *  the right branchId. Replaces the previous gear+plus pair so the
   *  chrome stays subtle and consistent. */
  private openBranchMenu(branchId: string, ev: MouseEvent): void {
    if (!branchId) return;
    this.branchMenuItems.set([
      {
        label: 'Service location toevoegen',
        icon: 'dps-icon dps-icon-add',
        command: () => this.openAddServiceLocationDialog(branchId),
      },
      {
        label: 'Vestiging-adres bewerken',
        icon: 'dps-icon dps-icon-edit',
        command: () => this.openEditBranchDialog(branchId),
      },
    ]);
    // Show after a microtask so the model update has flushed and the menu
    // anchors at the right size. queueMicrotask keeps us in the same task
    // → no visible delay.
    queueMicrotask(() => this.branchMenu?.show(ev));
  }

  /** Vestiging-address editing — invoked from the 3-dot overflow menu on
   *  the vestiging-header row. Reuses the same Google-Maps autocomplete
   *  field as the service-location dialog. */
  private openEditBranchDialog(branchId: string): void {
    if (!branchId || !this.lastData) return;
    const branch = this.lastData.branches.find(b => b.id === branchId);
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!branch || !company) return;
    const ref = this.dialogService.open(DialogEditVestigingComponent, {
      header: 'Vestiging bewerken',
      modal: true,
      width: '32rem',
      data: { branch, companyId: company.id },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'vestiging.updated') {
        this.messageService.add({
          severity: 'success',
          summary: 'Vestiging bijgewerkt',
        });
        this.maybeRefresh();
      } else if (result?.kind === 'vestiging.deleted') {
        this.messageService.add({
          severity: 'success',
          summary: 'Vestiging verwijderd',
        });
        this.maybeRefresh();
      }
    });
  }

  /** Service-location rename — reuses the same SL dialog (no address). */
  private openRenameServiceLocationDialog(slId: string): void {
    this.openEditServiceLocationDialog(slId);
  }

  /**
   * Mockup 14: clicking the gear icon on a service-location row opens an
   * "eigenschappen" dialog (rename + tweak address). Reuses the same
   * inline-create component but pre-fills the form via dialog data.
   */
  private openEditServiceLocationDialog(slId: string): void {
    if (!slId || !this.lastData) return;
    const sl = this.lastData.serviceLocations.find(x => x.id === slId);
    if (!sl) return;
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) return;
    const branchName =
      this.lastData.branches.find(b => b.id === sl.branch_group_id)?.name ?? '';
    const ref = this.dialogService.open(DialogAddServiceLocationComponent, {
      header: 'Service location bewerken',
      modal: true,
      width: '30rem',
      data: {
        companyId: company.id,
        branchGroupId: sl.branch_group_id,
        branchName,
        existing: sl,
      },
    });
    ref.onClose.subscribe(result => {
      if (
        result?.kind === 'service-location.created' ||
        result?.kind === 'service-location.updated'
      ) {
        this.messageService.add({
          severity: 'success',
          summary: 'Service location opgeslagen',
          detail: result.row?.name,
        });
        this.maybeRefresh();
      }
    });
  }

  /**
   * Inline create flow for service-locations triggered by the "+" button
   * on a vestiging row. Service-locations are PoC-DB rows that belong to
   * a DPS engagement-group (vestiging).
   */
  private openAddServiceLocationDialog(branchId: string): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company || !branchId) return;
    const branchName =
      this.lastData?.branches.find(b => b.id === branchId)?.name ?? '';
    const ref = this.dialogService.open(DialogAddServiceLocationComponent, {
      header: 'Nieuwe service location',
      modal: true,
      width: '30rem',
      data: { companyId: company.id, branchGroupId: branchId, branchName },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'service-location.created') {
        this.messageService.add({
          severity: 'success',
          summary: 'Service location aangemaakt',
          detail: result.row?.name,
        });
        this.maybeRefresh();
      }
    });
  }

  /**
   * Empty-cell click branches by view:
   *
   *  - **Namen**: defer to the production ContractDialogComponent. Bryntum's
   *    own flow auto-creates a placeholder event on the clicked cell and
   *    fires `beforeEventEdit` (see ngAfterViewInit wiring). The dialog is
   *    the same one as on the production planning page, so creating a
   *    contract here triggers Dimona exactly like in the live app.
   *  - **Locaties**: open the new-shift dialog (mockup 09). Service-group
   *    is the resourceId; if the user clicks a branch (vestiging header)
   *    row we ignore the click.
   *
   * Permanent-employee (perm:*) rows are not shift candidates and not
   * Dimona-bound contracts either, so they're a no-op.
   */
  protected onCellClick(event: { resourceRecord: ResourceModel; date: Date }): void {
    const isBranch = !!event.resourceRecord?.getData('isBranch');
    if (!event.resourceRecord || isBranch) return;
    const scheduler = this.schedulerComponent?.instance as Scheduler | undefined;
    if (!scheduler) return;
    // Match the production planning flow: add a placeholder event on the
    // clicked cell and trigger Bryntum's editEvent — that fires
    // beforeEventEdit, which our listener routes to the right dialog.
    const [placeholder] = scheduler.eventStore.add({
      name: 'Nieuw contract',
      resourceId: event.resourceRecord.getData('id'),
      startDate: event.date,
      endDate: event.date,
    } as Record<string, unknown>);
    scheduler.editEvent(placeholder, event.resourceRecord);
  }

  /**
   * Bound to bryntum-scheduler's (onEventClick). With eventEditFeature
   * `triggerEvent: 'eventclick'` set, the same click also fires
   * `beforeEventEdit` — which our handler routes to the correct dialog.
   * We deliberately keep this stub no-op so we don't end up double-opening.
   */
  protected onEventClick(_event: { eventRecord: EventModel }): void {
    // intentionally empty — see handleBeforeEventEdit
  }

  /**
   * Last forkJoin result, kept so view/zoom toggles can rebuild resources +
   * events synchronously from cache rather than waiting for a fresh fetch.
   * Without this, clicking Locaties briefly painted with the OLD Names
   * resources until the refresh completed, which made the toggle feel
   * broken.
   */
  private lastData: {
    employees: { content?: EmployeeModel[] };
    contracts: ContractListModel[];
    shifts: ShiftModel[];
    permanentEmployees: PermanentEmployeeModel[];
    permanentBlocks: PermanentBlockModel[];
    serviceLocations: ServiceLocationModel[];
    branches: EngagementGroupModel[];
    availabilities: AvailabilityModel[];
  } | null = null;

  private maybeRefresh(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (company) this.refresh(company.id);
  }

  /**
   * Immediately rebuild resources + events from cached data using the
   * current view + zoom values. Used by setView / setZoom so the user sees
   * the toggle take effect before the network round-trip lands.
   */
  private rebuildFromCache(): void {
    if (!this.lastData) return;
    const view = this.view();
    const resources = this.buildResources(view, this.lastData);
    const events = this.buildEvents(view, this.lastData);
    const rtrs = this.buildResourceTimeRanges(view, this.lastData);
    this.resources.set(resources);
    this.events.set(events);
    this.resourceTimeRanges.set(rtrs);
    this.cdr.markForCheck();
    queueMicrotask(() => this.syncSchedulerStores(resources, events));
  }

  /** Loads employees, contracts, shifts, service-locations, vestigingen
   * for the visible week, transforms them into Bryntum resources + events per
   * the active view, and pushes to the scheduler. */
  private refresh(companyId: string): void {
    // Fetch the actual visible range: 1 day for Day-zoom, 7 for Week, 14
    // for 2-week. Previously this was hard-coded to 7 days, which left the
    // second week of 2-week zoom permanently empty ("data gone when
    // switching to 2 weken") and over-fetched a whole week for Day-zoom.
    const startIso = this.weekStart();
    const z = this.zoom();
    const span = z === 'day' ? 0 : z === '2weeks' ? 13 : 6;
    const endIso = DateTime.fromISO(startIso).plus({ days: span }).toISODate() ?? startIso;
    this.loading.set(true);

    // Each source falls back to empty so one flaky upstream (DPS 5xx,
    // missing groups, etc.) doesn't blank the entire grid. The error is
    // logged but the rest of the data still paints.
    const safe = <T>(obs: Observable<T>, empty: T): Observable<T> =>
      obs.pipe(
        catchError(err => {
          // eslint-disable-next-line no-console
          console.warn('[planning-poc] source failed, falling back', err);
          return of(empty);
        }),
      );

    forkJoin({
      employees: safe(
        this.employeesApi.getEmployees({
          companyId,
          baseView: true,
          page: 0,
          size: 50,
        }),
        { content: [] } as { content: EmployeeModel[] },
      ),
      contracts: safe(
        this.contractsApi.getContracts({
          companyId,
          startDate: startIso,
          endDate: endIso,
          page: 0,
          size: 200,
        }),
        [] as ContractListModel[],
      ),
      shifts: safe(this.shiftsApi.list(companyId, startIso, endIso), []),
      // Permanent employees show as rows in the Names view; the Vast
      // blokjes they have for the visible week come from a separate
      // PoC-DB endpoint so we can clear / rebuild them independently.
      permanentEmployees: safe(this.permanentEmployeesApi.list(companyId), []),
      permanentBlocks: safe(
        this.permanentBlocksApi.list(companyId, startIso, endIso),
        [] as PermanentBlockModel[],
      ),
      serviceLocations: safe(this.serviceLocationsApi.list(companyId), []),
      branches: safe(this.engagementGroupsApi.listForCompany(companyId), []),
      // Pilot feedback (2026-05-14): seed availabilities paint as green
      // hour-blocks behind each employee row in the Medewerkers grid so
      // the operator sees "wie kan wanneer" without diving into MyStaffler.
      // The endpoint resolves the company's employee ids server-side
      // so this stays a single round-trip even with 50+ medewerkers.
      availabilities: safe(
        this.availabilityApi.listForCompany(companyId, startIso, endIso),
        [] as AvailabilityModel[],
      ),
    }).subscribe({
      next: data => {
        this.lastData = data;
        const view = this.view();
        // Cache employees by id so onEventClick can hand a proper
        // EmployeeModel to the production ContractDialogComponent.
        this.employeesById.clear();
        for (const emp of data.employees?.content ?? []) {
          if (emp?.id) this.employeesById.set(emp.id, emp);
        }
        const resources = this.buildResources(view, data);
        const events = this.buildEvents(view, data);
        const rtrs = this.buildResourceTimeRanges(view, data);
        // eslint-disable-next-line no-console
        console.info(
          `[planning-poc] view=${view} resources=${resources.length} events=${events.length} ` +
            `availabilities=${rtrs.length} ` +
            `(employees=${data.employees?.content?.length ?? 0}, perm=${data.permanentEmployees?.length ?? 0}, ` +
            `serviceLocations=${data.serviceLocations?.length ?? 0}, branches=${data.branches?.length ?? 0})`,
        );
        this.resources.set(resources);
        this.events.set(events);
        this.resourceTimeRanges.set(rtrs);
        this.loading.set(false);
        this.cdr.markForCheck();
        // Belt-and-suspenders: poke Bryntum directly. The [resources] input
        // binding *should* sync via the wrapper's ngOnChanges, but when
        // events + resources both change in the same tick the wrapper can
        // race against Bryntum's internal eventStore↔resourceStore reconcile
        // and end up rendering the previous resource set. Forcing the stores
        // imperatively here guarantees a clean swap.
        queueMicrotask(() => this.syncSchedulerStores(resources, events));
        // Item 7 (pilot feedback 2026-05-19): if refresh() lands while
        // Bryntum is still rebuilding its time axis after a viewPreset
        // (Dag/Week/2 weken) switch, the microtask sync gets clobbered
        // by Bryntum's own reconcile and the contracts vanish. A second
        // setTimeout-deferred sync runs AFTER the viewPreset rebuild
        // and restores the events from the freshly-fetched signals.
        setTimeout(() => this.syncSchedulerStores(resources, events), 0);
      },
      error: err => {
        this.loading.set(false);
        this.cdr.markForCheck();
        // eslint-disable-next-line no-console
        console.error('[planning-poc] refresh failed', err);
      },
    });
  }

  /**
   * Push resources and events directly into the Bryntum stores via the
   * @ViewChild instance reference. Used as a fallback so view-toggle swaps
   * always reach the DOM even if the Angular input binding misses a tick.
   */
  private syncSchedulerStores(resources: PocResource[], events: PocEvent[]): void {
    const scheduler = this.schedulerComponent?.instance as Scheduler | undefined;
    if (!scheduler) return;
    try {
      // Replace the entire data set rather than diff-merging, otherwise
      // permanent-employee rows from the Names view would linger when we
      // switch to Locations (different id namespace, no key collision to
      // trigger removal).
      scheduler.resourceStore.data = resources;
      scheduler.eventStore.data = events;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[planning-poc] direct store sync failed', err);
    }
  }

  private buildResources(
    view: PocPlanningView,
    data: {
      employees: { content?: { id: string; firstName?: string; lastName?: string }[] };
      branches: EngagementGroupModel[];
      serviceLocations: ServiceLocationModel[];
      permanentEmployees: PermanentEmployeeModel[];
    },
  ): PocResource[] {
    if (view === 'names') {
      const emp = (data.employees?.content ?? []).map(e => ({
        id: e.id,
        name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.id,
      }));
      const perm = (data.permanentEmployees ?? []).map(p => ({
        id: `perm:${p.id}`,
        name: `${p.first_name} ${p.last_name} (vast)`,
        isPermanent: true,
      }));
      return [...emp, ...perm];
    }

    // Locaties view: interleave a synthetic "branch header" row per
    // vestiging with the service-location rows underneath it. Branches
    // come from DPS as a paged response; service-locations are PoC-DB rows
    // referencing the branch by id.
    //
    // Defensive `Array.isArray` checks: DPS occasionally hands back a
    // `{ content: [...] }` page object instead of a flat array, depending
    // on the endpoint. Iterating that with for/of throws and silently
    // breaks the view toggle.
    const branches = Array.isArray(data.branches) ? data.branches : [];
    const serviceLocations = Array.isArray(data.serviceLocations) ? data.serviceLocations : [];

    // Bucket service-locations under their parent branch id. An empty string
    // branch_group_id (legacy seed data) ends up in the orphan bucket.
    const byBranch = new Map<string, ServiceLocationModel[]>();
    for (const sl of serviceLocations) {
      const key = sl.branch_group_id || '';
      const arr = byBranch.get(key) ?? [];
      arr.push(sl);
      byBranch.set(key, arr);
    }

    // Always render the two-level structure: each DPS vestiging is a
    // parent header, with its service-locations underneath. Limited users
    // only see vestigingen they have access to (DPS already filters the
    // /api/companies/:id/groups response per their permissions), so we
    // can render whatever the API returned without an extra access check.
    const rows: PocResource[] = [];
    for (const branch of branches) {
      rows.push({
        id: `branch:${branch.id}`,
        name: (branch.name as string | undefined) ?? branch.id,
        isBranch: true,
      });
      const children = byBranch.get(branch.id) ?? [];
      for (const sl of children) {
        rows.push({ id: sl.id, name: sl.name, branchId: branch.id });
      }
    }

    // Surface orphan SLs (no parent vestiging) so the operator can fix
    // them inline — clicking the row opens the attach-vestiging dialog.
    const knownBranchIds = new Set(branches.map(b => b.id));
    const orphans = serviceLocations.filter(
      sl => !sl.branch_group_id || !knownBranchIds.has(sl.branch_group_id),
    );
    if (orphans.length && branches.length) {
      rows.push({
        id: 'branch:_orphans',
        name: 'Service locations zonder vestiging — klik om te koppelen',
        isBranch: true,
        isOrphanHeader: true,
      });
      for (const sl of orphans) {
        rows.push({ id: sl.id, name: sl.name, isOrphan: true });
      }
    }

    // No vestigingen at all → point the user at Pool → Nieuwe vestiging.
    if (rows.length === 0) {
      rows.push({
        id: 'branch:_empty',
        name: 'Nog geen vestigingen — voeg er een toe via Pool → + Nieuwe vestiging.',
        isBranch: true,
      });
    }

    return rows;
  }

  /**
   * Build the green availability hour-blocks painted BEHIND events in the
   * Medewerkers view. Returns Bryntum `ResourceTimeRange` config objects:
   * each one fills a single employee row, on a single day, between two
   * times. Bryntum draws them at a lower z than events, with the colour
   * we pass through `timeRangeColor` + `.poc-rtr-availability` class.
   *
   * Locked / withdrawn / expired availabilities are skipped: locked
   * already has a contract painted over it, withdrawn/expired are
   * historical noise.
   */
  private buildResourceTimeRanges(
    view: PocPlanningView,
    data: { availabilities?: AvailabilityModel[] },
  ): Array<{
    id: string;
    resourceId: string;
    startDate: Date;
    endDate: Date;
    name?: string;
    timeRangeColor?: string;
    cls?: string;
  }> {
    if (view !== 'names') return [];
    const out: Array<{
      id: string;
      resourceId: string;
      startDate: Date;
      endDate: Date;
      name?: string;
      timeRangeColor?: string;
      cls?: string;
    }> = [];
    for (const a of data.availabilities ?? []) {
      if (a.status !== 'open') continue;
      const start = DateTime.fromISO(`${a.date}T${a.from_time}`).toJSDate();
      const end = DateTime.fromISO(`${a.date}T${a.to_time}`).toJSDate();
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      out.push({
        id: `avail:${a.id}`,
        resourceId: a.employee_id,
        startDate: start,
        endDate: end,
        name: `${a.from_time} – ${a.to_time}`,
        timeRangeColor: 'green',
        cls: 'poc-rtr-availability',
      });
    }
    return out;
  }

  private buildEvents(
    view: PocPlanningView,
    data: {
      contracts: ContractListModel[];
      shifts: ShiftModel[];
      serviceLocations: ServiceLocationModel[];
      permanentEmployees: PermanentEmployeeModel[];
      permanentBlocks?: PermanentBlockModel[];
      availabilities?: AvailabilityModel[];
    },
  ): PocEvent[] {
    const events: PocEvent[] = [];

    // Availabilities are no longer events — they're painted as
    // ResourceTimeRanges (background) by `buildResourceTimeRanges` below,
    // which means they sit behind contracts/shifts instead of stacking
    // in their own lane. Keep buildEvents focused on clickable blocks.

    // Contracts (DPS) appear in the Names view; in V+SL / Day they're hidden
    // because we don't yet know which service-location a contract is at.
    //
    // Important: we spread the mapped event (timetable / dateFrom / dateTo
    // / position) onto the PocEvent so ContractDialog can read them via
    // `contractEventRecord.getData('timetable')`. Without the spread, a
    // click on an existing contract would crash deep inside the dialog
    // because timetable came back undefined. (Bug reported 2026-05-12:
    // "Can't click an existing contract to edit".)
    if (view === 'names') {
      for (const contract of data.contracts ?? []) {
        const e = mapContractToSchedulerEvent(contract);
        if (!(e.startDate instanceof Date) || !(e.endDate instanceof Date)) continue;
        events.push({
          // Use the contract's own id (no prefix) so DPS endpoints that
          // expect the raw uuid still match. Bryntum doesn't care about
          // the prefix, but ContractDialog uses `getData('id')` to fetch
          // the contract by id.
          ...(e as unknown as Record<string, unknown>),
          id: contract.id,
          resourceId: String(e.resourceId),
          startDate: e.startDate,
          endDate: e.endDate,
          name: typeof e.name === 'string' ? e.name : 'Contract',
          cls: 'poc-event poc-event-contract',
          kind: 'contract',
          raw: contract,
        } as PocEvent & Record<string, unknown>);
      }
    }

    // Shifts (PoC-DB) — explode each shift record into ≤ N blocks so the
    // grid is honest about who's assigned vs. what's still open. Pilot
    // feedback (round 2026-05-12): creating a shift with capacity=3 and
    // 2 assigned employees used to render a single "Open shift × 3" pill,
    // hiding the fact that 2 seats were already named. The new model:
    //
    //   • One block per assigned target_employee_id (kind=contract;
    //     stacks on the SL row in Locaties view, lands on the employee
    //     row in Names view). Title = the employee's name.
    //   • One block for the remaining seats (kind=shift; title =
    //     "N open shift{s}") — Locaties view ONLY. Open shifts are a
    //     service-location concept; in Namen view every row already
    //     represents an assigned employee so there is no "open" block.
    //
    // V+SL / Day: shown on the service_location resource.
    // Names: assigned blocks fan out to each target_employee_id;
    //        open seats are NEVER rendered in Names view (pilot
    //        feedback 2026-05-13: ghost open-shift fan-out on Alexander
    //        was confusing — an empty row should mean "available", not
    //        "we put a pending open shift here").
    for (const s of data.shifts ?? []) {
      const start = DateTime.fromISO(`${s.date_from}T${s.from_time}`).toJSDate();
      const end = DateTime.fromISO(`${s.date_to}T${s.to_time}`).toJSDate();
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

      const assignedIds = s.target_employee_ids ?? [];
      const openSeats = Math.max(0, (s.capacity ?? 1) - assignedIds.length);
      const applications = s.applications_count ?? 0;

      // 1) Assigned blocks — one per target_employee_id. Renders with the
      // contract style (indigo, "this seat is filled") but stays kind='shift'
      // so a click opens the m09 edit dialog (operator can re-assign,
      // change times, etc.). Using kind='contract' would route the click
      // to ContractDialog and crash because `raw` is a Shift, not a
      // Contract.
      for (const empId of assignedIds) {
        const emp = this.employeesById.get(empId);
        const empName = emp
          ? `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || 'Toegewezen'
          : 'Toegewezen';
        const resourceId = view === 'names' ? empId : s.service_location_id;
        events.push({
          id: `shift:${s.id}:assigned:${empId}`,
          resourceId,
          startDate: start,
          endDate: end,
          name: empName,
          // Indigo "filled" chrome, plus a marker class so the renderer
          // can suppress the open-shift badge.
          cls: 'poc-event poc-event-contract poc-event-shift-assigned',
          kind: 'shift',
          raw: { ...s, applications_count: 0 },
        });
      }

      // 2) Open block — Locaties view ONLY. The badge renders
      // `+applications_count` (handled by eventBarRenderer); capacity
      // already lives in the title ("N open shifts"). Namen view skips
      // open blocks entirely: an empty employee row means "available",
      // not "pending open shift".
      if (openSeats > 0 && view !== 'names') {
        const label = `${openSeats} open shift${openSeats === 1 ? '' : 's'}`;
        const baseCls = `poc-event poc-event-shift poc-event-shift-${s.status}`;
        events.push({
          id: `shift:${s.id}:open`,
          resourceId: s.service_location_id,
          startDate: start,
          endDate: end,
          name: label,
          cls: baseCls,
          kind: 'shift',
          raw: { ...s, applications_count: applications, capacity: openSeats },
        });
      }
    }

    // Vast blokjes — flat date+hour ranges stored in PoC-DB
    // permanent_blocks. They only show on the Names view (a Vast block is
    // pinned to one permanent employee, not to a service-location).
    if (view === 'names') {
      const permById = new Map(
        (data.permanentEmployees ?? []).map(p => [p.id, p] as const),
      );
      for (const b of data.permanentBlocks ?? []) {
        const emp = permById.get(b.permanent_employee_id);
        if (!emp) continue;
        const start = DateTime.fromISO(`${b.date_from}T${b.from_time}`).toJSDate();
        const end = DateTime.fromISO(`${b.date_to}T${b.to_time}`).toJSDate();
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
        events.push({
          id: `vast:${b.id}`,
          resourceId: `perm:${b.permanent_employee_id}`,
          startDate: start,
          endDate: end,
          name: `${emp.first_name} ${emp.last_name}`,
          cls: 'poc-event poc-event-permanent',
          kind: 'permanent',
          raw: b,
        });
      }
    }

    return events;
  }
}
