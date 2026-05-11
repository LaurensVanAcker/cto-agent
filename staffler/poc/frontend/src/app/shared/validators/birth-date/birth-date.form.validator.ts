import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { DateTime, Settings } from 'luxon';

import { SSN_REGEXP } from '../ssn/ssn.validator';

export const BIRTH_DATE_INVALID_ERROR_NAME = 'birthDateMatchSsnError';

Settings.twoDigitCutoffYear = 30;

export const birthDateFormValidator = (): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const ssnValue: string = control.get('socialSecurityNumber')?.value;
    const birthDateValue: Date | null = control.get('dateOfBirth')?.value;

    if (!ssnValue || !birthDateValue || !SSN_REGEXP.test(ssnValue)) {
      return null;
    }

    const { year, month, date } = ssnValue.match(SSN_REGEXP)?.groups || {};

    const birthDate = DateTime.fromJSDate(birthDateValue);
    const ssnFullBirthDate = DateTime.fromFormat([year, month, date].join('-'), 'yy-MM-dd');

    return (
      ssnFullBirthDate.isValid
        ? birthDate.hasSame(ssnFullBirthDate, 'day')
        : birthDate.hasSame(DateTime.fromFormat(year, 'yy'), 'year')
    )
      ? null
      : { [BIRTH_DATE_INVALID_ERROR_NAME]: true };
  };
};
