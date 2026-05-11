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

import { ShiftApiService, ShiftTargetType } from '@dps/core/api/shift/shift.api.service';
import {
  ServiceGroupApiService,
  ServiceGroupModel,
} from '@dps/core/api/service-group/service-group.api.service';

interface DialogData {
  companyId?: string;
  serviceGroupId?: string;
  date?: string;
}

/**
 * Mockup 12 — "Batch dialog". Niveau 2 shift create + publish naar pool of
 * selectie. POSTs to /api/shifts + publishes. Service-location keuze gaat
 * via een dropdown gevoed door /api/service-groups.
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
  ],
  templateUrl: './dialog-shift-batch.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShiftBatchComponent {
  private readonly ref = inject(DynamicDialogRef);
  protected readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly serviceGroupsApi = inject(ServiceGroupApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly companyId = this.config.data?.companyId ?? '';
  protected readonly serviceGroups = signal<ServiceGroupModel[]>([]);

  protected readonly form = {
    serviceGroupId: this.config.data?.serviceGroupId ?? '',
    dateFrom: this.config.data?.date ?? '',
    dateTo: this.config.data?.date ?? '',
    fromTime: '09:00',
    toTime: '17:00',
    capacity: 1,
    targetType: 'ALL_POOL' as ShiftTargetType,
    deadline: '',
  };
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly serviceGroupOptions = () =>
    this.serviceGroups().map(s => ({ label: s.name, value: s.id }));

  protected readonly targetOptions = [
    { label: 'Volledige pool', value: 'ALL_POOL' },
    { label: 'Selectie', value: 'SELECTION' },
    { label: 'Groep', value: 'GROUP' },
    { label: 'Geen broadcast', value: 'NONE' },
  ];

  constructor() {
    if (this.companyId) {
      this.serviceGroupsApi.list(this.companyId).subscribe({
        next: rows => {
          this.serviceGroups.set(rows ?? []);
          // Default to the first service-group if not pre-selected.
          if (rows && rows.length > 0 && !this.form.serviceGroupId) {
            this.form.serviceGroupId = rows[0].id;
          }
          this.cdr.markForCheck();
        },
      });
    }
  }

  protected canSave(): boolean {
    return (
      !!this.form.serviceGroupId &&
      !!this.form.dateFrom &&
      !!this.form.fromTime &&
      !!this.form.toTime &&
      this.form.capacity >= 1 &&
      !this.saving()
    );
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
    this.shiftsApi
      .create({
        companyId: this.companyId,
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
