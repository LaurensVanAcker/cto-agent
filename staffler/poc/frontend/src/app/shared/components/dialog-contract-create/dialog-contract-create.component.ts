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
import { SelectModule } from 'primeng/select';

import {
  ContractApiService,
  EmployeeWageApiService,
} from '@dps/core/api';
import {
  ContractDayScheduleModel,
  ContractModel,
  ContractStatusEnum,
  EmployeeWageModel,
} from '@dps/shared/models';
import { DateTime } from 'luxon';

interface ContractDialogData {
  employeeId?: string;
  date?: string;
  companyId?: string;
}

/**
 * Mockup 09 — Niveau 1 directe toewijzing van een DPS Contract aan één
 * temporary medewerker. Volledige wire-up: laadt loonpakketten uit
 * `/api/employeewages`, build een ContractModel met alle wage-afgeleide
 * velden, POST naar `/api/contracts` (= Dimona-trigger via DPS gateway).
 */
@Component({
  selector: 'dps-dialog-contract-create',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './dialog-contract-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogContractCreateComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<ContractDialogData> = inject(DynamicDialogConfig);
  private readonly wagesApi = inject(EmployeeWageApiService);
  private readonly contractsApi = inject(ContractApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly form = {
    employeeId: this.config.data?.employeeId ?? '',
    companyId: this.config.data?.companyId ?? '',
    date: this.config.data?.date ?? DateTime.now().toISODate() ?? '',
    fromTime: '09:00',
    toTime: '17:00',
    pauseFromTime: '12:00',
    pauseToTime: '12:30',
    wageId: '',
  };
  protected readonly wages = signal<EmployeeWageModel[]>([]);
  protected readonly loadingWages = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly wageOptions = (): { label: string; value: string }[] =>
    this.wages().map(w => ({
      label: `${w.position} (${w.statute?.name ?? '?'} · €${w.wageHour}/u)`,
      value: w.id,
    }));

  constructor() {
    if (this.form.employeeId && this.form.companyId) {
      this.loadWages();
    }
  }

  private loadWages(): void {
    this.loadingWages.set(true);
    this.wagesApi
      .getEmployeeWages({
        companyId: this.form.companyId,
        employeeId: this.form.employeeId,
        page: 0,
        size: 50,
      } as Parameters<EmployeeWageApiService['getEmployeeWages']>[0])
      .subscribe({
        next: rows => {
          this.wages.set(rows ?? []);
          // Default to the first wage (which is typically the primary one in DPS)
          if (rows && rows.length > 0 && !this.form.wageId) {
            this.form.wageId = rows[0].id;
          }
          this.loadingWages.set(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingWages.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected canConfirm(): boolean {
    return (
      !!this.form.employeeId &&
      !!this.form.companyId &&
      !!this.form.date &&
      !!this.form.fromTime &&
      !!this.form.toTime &&
      !!this.form.wageId &&
      !this.saving()
    );
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;
    const wage = this.wages().find(w => w.id === this.form.wageId);
    if (!wage) {
      this.errorMessage.set('Loonpakket niet gevonden.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    const daySchedule: ContractDayScheduleModel = {
      shiftTemplateName: null,
      createShiftTemplate: false,
      date: this.form.date,
      fromTime: this.form.fromTime,
      toTime: this.form.toTime,
      pauseFromTime: this.form.pauseFromTime || null,
      pauseToTime: this.form.pauseToTime || null,
    };

    const payload: ContractModel = {
      // server-side genereerd
      id: '',
      employeeId: this.form.employeeId,
      companyId: this.form.companyId,
      dateFrom: this.form.date,
      dateTo: this.form.date,
      status: ContractStatusEnum.DRAFT,
      timetable: { schedule: [daySchedule] },
      // wage-afgeleid
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
      // niet-gebruikte velden op draft-create
      invoicing: {
        coefficient: 0,
        coefficientTravelAllowance: 0,
        coefficientMealVouchers: 0,
        coefficientEcoVouchers: 0,
        coefficientBankHoliday: 0,
        dimonaCost: 0,
        defaultTaxRate: { code: '', name: '' },
      },
      // Sensible defaults; DPS rejects 0/null here and the planner can
      // tune them per-contract in the production /planning edit dialog.
      companyHoursPerWeek: 40,
      employeeHoursPerWeek: 40,
      cancelReason: null,
      cancelExtraInfo: null,
      result: null,
      socialSecurityCategory: null,
    };

    this.contractsApi.createContract(payload).subscribe({
      next: created => {
        this.saving.set(false);
        this.ref.close({ kind: 'contract.create.success', contract: created });
      },
      error: err => {
        this.saving.set(false);
        // DPS business errors come back via the Fastify proxy as
        // { kind: 'business', errors: [{code, details, group}], traceId, message }
        const msg: string = err?.error?.message ?? err?.error?.errors?.[0]?.details ?? err?.message ?? 'Onbekende fout';
        this.errorMessage.set(msg);
        this.cdr.markForCheck();
      },
    });
  }
}
