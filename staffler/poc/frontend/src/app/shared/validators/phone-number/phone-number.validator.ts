import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidPhoneNumber } from 'libphonenumber-js';

export const PHONE_NUMBER_INVALID_ERROR_NAME = 'phoneNumberInvalid';

export const phoneNumberValidator = (): ValidatorFn => {
  return ({ value }: AbstractControl<string | null>): ValidationErrors | null => {
    if (!value) return null;

    return isValidPhoneNumber(value) ? null : { [PHONE_NUMBER_INVALID_ERROR_NAME]: true };
  };
};
