import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { DateTime } from 'luxon';
import { debounceTime, distinctUntilChanged, filter, startWith, take, tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

import { RootState } from '@dps/core/store';
import { EmployeeApiService } from '@dps/core/api';
import { ContractListModel } from '@dps/shared/models';
import {
  MyStafflerApiService,
  MyShiftRow,
} from '@dps/core/api/my-staffler/my-staffler.api.service';
import {
  AvailabilityApiService,
  AvailabilityModel,
} from '@dps/core/api/availability/availability.api.service';
import { ShiftApiService } from '@dps/core/api/shift/shift.api.service';

type Tab = 'planning' | 'availability' | 'shifts';

interface DayBucket {
  iso: string;
  weekdayLabel: string;
  dateLabel: string;
  contracts: ContractListModel[];
  shifts: MyShiftRow[];
  availability: AvailabilityModel | null;
}

/**
 * MyStaffler-preview — narrow mobile-style strip that simulates the
 * uitzendkracht-zicht inside the company portal. The company user picks
 * an employee from the pool and previews what that employee would see on
 * their MyStaffler app this week: scheduled contracts, open shifts they
 * can react to, and their availability slots. Mirrors
 * `mockups/mobile-mystaffler-v2.html`.
 *
 * For pilot v0 the operator (company user) can "act on behalf" of the
 * employee for testing: kandideren / terugtrekken / availability CRUD.
 * v1 will expose this surface to the actual employee via the
 * `/publicapi/employees/users/login` flow.
 */
@Component({
  selector: 'dps-mystaffler-preview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    ToastModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './mystaffler-preview.component.html',
  styleUrl: './mystaffler-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden p-4 gap-3' },
})
export class MystafflerPreviewComponent {
  private readonly employeesApi = inject(EmployeeApiService);
  private readonly myStafflerApi = inject(MyStafflerApiService);
  private readonly availabilityApi = inject(AvailabilityApiService);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly messageService = inject(MessageService);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly employeeControl = new FormControl<string>('', { nonNullable: true });
  protected readonly employeeOptions = signal<{ label: string; value: string }[]>([]);

  protected readonly tab = signal<Tab>('planning');
  protected readonly weekStart = signal<string>(
    DateTime.now().startOf('week').toISODate() ?? '',
  );
  protected readonly contracts = signal<ContractListModel[]>([]);
  protected readonly openShifts = signal<MyShiftRow[]>([]);
  protected readonly availabilities = signal<AvailabilityModel[]>([]);
  protected readonly loading = signal(false);
  protected readonly company = this.store.selectSignal(RootState.getCompanyData);

  protected readonly days = computed<DayBucket[]>(() => {
    const start = DateTime.fromISO(this.weekStart()).setLocale('nl-BE');
    const contracts = this.contracts();
    const shifts = this.openShifts();
    const av = this.availabilities();
    return Array.from({ length: 7 }, (_, i) => {
      const d = start.plus({ days: i });
      const iso = d.toISODate() ?? '';
      return {
        iso,
        weekdayLabel: d.toFormat('ccc'),
        dateLabel: d.toFormat('d MMM'),
        contracts: contracts.filter(c => c.dateFrom <= iso && c.dateTo >= iso),
        shifts: shifts.filter(({ shift }) => shift.date_from <= iso && shift.date_to >= iso),
        availability: av.find(a => a.date === iso) ?? null,
      };
    });
  });

  protected readonly weekLabel = computed(() => {
    const start = DateTime.fromISO(this.weekStart()).setLocale('nl-BE');
    const end = start.plus({ days: 6 });
    return `Week ${start.weekNumber} — ${start.toFormat('d LLL')} → ${end.toFormat('d LLL yyyy')}`;
  });

  // Auto-refresh when the picked employee changes.
  // eslint-disable-next-line @typescript-eslint/no-unused-private-class-members
  private readonly _onEmployeeChange = toSignal(
    this.employeeControl.valueChanges.pipe(
      debounceTime(50),
      distinctUntilChanged(),
      startWith(this.employeeControl.value),
      tap(() => this.refresh()),
    ),
    { initialValue: '' },
  );

