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

import { DateTime } from 'luxon';

import { ContractConfirmationApiService } from '@dps/core/api';
import {
  ContractConfirmation,
  ContractConfirmationDaySchedule,
  ContractConfirmationStatus,
} from '@dps/shared/models';

interface DialogData {
  confirmation: ContractConfirmation;
  companyId: string;
}

type DayDecision = 'confirmed' | 'absent';

interface EditableDay {
  id: string;
  date: string;
  decision: DayDecision;
  fromTime: string;
  toTime: string;
  pauseFromTime: string;
  pauseToTime: string;
}

/**
 * Per-day confirmer for a single ContractConfirmation. The operator can
 * adjust the worked from/to/pause times and mark a day "afwezig"; saving
 * fires a PATCH /actuals/:id/workTimes on DPS.
 *
 * Mock-up: a stack of day rows with a status toggle, time inputs, and a
 * submit footer. Compact enough to fit the m09-style chrome we use for
 * all PoC dialogs.
 */
@Component({
  selector: 'dps-dialog-confirm-actual',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './dialog-confirm-actual.component.html',
  styleUrl: './dialog-confirm-actual.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogConfirmActualComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly api = inject(ContractConfirmationApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly confirmation = this.config.data!.confirmation;
  protected readonly companyId = this.config.data!.companyId;

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly days = signal<EditableDay[]>(
    this.confirmation.workTime.map(d => ({
      id: d.id,
      date: d.date,
      decision:
        d.status === ContractConfirmationStatus.ABSENT ? 'absent' : 'confirmed',
      fromTime: d.fromTime ?? '',
      toTime: d.toTime ?? '',
      pauseFromTime: d.pauseFromTime ?? '',
      pauseToTime: d.pauseToTime ?? '',
    })),
  );

  protected dayLabel(date: string): string {
    const d = DateTime.fromISO(date).setLocale('nl-BE');
    return d.isValid ? d.toFormat('cccc d LLLL') : date;
  }

  protected setDecision(idx: number, decision: DayDecision): void {
    this.days.update(arr =>
      arr.map((d, i) => (i === idx ? { ...d, decision } : d)),
    );
  }

  /**
   * Operator shortcut: flip every day to "gewerkt" in one click. Common
   * after a normal week where nothing went wrong — saves the operator
   * from poking each toggle individually.
   */
  protected confirmAllWorked(): void {
    this.days.update(arr => arr.map(d => ({ ...d, decision: 'confirmed' as const })));
  }

  protected onFieldChange(
    idx: number,
    field: 'fromTime' | 'toTime' | 'pauseFromTime' | 'pauseToTime',
    value: string,
  ): void {
    this.days.update(arr =>
      arr.map((d, i) => (i === idx ? { ...d, [field]: value } : d)),
    );
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * PATCH each day with the operator's decision. We map our editable
   * struct back to the DPS `ContractConfirmationDaySchedule` shape and
   * fire the existing endpoint.
   */
  protected save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const original = new Map(
      this.confirmation.workTime.map(d => [d.id, d] as const),
    );

    const payload: ContractConfirmationDaySchedule[] = this.days().map(d => {
      const orig = original.get(d.id);
      const status =
        d.decision === 'absent'
          ? ContractConfirmationStatus.ABSENT
          : ContractConfirmationStatus.CONFIRMED;
      return {
        id: d.id,
        date: d.date,
        fromTime: d.decision === 'absent' ? orig?.fromTime ?? d.fromTime : d.fromTime,
        toTime: d.decision === 'absent' ? orig?.toTime ?? d.toTime : d.toTime || null,
        pauseFromTime: d.pauseFromTime || null,
        pauseToTime: d.pauseToTime || null,
        status,
        absence: orig?.absence ?? {
          type: null,
          reason: null,
          partialAbsenceDetails: { fromTime: null, toTime: null },
        },
        prefilledFromTimeRegistration:
          orig?.prefilledFromTimeRegistration ?? false,
      };
    });

    this.api
      .updateContractConfirmationWorkTime(
        this.companyId,
        this.confirmation.id,
        payload,
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.ref.close({ kind: 'actual.saved' });
        },
        error: err => {
          this.saving.set(false);
          this.error.set(
            (err?.error?.message as string | undefined) ??
              'Bevestigen mislukt. Probeer het opnieuw.',
          );
          this.cdr.markForCheck();
        },
      });
  }
}
