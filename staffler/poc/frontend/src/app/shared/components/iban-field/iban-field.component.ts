import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { InputMaskModule } from 'primeng/inputmask';

import { IBAN_MASK } from '@dps/shared/constants';
import { FieldValidationErrorsComponent } from '../field-validation-errors/field-validation-errors.component';
import { IBAN_INVALID_ERROR_NAME } from '@dps/shared/validators';

@Component({
    selector: 'dps-iban-field',
    templateUrl: './iban-field.component.html',
    styleUrl: './iban-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [InputMaskModule, ReactiveFormsModule, TranslatePipe, FieldValidationErrorsComponent]
})
export class IbanFieldComponent {
  readonly ibanMask = IBAN_MASK;
  readonly ibanInvalidError = IBAN_INVALID_ERROR_NAME;

  @Input() labelTranslationKey = 'EMPLOYEE_PROFILE.IBAN';
  @Input({ required: true }) control!: FormControl<string | null>;

  @HostBinding('class') hostClasses = ['flex', 'flex-column'];

  makeControlLettersUppercase(): void {
    if (this.control.value) {
      this.control.setValue(this.control.value.toUpperCase());
    }
  }
}
