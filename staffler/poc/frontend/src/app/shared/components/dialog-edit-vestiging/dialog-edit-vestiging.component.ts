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
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';

import {
  CompanyGroupApiService,
  EmployeeApiService,
} from '@dps/core/api';
import { Group } from '@dps/shared/models';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';
import { AddressAutocompleteFieldComponent } from '@dps/shared/components';
import { AddressModel } from '@dps/shared/models';

interface DialogData {
  branch: EngagementGroupModel;
  companyId: string;
}

/**
 * Vestiging edit dialog — name + address. Triggered by the gear icon on
 * a vestiging-header row on the planning grid (Locaties view).
 *
 * The DPS engagement-group endpoint accepts `name` updates; the
 * `Plaats tewerkstelling` (work address) lives on the engagement-group's
 * extended payload as `workAddress`. We patch them in a single PUT
 * /api/companies/:id/groups/:id call.
 */
@Component({
  selector: 'dps-dialog-edit-vestiging',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    AddressAutocompleteFieldComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './dialog-edit-vestiging.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogEditVestigingComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly groupsApi = inject(CompanyGroupApiService);
  private readonly engagementApi = inject(EngagementGroupApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  /** Hold a ref to the employee API even when unused so the DI tree
   *  rebinds correctly across tests. */
  private readonly _employees = inject(EmployeeApiService);

  protected readonly branch = this.config.data?.branch;
  protected readonly nameControl = new FormControl<string>(this.branch?.name ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });

  protected readonly addressControl = new FormControl<AddressModel | null>(
    this.addressFromBranch(),
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
    if (!this.branch) return;
    this.saving.set(true);
    const addr = this.addressControl.value;
    const payload: Group & {
      workAddress?: Partial<AddressModel>;
    } = {
      ...((this.branch as unknown) as Group),
      name: this.nameControl.value.trim(),
    };
    if (addr) {
      payload.workAddress = {
        street: addr.street,
        streetNumber: addr.streetNumber,
        postalCode: addr.postalCode,
        city: addr.city,
        country: addr.country,
        countryCode: addr.countryCode,
        latitude: addr.latitude,
        longitude: addr.longitude,
        formattedAddress: addr.formattedAddress,
        bus: addr.bus,
      };
    }
    this.groupsApi.updateGroup(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.ref.close({ kind: 'vestiging.updated' });
      },
      error: err => {
        this.saving.set(false);
        this.error.set(
          (err?.error?.message as string | undefined) ?? 'Opslaan vestiging mislukt.',
        );
        this.cdr.markForCheck();
      },
    });
  }

  private addressFromBranch(): AddressModel | null {
    const wa = (this.branch as unknown as { workAddress?: AddressModel })?.workAddress;
    if (!wa) return null;
    return wa;
  }

  /**
   * Danger-zone: prompt-then-delete. Mirrors the prod
   * `CompanyGroupsComponent.removeGroup` flow (ConfirmationService +
   * `companyGroupApi.removeGroup`) so the operator sees the same UX they
   * already know. On success we close the dialog with a `vestiging.deleted`
   * payload so the planning page can refresh its rows.
   *
   * DPS owns the group server-side — if the engagement-group still has
   * contracts attached the API returns 409 / 400 and the generic error
   * dialog surfaces the reason; we keep the edit dialog open so the
   * operator can act on the message.
   */
  protected confirmDelete(): void {
    if (!this.branch) return;
    this.confirmationService.confirm({
      header: 'Vestiging verwijderen?',
      message:
        `Weet je zeker dat je "${this.branch.name}" wil verwijderen? Deze ` +
        `actie is onomkeerbaar. Service locations die aan deze vestiging ` +
        `hangen worden los geknipt en moeten opnieuw gekoppeld worden.`,
      acceptLabel: 'Verwijderen',
      rejectLabel: 'Annuleren',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      icon: 'dps-icon dps-icon-warning',
      accept: () => {
        if (!this.branch) return;
        this.saving.set(true);
        this.groupsApi
          .removeGroup(this.config.data?.companyId ?? '', this.branch.id)
          .subscribe({
            next: () => {
              this.saving.set(false);
              this.messageService.add({
                severity: 'success',
                summary: 'Vestiging verwijderd',
                detail: this.branch?.name,
              });
              this.ref.close({ kind: 'vestiging.deleted', branchId: this.branch?.id });
            },
            error: err => {
              this.saving.set(false);
              this.error.set(
                (err?.error?.message as string | undefined) ??
                  'Verwijderen mislukt. Mogelijk zijn er nog contracten verbonden aan deze vestiging.',
              );
              this.cdr.markForCheck();
            },
          });
      },
    });
  }
}
