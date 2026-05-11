import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { AddressModel } from '@dps/shared/models';

export enum AddressErrorNamesEnum {
  ADDRESS_INVALID = 'addressInvalid',
  STREET_NUMBER_INVALID = 'streetNumberInvalid',
}

export const addressValidator = (): ValidatorFn => {
  return ({ value }: AbstractControl<AddressModel | null>): ValidationErrors | null => {
    if (!value) return null;

    const { streetNumber } = value;

    const errorsObj: Partial<Record<AddressErrorNamesEnum, boolean>> = {
      [AddressErrorNamesEnum.ADDRESS_INVALID]: true, // Generic error always present
    };

    if (!streetNumber) {
      errorsObj[AddressErrorNamesEnum.STREET_NUMBER_INVALID] = true;
      return errorsObj;
    }

    return null;
  };
};
