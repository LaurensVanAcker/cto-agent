import { AbstractControl, FormControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export enum NewPasswordFormValidationErrorsEnum {
  HAS_NUMBER = 'hasNumber',
  HAS_SPECIAL_CHAR = 'hasSpecialChar',
  HAS_UPPERCASE_LETTER = 'hasUppercaseLetter',
  HAS_LOWERCASE_LETTER = 'hasLowercaseLetter',
  HAS_MIN_LENGTH = 'hasMinLength',
  PASSWORDS_MATCH = 'passwordsMatch',
}

const NEW_PASSWORD_PATTERN_VALIDATIONS_MAP: Partial<
  Record<NewPasswordFormValidationErrorsEnum, RegExp>
> = {
  [NewPasswordFormValidationErrorsEnum.HAS_NUMBER]: /[0-9]/,
  [NewPasswordFormValidationErrorsEnum.HAS_SPECIAL_CHAR]: /[\^$*.[\]{}()?\-"!@#%&/\\,><':;|_~`+=]/, // Per default AWS Password policy,
  [NewPasswordFormValidationErrorsEnum.HAS_UPPERCASE_LETTER]: /[A-Z]/,
  [NewPasswordFormValidationErrorsEnum.HAS_LOWERCASE_LETTER]: /[a-z]/,
};
export const NEW_PASSWORD_MIN_LENGTH = 8;

export const newPasswordFormValidator = (
  passwordControlName: string,
  repeatPasswordControlName: string
): ValidatorFn => {
  return (form: AbstractControl) => {
    const newPasswordControl = form.get(passwordControlName) as FormControl<string>;
    const repeatPasswordControl = form.get(repeatPasswordControlName) as FormControl<string>;

    const errorsObj: ValidationErrors = {};

    Object.entries(NEW_PASSWORD_PATTERN_VALIDATIONS_MAP).forEach(([validationName, pattern]) => {
      if (!pattern.test(newPasswordControl.value)) {
        errorsObj[validationName] = true;
      }
    });

    if (newPasswordControl.value.length < NEW_PASSWORD_MIN_LENGTH) {
      errorsObj[NewPasswordFormValidationErrorsEnum.HAS_MIN_LENGTH] = true;
    }

    if (
      newPasswordControl.value.length &&
      newPasswordControl.value !== repeatPasswordControl.value
    ) {
      errorsObj[NewPasswordFormValidationErrorsEnum.PASSWORDS_MATCH] = true;
    }

    return Object.keys(errorsObj).length ? errorsObj : null;
  };
};
