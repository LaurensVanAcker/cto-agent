import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { DateTime } from 'luxon';
import { filter, forkJoin, take } from 'rxjs';

// Bryntum
import type { EventModel, ResourceModel, Scheduler, SchedulerConfig } from '@bryntum/scheduler';
import { BryntumSchedulerComponent, BryntumSchedulerModule } from '@bryntum/scheduler-angular';

// PrimeNG
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { RootState } from '@dps/core/store';
import { EmployeeApiService, ContractApiService } from '@dps/core/api';
import { ContractListModel } from '@dps/shared/models';
import { mapContractToSchedulerEvent } from '@dps/shared/functions';
import { GENERAL_SCHEDULER_CONFIG } from '@dps/shared/configs';
import {
  ServiceGroupApiService,
  ServiceGroupModel,
} from '@dps/core/api/service-group/service-group.api.service';
import {
  ShiftApiService,
  ShiftModel,
} from '@dps/core/api/shift/shift.api.service';
import {
  PermanentAssignmentApiService,
  PermanentAssignmentModel,
} from '@dps/core/api/permanent-assignment/permanent-assignment.api.service';
import {
  PermanentEmployeeApiService,
  PermanentEmployeeModel,
} from '@dps/core/api/permanent-employee/permanent-employee.api.service';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';
import { DialogContractCreateComponent } from '@dps/shared/components/dialog-contract-create/dialog-contract-create.component';
import { DialogShiftBatchComponent } from '@dps/shared/components/dialog-shift-batch/dialog-shift-batch.component';

type PocPlanningView = 'names' | 'vsl' | 'day';

const VIEW_OPTIONS: { label: string; value: PocPlanningView }[] = [
  { label: 'Namen', value: 'names' },
  { label: 'V+SL', value: 'vsl' },
  { label: 'Dag', value: 'day' },
];

const WEEKDAY_INDEX: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

interface PocResource {
  id: string;
  name: string;
  parentId?: string;
  expanded?: boolean;
  isPermanent?: boolean;
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
 *  - PoC-DB permanent assignments (`/api/permanent-assignments`)
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
    BryntumSchedulerModule,
    ButtonModule,
    SelectButtonModule,
    TooltipModule,
    ToastModule,
  ],
  providers: [DialogService, MessageService],
  templateUrl: './planning-poc.component.html',
  styleUrl: './planning-poc.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden p-3 gap-3' },
})
export class PlanningPocComponent implements AfterViewInit {
  @ViewChild('scheduler') readonly schedulerComponent?: BryntumSchedulerComponent;

  private readonly employeesApi = inject(EmployeeApiService);
  private readonly contractsApi = inject(ContractApiService);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly permanentAssignmentsApi = inject(PermanentAssignmentApiService);
  private readonly permanentEmployeesApi = inject(PermanentEmployeeApiService);
  private readonly serviceGroupsApi = inject(ServiceGroupApiService);
  private readonly engagementGroupsApi = inject(EngagementGroupApiService);
  private readonly dialogService = inject(DialogService);
  private readonly messageService = inject(MessageService);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly view = signal<PocPlanningView>('names');
  protected readonly viewOptions = VIEW_OPTIONS;
  protected readonly weekStart = signal<string>(
    DateTime.now().startOf('week').toISODate() ?? '',
  );
  protected readonly resources = signal<PocResource[]>([]);
  protected readonly events = signal<PocEvent[]>([]);
  protected readonly loading = signal(false);

  protected readonly schedulerConfig = computed<Partial<SchedulerConfig>>(() => {
    const v = this.view();
    if (v === 'day') {
      return {
        ...GENERAL_SCHEDULER_CONFIG,
        viewPreset: 'hourAndDay',
        mode: 'vertical',
        rowHeight: 60,
      } as unknown as Partial<SchedulerConfig>;
    }
    return {
      ...GENERAL_SCHEDULER_CONFIG,
      rowHeight: 65,
    } as Partial<SchedulerConfig>;
  });

  protected readonly weekLabel = computed(() => {
    const start = DateTime.fromISO(this.weekStart()).setLocale('nl-BE');
    const end = start.plus({ days: 6 });
    return `Week ${start.weekNumber} — ${start.toFormat('d LLL')} → ${end.toFormat('d LLL yyyy')}`;
  });

  protected readonly startDate = computed(() => DateTime.fromISO(this.weekStart()).toJSDate());
  protected readonly endDate = computed(() =>
    DateTime.fromISO(this.weekStart()).plus({ days: 7 }).toJSDate(),
  );

