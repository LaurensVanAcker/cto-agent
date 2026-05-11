import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { DateTime } from 'luxon';
import { filter, take } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { DialogService } from 'primeng/dynamicdialog';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';

import { RootState } from '@dps/core/store';
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
import { EmployeeApiService } from '@dps/core/api';
import { DialogContractCreateComponent } from '@dps/shared/components/dialog-contract-create/dialog-contract-create.component';
import { DialogShiftBatchComponent } from '@dps/shared/components/dialog-shift-batch/dialog-shift-batch.component';

type PocPlanningView = 'names' | 'vsl' | 'day';

const VIEW_OPTIONS: { label: string; value: PocPlanningView }[] = [
  { label: 'Namen', value: 'names' },
  { label: 'V+SL', value: 'vsl' },
  { label: 'Dag', value: 'day' },
];

interface DayCol {
  iso: string;
  label: string;
  isWeekend: boolean;
}

/**
 * PoC planning surface — separate from the existing Bryntum-heavy
 * `pages/company/modules/planning/`. Three view modes per mockups
 * 10 (names), 11 (V+SL) and 13 (day). Initial implementation is a
 * skeleton: it fetches the data sources (employees, contracts, shifts,
 * permanent-assignments, service-groups) for the visible week but only
 * the Names view paints a real 7-day grid. V+SL and Day are stubs that
 * point at the Bryntum scheduler config we plan to drive in v1.
 */
@Component({
  selector: 'dps-planning-poc',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    SelectButtonModule,
    TooltipModule,
  ],
  providers: [DialogService],
  templateUrl: './planning-poc.component.html',
  styleUrl: './planning-poc.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden p-3 gap-3' },
})
export class PlanningPocComponent {
  private readonly employeesApi = inject(EmployeeApiService);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly permanentAssignmentsApi = inject(PermanentAssignmentApiService);
  private readonly serviceGroupsApi = inject(ServiceGroupApiService);
  private readonly dialogService = inject(DialogService);
  private readonly store = inject(Store);

  protected readonly view = signal<PocPlanningView>('names');
  protected readonly viewOptions = VIEW_OPTIONS;
  protected readonly weekStart = signal<string>(
    DateTime.now().startOf('week').toISODate() ?? '',
  );
  protected readonly employees = signal<{ id: string; name: string }[]>([]);
  protected readonly shifts = signal<ShiftModel[]>([]);
  protected readonly permanentAssignments = signal<PermanentAssignmentModel[]>([]);
  protected readonly serviceGroups = signal<ServiceGroupModel[]>([]);
  protected readonly loading = signal(false);

  protected readonly days = computed<DayCol[]>(() => {
    const start = DateTime.fromISO(this.weekStart());
    return Array.from({ length: 7 }, (_, i) => {
      const d = start.plus({ days: i });
      return {
        iso: d.toISODate() ?? '',
        label: d.setLocale('nl-BE').toFormat('ccc d/L'),
        isWeekend: d.weekday >= 6,
      };
    });
  });

  protected readonly weekLabel = computed(() => {
    const start = DateTime.fromISO(this.weekStart()).setLocale('nl-BE');
    const end = start.plus({ days: 6 });
    return `Week ${start.weekNumber} — ${start.toFormat('d LLL')} → ${end.toFormat('d LLL yyyy')}`;
  });

  constructor() {
    this.store
      .select(RootState.getCompanyData)
      .pipe(filter(Boolean), take(1))
      .subscribe(company => this.refresh(company.id));
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

  protected openContractDialog(employeeId?: string, date?: string): void {
    this.dialogService.open(DialogContractCreateComponent, {
      header: 'Nieuw contract (Niveau 1)',
      width: '40rem',
      modal: true,
      data: { employeeId, date },
    });
  }

  protected openShiftBatchDialog(serviceGroupId?: string, date?: string): void {
    this.dialogService.open(DialogShiftBatchComponent, {
      header: 'Nieuwe shifts (Niveau 2 batch)',
      width: '46rem',
      modal: true,
      data: { serviceGroupId, date },
    });
  }

  /** Returns shifts whose date overlaps the visible day (for names view). */
  protected shiftsForDay(iso: string): ShiftModel[] {
    return this.shifts().filter(s => s.date_from <= iso && s.date_to >= iso);
  }

  private maybeRefresh(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (company) this.refresh(company.id);
  }

  private refresh(companyId: string): void {
    const start = this.weekStart();
    const end = DateTime.fromISO(start).plus({ days: 6 }).toISODate() ?? start;
    this.loading.set(true);

    this.employeesApi
      .getEmployees({ companyId, page: 0, size: 50 })
      .subscribe({
        next: page => {
          const rows = (page?.content ?? []) as {
            id: string;
            firstName?: string;
            lastName?: string;
          }[];
          this.employees.set(
            rows.map(e => ({
              id: e.id,
              name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.id,
            })),
          );
        },
        error: () => this.employees.set([]),
      });

    this.shiftsApi.list(companyId, start, end).subscribe({
      next: rows => this.shifts.set(rows ?? []),
      error: () => this.shifts.set([]),
    });

    this.permanentAssignmentsApi
      .list({ companyId, dateFrom: start, dateTo: end })
      .subscribe({
        next: rows => this.permanentAssignments.set(rows ?? []),
        error: () => this.permanentAssignments.set([]),
      });

    this.serviceGroupsApi.list(companyId).subscribe({
      next: rows => {
        this.serviceGroups.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.serviceGroups.set([]);
        this.loading.set(false);
      },
    });
  }
}
