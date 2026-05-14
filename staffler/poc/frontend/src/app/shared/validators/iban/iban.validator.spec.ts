import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ibanValidator, IBAN_INVALID_ERROR_NAME } from './iban.validator';

describe('IBAN Validator', () => {
  const invalidIbanError = { [IBAN_INVALID_ERROR_NAME]: true };
  let validatorFn: ValidatorFn;

  beforeEach(() => {
    validatorFn = ibanValidator();
  });

  it('should return null for an empty control', () => {
    const emptyControl = { value: null } as AbstractControl;
    const result = validatorFn(emptyControl);
    expect(result).toBeNull();
  });

  it('should return null for a valid IBAN', () => {
    const ibanControl = { value: 'GB82WEST12345698765432' } as AbstractControl;
    const result = validatorFn(ibanControl);
    expect(result).toBeNull();

    const result2 = validatorFn({ value: 'GB94BARC10201530093459' } as AbstractControl);
    expect(result2).toBeNull();

    const result3 = validatorFn({ value: 'GB33BUKB20201555555555' } as AbstractControl);
    expect(result3).toBeNull();
  });

  it('should return an error for an invalid IBAN', () => {
    const ibanControl = { value: 'InvalidIBAN' } as AbstractControl;
    const result = validatorFn(ibanControl);
    expect(result).toEqual(invalidIbanError);
  });

  it('should return an error due to invalid IBAN check digits', () => {
    const ibanControl = { value: 'GB94BARC20201530093459' } as AbstractControl;
    const result = validatorFn(ibanControl);
    expect(result).toEqual(invalidIbanError);
  });

  it('should return an error due to invalid IBAN length (must be 22 as of GB country code characters long)', () => {
    const ibanControl = { value: 'GB96BARC202015300934591' } as AbstractControl;
    const result = validatorFn(ibanControl);
    expect(result).toEqual(invalidIbanError);
  });

  it('should return an error due to invalid IBAN checksum structure', () => {
    const ibanControl = { value: 'GB2LABBY09012857201707' } as AbstractControl;
    const result = validatorFn(ibanControl);
    expect(result).toEqual(invalidIbanError);
  });
});