  constructor() {
    // Load the pool once the company context arrives.
    this.store
      .select(RootState.getCompanyData)
      .pipe(filter(Boolean), take(1))
      .subscribe(company => this.loadEmployees(company.id));
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
  }

  protected previousWeek(): void {
    const d = DateTime.fromISO(this.weekStart()).minus({ weeks: 1 });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.refresh();
  }

  protected nextWeek(): void {
    const d = DateTime.fromISO(this.weekStart()).plus({ weeks: 1 });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
    this.refresh();
  }

  protected today(): void {
    this.weekStart.set(DateTime.now().startOf('week').toISODate() ?? '');
    this.refresh();
  }

  protected apply(row: MyShiftRow): void {
    const empId = this.employeeControl.value;
    if (!empId) return;
    this.shiftsApi.apply(row.shift.id, empId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Kandidaat gesteld',
          detail: `Open shift × ${row.shift.capacity} op ${row.shift.date_from}`,
        });
        this.refresh();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Kandidaat stellen mislukt',
        }),
    });
  }

  protected withdraw(row: MyShiftRow): void {
    const empId = this.employeeControl.value;
    if (!empId) return;
    this.shiftsApi.withdraw(row.shift.id, empId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Kandidatuur teruggetrokken',
        });
        this.refresh();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Terugtrekken mislukt',
        }),
    });
  }

  protected createAvailability(day: DayBucket, fromTime: string, toTime: string): void {
    const empId = this.employeeControl.value;
    if (!empId || !fromTime || !toTime) return;
    this.availabilityApi
      .create({ employeeId: empId, date: day.iso, fromTime, toTime })
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Beschikbaar toegevoegd',
            detail: `${day.weekdayLabel} ${day.dateLabel}: ${fromTime} → ${toTime}`,
          });
          this.refresh();
        },
        error: () =>
          this.messageService.add({
            severity: 'error',
            summary: 'Beschikbaarheid opslaan mislukt',
          }),
      });
  }

  /** Remove an availability the operator created from MyStaffler. Same
   *  refresh hook as create — the green band on the planning grid
   *  reflects the change on next navigation. Locked slots (already
   *  promoted to a contract) cannot be deleted; the server 409s and we
   *  surface a tailored toast. */
  protected removeAvailability(av: AvailabilityModel): void {
    if (!av?.id) return;
    if (av.status === 'locked') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Niet verwijderbaar',
        detail: 'Deze beschikbaarheid hangt aan een contract.',
      });
      return;
    }
    this.availabilityApi.remove(av.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Beschikbaarheid verwijderd',
        });
        this.refresh();
      },
      error: (err: { status?: number }) => {
        this.messageService.add({
          severity: 'error',
          summary:
            err?.status === 409
              ? 'Niet verwijderbaar — gekoppeld aan een contract.'
              : 'Verwijderen mislukt.',
        });
      },
    });
  }

  private loadEmployees(companyId: string): void {
    this.employeesApi
      .getEmployees({ companyId, baseView: true, page: 0, size: 100 })
      .subscribe({
        next: page => {
          this.employeeOptions.set(
            (page?.content ?? []).map(e => ({
              label: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.id,
              value: e.id,
            })),
          );
          // Default to the first employee in the pool so the preview lights up.
          const first = this.employeeOptions()[0]?.value;
          if (first && !this.employeeControl.value) {
            this.employeeControl.setValue(first);
          }
          this.cdr.markForCheck();
        },
      });
  }

  private refresh(): void {
    const empId = this.employeeControl.value;
    if (!empId) return;
    const start = this.weekStart();
    const end = DateTime.fromISO(start).plus({ days: 6 }).toISODate() ?? start;
    this.loading.set(true);

    this.myStafflerApi.contractsForEmployee(empId, start, end).subscribe({
      next: rows => this.contracts.set(rows ?? []),
      error: () => this.contracts.set([]),
    });
    this.myStafflerApi.myOpenShifts(empId).subscribe({
      next: rows => this.openShifts.set(rows ?? []),
      error: () => this.openShifts.set([]),
    });
    this.myStafflerApi.myAvailabilities(empId, start, end).subscribe({
      next: rows => {
        this.availabilities.set(rows ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.availabilities.set([]);
        this.loading.set(false);
      },
    });
  }
}
