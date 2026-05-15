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
  EmployeeWageModel,
  ContractDayScheduleModel,
  ContractModel,
  ContractStatusEnum,
} from '@dps/shared/models';
import {
  ShiftApiService,
  ShiftApplicationModel,
  ShiftModel,
} from '@dps/core/api/shift/shift.api.service';
import { SelectModule } from 'primeng/select';

interface ShiftDetailData {
  shift: ShiftModel;
  companyId: string;
}

interface CandidateRow {
  application: ShiftApplicationModel;
  employee: EmployeeModel | null;
  /** All wage packages for this candidate at this company. Empty → the
   *  candidate can't be selected (we'd have nothing to POST). */
  wages: EmployeeWageModel[];
  /** Operator's pick. Defaults to the first wage; can be flipped via
   *  the inline select when the candidate has multiple wages (different
   *  positions / statutes). */
  selectedWageId: string | null;
  /** Spinner while wages are being fetched on dialog-open. */
  loadingWages: boolean;
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
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule],
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
  protected readonly cancelling = signal(false);

  constructor() {
    this.loadCandidates();
  }

  protected close(): void {
    this.ref.close();
  }

  /** Cancel is offered only while the shift is still actionable. Once a
   *  contract has landed (closed/fulfilled) the operator should use the
   *  Contract dialog's cancel instead, which also unwinds Dimona. */
  protected canCancelShift(): boolean {
    return this.shift.status === 'draft' || this.shift.status === 'open';
  }

  /** Soft-confirm + cancel. The server returns 409 if the shift moved out
   *  of draft/open between page load and the click (e.g. someone selected
   *  a candidate in another tab) — we surface that as an error banner. */
  protected cancelShift(): void {
    const ok = window.confirm(
      'Deze shift annuleren? Reeds gekoppelde contracten blijven bestaan; ' +
        'enkel de open seats verdwijnen uit de planning.',
    );
    if (!ok) return;
    this.cancelling.set(true);
    this.shiftsApi.cancel(this.shift.id).subscribe({
      next: updated => {
        this.cancelling.set(false);
        this.ref.close({ cancelled: true, shift: updated });
      },
      error: err => {
        this.cancelling.set(false);
        this.error.set(
          err?.status === 409
            ? 'Deze shift is niet meer annuleerbaar — refresh de planning.'
            : 'Annuleren mislukt. Probeer opnieuw.',
        );
        this.cdr.markForCheck();
      },
    });
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
          wages: [],
          selectedWageId: null,
          loadingWages: true,
          selecting: false,
        }));
        this.candidates.set(partial);
        // Hydrate employee + wages in parallel per row. Wages drive the
        // inline picker the operator uses on Kies-click; pre-loading them
        // (instead of fetching after click) keeps the click cheap and
        // surfaces "no loonpakket" early so the operator can route the
        // candidate to onboarding before they bother to pick.
        for (const row of partial) {
          this.employeesApi.getEmployee(row.application.employee_id).subscribe({
            next: emp => {
              row.employee = emp;
              this.cdr.markForCheck();
            },
          });
          this.wagesApi
            .getEmployeeWages({
              companyId: this.companyId,
              employeeId: row.application.employee_id,
              page: 0,
              size: 10,
            })
            .subscribe({
              next: wages => {
                row.wages = wages ?? [];
                row.selectedWageId = row.wages[0]?.id ?? null;
                row.loadingWages = false;
                this.cdr.markForCheck();
              },
              error: () => {
                row.wages = [];
                row.selectedWageId = null;
                row.loadingWages = false;
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

  /** Build a ContractModel for the picked candidate using the wage
   *  the operator selected via the inline picker (or the only one
   *  available when there's no choice). Wages are pre-loaded in
   *  `loadCandidates`, so this method no longer fetches — it just
   *  picks. */
  protected select(row: CandidateRow): void {
    if (row.application.status !== 'candidate') return;
    if (!row.wages.length) {
      this.error.set(`Geen loonpakket gevonden voor ${this.employeeName(row)}.`);
      this.cdr.markForCheck();
      return;
    }
    const wage =
      row.wages.find(w => w.id === row.selectedWageId) ?? row.wages[0];
    if (!wage) {
      this.error.set(`Geen loonpakket geselecteerd voor ${this.employeeName(row)}.`);
      this.cdr.markForCheck();
      return;
    }

    row.selecting = true;
    this.cdr.markForCheck();

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
      // All wage-derived fields come from the picked wage row — no more
      // implicit "first one wins". The invoicing block stays zero'd
      // because those coefficients live on the company, not the wage,
      // and the gateway populates them on POST /api/contracts.
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
  }

  /** Options list for the inline wage select — concise label per row,
   *  full title via tooltip. */
  protected wageOptions(row: CandidateRow): Array<{ label: string; value: string }> {
    return row.wages.map(w => ({
      label: `${w.position} — ${w.statute?.name ?? '—'} — €${w.wageHour}/u`,
      value: w.id,
    }));
  }

  protected onWagePicked(row: CandidateRow, wageId: string): void {
    row.selectedWageId = wageId;
    this.cdr.markForCheck();
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
