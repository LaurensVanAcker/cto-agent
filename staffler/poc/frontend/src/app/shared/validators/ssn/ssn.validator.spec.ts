import { FormControl } from '@angular/forms';
import { SsnErrorNamesEnum, ssnValidator } from './ssn.validator';

describe('SSN Validator', () => {
  const ssnControl = new FormControl<string | null>(null, ssnValidator());

  it('73.03.08-573.62 should be valid SSN', () => {
    ssnControl.setValue('73.03.08-573.62');
    expect(ssnControl.errors).toBeNull();
  });

  it('73.03.32-573.62 should have birth date error', () => {
    ssnControl.setValue('73.03.32-573.62');

    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR)).toBeTrue();
    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_BIRTH_DAY_ERROR)).toBeTrue();
  });

  it('73.33.08-573.62 should have birth month error', () => {
    ssnControl.setValue('73.33.08-573.62');

    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR)).toBeTrue();
    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_BIRTH_MONTH_ERROR)).toBeTrue();
  });

  it('73.46.08-573.62 should NOT have birth month error', () => {
    ssnControl.setValue('73.46.08-573.62');

    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_BIRTH_MONTH_ERROR)).toBeFalse();
  });

  it('73.03.08-999.62 should have gender error', () => {
    ssnControl.setValue('73.03.08-999.62');

    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR)).toBeTrue();
    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_GENDER_ERROR)).toBeTrue();
  });

  it('73.03.08-782.62 should NOT have gender error', () => {
    ssnControl.setValue('73.03.08-782.62');

    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_GENDER_ERROR)).toBeFalse();
  });

  it('73.03.08-573.63 should have checksum error', () => {
    ssnControl.setValue('73.03.08-573.63');

    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_GENERIC_ERROR)).toBeTrue();
    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_CHECKSUM_ERROR)).toBeTrue();
  });

  it('01.08.05-267.77 should NOT have checksum error and be valid', () => {
    ssnControl.setValue('01.08.05-267.77');

    expect(ssnControl.valid).toBeTrue();
    expect(ssnControl.hasError(SsnErrorNamesEnum.SSN_INVALID_CHECKSUM_ERROR)).toBeFalse();
  });
});
