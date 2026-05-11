import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DPS_ADMINISTRATION_EMAIL, DPS_ADMINISTRATION_PHONE_NUMBER } from '@dps/shared/constants';
import { ApiErrorResponse } from '@dps/shared/models';
import { TranslatePipe } from '@ngx-translate/core';
import { DateTime } from 'luxon';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

@Component({
  selector: 'dps-generic-error-dialog',
  imports: [TranslatePipe],
  templateUrl: './generic-error-dialog.component.html',
  styleUrl: './generic-error-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column align-items-center gap-4 pt-3',
  },
})
export class GenericErrorDialogComponent {
  constructor(
    public dialogRef: DynamicDialogRef,
    private dialogService: DialogService
  ) {}

  readonly dialogData: ApiErrorResponse | null = this.dialogService.getInstance(this.dialogRef)
    .data;
  readonly formattedErrorDatetime = DateTime.now().toLocaleString(DateTime.DATETIME_SHORT);
  readonly messageTranslationParams = {
    phoneNumber: DPS_ADMINISTRATION_PHONE_NUMBER,
    email: DPS_ADMINISTRATION_EMAIL,
  };
}