  ngAfterViewInit(): void {
    this.store
      .select(RootState.getCompanyData)
      .pipe(filter(Boolean), take(1))
      .subscribe(company => this.refresh(company.id));
  }

  protected onViewChange(): void {
    this.maybeRefresh();
  }

  protected previousWeek(): void {
    const d = DateTime.fromISO(this.weekStart()).minus({ weeks: 1 });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.maybeRefresh();
  }

  protected nextWeek(): void {
    const d = DateTime.fromISO(this.weekStart()).plus({ weeks: 1 });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.maybeRefresh();
  }

  protected today(): void {
    this.weekStart.set(DateTime.now().startOf('week').toISODate() ?? '');
    this.maybeRefresh();
  }

  protected openShiftBatchDialog(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    const ref = this.dialogService.open(DialogShiftBatchComponent, {
      header: 'Nieuwe shift (Niveau 2)',
      width: '46rem',
      modal: true,
      data: { companyId: company?.id, date: this.weekStart() },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'shift.batch.published') {
        this.messageService.add({
          severity: 'success',
          summary: 'Shift gepubliceerd',
          detail: `${result.shift?.from_time} → ${result.shift?.to_time} op ${result.shift?.date_from}`,
        });
        this.maybeRefresh();
      } else if (result?.kind === 'shift.batch.error') {
        this.messageService.add({
          severity: 'error',
          summary: 'Aanmaken shift mislukt',
          detail: 'Controleer service location id en datums.',
        });
      }
    });
  }

  /** Bryntum cell-click → open contract dialog for that employee + date. */
  protected onCellClick(event: { resourceRecord: ResourceModel; date: Date }): void {
    if (this.view() !== 'names') return;
    const resourceId = String(event.resourceRecord?.getData('id'));
    if (!resourceId) return;
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    const ref = this.dialogService.open(DialogContractCreateComponent, {
      header: 'Nieuw contract (Niveau 1)',
      width: '40rem',
      modal: true,
      data: {
        employeeId: resourceId,
        date: DateTime.fromJSDate(event.date).toISODate(),
        companyId: company?.id,
      },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'contract.create.success') {
        this.messageService.add({
          severity: 'success',
          summary: 'Contract aangemaakt (Dimona aangevraagd)',
        });
        this.maybeRefresh();
      } else if (result?.kind === 'contract.create.error') {
        this.messageService.add({
          severity: 'error',
          summary: 'Contract aanmaken mislukt',
          detail: result.message,
        });
      }
    });
  }

  /** Bryntum event-click → open contract detail (DPS) or shift details. */
  protected onEventClick(event: { eventRecord: EventModel }): void {
    const kind = event.eventRecord?.getData('kind') as PocEvent['kind'] | undefined;
    if (kind === 'shift') {
      this.messageService.add({
        severity: 'info',
        summary: 'Shift detail',
        detail: 'Open shift — kandidaat-flow volgt in MyStaffler strook.',
      });
    } else if (kind === 'permanent') {
      this.messageService.add({
        severity: 'info',
        summary: 'Vast blok',
        detail: 'Vaste medewerker via PoC-DB permanent_assignments.',
      });
    } else if (kind === 'contract') {
      this.messageService.add({
        severity: 'info',
        summary: 'Contract',
        detail: 'Klik via /planning (productie-zicht) voor het edit-detail.',
      });
    }
  }

  private maybeRefresh(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (company) this.refresh(company.id);
  }

  /** Loads employees, contracts, shifts, permanent-assignments, service-groups, vestigingen
   * for the visible week, transforms them into Bryntum resources + events per
   * the active view, and pushes to the scheduler. */
  private refresh(companyId: string): void {
    const startIso = this.weekStart();
    const endIso = DateTime.fromISO(startIso).plus({ days: 6 }).toISODate() ?? startIso;
    this.loading.set(true);

    // Issue all the reads in parallel.
    forkJoin({
      employees: this.employeesApi.getEmployees({
        companyId,
        baseView: true,
        page: 0,
        size: 50,
      }),
      contracts: this.contractsApi.getContracts({
        companyId,
        startDate: startIso,
        endDate: endIso,
        page: 0,
        size: 200,
      }),
      shifts: this.shiftsApi.list(companyId, startIso, endIso),
      permanentAssignments: this.permanentAssignmentsApi.list({
        companyId,
        dateFrom: startIso,
        dateTo: endIso,
      }),
      permanentEmployees: this.permanentEmployeesApi.list(companyId),
      serviceGroups: this.serviceGroupsApi.list(companyId),
      branches: this.engagementGroupsApi.listForCompany(companyId),
    }).subscribe({
      next: data => {
        const view = this.view();
        const resources = this.buildResources(view, data);
        const events = this.buildEvents(view, data);
        this.resources.set(resources);
        this.events.set(events);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: err => {
        this.loading.set(false);
        this.cdr.markForCheck();
        // eslint-disable-next-line no-console
        console.error('[planning-poc] refresh failed', err);
      },
    });
  }

  private buildResources(
    view: PocPlanningView,
    data: {
      employees: { content?: { id: string; firstName?: string; lastName?: string }[] };
      branches: EngagementGroupModel[];
      serviceGroups: ServiceGroupModel[];
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

    // V+SL and Day both group service-locations under their parent branch.
    const branches = (data.branches ?? []).map(b => ({
      id: `branch:${b.id}`,
      name: (b.name as string | undefined) ?? b.id,
      expanded: true,
    }));
    const serviceGroups = (data.serviceGroups ?? []).map(sg => ({
      id: sg.id,
      name: sg.name,
      parentId: `branch:${sg.branch_group_id}`,
    }));
    return [...branches, ...serviceGroups];
  }

  private buildEvents(
    view: PocPlanningView,
    data: {
      contracts: ContractListModel[];
      shifts: ShiftModel[];
      permanentAssignments: PermanentAssignmentModel[];
      serviceGroups: ServiceGroupModel[];
      permanentEmployees: PermanentEmployeeModel[];
    },
  ): PocEvent[] {
    const events: PocEvent[] = [];

    // Contracts (DPS) appear in the Names view; in V+SL / Day they're hidden
    // because we don't yet know which service-location a contract is at.
    if (view === 'names') {
      for (const contract of data.contracts ?? []) {
        const e = mapContractToSchedulerEvent(contract);
        if (!(e.startDate instanceof Date) || !(e.endDate instanceof Date)) continue;
        events.push({
          id: `contract:${e.id}`,
          resourceId: String(e.resourceId),
          startDate: e.startDate,
          endDate: e.endDate,
          name: typeof e.name === 'string' ? e.name : 'Contract',
          cls: 'poc-event poc-event-contract',
          kind: 'contract',
          raw: contract,
        });
      }
    }

    // Shifts (PoC-DB) appear in V+SL and Day. In Names we'd need to fan them
    // out to target_employee_ids — out of scope for v1.
    if (view !== 'names') {
      for (const s of data.shifts ?? []) {
        const start = DateTime.fromISO(`${s.date_from}T${s.from_time}`).toJSDate();
        const end = DateTime.fromISO(`${s.date_to}T${s.to_time}`).toJSDate();
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
        events.push({
          id: `shift:${s.id}`,
          resourceId: s.service_group_id,
          startDate: start,
          endDate: end,
          name: `Open shift × ${s.capacity}`,
          cls: `poc-event poc-event-shift poc-event-shift-${s.status}`,
          kind: 'shift',
          raw: s,
        });
      }
    }

    // Permanent assignments (Vast) appear in V+SL (recurring per weekday) and
    // also in Names if the permanent employee is a resource.
    const weekStart = DateTime.fromISO(this.weekStart());
    for (const assignment of data.permanentAssignments ?? []) {
      const validFrom = DateTime.fromISO(assignment.valid_from);
      const validTo = assignment.valid_to ? DateTime.fromISO(assignment.valid_to) : null;
      for (const [weekday, slot] of Object.entries(assignment.weekday_pattern ?? {})) {
        const dayIdx = WEEKDAY_INDEX[weekday];
        if (!dayIdx) continue;
        const day = weekStart.plus({ days: dayIdx - 1 });
        if (day < validFrom) continue;
        if (validTo && day > validTo) continue;
        const start = DateTime.fromISO(`${day.toISODate()}T${slot.from}`).toJSDate();
        const end = DateTime.fromISO(`${day.toISODate()}T${slot.to}`).toJSDate();
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

        if (view === 'names') {
          // Resource = the permanent employee (prefixed "perm:" to disambiguate from DPS employee ids).
          events.push({
            id: `perm:${assignment.id}:${weekday}`,
            resourceId: `perm:${assignment.permanent_employee_id}`,
            startDate: start,
            endDate: end,
            name: 'Vast',
            cls: 'poc-event poc-event-permanent',
            kind: 'permanent',
            raw: assignment,
          });
        } else {
          // Resource = the service-group row.
          events.push({
            id: `perm:${assignment.id}:${weekday}`,
            resourceId: assignment.service_group_id,
            startDate: start,
            endDate: end,
            name: 'Vast',
            cls: 'poc-event poc-event-permanent',
            kind: 'permanent',
            raw: assignment,
          });
        }
      }
    }

    return events;
  }
}
