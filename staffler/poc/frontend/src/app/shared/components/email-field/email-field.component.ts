import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { InputTextModule } from 'primeng/inputtext';
import { KeyFilterModule } from 'primeng/keyfilter';

import { EMAIL_ALLOWED_CHAR_REGEXP, EMAIL_INVALID_ERROR_NAME } from '@dps/shared/validators';
import { FieldValidationErrorsComponent } from '../field-validation-errors/field-validation-errors.component';

@Component({
  selector: 'dps-email-field',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    KeyFilterModule,
    TranslatePipe,
    FieldValidationErrorsComponent,
  ],
  templateUrl: './email-field.component.html',
  styleUrl: './email-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-column' },
})
export class EmailFieldComponent {
  readonly allowedCharRegExp = EMAIL_ALLOWED_CHAR_REGEXP;
  readonly invalidEmailError = EMAIL_INVALID_ERROR_NAME;
  readonly labelTranslationKey = input<string>('EMPLOYEE_PROFILE.EMAIL');
  readonly control = input.required<FormControl<string | null>>();
  readonly isReadonly = input<boolean>(false);
}
