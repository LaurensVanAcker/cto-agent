import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const EMAIL_ALLOWED_CHAR_REGEXP = /[a-z0-9._@-]/i;
const EMAIL_REGEXP = /^[a-z0-9._-]+@[a-z0-9._-]+\.[a-z0-9_-]+$/i;
export const EMAIL_INVALID_ERROR_NAME = 'emailInvalid';

export const emailValidator = (): ValidatorFn => {
  return ({ value }: AbstractControl<string | null>): ValidationErrors | null => {
    if (!value) return null;

    return EMAIL_REGEXP.test(value) ? null : { [EMAIL_INVALID_ERROR_NAME]: true };
  };
};
