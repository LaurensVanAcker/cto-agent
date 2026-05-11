import { ChangeDetectionStrategy, Component, input, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { filter, startWith } from 'rxjs';
import { AsYouType } from 'libphonenumber-js';

import { InputTextModule } from 'primeng/inputtext';
import { FieldValidationErrorsComponent } from '../field-validation-errors/field-validation-errors.component';
import { PHONE_NUMBER_INVALID_ERROR_NAME } from '@dps/shared/validators';

@UntilDestroy()
@Component({
  selector: 'dps-phone-number-field',
  standalone: true,
  imports: [InputTextModule, ReactiveFormsModule, TranslatePipe, FieldValidationErrorsComponent],
  templateUrl: './phone-number-field.component.html',
  styleUrl: './phone-number-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-column' },
})
export class PhoneNumberFieldComponent implements OnInit {
  readonly labelTranslationKey = input<string>('EMPLOYEE_PROFILE.MOBILE');
  readonly control = input.required<FormControl<string | null>>();
  readonly isReadonly = input<boolean>(false);

  readonly phoneNumberInvalidError = PHONE_NUMBER_INVALID_ERROR_NAME;
  private readonly asTypeFormatter = new AsYouType('BE');

  ngOnInit(): void {
    this.control()
      .valueChanges.pipe(filter(Boolean), untilDestroyed(this))
      .subscribe(phone => {
        this.asTypeFormatter.reset();
        this.asTypeFormatter.input(phone);
        const number = this.asTypeFormatter.getNumber();
        if (!number) return;
        this.control().setValue(number.formatInternational(), { emitEvent: false });
      });
  }
}
