import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

/**
 * Mockup 09 — "Niveau 1 dialog volledig". Direct-toewijzing van een
 * Contract aan één temporary medewerker. Skeleton dialog: it exposes
 * the same fields as the mockup (medewerker, statuut + paritair comité,
 * datum, van/tot, pauze, loonpakket-keuze, plaats tewerkstelling) maar
 * gebruikt nog niet de echte `POST /api/contracts`. De integratie
 * met DPS (Dimona!) gebeurt in een volgende iteratie zodra de
 * loonpakket-suggesties geladen worden uit `/api/employeewages`.
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
  protected readonly config = inject(DynamicDialogConfig);

  protected readonly form = {
    employeeId: (this.config.data?.employeeId as string | undefined) ?? '',
    date: (this.config.data?.date as string | undefined) ?? '',
    fromTime: '09:00',
    toTime: '17:00',
    pauseFromTime: '12:00',
    pauseToTime: '12:30',
    wageId: '',
    employmentAddress: '',
  };
  protected readonly inProgress = signal(false);

  protected cancel(): void {
    this.ref.close();
  }

  protected confirm(): void {
    // TODO step 6 - call POST /api/contracts via StafflerClient.
    // For now we close the dialog with the form payload so the parent
    // can echo the values to the user / log them.
    this.ref.close({ kind: 'contract.create.dry-run', payload: this.form });
  }
}
