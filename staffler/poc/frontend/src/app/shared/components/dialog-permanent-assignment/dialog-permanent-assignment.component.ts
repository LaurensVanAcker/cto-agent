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
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import {
  PermanentAssignmentApiService,
  Weekday,
  WeekdaySlot,
} from '@dps/core/api/permanent-assignment/permanent-assignment.api.service';
import {
  PermanentEmployeeApiService,
  PermanentEmployeeModel,
} from '@dps/core/api/permanent-employee/permanent-employee.api.service';
import {
  ServiceGroupApiService,
  ServiceGroupModel,
} from '@dps/core/api/service-group/service-group.api.service';

interface DialogData {
  companyId: string;
}

interface DayRow {
  weekday: Weekday;
  label: string;
  enabled: boolean;
  from: string;
  to: string;
}

const DAYS: { weekday: Weekday; label: string }[] = [
  { weekday: 'MON', label: 'Maandag' },
  { weekday: 'TUE', label: 'Dinsdag' },
  { weekday: 'WED', label: 'Woensdag' },
  { weekday: 'THU', label: 'Donderdag' },
  { weekday: 'FRI', label: 'Vrijdag' },
  { weekday: 'SAT', label: 'Zaterdag' },
  { weekday: 'SUN', label: 'Zondag' },
];

/**
 * Pin een vaste medewerker aan een service-group met een wekelijks patroon.
 * Schrijft `permanent_assignments`-rij in PoC-DB. Geen Dimona — vaste
 * medewerkers leven volledig buiten DPS.
 */
@Component({
  selector: 'dps-dialog-permanent-assignment',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './dialog-permanent-assignment.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogPermanentAssignmentComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly assignmentsApi = inject(PermanentAssignmentApiService);
  private readonly permEmployeesApi = inject(PermanentEmployeeApiService);
  private readonly serviceGroupsApi = inject(ServiceGroupApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly companyId = this.config.data?.companyId ?? '';
  protected readonly employees = signal<PermanentEmployeeModel[]>([]);
  protected readonly serviceGroups = signal<ServiceGroupModel[]>([]);
  protected readonly form = {
    permanentEmployeeId: '',
    serviceGroupId: '',
    validFrom: DateTime.now().toISODate() ?? '',
    validTo: '',
    note: '',
  };
  protected days: DayRow[] = DAYS.map((d, i) => ({
    weekday: d.weekday,
    label: d.label,
    enabled: i < 5, // default: weekdays only
    from: '09:00',
    to: '17:00',
  }));
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly employeeOptions = () =>
    this.employees().map(e => ({
      label: `${e.first_name} ${e.last_name}`,
      value: e.id,
    }));

  protected readonly serviceGroupOptions = () =>
    this.serviceGroups().map(s => ({ label: s.name, value: s.id }));

  constructor() {
    if (!this.companyId) return;
    this.permEmployeesApi.list(this.companyId).subscribe({
      next: rows => {
        this.employees.set(rows ?? []);
        this.cdr.markForCheck();
      },
    });
    this.serviceGroupsApi.list(this.companyId).subscribe({
      next: rows => {
        this.serviceGroups.set(rows ?? []);
        this.cdr.markForCheck();
      },
    });
  }

  protected canSave(): boolean {
    return (
      !!this.form.permanentEmployeeId &&
      !!this.form.serviceGroupId &&
      !!this.form.validFrom &&
      this.days.some(d => d.enabled) &&
      !this.saving()
    );
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected save(): void {
    if (!this.canSave()) return;
    const pattern: Partial<Record<Weekday, WeekdaySlot>> = {};
    for (const d of this.days) {
      if (d.enabled && d.from && d.to) {
        pattern[d.weekday] = { from: d.from, to: d.to };
      }
    }
    this.saving.set(true);
    this.assignmentsApi
      .create({
        permanentEmployeeId: this.form.permanentEmployeeId,
        serviceGroupId: this.form.serviceGroupId,
        weekdayPattern: pattern,
        validFrom: this.form.validFrom,
        validTo: this.form.validTo || undefined,
        note: this.form.note || undefined,
      })
      .subscribe({
        next: created => {
          this.saving.set(false);
          this.ref.close({ kind: 'permanent-assignment.created', row: created });
        },
        error: err => {
          this.saving.set(false);
          this.error.set(
            (err?.error?.message as string | undefined) ??
              'Aanmaken vast-toewijzing mislukt.',
          );
          this.cdr.markForCheck();
        },
      });
  }
}
