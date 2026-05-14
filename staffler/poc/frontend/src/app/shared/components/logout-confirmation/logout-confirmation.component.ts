import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DynamicDialogRef } from 'primeng/dynamicdialog';

export type LogoutConfirmationResponse = {
  logoutFromAllDevices: boolean;
};

@Component({
  selector: 'dps-logout-confirmation',
  imports: [TranslatePipe, CheckboxModule, ButtonModule, FormsModule],
  templateUrl: './logout-confirmation.component.html',
  styleUrl: './logout-confirmation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column align-items-center gap-3',
  },
})
export class LogoutConfirmationComponent {
  readonly dialogRef = inject(DynamicDialogRef);
  readonly logoutFromAllDevices = model(false);
}
