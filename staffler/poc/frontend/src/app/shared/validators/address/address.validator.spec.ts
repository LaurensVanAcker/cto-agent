import { AbstractControl, ValidatorFn } from '@angular/forms';

import { AddressModel } from '@dps/shared/models';
import { addressValidator, AddressErrorNamesEnum } from './address.validator';

describe('addressValidator', () => {
  let validator: ValidatorFn;

  beforeEach(() => {
    validator = addressValidator();
  });

  it('should return null for no address', () => {
    const control = { value: null } as AbstractControl<AddressModel | null>;
    const errors = validator(control);
    expect(errors).toBeNull();
  });

  it('should return generic and street number error for missing street number', () => {
    const control = {
      value: {
        street: 'Main St',
        streetNumber: null,
        city: 'Anytown',
        postalCode: '12345',
        country: 'USA',
        countryCode: 'US',
        latitude: 10.0,
        longitude: 20.0,
        formattedAddress: '',
        bus: null,
      },
    } as AbstractControl<AddressModel | null>;
    const errors = validator(control);
    expect(errors).toEqual({
      [AddressErrorNamesEnum.ADDRESS_INVALID]: true,
      [AddressErrorNamesEnum.STREET_NUMBER_INVALID]: true,
    });
  });

  it('should return null for valid address', () => {
    const control = {
      value: {
        street: 'Main St',
        streetNumber: '123',
        city: 'Anytown',
        postalCode: '12345',
        country: 'USA',
        countryCode: 'US',
        latitude: 10.0,
        longitude: 20.0,
        formattedAddress: '',
        bus: null,
      },
    } as AbstractControl<AddressModel | null>;
    const errors = validator(control);
    expect(errors).toBeNull();
  });
});
