import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { GenderEnum } from '@dps/shared/models';
import { SSN_REGEXP } from '../ssn/ssn.validator';

export const GENDER_INVALID_ERROR_NAME = 'genderMatchSsnError';

export const genderFormValidator = (): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const ssnValue: string = control.get('socialSecurityNumber')?.value;
    const genderValue: GenderEnum = control.get('gender')?.value;

    if (
      !ssnValue ||
      !genderValue ||
      genderValue === GenderEnum.OTHER ||
      !SSN_REGEXP.test(ssnValue)
    ) {
      return null;
    }

    const { gender } = ssnValue.match(SSN_REGEXP)?.groups || {};
    const isFemaleBySSN = isEvenNumber(parseInt(gender, 10));

    return (isFemaleBySSN && genderValue === GenderEnum.FEMALE) ||
      (!isFemaleBySSN && genderValue === GenderEnum.MALE)
      ? null
      : { [GENDER_INVALID_ERROR_NAME]: true };
  };
};

const isEvenNumber = (n: number): boolean => {
  return !(n % 2);
};
