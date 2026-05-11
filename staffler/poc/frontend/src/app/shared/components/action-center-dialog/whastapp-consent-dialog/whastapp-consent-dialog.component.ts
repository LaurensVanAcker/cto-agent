import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPreferencesApiService } from '@dps/core/notification-preferences/notification-preferences.api.service';
import { NotificationPreferencesModel } from '@dps/shared/models';
import { phoneNumberValidator } from '@dps/shared/validators';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-whastapp-consent-dialog',
  templateUrl: './whastapp-consent-dialog.component.html',
  styleUrls: ['./whastapp-consent-dialog.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    CheckboxModule,
    ButtonModule,
    InputTextModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappConsentDialogComponent {
  readonly dialogService = inject(DialogService);
  readonly dialogRef = inject(DynamicDialogRef);
  readonly notificationPreferencesService = inject(NotificationPreferencesApiService);

  readonly userData = this.dialogService.getInstance(this.dialogRef).data;
  readonly phoneNumberControl = new FormControl<string>('', { nonNullable: false, validators: [Validators.required, phoneNumberValidator()] });
  readonly agreeTermsControl = new FormControl<boolean>(false);

  addWhatsappNumber() {
    const payload = {
      ...this.userData,
      phoneNumber: this.phoneNumberControl.value?.trim(),
    } as NotificationPreferencesModel;
  
    this.notificationPreferencesService.updateNotificationPreferences(payload).subscribe(() => 
      this.dialogRef.close(payload)
    );
  }
}
