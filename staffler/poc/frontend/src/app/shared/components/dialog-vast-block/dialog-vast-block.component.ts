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

interface DialogData {
  /** Permanent-employee id (PoC-DB, prefixed `perm:` in event resourceIds). */
  permanentEmployeeId: string;
  employeeName: string;
  /** Initial date range — taken from the Bryntum placeholder. */
  dateFrom: string;
  dateTo: string;
  /** Initial hour range when the operator dragged to size the block. */
  fromTime?: string;
  toTime?: string;
  /** Existing PoC-DB block id when the operator clicks a saved block.
   *  Presence flips the dialog from create-only to edit-with-delete:
   *  the "Vast blok verwijderen" action becomes available. */
  blockId?: string;
}

/**
 * Vast-blok dialog — date range + hours only.
 *
 * Vaste medewerkers live entirely in PoC-DB and never trigger Dimona, so
 * the dialog is intentionally compact: no loonpakket, no slots, no Dimona
 * fields. It mirrors the chrome of the new-shift dialog (mockup 09) so
 * the operator never has to context-switch between the two.
 *
 * Persistence intentionally stays in the dialog — saving emits a result
 * back to the caller, which writes to PoC-DB via the appropriate API.
 */
@Component({
  selector: 'dps-dialog-vast-block',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './dialog-vast-block.component.html',
  styleUrl: './dialog-vast-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogVastBlockComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly form = {
    dateFrom: this.config.data?.dateFrom ?? '',
    dateTo:
      this.config.data?.dateTo ??
      this.config.data?.dateFrom ??
      '',
    fromTime: this.config.data?.fromTime ?? '09:00',
    toTime: this.config.data?.toTime ?? '17:00',
  };

  protected readonly employeeName = this.config.data?.employeeName ?? 'Vaste medewerker';
  protected readonly blockId = this.config.data?.blockId ?? null;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly dayTitle = (): string => {
    const from = DateTime.fromISO(this.form.dateFrom).setLocale('nl-BE');
    const to = DateTime.fromISO(this.form.dateTo).setLocale('nl-BE');
    if (!from.isValid) return '';
    if (!to.isValid || from.hasSame(to, 'day')) {
      return from.toFormat('cccc d LLLL yyyy');
    }
    return `${from.toFormat('cccc d LLLL')} — ${to.toFormat('cccc d LLLL yyyy')}`;
  };

  protected canSave(): boolean {
    return (
      !!this.form.dateFrom &&
      !!this.form.dateTo &&
      !!this.form.fromTime &&
      !!this.form.toTime &&
      this.form.toTime > this.form.fromTime &&
      !this.saving()
    );
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    // Emit the form — the caller (planning-poc) decides whether to POST
    // to PoC-DB and refresh the grid. Keeps this dialog free of API deps.
    this.ref.close({
      kind: 'vast.block.saved',
      block: {
        permanentEmployeeId: this.config.data?.permanentEmployeeId,
        dateFrom: this.form.dateFrom,
        dateTo: this.form.dateTo,
        fromTime: this.form.fromTime,
        toTime: this.form.toTime,
      },
    });
  }

  /** Soft-confirmed delete. Emits a `vast.block.deleted` intent — the
   *  caller (planning-poc) DELETEs against PoC-DB and refreshes the grid.
   *  Only available when the dialog opened on an existing block. */
  protected deleteBlock(): void {
    if (!this.blockId || this.saving()) return;
    const ok = window.confirm(
      `Vast blok van ${this.employeeName} verwijderen? Dit kan niet ongedaan gemaakt worden.`,
    );
    if (!ok) return;
    this.ref.close({ kind: 'vast.block.deleted', blockId: this.blockId });
  }
}
