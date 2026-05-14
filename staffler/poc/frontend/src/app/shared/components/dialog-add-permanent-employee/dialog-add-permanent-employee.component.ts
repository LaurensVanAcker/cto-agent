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

import {
  PermanentEmployeeApiService,
  PermanentEmployeeModel,
} from '@dps/core/api/permanent-employee/permanent-employee.api.service';

interface DialogData {
  companyId: string;
}

/**
 * Vaste medewerker toevoegen — a fully PoC-DB-bound creation flow.
 *
 * The bijverdiener (DPS) flow goes through the existing
 * /invitations/create page which triggers Dimona and an actual contract.
 * Permanent employees live next to that: they don't generate Dimona
 * records and exist only inside the PoC-DB. The dialog stays intentionally
 * narrow (voornaam + achternaam) — pilot customers only need enough to
 * see the row appear in the Pool list and on the planning grid.
 */
@Component({
  selector: 'dps-dialog-add-permanent-employee',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './dialog-add-permanent-employee.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAddPermanentEmployeeComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly api = inject(PermanentEmployeeApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected form = { firstName: '', lastName: '' };
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected canSave(): boolean {
    return !!this.form.firstName.trim() && !!this.form.lastName.trim() && !this.saving();
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected save(): void {
    if (!this.canSave()) return;
    const companyId = this.config.data?.companyId;
    if (!companyId) {
      this.error.set('Bedrijfscontext ontbreekt.');
      return;
    }
    this.saving.set(true);
    this.api
      .create({
        companyId,
        firstName: this.form.firstName.trim(),
        lastName: this.form.lastName.trim(),
      })
      .subscribe({
        next: (row: PermanentEmployeeModel) => {
          this.saving.set(false);
          this.ref.close({ kind: 'permanent-employee.created', row });
        },
        error: err => {
          this.saving.set(false);
          this.error.set(
            (err?.error?.message as string | undefined) ??
              'Aanmaken vaste medewerker mislukt.',
          );
          this.cdr.markForCheck();
        },
      });
  }
}
