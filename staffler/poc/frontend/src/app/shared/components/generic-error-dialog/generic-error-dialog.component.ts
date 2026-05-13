import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { DPS_ADMINISTRATION_EMAIL, DPS_ADMINISTRATION_PHONE_NUMBER } from '@dps/shared/constants';
import { ApiErrorResponse } from '@dps/shared/models';
import { RootState } from '@dps/core/store';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { DateTime } from 'luxon';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { AppRouteEnum } from 'src/app/app.routes.model';

@Component({
  selector: 'dps-generic-error-dialog',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './generic-error-dialog.component.html',
  styleUrl: './generic-error-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column align-items-center gap-4 pt-3',
  },
})
export class GenericErrorDialogComponent {
  private readonly router = inject(Router);
  private readonly store = inject(Store);

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

  /**
   * Detect the well-known DPS "openstaande prestaties" 403 — it blocks
   * contract creation/edit when the employee has actuals to confirm.
   * Treating it as a generic error scares pilot operators; instead we
   * render a tailored explanation + a "Naar prestatiebevestiging" link.
   */
  readonly isOpenstaandePrestaties: boolean = !!this.dialogData?.apiErrors?.some(
    e =>
      e?.code === 'FORBIDDEN' &&
      typeof e?.details === 'string' &&
      /openstaande prestaties/i.test(e.details),
  );

  goToActuals(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    this.dialogRef.close();
    if (!company) return;
    this.router.navigate([
      '/',
      AppRouteEnum.COMPANY,
      company.id,
      CompanyRouteEnum.ACTUALS,
    ]);
  }
}
