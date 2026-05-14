import { FormControl, FormGroup } from '@angular/forms';
import { BIRTH_DATE_INVALID_ERROR_NAME, birthDateFormValidator } from './birth-date.form.validator';
import { DateTime } from 'luxon';

describe('Birth date form validator based on SSN', () => {
  const form = new FormGroup(
    {
      socialSecurityNumber: new FormControl<string | null>(null),
      dateOfBirth: new FormControl<Date | null>(null),
    },
    { validators: [birthDateFormValidator()] }
  );
  const { socialSecurityNumber, dateOfBirth } = form.controls;

  beforeEach(() => form.reset());

  it('should NOT have birth date error if SSN or dateOfBirth fields are empty', () => {
    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should match full date if SSN birth date is valid', () => {
    socialSecurityNumber.setValue('73.03.08-573.62');
    dateOfBirth.setValue(
      DateTime.fromObject({
        year: 1973,
        month: 3,
        day: 8,
      }).toJSDate()
    );

    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeFalse();

    dateOfBirth.setValue(
      DateTime.fromObject({
        year: 1973,
        month: 5,
        day: 8,
      }).toJSDate()
    );

    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeTrue();
  });

  it('should match if person born in 20 century', () => {
    socialSecurityNumber.setValue('50.02.13-001.91');
    dateOfBirth.setValue(
      DateTime.fromObject({
        year: 1950,
        month: 2,
        day: 13,
      }).toJSDate()
    );

    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should match if person born in 21 century', () => {
    socialSecurityNumber.setValue('01.08.05-267.77');
    dateOfBirth.setValue(
      DateTime.fromObject({
        year: 2001,
        month: 8,
        day: 5,
      }).toJSDate()
    );

    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should match at least by year if month is increased', () => {
    socialSecurityNumber.setValue('73.25.37-255.87');
    dateOfBirth.setValue(
      DateTime.fromObject({
        year: 1973,
        month: 8,
        day: 1,
      }).toJSDate()
    );

    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeFalse();
    dateOfBirth.setValue(
      DateTime.fromObject({
        year: 1975,
        month: 8,
        day: 1,
      }).toJSDate()
    );
    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeTrue();
  });

  it('should match at least by year if it is a refugee', () => {
    socialSecurityNumber.setValue('73.00.00-573.87');
    dateOfBirth.setValue(
      DateTime.fromObject({
        year: 1973,
        month: 8,
        day: 1,
      }).toJSDate()
    );

    expect(form.hasError(BIRTH_DATE_INVALID_ERROR_NAME)).toBeFalse();
  });
});
