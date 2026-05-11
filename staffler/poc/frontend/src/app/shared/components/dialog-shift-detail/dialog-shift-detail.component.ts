import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DateTime } from 'luxon';

import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';

import { EmployeeApiService, EmployeeWageApiService } from '@dps/core/api';
import {
  EmployeeModel,
  ContractDayScheduleModel,
  ContractModel,
  ContractStatusEnum,
} from '@dps/shared/models';
import {
  ShiftApiService,
  ShiftApplicationModel,
  ShiftModel,
} from '@dps/core/api/shift/shift.api.service';

interface ShiftDetailData {
  shift: ShiftModel;
  companyId: string;
}

interface CandidateRow {
  application: ShiftApplicationModel;
  employee: EmployeeModel | null;
  selecting: boolean;
}

/**
 * Niveau-2 detail dialog. Shows a shift's metadata, lists its candidates and
 * lets the operator "Kies" one — which POSTs to `/api/shifts/:id/select`. That
 * endpoint creates a Contract in DPS (Dimona!) using the candidate's primary
 * wage and updates the application status in PoC-DB.
 */
@Component({
  selector: 'dps-dialog-shift-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule],
  templateUrl: './dialog-shift-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShiftDetailComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<ShiftDetailData> = inject(DynamicDialogConfig);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly employeesApi = inject(EmployeeApiService);
  private readonly wagesApi = inject(EmployeeWageApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly shift = this.config.data?.shift as ShiftModel;
  protected readonly companyId = this.config.data?.companyId ?? '';
  protected readonly candidates = signal<CandidateRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.loadCandidates();
  }

  protected close(): void {
    this.ref.close();
  }

  private loadCandidates(): void {
    this.shiftsApi.applications(this.shift.id).subscribe({
      next: apps => {
        // Hydrate employee data for each application in parallel.
        if (apps.length === 0) {
          this.candidates.set([]);
          this.loading.set(false);
          this.cdr.markForCheck();
          return;
        }
        const partial: CandidateRow[] = apps.map(a => ({
          application: a,
          employee: null,
          selecting: false,
        }));
        this.candidates.set(partial);
        for (const row of partial) {
          this.employeesApi.getEmployee(row.application.employee_id).subscribe({
            next: emp => {
              row.employee = emp;
              this.cdr.markForCheck();
            },
          });
        }
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.error.set('Kandidaten laden mislukt.');
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  protected employeeName(row: CandidateRow): string {
    const emp = row.employee;
    if (!emp) return row.application.employee_id;
    return `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || emp.id;
  }

  /** Build a ContractModel for the picked candidate using their primary wage. */
  protected select(row: CandidateRow): void {
    if (row.application.status !== 'candidate') return;
    row.selecting = true;
    this.cdr.markForCheck();

    this.wagesApi
      .getEmployeeWages({
        companyId: this.companyId,
        employeeId: row.application.employee_id,
        page: 0,
        size: 1,
      })
      .subscribe({
        next: wages => {
          const wage = wages?.[0];
          if (!wage) {
            row.selecting = false;
            this.error.set(`Geen loonpakket gevonden voor ${this.employeeName(row)}.`);
            this.cdr.markForCheck();
            return;
          }

          const daySchedule: ContractDayScheduleModel = {
            shiftTemplateName: null,
            createShiftTemplate: false,
            date: this.shift.date_from,
            fromTime: this.shift.from_time,
            toTime: this.shift.to_time,
            pauseFromTime: this.shift.pause_from,
            pauseToTime: this.shift.pause_to,
          };

          const contract: ContractModel = {
            id: '',
            employeeId: row.application.employee_id,
            companyId: this.companyId,
            dateFrom: this.shift.date_from,
            dateTo: this.shift.date_to,
            status: ContractStatusEnum.DRAFT,
            timetable: { schedule: [daySchedule] },
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
            companyHoursPerWeek: 40,
            employeeHoursPerWeek: 40,
            cancelReason: null,
            cancelExtraInfo: null,
            result: null,
            socialSecurityCategory: null,
          };

          this.shiftsApi.select(this.shift.id, row.application.id, contract).subscribe({
            next: result => {
              row.selecting = false;
              this.ref.close({ kind: 'shift.select.success', result });
            },
            error: err => {
              row.selecting = false;
              this.error.set(this.parseError(err));
              this.cdr.markForCheck();
            },
          });
        },
        error: err => {
          row.selecting = false;
          this.error.set(this.parseError(err));
          this.cdr.markForCheck();
        },
      });
  }

  protected formatTime(iso: string | null): string {
    if (!iso) return '';
    return DateTime.fromISO(iso).setLocale('nl-BE').toFormat('d/M/yyyy HH:mm');
  }

  private parseError(err: unknown): string {
    const e = err as { error?: { message?: string; errors?: { details?: string }[] } } | undefined;
    return e?.error?.message ?? e?.error?.errors?.[0]?.details ?? 'Onbekende fout';
  }
}
