import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';

import {
  ServiceLocationApiService,
  ServiceLocationModel,
} from '@dps/core/api/service-location/service-location.api.service';

interface DialogData {
  companyId: string;
  branchGroupId: string;
  /** Parent vestiging name — surfaced in the dialog header so the operator
   *  always sees which vestiging the SL hangs under. Caller passes the
   *  resolved name; we don't refetch. Optional → empty subtitle when
   *  unknown. */
  branchName?: string;
  /** When present, the dialog runs in "edit" mode and PATCHes the row
   *  instead of POSTing a new one. */
  existing?: ServiceLocationModel;
}

/**
 * Service-location create / edit dialog.
 *
 * Address lives on the *vestiging* (mockup 14 — pilot user feedback). The
 * service-location only carries a name. The gear icon for editing the
 * address has been moved to the vestiging-header row on the planning grid.
 */
@Component({
  selector: 'dps-dialog-add-service-location',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
  ],
  templateUrl: './dialog-add-service-location.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAddServiceLocationComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly api = inject(ServiceLocationApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly isEdit = !!this.config.data?.existing;
  protected readonly branchName = this.config.data?.branchName ?? '';

  protected readonly nameControl = new FormControl<string>(
    this.config.data?.existing?.name ?? '',
    {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    },
  );

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected canSave(): boolean {
    return this.nameControl.valid && !this.saving();
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected save(): void {
    if (!this.canSave()) {
      this.nameControl.markAsTouched();
      return;
    }
    const data = this.config.data;
    if (!data?.companyId || !data?.branchGroupId) {
      this.error.set('Vestiging context ontbreekt.');
      return;
    }
    this.saving.set(true);
    const payload = {
      companyId: data.companyId,
      branchGroupId: data.branchGroupId,
      name: this.nameControl.value.trim(),
    };
    const obs$ =
      this.isEdit && data.existing ? this.api.update(data.existing.id, payload) : this.api.create(payload);
    obs$.subscribe({
      next: (row: ServiceLocationModel) => {
        this.saving.set(false);
        this.ref.close({
          kind: this.isEdit ? 'service-location.updated' : 'service-location.created',
          row,
        });
      },
      error: err => {
        this.saving.set(false);
        this.error.set(
          (err?.error?.message as string | undefined) ??
            'Opslaan service location mislukt.',
        );
        this.cdr.markForCheck();
      },
    });
  }
}
