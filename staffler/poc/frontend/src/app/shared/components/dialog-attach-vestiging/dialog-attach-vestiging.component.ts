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
import { SelectModule } from 'primeng/select';

import {
  ServiceLocationApiService,
  ServiceLocationModel,
} from '@dps/core/api/service-location/service-location.api.service';
import { EngagementGroupModel } from '@dps/core/api/engagement-group/engagement-group.api.service';

interface DialogData {
  serviceLocation: ServiceLocationModel;
  branches: EngagementGroupModel[];
}

/**
 * "Service location aan vestiging koppelen" — opens from an orphan SL row
 * (Locaties view). Lets the operator pick a vestiging from the company's
 * branch list, then PATCHes the SL's `branch_group_id` so it disappears
 * from the orphan bucket.
 */
@Component({
  selector: 'dps-dialog-attach-vestiging',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule],
  templateUrl: './dialog-attach-vestiging.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAttachVestigingComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly api = inject(ServiceLocationApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly sl = this.config.data?.serviceLocation;
  protected readonly branches = this.config.data?.branches ?? [];
  protected readonly branchOptions = this.branches.map(b => ({
    label: b.name ?? b.id,
    value: b.id,
  }));

  protected selectedBranchId = signal<string>('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected canSave(): boolean {
    return !!this.selectedBranchId() && !this.saving();
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected save(): void {
    if (!this.canSave() || !this.sl) return;
    this.saving.set(true);
    this.api
      .update(this.sl.id, { branchGroupId: this.selectedBranchId() })
      .subscribe({
        next: row => {
          this.saving.set(false);
          this.ref.close({ kind: 'sl.attached', row });
        },
        error: err => {
          this.saving.set(false);
          this.error.set(
            (err?.error?.message as string | undefined) ?? 'Koppelen aan vestiging mislukt.',
          );
          this.cdr.markForCheck();
        },
      });
  }
}
