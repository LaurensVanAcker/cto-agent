import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { ShiftApiService, ShiftTargetType } from '@dps/core/api/shift/shift.api.service';

/**
 * Mockup 12 — "Batch dialog". Niveau 2 shift create + publish naar pool
 * of selectie. Skeleton: form fields zoals in de mockup, en op confirm
 * doet het echt een POST naar /api/shifts (PoC-DB) + publish. Geen
 * candidate-flow yet.
 */
@Component({
  selector: 'dps-dialog-shift-batch',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './dialog-shift-batch.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShiftBatchComponent {
  private readonly ref = inject(DynamicDialogRef);
  protected readonly config = inject(DynamicDialogConfig);
  private readonly shiftsApi = inject(ShiftApiService);

  protected readonly form = {
    serviceGroupId: (this.config.data?.serviceGroupId as string | undefined) ?? '',
    dateFrom: (this.config.data?.date as string | undefined) ?? '',
    dateTo: (this.config.data?.date as string | undefined) ?? '',
    fromTime: '09:00',
    toTime: '17:00',
    capacity: 1,
    targetType: 'ALL_POOL' as ShiftTargetType,
    deadline: '',
  };
  protected readonly saving = signal(false);

  protected readonly targetOptions = [
    { label: 'Volledige pool', value: 'ALL_POOL' },
    { label: 'Selectie', value: 'SELECTION' },
    { label: 'Groep', value: 'GROUP' },
    { label: 'Geen broadcast', value: 'NONE' },
  ];

  protected cancel(): void {
    this.ref.close();
  }

  protected confirmAndPublish(): void {
    const company = this.config.data?.companyId as string | undefined;
    if (!company) {
      this.ref.close({ kind: 'shift.batch.error', reason: 'missing companyId' });
      return;
    }
    this.saving.set(true);
    this.shiftsApi
      .create({
        companyId: company,
        serviceGroupId: this.form.serviceGroupId,
        dateFrom: this.form.dateFrom,
        dateTo: this.form.dateTo || this.form.dateFrom,
        fromTime: this.form.fromTime,
        toTime: this.form.toTime,
        capacity: this.form.capacity,
        deadline: this.form.deadline || undefined,
        targetType: this.form.targetType,
        status: 'draft',
      })
      .subscribe({
        next: shift => {
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
        error: () => {
          this.saving.set(false);
          this.ref.close({ kind: 'shift.batch.error' });
        },
      });
  }
}
